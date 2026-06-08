import { join } from "node:path";
import { editYaml } from "../../util/yaml.js";
import { ConstraintError, NotFoundError } from "../errors.js";
import type { AuthoringTaskSpec, BundleManifest, Project, SkillRef } from "../model/index.js";
import { validateSkillFrontmatter } from "../services/frontmatter.js";
import type { ApplyContext, ApplyOutcome, OperationSpec, ReadSpec } from "./lifecycle.js";
import { renderSkillStub, type SkillStubDeps } from "./scaffold-skill.js";

/**
 * The **generic, descriptor-driven skill-reference operation** behind the `bundle <id> skills` family (doc 10
 * rows 170–172) — and the seam the two later installer-skill families reuse: `bundle <id> installer-skills`
 * (P, tasks 77–79) and `project installer-skills` (F, tasks 45–47). It is the skill-shaped analogue of
 * `payload-refs.ts`: a bundle's `bundle.yml` carries a `payload.skills` REGISTRY of {@link SkillRef} (`{name,
 * path}`) entries; `add` REGISTERS a reference (after either ATTACHing an author-placed SKILL.md — validating
 * its frontmatter — or SCAFFOLDing a structural stub and queuing the writing) and `remove` DEREGISTERS it,
 * leaving the SKILL.md on disk (doc 10 row 172).
 *
 * **Why a registry of `{name, path}` and not bare strings (like files/templates/scripts):** a skill is
 * identified by its `name` (the registry key, the `remove <name>` deregister key, the menu line `list` prints)
 * AND located by its `path` (the bundle-relative `SKILL.md` path, which `--path` can move off the conventional
 * `payload/agent-skills/<name>/SKILL.md`). `list` and the downstream "Verify skill registration" authoring task
 * (doc 11) must LOCATE each registered skill, so the path is carried. Payload skills are inert until install
 * (doc 06), so this registry — not a directory scan — is authoritative (O's `list` is registry-based; P/F's
 * `list` is doc-spec'd as a directory scan, so {@link listSkillRefsSpec} is the one piece P/F replace).
 *
 * **The scaffold-or-attach-or-error split is in the COMMAND layer** (mirroring `payload-refs`'s existence
 * check), because the 3-way decision needs a disk probe and a pure `check` has no port: the CLI resolves the
 * target path, probes existence, and dispatches to {@link attachSkillRefSpec} (ATTACH — no materialise) or
 * {@link scaffoldSkillRefSpec} (SCAFFOLD — WITH materialise), or raises a typed error when `--path` is given but
 * nothing exists there (registering nothing). This keeps each core spec single-purpose (so the materialise is
 * unconditional-per-spec, doc 11 line 91: attach materialises nothing) and makes the 3-way branch a thin CLI
 * shim P/F copy. Frontmatter validation stays in {@link attachSkillRefSpec}'s `apply` (it reads the file via the
 * fs port and validates) so the validation rule is shared, not re-implemented per family.
 *
 * **Pure over the ports** (doc 13 §1): the `bundle.yml` edit goes through the task-13 comment-preserving
 * {@link editYaml}; the stub render goes through the shared {@link renderSkillStub}; the attach read goes through
 * the injected fs port (operations MAY take + call the fs port — `advisor.ts` precedent). It imports only
 * `node:path`, the yaml leaf, the model, the frontmatter service, the shared renderer, the errors, and the
 * lifecycle types — never the CLI framework / subprocess library / `node:fs` — so the import-boundary rule on
 * `src/core/operations/` holds.
 */

/**
 * Describes one skill-reference category so the same operation core serves payload skills (O), bundle
 * installer-skills (P), and project installer-skills (F). The OPERATION is generic; a family supplies a
 * descriptor (+ the model/schema registry field + its `list` source).
 */
export interface SkillRefDescriptor {
  /** The host-relative on-disk directory skills of this category live under (e.g. `payload/agent-skills` for O). */
  readonly onDiskDir: string;
  /** The `bundle.yml`/`manifest.yml` key path whose sequence holds the `{name,path}` registry (e.g. `["payload", "skills"]`). */
  readonly registryPath: readonly string[];
  /** Project the registered {@link SkillRef} list off the parsed host bundle (e.g. `(b) => b.payload.skills`). */
  readonly select: (host: BundleManifest) => readonly SkillRef[];
  /** The template SNIPPET path the SCAFFOLD branch renders (e.g. `payload-skill.SKILL.md.tmpl` for O). */
  readonly snippetPath: string;
  /** The materialised authoring-task TITLE for the scaffold branch (doc 11) — `(name, hostId) => title`. */
  readonly materialiseTitle: (name: string, hostId: string) => string;
  /** The materialised authoring-task AC for the scaffold branch (doc 11) — `(name, hostId) => criterion`. */
  readonly materialiseAc: (name: string, hostId: string) => string;
  /** A human noun for messages (e.g. `payload skill`). */
  readonly noun: string;
}

/**
 * The `payload skills` descriptor (Family O) — `payload/agent-skills/` ↔ `bundle.yml`'s `payload.skills`,
 * scaffolding from the `payload-skill.SKILL.md.tmpl` snippet and materialising the doc-11 "Write payload skill"
 * task. P (`installer-skills` ← `bundles/<id>/installer-skills`, the `installer-skill.SKILL.md.tmpl` snippet) and
 * F (project-scoped) add their own descriptors the same way (the descriptor genericises the OPERATION, not the
 * model/schema registry field or the `list` source).
 */
export const PAYLOAD_SKILLS_DESCRIPTOR: SkillRefDescriptor = {
  onDiskDir: "payload/agent-skills",
  registryPath: ["payload", "skills"],
  select: (host) => host.payload.skills,
  snippetPath: "payload-skill.SKILL.md.tmpl",
  materialiseTitle: (name, hostId) => `Write payload skill ${name} for ${hostId}`,
  materialiseAc: (name, _hostId) =>
    `the stub's placeholder runtime-trigger description and body for ${name} are replaced with real content (triggers on the bundle's runtime use, per docs/05)`,
  noun: "payload skill",
};

/**
 * The `bundle installer-skills` descriptor (Family P) — `bundles/<id>/installer-skills/` ↔ the bundle-level
 * `installerSkills` registry in `bundle.yml`, scaffolding from the `installer-skill.SKILL.md.tmpl` snippet and
 * materialising the doc-11 "Write content for install-time skill" task. Reuses the O core's attach/scaffold/remove
 * specs unchanged (parameterised by this descriptor); P additionally supplies a SCAN-based `list`
 * ({@link scanInstallerSkillsSpec}) — the ONE pluggable piece O left — because installer-skills are union-scanned
 * at install (doc 06), so `list` reflects on-disk reality rather than the registry. The registry still backs
 * `add`/`remove`/completion (the deregister contract + the `remove` completion source), exactly as O's does.
 *
 * The registry is a TOP-LEVEL `bundle.yml` field (`["installerSkills"]`, a SIBLING of `payload`), NOT under
 * `payload:` — installer-skills are install-time HELPERS, not delivered payload (doc 06 line 77 / doc 07 line 51).
 */
export const BUNDLE_INSTALLER_SKILLS_DESCRIPTOR: SkillRefDescriptor = {
  onDiskDir: "installer-skills",
  registryPath: ["installerSkills"],
  select: (host) => host.installerSkills,
  snippetPath: "installer-skill.SKILL.md.tmpl",
  materialiseTitle: (name, hostId) => `Write content for install-time skill ${name} in ${hostId}`,
  materialiseAc: (name, hostId) =>
    `the stub's placeholder description and body for ${name} are replaced with real install-time helper content (active while the agent works ${hostId}'s installer-skills scope, per docs/06)`,
  noun: "installer skill",
};

/** A bundle's manifest filename, under `bundles/<id>/`. */
const BUNDLE_MANIFEST_FILE = "bundle.yml";

/**
 * The bundle-relative conventional SKILL.md path for a skill of this category: `<onDiskDir>/<name>/SKILL.md`
 * (e.g. `payload/agent-skills/<name>/SKILL.md` for O). The default target when no `--path` is given.
 *
 * @param descriptor - The skill category descriptor.
 * @param name - The skill name.
 * @returns The bundle-relative SKILL.md path.
 */
export function conventionalSkillPath(descriptor: SkillRefDescriptor, name: string): string {
  return `${descriptor.onDiskDir}/${name}/SKILL.md`;
}

/**
 * Resolve the enabled host bundle from the loaded project, or raise a {@link NotFoundError} (defense-in-depth
 * with the routing's `requireEnabledBundle`).
 *
 * @param project - The loaded project.
 * @param id - The host bundle id.
 * @returns The host bundle's parsed manifest.
 * @throws {NotFoundError} When `<id>` is not an enabled bundle.
 */
function requireBundle(project: Project, id: string): BundleManifest {
  const bundle = (project.bundles as ReadonlyMap<string, BundleManifest>).get(id);
  if (bundle === undefined) {
    throw new NotFoundError(`bundle "${id}" is not an enabled bundle`);
  }
  return bundle;
}

/** The path to `bundles/<id>/bundle.yml` under `root`. */
function bundleManifestPath(root: string, id: string): string {
  return join(root, "bundles", id, BUNDLE_MANIFEST_FILE);
}

/**
 * Register a {@link SkillRef} into the descriptor's registry sequence in `bundles/<id>/bundle.yml`, set-like on
 * `name` (an already-registered name is a no-op — never duplicated), comment-preservingly. Shared by the attach
 * and scaffold apply beats. Writes only the YAML registry; never any SKILL.md content.
 *
 * @param ctx - The apply context (fs port + root).
 * @param descriptor - The skill category descriptor.
 * @param host - The host bundle manifest (for the current registry).
 * @param id - The host bundle id.
 * @param ref - The `{name, path}` reference to register.
 * @returns The bundle.yml path if it changed, or `undefined` when the name was already registered (no-op).
 */
function registerSkillRef(
  ctx: ApplyContext,
  descriptor: SkillRefDescriptor,
  host: BundleManifest,
  id: string,
  ref: SkillRef,
): string | undefined {
  const current = [...descriptor.select(host)];
  if (current.some((existing) => existing.name === ref.name)) {
    // Set-like on name: already registered ⇒ no registry change.
    return undefined;
  }
  const next = [...current, { name: ref.name, path: ref.path }];
  const ymlPath = bundleManifestPath(ctx.root, id);
  const text = editYaml(ctx.fs.read(ymlPath), (doc) => {
    // `setIn(path, jsArray)` writes a clean block sequence even when `payload`/`payload.skills` is absent in an
    // old bundle.yml; comments + key order on the rest of the doc survive (edited in place).
    doc.setIn([...descriptor.registryPath], next);
  });
  ctx.fs.write(ymlPath, text);
  return ymlPath;
}

/** The input to {@link attachSkillRefSpec}: the host id, the skill name, and the bundle-relative SKILL.md path. */
export interface AttachSkillRefInput {
  /** The host bundle (selected + enabled-guarded by the `bundle <id>` routing). */
  readonly id: string;
  /** The skill name to register (the registry key). */
  readonly name: string;
  /** The bundle-relative path to the existing SKILL.md (the conventional path, or the `--path` location). */
  readonly path: string;
}

/** The input to {@link scaffoldSkillRefSpec}: the host id and the new skill name (scaffolded at the conventional path). */
export interface ScaffoldSkillRefInput {
  /** The host bundle (selected + enabled-guarded by the `bundle <id>` routing). */
  readonly id: string;
  /** The new skill name to scaffold + register. */
  readonly name: string;
}

/** The input to {@link removeSkillRefSpec}: the host id and the registered skill name to deregister. */
export interface RemoveSkillRefInput {
  /** The host bundle (selected + enabled-guarded by the `bundle <id>` routing). */
  readonly id: string;
  /** The registered skill name to deregister (the SKILL.md is left on disk). */
  readonly name: string;
}

/** The input to {@link listSkillRefsSpec}: the host bundle id to read. */
export interface SkillListInput {
  /** The host bundle whose registered skills to print (selected by the `bundle <id>` routing). */
  readonly id: string;
}

/**
 * `bundle <id> skills add <name>` — the ATTACH branch (doc 10 row 170 step 2), a mutation. ② CHECK re-asserts
 * the host bundle. ③ APPLY READS the SKILL.md at the resolved `path` through the fs port, validates its
 * frontmatter (must have `name` + `description`, else a {@link ValidationError} from {@link
 * validateSkillFrontmatter} — exit 1, registering nothing), then registers `{name, path}` in the registry
 * (set-like on name), writing NO content (structure-not-content, 74#1). ④ RERENDER (the harness) runs. NO
 * `materialise` (doc 10 row 170 step 2 / doc 11 line 91: attach queues no writing).
 *
 * The CLI dispatches here only when the SKILL.md already exists at the resolved path (it owns the disk probe).
 *
 * @param descriptor - The skill category descriptor.
 * @returns The attach operation spec.
 */
export function attachSkillRefSpec(
  descriptor: SkillRefDescriptor,
): OperationSpec<AttachSkillRefInput> {
  return {
    summary: (_project, { id, name }) =>
      `attached ${descriptor.noun} ${name} to ${id} (validated frontmatter; registered the reference)`,

    check: (project, { id }) => {
      requireBundle(project, id);
    },

    apply: (ctx: ApplyContext, project, { id, name, path }): ApplyOutcome => {
      const host = requireBundle(project, id);
      // Validate the author-placed SKILL.md's frontmatter (read via the fs port; the pure validator takes the
      // content as data). A malformed head throws ValidationError BEFORE any registry write — nothing registered.
      const skillAbs = join(ctx.root, "bundles", id, path);
      validateSkillFrontmatter(ctx.fs.read(skillAbs), `bundles/${id}/${path}`);

      const changed = registerSkillRef(ctx, descriptor, host, id, { name, path });
      return { changedPaths: changed !== undefined ? [changed] : [] };
    },
  };
}

/**
 * `bundle <id> skills add <name>` — the SCAFFOLD branch (doc 10 row 170 step 3), a mutation. ② CHECK re-asserts
 * the host bundle. ③ APPLY template-renders a payload-skill STUB at the conventional path via the shared {@link
 * renderSkillStub} (frontmatter `name: <name>` + the snippet's placeholder runtime-trigger description — NO
 * invented prose; no-op if somehow present), then registers `{name, conventionalPath}`. ④ RERENDER (the harness)
 * runs. ⑤ MATERIALISE the doc-11 "Write payload skill `<name>` for `<id>`" task (the harness materialises it
 * title-idempotently into the authoring backlog). 74#2.
 *
 * The CLI dispatches here only when no SKILL.md exists at the conventional path AND no `--path` was given.
 *
 * @param descriptor - The skill category descriptor.
 * @param deps - The built-in templates root + optional project template name for the snippet resolution.
 * @returns The scaffold operation spec.
 */
export function scaffoldSkillRefSpec(
  descriptor: SkillRefDescriptor,
  deps: SkillStubDeps,
): OperationSpec<ScaffoldSkillRefInput> {
  return {
    summary: (_project, { id, name }) =>
      `scaffolded ${descriptor.noun} ${name} for ${id} (rendered a stub + queued its writing; registered the reference)`,

    check: (project, { id }) => {
      requireBundle(project, id);
    },

    apply: (ctx: ApplyContext, project, { id, name }): ApplyOutcome => {
      const host = requireBundle(project, id);
      const stubRelPath = `bundles/${id}/${conventionalSkillPath(descriptor, name)}`;

      const changedPaths: string[] = [];
      // Template-render the structural stub (the snippet consumes `{{skill-name}}`; `{{bundle-id}}` is supplied
      // too so a category snippet that wants it works unchanged — the render service ignores unused params).
      for (const written of renderSkillStub(
        deps,
        ctx.fs,
        ctx.root,
        stubRelPath,
        descriptor.snippetPath,
        new Map([
          ["skill-name", name],
          ["bundle-id", id],
        ]),
      )) {
        changedPaths.push(written);
      }

      const registered = registerSkillRef(ctx, descriptor, host, id, {
        name,
        path: conventionalSkillPath(descriptor, name),
      });
      if (registered !== undefined) {
        changedPaths.push(registered);
      }
      return { changedPaths };
    },

    materialise: (_project, { id, name }): readonly AuthoringTaskSpec[] => [
      {
        title: descriptor.materialiseTitle(name, id),
        acceptanceCriteria: [descriptor.materialiseAc(name, id)],
      },
    ],
  };
}

/**
 * `bundle <id> skills remove <name>` (doc 10 row 172), a mutation. ② CHECK the name IS registered (else a {@link
 * NotFoundError} — 76#3, nothing changed). ③ APPLY deletes that entry from the registry sequence by index,
 * comment-preservingly; it does NOT touch the SKILL.md on disk (deregister-not-delete, 76#2). ④ RERENDER (the
 * harness) runs. The `summary` carries the doc-10-row-172 "left at …" message the command prints (76#1), built
 * from the REGISTERED ref's path directory (so a `--path`-relocated skill names its real location). No
 * `materialise`.
 *
 * @param descriptor - The skill category descriptor.
 * @returns The remove operation spec.
 */
export function removeSkillRefSpec(
  descriptor: SkillRefDescriptor,
): OperationSpec<RemoveSkillRefInput> {
  // The directory the deregistered SKILL.md was left in, captured during ② CHECK (which sees the registry BEFORE
  // ③ APPLY removes the entry) so the ⑥ summary — computed by the harness on the POST-apply project, where the
  // entry is already gone — can still name a `--path`-relocated skill's real location. A fresh spec per
  // `runMutation` call, so this per-invocation closure is safe.
  let removedDir = "";

  return {
    summary: (_project, { name }) => {
      const dir = removedDir !== "" ? removedDir : `${descriptor.onDiskDir}/${name}/`;
      return `deregistered; SKILL.md left at ${dir} — delete it yourself if you meant to`;
    },

    check: (project, { id, name }) => {
      const current = descriptor.select(requireBundle(project, id));
      const ref = current.find((s) => s.name === name);
      if (ref === undefined) {
        throw new NotFoundError(
          `${descriptor.noun} "${name}" is not registered in "${id}" — nothing to deregister`,
        );
      }
      // The registered path's parent dir (e.g. payload/agent-skills/<name>/, or a --path location's dir).
      removedDir = skillDir(ref.path);
    },

    apply: (ctx: ApplyContext, project, { id, name }): ApplyOutcome => {
      const current = [...descriptor.select(requireBundle(project, id))];
      const index = current.findIndex((s) => s.name === name); // present (CHECK validated)
      const ymlPath = bundleManifestPath(ctx.root, id);
      const text = editYaml(ctx.fs.read(ymlPath), (doc) => {
        // Remove only that index from the registry sequence; the SKILL.md on disk is left in place — we never
        // call `ctx.fs.remove`.
        doc.deleteIn([...descriptor.registryPath, index]);
      });
      ctx.fs.write(ymlPath, text);
      return { changedPaths: [ymlPath] };
    },
  };
}

/** The input to {@link removeUnregisteredSkillStubSpec}: the host id and the on-disk-but-unregistered skill name. */
export interface RemoveUnregisteredSkillInput {
  /** The host bundle (selected + enabled-guarded by the `bundle <id>` routing). */
  readonly id: string;
  /** The unregistered skill name whose stray on-disk stub directory is removed. */
  readonly name: string;
}

/**
 * `bundle <id> skills remove <name>` — the ORPHAN-CLEANUP branch (TASK-103), a mutation. The companion of {@link
 * removeSkillRefSpec}: where that DEREGISTERS a REGISTERED skill and leaves its SKILL.md on disk
 * (deregister-not-delete, 76#1/#2), THIS removes a skill that is present on disk but NOT registered — a stray
 * scaffold (an old `bundle new` payload-skill stub, or a hand-placed stub never `skills add`-registered). Because
 * nothing is registered there is nothing to deregister, so the sensible `remove` is to delete the stray scaffold
 * DIRECTORY `<onDiskDir>/<name>/` through the fs port. This NEVER deletes registered content: the registry is
 * authoritative for payload skills (inert until install, doc 06), so an unregistered on-disk skill was never
 * committed through `add` and is debris — and ② CHECK guards that `<name>` is genuinely unregistered before any
 * delete, so the deregister-not-delete contract for committed skills is preserved.
 *
 * The CLI dispatches here only when the name is NOT registered (it owns the registry probe — the registered-vs-
 * orphan split is the COMMAND-layer's, mirroring the `add` 3-way: a pure `check` has no port to probe disk).
 * ② CHECK re-asserts the host bundle and that `<name>` is unregistered (defense-in-depth). ③ APPLY probes the
 * conventional on-disk directory through the fs port; if present it removes it (recursively), else it raises a
 * {@link NotFoundError} (nothing registered, nothing on disk — nothing to remove), so a name matching neither
 * exits 1 with nothing changed. No `materialise`.
 *
 * @param descriptor - The skill category descriptor.
 * @returns The orphan-cleanup operation spec.
 */
export function removeUnregisteredSkillStubSpec(
  descriptor: SkillRefDescriptor,
): OperationSpec<RemoveUnregisteredSkillInput> {
  const stubDirRel = (name: string): string => `${descriptor.onDiskDir}/${name}`;

  return {
    summary: (_project, { name }) =>
      `removed unregistered ${descriptor.noun} ${name} (deleted the stray stub at ${stubDirRel(name)}/)`,

    check: (project, { id, name }) => {
      const current = descriptor.select(requireBundle(project, id));
      if (current.some((existing) => existing.name === name)) {
        // A registered skill is removed by DEREGISTER (removeSkillRefSpec), which LEAVES its SKILL.md on disk;
        // this delete path must never touch author-committed content (76#1/#2). Guard against a mis-dispatch.
        throw new ConstraintError(
          `${descriptor.noun} "${name}" is registered in "${id}" — deregister it (its SKILL.md is left on disk), not stub removal`,
        );
      }
    },

    apply: (ctx: ApplyContext, _project, { id, name }): ApplyOutcome => {
      const dirRel = stubDirRel(name);
      const dirAbs = join(ctx.root, "bundles", id, dirRel);
      if (!ctx.fs.exists(dirAbs)) {
        throw new NotFoundError(
          `${descriptor.noun} "${name}" is not registered in "${id}" and no stub exists at ${dirRel}/ — nothing to remove`,
        );
      }
      // Remove only the stray scaffold's own directory (recursively via the port); the parent `<onDiskDir>/` and
      // any sibling skills are left untouched.
      ctx.fs.remove(dirAbs);
      return { changedPaths: [dirAbs] };
    },
  };
}

/**
 * `bundle <id> skills list` (doc 10 row 171), a read. Projects the descriptor's registered {@link SkillRef}
 * list in registration order; the command prints each skill's name (75#1). Changes nothing (75#2). Registry-
 * based (payload skills are inert until install, so the registry is authoritative); P/F replace this with a
 * directory-scan list.
 *
 * @param descriptor - The skill category descriptor.
 * @returns The list read spec.
 */
export function listSkillRefsSpec(
  descriptor: SkillRefDescriptor,
): ReadSpec<SkillListInput, readonly SkillRef[]> {
  return {
    summary: (_project, { id }) => `bundle ${id} ${descriptor.noun}s`,
    project: (project, { id }) => [...descriptor.select(requireBundle(project, id))],
  };
}

/** The directory portion of a bundle-relative SKILL.md path (everything up to and including the last `/`). */
function skillDir(skillMdPath: string): string {
  const slash = skillMdPath.lastIndexOf("/");
  return slash >= 0 ? skillMdPath.slice(0, slash + 1) : "";
}

/**
 * The input to {@link scanInstallerSkillsSpec}: the host id and the helper NAMES already scanned off disk by the
 * command layer (which owns the fs port). The scan itself is threaded in — like `bundle <id> show` threads its
 * file tree — so the read's projection stays pure (no fs in the core read path).
 */
export interface ScanInstallerSkillsInput {
  /** The host bundle whose install-time helpers were scanned (selected by the `bundle <id>` routing). */
  readonly id: string;
  /** The helper NAMES the command scanned under the host's `installer-skills/` (sorted, already filtered). */
  readonly scannedNames: readonly string[];
}

/**
 * `bundle <id> installer-skills list` (doc 10 row 174) — a directory-SCAN read, the ONE piece P/F supply beyond
 * the O core. UNLIKE the registry-based {@link listSkillRefsSpec} (O — payload skills are inert until install, so
 * the registry is authoritative), installer-skills are **union-scanned at install** (doc 06), so `list` reflects
 * on-disk REALITY: an author-placed `installer-skills/<name>/SKILL.md` shows even if it was never `add`-registered,
 * and a `remove`-deregistered helper whose SKILL.md is left still shows (the registry and the scan are allowed to
 * diverge — the deliberate payload-vs-installer-skill split). The command performs the directory walk (it owns the
 * fs port) and threads the resulting `scannedNames` in; this spec PROJECTS them, changing nothing (the read is
 * pure). The command prints each name, or an empty marker.
 *
 * @returns The scan-list read spec (projects the threaded helper names).
 */
export function scanInstallerSkillsSpec(): ReadSpec<ScanInstallerSkillsInput, readonly string[]> {
  return {
    summary: (_project, { id }) => `bundle ${id} installer skills`,
    project: (_project, { scannedNames }) => [...scannedNames],
  };
}
