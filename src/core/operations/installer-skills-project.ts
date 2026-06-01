import { join } from "node:path";
import { editYaml } from "../../util/yaml.js";
import { NotFoundError, UsageError } from "../errors.js";
import type { AuthoringTaskSpec, Manifest, Project, SkillRef } from "../model/index.js";
import { validateSkillFrontmatter } from "../services/frontmatter.js";
import type { ApplyContext, ApplyOutcome, OperationSpec } from "./lifecycle.js";
import { renderSkillStub, type SkillStubDeps } from "./scaffold-skill.js";

/**
 * The **project-scoped installer-skill operations** behind the `project installer-skills` family (doc 10 rows
 * 178–180, Family F) — the PROJECT analogue of the bundle-scoped installer-skills (P, `skill-refs.ts` +
 * `BUNDLE_INSTALLER_SKILLS_DESCRIPTOR`). Where the O/P specs are bundle-keyed (input `{id}`, `requireBundle`,
 * editing `bundles/<id>/bundle.yml`), these are ROOT-keyed: no id, editing `manifest.yml`'s top-level
 * `installerSkills` registry, projecting from `project.manifest` — the SAME project-vs-bundle structural
 * divergence `version.ts`/`targets.ts` already embody (project ops edit `manifest.yml`; bundle ops take an id and
 * edit `bundle.yml`). So this is a small, single-purpose project-scoped spec set, NOT a generalisation of the
 * descriptor — keeping the twice-reused bundle core untouched.
 *
 * It REUSES the shared skill machinery unchanged: {@link renderSkillStub} (the structural-stub render),
 * {@link validateSkillFrontmatter} (the attach validation), the {@link SkillRef} shape, and the comment-preserving
 * {@link editYaml} set-like-add / index-remove mechanics — just over `manifest.yml`'s `["installerSkills"]`
 * sequence at the project root. The `installer-skills list` command does NOT use these specs: it SCANS the root
 * `installer-skills/` directory (excluding the main `<project>-installer` + the `<id>-advisor`s) via the
 * scope-agnostic `scanInstallerSkillsSpec` in `skill-refs.ts`, with the fs walk + exclusion in the CLI shell.
 *
 * **Two project-only rules** these specs enforce (absent from P): (1) a RESERVED-NAME REFUSAL — a `<name>` ending
 * in `-advisor` or equal to the main `<project>-installer` skill name is rejected as a {@link UsageError} (exit 2,
 * a bad argument) in the attach/scaffold `check`, since those name the reserved roles `init`/`advisor add` own,
 * not a hand-added helper (doc 10 row 178 step 1; AC45#4). (2) the `list` EXCLUSION lives in the command's scan.
 *
 * **Pure over the ports** (doc 13 §1): the `manifest.yml` edit goes through {@link editYaml}; the stub render
 * through {@link renderSkillStub}; the attach read through the injected fs port (operations MAY take + call the fs
 * port — `advisor.ts` precedent). Imports only `node:path`, the yaml leaf, the model, the frontmatter service, the
 * shared renderer, the errors, and the lifecycle types — never the CLI framework / subprocess library / `node:fs`
 * — so the import-boundary rule on `src/core/operations/` holds.
 */

/** The project manifest filename at the root. */
const MANIFEST_FILE = "manifest.yml";
/** The root-relative on-disk directory project-scoped install-time helper skills live under. */
const INSTALLER_SKILLS_DIR = "installer-skills";
/** The template snippet the SCAFFOLD branch renders (the same install-time-helper snippet P uses). */
const INSTALLER_SKILL_SNIPPET = "installer-skill.SKILL.md.tmpl";
/** The `manifest.yml` key path whose sequence holds the project `{name,path}` installer-skill registry. */
const REGISTRY_PATH = ["installerSkills"] as const;
/** The reserved suffix every advisor skill name carries (`<id>-advisor`), which `add` must refuse (AC45#4). */
const ADVISOR_SUFFIX = "-advisor";
/** The suffix of the main installer skill name (`<project>-installer`), which `add` must refuse (AC45#4). */
const INSTALLER_SUFFIX = "-installer";

/**
 * The root-relative conventional SKILL.md path for a project installer-skill: `installer-skills/<name>/SKILL.md`.
 * The default target when no `--path` is given.
 *
 * @param name - The installer-skill name.
 * @returns The project-root-relative SKILL.md path.
 */
export function conventionalProjectSkillPath(name: string): string {
  return `${INSTALLER_SKILLS_DIR}/${name}/SKILL.md`;
}

/**
 * The main installer skill name for a project: `<project-name>-installer` (doc 06 line 31). Computed from the
 * loaded manifest's project name — the name `add` must refuse and `list` must exclude.
 *
 * @param manifest - The loaded project manifest.
 * @returns The `<project>-installer` skill name.
 */
export function mainInstallerSkillName(manifest: Manifest): string {
  return `${manifest.meta.name}${INSTALLER_SUFFIX}`;
}

/**
 * Whether `name` is a RESERVED installer-skill name `project installer-skills add` must refuse (doc 10 row 178
 * step 1; AC45#4): a name ending in `-advisor` (every bundle's advisor is `<id>-advisor`) OR equal to the main
 * `<project>-installer` skill name. Pure — the project name is supplied (read from the loaded manifest).
 *
 * @param name - The candidate installer-skill name.
 * @param projectName - The manifest's project name (so the `<project>-installer` reserved name is known).
 * @returns `true` when the name is reserved and must be refused.
 */
export function isReservedInstallerSkillName(name: string, projectName: string): boolean {
  return name.endsWith(ADVISOR_SUFFIX) || name === `${projectName}${INSTALLER_SUFFIX}`;
}

/** Raise a {@link UsageError} (exit 2) when `name` is a reserved installer-skill name, naming why. */
function assertNotReserved(project: Project, name: string): void {
  if (isReservedInstallerSkillName(name, project.manifest.meta.name)) {
    const reason = name.endsWith(ADVISOR_SUFFIX)
      ? `names ending in "${ADVISOR_SUFFIX}" are reserved for bundle advisors`
      : `"${name}" is the main installer skill (${mainInstallerSkillName(project.manifest)})`;
    throw new UsageError(
      `installer-skill name "${name}" is reserved — ${reason}; pick another name`,
    );
  }
}

/**
 * Register a {@link SkillRef} into `manifest.yml`'s `installerSkills` sequence, set-like on `name` (an
 * already-registered name is a no-op), comment-preservingly. Shared by the attach + scaffold apply beats. Writes
 * only the manifest registry; never any SKILL.md content.
 *
 * @param ctx - The apply context (fs port + root).
 * @param manifest - The loaded manifest (for the current registry).
 * @param ref - The `{name, path}` reference to register.
 * @returns The manifest path if it changed, or `undefined` when the name was already registered (no-op).
 */
function registerProjectSkill(
  ctx: ApplyContext,
  manifest: Manifest,
  ref: SkillRef,
): string | undefined {
  const current = [...manifest.installerSkills];
  if (current.some((existing) => existing.name === ref.name)) {
    return undefined; // set-like on name: already registered ⇒ no registry change.
  }
  const next = [...current, { name: ref.name, path: ref.path }];
  const manifestPath = join(ctx.root, MANIFEST_FILE);
  const text = editYaml(ctx.fs.read(manifestPath), (doc) => {
    // `setIn` writes a clean block sequence even when `installerSkills` is absent in an old manifest.yml; the
    // rest of the doc (comments + key order) survives.
    doc.setIn([...REGISTRY_PATH], next);
  });
  ctx.fs.write(manifestPath, text);
  return manifestPath;
}

/** The input to {@link attachProjectInstallerSkillSpec}: the skill name + the root-relative SKILL.md path. */
export interface AttachProjectSkillInput {
  /** The installer-skill name to register (the registry key). */
  readonly name: string;
  /** The project-root-relative path to the existing SKILL.md (the conventional path, or a `--path` location). */
  readonly path: string;
}

/** The input to {@link scaffoldProjectInstallerSkillSpec}: the new skill name (scaffolded at the conventional path). */
export interface ScaffoldProjectSkillInput {
  /** The new installer-skill name to scaffold + register. */
  readonly name: string;
}

/** The input to {@link removeProjectInstallerSkillSpec}: the registered skill name to deregister. */
export interface RemoveProjectSkillInput {
  /** The registered installer-skill name to deregister (the SKILL.md is left on disk). */
  readonly name: string;
}

/**
 * `project installer-skills add <name> [--path <path>]` — the ATTACH branch (doc 10 row 178 steps 1–3), a
 * mutation. ② CHECK refuses a reserved `<name>` (a {@link UsageError}, exit 2 — AC45#4) BEFORE any effect. ③ APPLY
 * READS the SKILL.md at the resolved `path` through the fs port, validates its frontmatter (else a
 * {@link ValidationError} from {@link validateSkillFrontmatter} — exit 1, registering nothing), then registers
 * `{name, path}` in `manifest.yml`'s `installerSkills` (set-like on name), writing NO content. ④ RERENDER (the
 * harness) runs. NO `materialise` (attach queues no writing — doc 11).
 *
 * The CLI dispatches here only when the SKILL.md already exists at the resolved path (it owns the disk probe).
 *
 * @returns The attach operation spec.
 */
export function attachProjectInstallerSkillSpec(): OperationSpec<AttachProjectSkillInput> {
  return {
    summary: (_project, { name }) =>
      `attached installer skill ${name} (validated frontmatter; registered the reference at root scope)`,

    check: (project, { name }) => {
      assertNotReserved(project, name);
    },

    apply: (ctx: ApplyContext, project, { name, path }): ApplyOutcome => {
      // Validate the author-placed SKILL.md's frontmatter (read via the fs port; the pure validator takes the
      // content as data). A malformed head throws ValidationError BEFORE any registry write — nothing registered.
      const skillAbs = join(ctx.root, path);
      validateSkillFrontmatter(ctx.fs.read(skillAbs), path);

      const changed = registerProjectSkill(ctx, project.manifest, { name, path });
      return { changedPaths: changed !== undefined ? [changed] : [] };
    },
  };
}

/**
 * `project installer-skills add <name>` — the SCAFFOLD branch (doc 10 row 178 step 4), a mutation. ② CHECK refuses
 * a reserved `<name>` (a {@link UsageError}, exit 2 — AC45#4). ③ APPLY template-renders an installer-skill STUB at
 * the conventional root path via {@link renderSkillStub} (frontmatter `name: <name>` + the snippet's placeholder
 * description — NO invented prose; no-op if somehow present), then registers `{name, conventionalPath}`. ④
 * RERENDER (the harness) runs. ⑤ MATERIALISE the doc-11 "Write content for install-time skill `<name>`" task (the
 * harness materialises it title-idempotently into the authoring backlog).
 *
 * The CLI dispatches here only when no SKILL.md exists at the conventional path AND no `--path` was given.
 *
 * @param deps - The built-in templates root + optional project template name for the snippet resolution.
 * @returns The scaffold operation spec.
 */
export function scaffoldProjectInstallerSkillSpec(
  deps: SkillStubDeps,
): OperationSpec<ScaffoldProjectSkillInput> {
  return {
    summary: (_project, { name }) =>
      `scaffolded installer skill ${name} (rendered a stub + queued its writing; registered the reference at root scope)`,

    check: (project, { name }) => {
      assertNotReserved(project, name);
    },

    apply: (ctx: ApplyContext, project, { name }): ApplyOutcome => {
      const stubRelPath = conventionalProjectSkillPath(name);

      const changedPaths: string[] = [];
      for (const written of renderSkillStub(
        deps,
        ctx.fs,
        ctx.root,
        stubRelPath,
        INSTALLER_SKILL_SNIPPET,
        new Map([["skill-name", name]]),
      )) {
        changedPaths.push(written);
      }

      const registered = registerProjectSkill(ctx, project.manifest, {
        name,
        path: stubRelPath,
      });
      if (registered !== undefined) {
        changedPaths.push(registered);
      }
      return { changedPaths };
    },

    materialise: (_project, { name }): readonly AuthoringTaskSpec[] => [
      {
        title: `Write content for install-time skill ${name}`,
        acceptanceCriteria: [
          `the stub's placeholder description and body for ${name} are replaced with real install-time helper content (active while the agent works the project's installer-skills scope, per docs/06)`,
        ],
      },
    ],
  };
}

/**
 * `project installer-skills remove <name>` (doc 10 row 180), a mutation. ② CHECK the name IS registered (else a
 * {@link NotFoundError} — AC47#3, nothing changed). ③ APPLY deletes that entry from `manifest.yml`'s
 * `installerSkills` sequence by index, comment-preservingly; it does NOT touch the SKILL.md on disk
 * (deregister-not-delete, AC47#2). ④ RERENDER (the harness) runs. The `summary` carries the doc-10-row-180 "left
 * at …" message the command prints (AC47#1), built from the REGISTERED ref's path directory (so a
 * `--path`-relocated skill names its real location). No `materialise`.
 *
 * @returns The remove operation spec.
 */
export function removeProjectInstallerSkillSpec(): OperationSpec<RemoveProjectSkillInput> {
  // The directory the deregistered SKILL.md was left in, captured during ② CHECK (which sees the registry BEFORE
  // ③ APPLY removes the entry) so the ⑥ summary — computed by the harness on the POST-apply project, where the
  // entry is already gone — can still name a `--path`-relocated skill's real location. A fresh spec per
  // `runMutation` call, so this per-invocation closure is safe.
  let removedDir = "";

  return {
    summary: (_project, { name }) => {
      const dir = removedDir !== "" ? removedDir : `${INSTALLER_SKILLS_DIR}/${name}/`;
      return `deregistered; SKILL.md left at ${dir} — delete it yourself if you meant to`;
    },

    check: (project, { name }) => {
      const ref = project.manifest.installerSkills.find((s) => s.name === name);
      if (ref === undefined) {
        throw new NotFoundError(
          `installer skill "${name}" is not registered in this project — nothing to deregister`,
        );
      }
      removedDir = skillDir(ref.path);
    },

    apply: (ctx: ApplyContext, project, { name }): ApplyOutcome => {
      const current = [...project.manifest.installerSkills];
      const index = current.findIndex((s) => s.name === name); // present (CHECK validated)
      const manifestPath = join(ctx.root, MANIFEST_FILE);
      const text = editYaml(ctx.fs.read(manifestPath), (doc) => {
        // Remove only that index from the registry sequence; the SKILL.md on disk is left in place — we never
        // call `ctx.fs.remove`.
        doc.deleteIn([...REGISTRY_PATH, index]);
      });
      ctx.fs.write(manifestPath, text);
      return { changedPaths: [manifestPath] };
    },
  };
}

/** The directory portion of a root-relative SKILL.md path (everything up to and including the last `/`). */
function skillDir(skillMdPath: string): string {
  const slash = skillMdPath.lastIndexOf("/");
  return slash >= 0 ? skillMdPath.slice(0, slash + 1) : "";
}
