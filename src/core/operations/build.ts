import { join } from "node:path";
import type { AgentName, Project, ValidationProblem, ValidationReport } from "../model/index.js";
import type { FileSystem } from "../ports/index.js";
import { validateSkillFrontmatter } from "../services/frontmatter.js";
import {
  type Lockfile,
  parseLockfile,
  type VendoredArtifact,
  type VendoredFile,
  type VerifyResult,
  verifyLockfile,
} from "../services/integrity.js";
import {
  isPathWithin,
  isReservedPayloadSkillPackageRoot,
  payloadSkillPackageRoot,
} from "../services/skill-ref-path.js";
import { validateProject } from "../services/validate.js";

/**
 * The `build` operation's PURE PLAN (doc 13 §4/§5; doc 10 rows `build dry-run` / `build package` / `build
 * publish`). The build family is the first with real-world side effects (archiving, pushing) — and doc 13 §1's
 * boundary draws the line exactly here: **this module computes the plan, it never performs the effect.** The plan
 * is three pure reads over the project:
 *
 * 1. **validate** — `validateProject` (task-20): the project must be coherent before it ships (AC82#1).
 * 2. **frozen-lockfile** — verify `wpm.lock` against the vendored third-party content via the pure
 *    `verifyLockfile` (task-22): a silently-modified vendored skill must not ride into a package unnoticed
 *    (AC82#2; doc 08 §"Pinning and integrity"). A project that vendors nothing has no `wpm.lock` and trivially
 *    passes.
 * 3. **shippable enumeration** — the file tree that WOULD ship (doc 06 skeleton), MINUS the builder-time working
 *    dirs and the disabled bundle directories (doc 06's hard rule: "a directory under `bundles/` that the manifest
 *    doesn't list is disabled … the build never includes it"). One enumeration feeds BOTH dry-run's preview
 *    (AC82#3) and `build package`'s archive content, so the two cannot diverge.
 *
 * It is **pure over the injected FileSystem port** — the one abstraction the pure core uses to reach the file tree
 * (doc 13 §3; the same way `lifecycle.ts`'s `loadProject`/`applyRerender` read through the port). It imports only
 * the model/services/ports + `node:path`; never `node:fs`/`execa`/`commander`/`node:child_process`, so the
 * import-boundary rule on `src/core/operations/` holds. The ACTUAL archiving + pushing live in an adapter
 * (`src/adapters/packager.ts`) and the CLI shell — never here.
 */

/** The lockfile pinning vendored third-party content, at the project root (doc 06; doc 08). `[OPT]`. */
const LOCKFILE_NAME = "wpm.lock";
/** Where vendored third-party artifacts (and the project's own installer skills) live (doc 06). */
const INSTALLER_SKILLS_DIR = "installer-skills";
/** The bundles directory (doc 06/10). */
const BUNDLES_DIR = "bundles";
/** The authoring-only default bundle scaffold under `bundles/`; it is copied to create bundles but never ships. */
const BUNDLE_TEMPLATE_DIR = "bundle-template";

/**
 * The deliverable executor front door's **authoring-time reserved name** (doc 06/12). It carries a leading
 * underscore so no agent's exact-basename front-door discovery (`AGENTS.md`/`CLAUDE.md`/`GEMINI.md`) ever
 * auto-loads it during authoring — yet it stays `.md` and author-editable. The build strips the prefix to the
 * canonical name (below), at the project root and inside each shipped bundle (the self-similar surfaces).
 */
const RESERVED_FRONT_DOOR = "_AGENTS.md";
/** The canonical, universally auto-discovered executor front-door name the build restores `_AGENTS.md` to (doc 05). */
const CANONICAL_FRONT_DOOR = "AGENTS.md";

/**
 * The per-target executor front-door alias FILENAMES — the build-created aliases a given target agent needs when
 * it does NOT read the universal `AGENTS.md` natively (doc 05 §"AGENTS.md (and CLAUDE.md / GEMINI.md variants)").
 * A DATA map so adding an agent later is a one-line change. Grounded in doc 05:
 *
 * | AgentName     | front-door filename | doc 05                                              |
 * |---------------|---------------------|-----------------------------------------------------|
 * | `claude-code` | `CLAUDE.md`         | "Claude Code using the sibling `CLAUDE.md`"         |
 * | `gemini`      | `GEMINI.md`         | the `GEMINI.md` variant                             |
 *
 * Every other targeted agent (`codex`, `hermes`, `openclaw`, …) reads `AGENTS.md` natively (the broad open
 * standard), so it needs no alias and is absent here — an alias is created ONLY for a target whose front-door
 * basename differs from the canonical `AGENTS.md`.
 */
const FRONT_DOOR_ALIAS_FILENAMES: Readonly<Record<string, string>> = {
  "claude-code": "CLAUDE.md",
  gemini: "GEMINI.md",
};

/**
 * Top-level directory names that are NEVER part of the shippable set: builder-time working state and VCS/build
 * artifacts. `.authoring-backlog/` is the CLI's hidden authoring Backlog.md root (doc 10 §"The authoring-backlog")
 * — builder-time only, the analogue of the excluded dev backlog, and `init` already lists it in `.gitignore`.
 * `.git/`/`node_modules/`/`dist/` are VCS/dependency/build artifacts that are not project content.
 */
const NON_SHIPPABLE_TOP_LEVEL: ReadonlySet<string> = new Set([
  ".authoring-backlog",
  ".git",
  "node_modules",
  "dist",
]);

/** A vendored artifact's pinned identity, projected from its `wpm.lock` entry for the dry-run preview (AC82#3). */
export interface VendoredArtifactSummary {
  /** The artifact name (the `installer-skills/<name>/` folder; the lockfile key). */
  readonly name: string;
  /** Where it came from — the provenance string (a marketplace id, a git URL + ref, a release). */
  readonly source: string;
  /** The resolved, locked version. */
  readonly version: string;
}

/** The result of the frozen-lockfile check, plus whether a `wpm.lock` was present at all. */
export interface LockCheck extends VerifyResult {
  /**
   * Whether a `wpm.lock` exists at the project root. When `false` the project vendors nothing pinned, so the
   * check passes trivially (`ok: true`, all lists empty) — the common fresh-project case (doc 06: `wpm.lock` is
   * "Present only when the project vendors such content").
   */
  readonly present: boolean;
}

/**
 * One executor-front-door transform the build performs while archiving (doc 06/12): rename a reserved-prefix
 * `_AGENTS.md` to its canonical `AGENTS.md`, and synthesize the per-target alias front doors beside it. Computed
 * PURELY here (the policy); the packager adapter PERFORMS it (the effect — staging + the verbatim byte copy + the
 * alias symlinks). All paths are root-relative POSIX, so they line up with {@link BuildPlan.shippable}.
 */
export interface FrontDoorTransform {
  /** The reserved-prefix source path in the shippable set, e.g. `_AGENTS.md` or `bundles/core/_AGENTS.md`. */
  readonly from: string;
  /** The canonical stripped destination, in the same directory, e.g. `AGENTS.md` or `bundles/core/AGENTS.md`. */
  readonly to: string;
  /**
   * The build-created per-target alias front doors, in the same directory (e.g. `CLAUDE.md`,
   * `bundles/core/CLAUDE.md`) — one per targeted agent whose front-door basename is not the universal `AGENTS.md`
   * (doc 05). Empty when every target reads `AGENTS.md` natively.
   */
  readonly aliases: readonly string[];
}

/**
 * Compute the executor-front-door transforms for a project (doc 06 §"Self-similar surfaces"; doc 12 §"The
 * executor front door's reserved-prefix transform"). For every reserved-prefix `_AGENTS.md` in the shippable set
 * — the project-root one (task-87) and each SHIPPED bundle's `bundles/<id>/_AGENTS.md` (disabled bundles are
 * already pruned from `shippable`, so they never appear) — emit a strip-to-canonical transform plus the
 * build-created per-target aliases ({@link FRONT_DOOR_ALIAS_FILENAMES}). Matching is by EXACT basename, so the
 * bundle-template's un-rendered `_AGENTS.md.tmpl` (a different basename) is never matched. Pure and deterministic
 * (output order follows `shippable`'s sorted order; aliases follow `targets` order, de-duplicated).
 *
 * @param shippable - The sorted, root-relative shippable file paths (POSIX).
 * @param targets - The project's declared target agents (`manifest.targets`).
 * @returns The front-door transforms (one per reserved-prefix `_AGENTS.md`), in `shippable` order.
 */
export function computeFrontDoorTransforms(
  shippable: readonly string[],
  targets: readonly AgentName[],
): FrontDoorTransform[] {
  // The per-target alias FILENAMES (de-duplicated, in target order): a target with no entry reads AGENTS.md
  // natively and contributes nothing. Computed once — it is the same for every front door in the project.
  const aliasFilenames: string[] = [];
  for (const target of targets) {
    const filename = FRONT_DOOR_ALIAS_FILENAMES[target];
    if (filename !== undefined && !aliasFilenames.includes(filename)) {
      aliasFilenames.push(filename);
    }
  }

  const transforms: FrontDoorTransform[] = [];
  for (const rel of shippable) {
    const slash = rel.lastIndexOf("/");
    const base = slash === -1 ? rel : rel.slice(slash + 1);
    if (base !== RESERVED_FRONT_DOOR) {
      continue;
    }
    const dir = slash === -1 ? "" : rel.slice(0, slash + 1); // includes the trailing `/`, or "" at the root
    transforms.push({
      from: rel,
      to: `${dir}${CANONICAL_FRONT_DOOR}`,
      aliases: aliasFilenames.map((filename) => `${dir}${filename}`),
    });
  }
  return transforms;
}

/**
 * The build plan — the pure, render-agnostic value the dry-run/package/publish commands compute and then act on
 * (doc 13 §2/§3: the core returns data; the shell formats + the adapter performs the effect). `ok` is `true`
 * exactly when validation passed AND the lockfile check passed — i.e. the project is buildable.
 */
export interface BuildPlan {
  /** Whether the project is buildable: validation clean AND the frozen-lockfile check clean. */
  readonly ok: boolean;
  /** The project's release name (from `manifest.yml.project.name`) — names the archive. */
  readonly name: string;
  /** The project's release version (from `manifest.yml.project.version`) — names the archive. */
  readonly version: string;
  /** The validation report (doc 13 §4; task-20), aggregating every coherence problem (AC82#1). */
  readonly validation: ValidationReport;
  /** The frozen-lockfile verification result (task-22) plus the lock-present flag (AC82#2). */
  readonly lock: LockCheck;
  /** The vendored artifacts pinned in `wpm.lock`, with their locked version + source (AC82#3); empty if none. */
  readonly vendored: readonly VendoredArtifactSummary[];
  /** The sorted, root-relative file paths that WOULD ship (AC82#3; the archive content for `build package`). */
  readonly shippable: readonly string[];
  /**
   * The executor-front-door transforms the packager applies while archiving (task-90; doc 06/12): each
   * reserved-prefix `_AGENTS.md` in `shippable` (root + per shipped bundle) is renamed to its canonical
   * `AGENTS.md` and its per-target aliases are synthesized. Empty when the deliverable carries no `_AGENTS.md`.
   */
  readonly frontDoorTransforms: readonly FrontDoorTransform[];
}

/** The input to {@link computeBuildPlan}: the loaded project plus the inputs the shell pre-reads for it. */
export interface BuildPlanInput {
  /** The loaded project (manifest + every enabled bundle's parsed `bundle.yml`). */
  readonly project: Project;
  /** The directory names present under `bundles/` — the input `validateProject` needs to detect orphans. */
  readonly bundleDirectoryNames: readonly string[];
}

/**
 * Recursively read a vendored artifact's file tree under `installer-skills/<name>/` into {@link VendoredFile}s
 * (relative path + content), so {@link verifyLockfile} can re-hash it. Returns `[]` when the directory is absent
 * (a pinned-but-missing artifact — `verifyLockfile` then reports it as `missing`). Reads only through the port.
 *
 * @param fs - The FileSystem port.
 * @param root - The project root.
 * @param name - The artifact name (its `installer-skills/<name>/` folder).
 * @returns The artifact's files, with paths relative to the artifact root.
 */
function readVendoredFiles(fs: FileSystem, root: string, name: string): VendoredFile[] {
  const base = join(root, INSTALLER_SKILLS_DIR, name);
  const files: VendoredFile[] = [];
  const walk = (rel: string): void => {
    const abs = rel === "" ? base : join(base, rel);
    if (!fs.exists(abs)) {
      return;
    }
    for (const entry of fs.list(abs)) {
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.kind === "directory") {
        walk(childRel);
      } else {
        files.push({ path: childRel, content: fs.read(join(base, childRel)) });
      }
    }
  };
  walk("");
  return files;
}

/**
 * Build the current vendored set from a parsed lockfile: for each PINNED artifact whose `installer-skills/<name>/`
 * directory EXISTS on disk, re-read its file tree and carry its source/version from the lock entry. A pinned
 * artifact whose directory is ABSENT is OMITTED, so {@link verifyLockfile} reports it as `missing` (not `drifted`
 * via an empty tree). Deliberately reads ONLY the pinned names — so `verifyLockfile` reports `drifted` (a pinned
 * tree whose hash changed) and `missing` (a pinned tree absent on disk), but never spuriously flags `extra`: an
 * authored `<project>-installer` skill sits in `installer-skills/` un-pinned and must not be treated as drift. The
 * lock IS the authoritative list of what is vendored (doc 08).
 *
 * @param fs - The FileSystem port.
 * @param root - The project root.
 * @param lock - The parsed lockfile.
 * @returns The current vendored artifacts (present ones only), ordered by the lock's pins.
 */
function currentVendored(fs: FileSystem, root: string, lock: Lockfile): VendoredArtifact[] {
  const current: VendoredArtifact[] = [];
  for (const [name, entry] of Object.entries(lock.artifacts)) {
    // Skip a pinned-but-absent artifact: leaving it out of `current` makes verifyLockfile report it as `missing`
    // (the precise failure), rather than as `drifted` against an empty tree.
    if (!fs.exists(join(root, INSTALLER_SKILLS_DIR, name))) {
      continue;
    }
    current.push({
      name,
      source: entry.source,
      version: entry.version,
      files: readVendoredFiles(fs, root, name),
    });
  }
  return current;
}

/**
 * Verify the project's `wpm.lock` against the vendored content on disk (doc 08 §"Pinning and integrity"; the
 * `--frozen-lockfile` discipline). When no `wpm.lock` is present the project vendors nothing pinned and the check
 * passes trivially. Otherwise the lock is parsed, each pinned artifact's tree is re-read and re-hashed, and the
 * result reports any `drifted`/`missing` artifact (AC82#2). Pure over the port; a genuinely malformed lockfile
 * throws (it is a real defect, not data — `parseLockfile`'s contract).
 *
 * @param fs - The FileSystem port.
 * @param root - The project root.
 * @returns The lock check (with `present`) plus the parsed lockfile (or `undefined` when absent).
 */
function checkLockfile(
  fs: FileSystem,
  root: string,
): { readonly check: LockCheck; readonly lock: Lockfile | undefined } {
  const lockPath = join(root, LOCKFILE_NAME);
  if (!fs.exists(lockPath)) {
    // Trivial pass: nothing vendored is pinned, so nothing can drift (doc 06: `wpm.lock` present only when vendoring).
    return {
      check: { present: false, ok: true, drifted: [], missing: [], extra: [] },
      lock: undefined,
    };
  }
  const lock = parseLockfile(fs.read(lockPath));
  const result = verifyLockfile(lock, currentVendored(fs, root, lock));
  return { check: { present: true, ...result }, lock };
}

/**
 * Enumerate the SHIPPABLE file tree (doc 06 §"Project skeleton"): every file under the project root, as sorted
 * root-relative paths, EXCLUDING the builder-time working dirs ({@link NON_SHIPPABLE_TOP_LEVEL}), every DISABLED
 * bundle directory, the authoring-only `bundles/bundle-template/` scaffold, and unresolved builder-template
 * sources. Runtime payload templates under an enabled bundle remain shippable because their `.tmpl` suffix is
 * product content interpreted at install time, not a builder placeholder. The walk does NOT recurse into
 * symlinked directories: in a generated
 * project the symlinks are the scope aliases (`.claude/skills → installer-skills/`, etc.) and each bundle's
 * `backlog → install-backlog` recipe alias (TASK-102), so skipping symlinked dirs records the alias path itself
 * without doubling its target's bytes. Pure over the port.
 *
 * @param fs - The FileSystem port.
 * @param root - The project root.
 * @param project - The loaded project model: its manifest drives enabled-bundle pruning and each enabled
 * bundle's `payload.skills` registry authorizes payload-skill directory packages.
 * @returns The sorted, root-relative shippable file paths.
 */
export function shippableFiles(fs: FileSystem, root: string, project: Project): string[] {
  const enabled = new Set<string>(project.manifest.bundles);
  const skillPolicies = payloadSkillPolicies(fs, root, project);
  const registeredSkillRoots = [...skillPolicies.values()].flatMap(
    (policy) => policy.registeredRoots,
  );
  const out: string[] = [];

  const walk = (rel: string): void => {
    const abs = rel === "" ? root : join(root, rel);
    if (!fs.exists(abs)) {
      return;
    }
    for (const entry of fs.list(abs)) {
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;

      // Prune builder-time working dirs at the top level (.authoring-backlog/, .git/, node_modules/, dist/).
      if (rel === "" && NON_SHIPPABLE_TOP_LEVEL.has(entry.name)) {
        continue;
      }
      // Prune every non-enabled direct child of bundles/, including the authoring-only bundle-template
      // scaffold. Do not key this on `entry.kind`: the real FileSystem reports symlinks as file-like leaves,
      // and an orphan/scaffold symlink must not bypass the same manifest boundary as a directory.
      if (rel === BUNDLES_DIR && (entry.name === BUNDLE_TEMPLATE_DIR || !enabled.has(entry.name))) {
        continue;
      }

      // `bundle.yml payload.skills` is authoritative. Under the conventional payload-skill container, recurse
      // only into an exact registered directory root (or an ancestor needed to reach a nested custom root).
      // Apply this before the entry-kind branch so a file-like symlink root cannot bypass registration.
      const skillPolicy = conventionalSkillContainerPolicy(rel, skillPolicies);
      if (
        skillPolicy !== undefined &&
        !skillPolicy.registeredRoots.some(
          (registeredRoot) =>
            registeredRoot === childRel || registeredRoot.startsWith(`${childRel}/`),
        )
      ) {
        continue;
      }

      // `.tmpl` is the builder's source suffix. The only shippable exception is a real enabled bundle's
      // payload/templates/ subtree or a registered payload-skill root: both are runtime product content, not
      // unresolved builder sources. Keeping these exceptions avoids silently breaking an author's payload.
      if (
        entry.kind !== "directory" &&
        isUnresolvedBuilderTemplate(childRel, enabled, registeredSkillRoots)
      ) {
        continue;
      }

      if (entry.kind === "directory") {
        // Do not traverse a symlinked directory (a scope alias, or a bundle's `backlog → install-backlog`
        // alias): record the link path itself as a leaf so the ship set names the alias without duplicating its
        // target (installer-skills/ or install-backlog/) under it. `isSymlink` is best-effort — the in-memory
        // fake has no symlink-dir distinction, so a real alias only appears through the real adapter, where it
        // is detected; absent the distinction the dir is walked normally (harmless in tests).
        if (isSymlinkDir(fs, abs, childRel)) {
          out.push(childRel);
        } else {
          walk(childRel);
        }
      } else {
        out.push(childRel);
      }
    }
  };
  walk("");
  return filterPayloadSkillPackages(fs, root, out, skillPolicies).sort();
}

/** Whether a `.tmpl` path is unresolved builder input rather than an enabled bundle's runtime payload template. */
function isUnresolvedBuilderTemplate(
  rel: string,
  enabled: ReadonlySet<string>,
  registeredSkillRoots: readonly string[],
): boolean {
  if (!rel.endsWith(".tmpl")) {
    return false;
  }
  if (registeredSkillRoots.some((root) => isPathWithin(rel, root))) {
    return false;
  }
  const match = /^bundles\/([^/]+)\/payload\/templates\//.exec(rel);
  return match === null || !enabled.has(match[1] as string);
}

/** The payload-skill ship policy for one enabled bundle, projected from the already parsed project model. */
interface PayloadSkillPolicy {
  readonly bundleRoot: string;
  readonly conventionalRoot: string;
  readonly declaredRoots: readonly string[];
  readonly registeredRoots: readonly string[];
}

/** Project each enabled bundle's existing, valid `payload.skills` refs into exact package boundaries. */
function payloadSkillPolicies(
  fs: FileSystem,
  root: string,
  project: Project,
): ReadonlyMap<string, PayloadSkillPolicy> {
  const policies = new Map<string, PayloadSkillPolicy>();
  for (const [id, bundle] of project.bundles) {
    const bundleRoot = `${BUNDLES_DIR}/${id}`;
    const declaredRoots = new Set<string>();
    const registeredRoots = new Set<string>();
    for (const ref of bundle.payload.skills) {
      const skillRoot = payloadSkillPackageRoot(ref.path);
      const documentPath = `${bundleRoot}/${ref.path}`;
      if (skillRoot === undefined) continue;
      const absoluteRoot = `${bundleRoot}/${skillRoot}`;
      declaredRoots.add(absoluteRoot);
      if (!fs.exists(join(root, documentPath))) continue;
      if (isValidSkillDocument(fs, root, documentPath)) registeredRoots.add(absoluteRoot);
    }
    policies.set(String(id), {
      bundleRoot,
      conventionalRoot: `${bundleRoot}/payload/agent-skills`,
      declaredRoots: [...declaredRoots].sort(),
      registeredRoots: [...registeredRoots].sort(),
    });
  }
  return policies;
}

/** Return the bundle policy when `rel` is exactly its conventional payload-skill container. */
function conventionalSkillContainerPolicy(
  rel: string,
  policies: ReadonlyMap<string, PayloadSkillPolicy>,
): PayloadSkillPolicy | undefined {
  const match = /^bundles\/([^/]+)\/payload\/agent-skills$/.exec(rel);
  return match === null ? undefined : policies.get(match[1] as string);
}

/**
 * Remove detectable custom-path payload-skill packages that have no registry entry. Conventional roots were
 * pruned during traversal (including symlink leaves); this second pass handles relocated skill directories by
 * recognizing a valid skill-frontmatter document with any basename. Reserved bundle surfaces with independent
 * delivery/scan semantics are excluded from detection, so their ordinary frontmatter-bearing files are intact.
 */
function filterPayloadSkillPackages(
  fs: FileSystem,
  root: string,
  paths: readonly string[],
  policies: ReadonlyMap<string, PayloadSkillPolicy>,
): string[] {
  const unregisteredRoots = new Set<string>();
  for (const path of paths) {
    const match = /^bundles\/([^/]+)\/(.+)$/.exec(path);
    if (match === null) continue;
    const policy = policies.get(match[1] as string);
    if (policy === undefined) continue;
    if (policy.registeredRoots.some((registeredRoot) => isPathWithin(path, registeredRoot))) {
      continue;
    }
    const skillRoot = detectedSkillPackageRoot(fs, root, path);
    if (skillRoot === undefined) continue;
    const bundleRelativeRoot = skillRoot.slice(policy.bundleRoot.length + 1);
    if (isProtectedNonPayloadSkillSurface(bundleRelativeRoot)) continue;
    unregisteredRoots.add(skillRoot);
  }

  return paths.filter((path) => {
    const policy = [...policies.values()].find((candidate) =>
      isPathWithin(path, candidate.bundleRoot),
    );
    if (policy === undefined) return true;
    if (policy.registeredRoots.some((registeredRoot) => isPathWithin(path, registeredRoot))) {
      return true;
    }
    // A declared ref whose document is missing or invalid never authorizes neighboring package content.
    if (policy.declaredRoots.some((declaredRoot) => isPathWithin(path, declaredRoot))) {
      return false;
    }
    // Traversal may enter an ancestor to reach a nested registered custom root. Only the ancestor leaf itself
    // (not arbitrary sibling content below it) is eligible to survive alongside the exact registered subtree.
    if (isPathWithin(path, policy.conventionalRoot)) {
      return policy.registeredRoots.some((registeredRoot) => registeredRoot.startsWith(`${path}/`));
    }
    return ![...unregisteredRoots].some((unregisteredRoot) => isPathWithin(path, unregisteredRoot));
  });
}

/**
 * Detect the package root represented by one enumerated leaf. Regular skill documents may use any basename.
 * The real adapter reports a directory symlink as a file-like leaf, so an immediate directory listing is also
 * attempted; a valid document directly inside that linked directory identifies the link itself as the package.
 */
function detectedSkillPackageRoot(fs: FileSystem, root: string, path: string): string | undefined {
  if (isValidSkillDocument(fs, root, path)) {
    const slash = path.lastIndexOf("/");
    return slash > 0 ? path.slice(0, slash) : undefined;
  }
  try {
    for (const entry of fs.list(join(root, path))) {
      if (entry.kind === "file" && isValidSkillDocument(fs, root, `${path}/${entry.name}`)) {
        return path;
      }
    }
  } catch {
    // A normal file is not listable; only a directory-like symlink reaches the loop above.
  }
  return undefined;
}

/** Whether an on-disk document has the same valid frontmatter required by `skills add --path`. */
function isValidSkillDocument(fs: FileSystem, root: string, documentPath: string): boolean {
  try {
    validateSkillFrontmatter(fs.read(join(root, documentPath)), documentPath);
    return true;
  } catch {
    return false;
  }
}

/** Bundle subtrees whose valid skill-like frontmatter belongs to a distinct non-payload-skill surface. */
function isProtectedNonPayloadSkillSurface(bundleRelativeRoot: string): boolean {
  return isReservedPayloadSkillPackageRoot(bundleRelativeRoot);
}

/** Build-blocking problems for registered payload-skill documents that are missing or no longer valid. */
function payloadSkillSourceProblems(
  fs: FileSystem,
  root: string,
  project: Project,
): ValidationProblem[] {
  const problems: ValidationProblem[] = [];
  for (const [id, bundle] of project.bundles) {
    for (const ref of bundle.payload.skills) {
      const relative = `${BUNDLES_DIR}/${id}/${ref.path}`;
      const field = `bundles.${id}.payload.skills.${ref.name}.path`;
      if (!fs.exists(join(root, relative))) {
        problems.push({
          message: `registered payload skill "${ref.name}" is missing at ${relative}`,
          field,
        });
      } else if (!isValidSkillDocument(fs, root, relative)) {
        problems.push({
          message: `registered payload skill "${ref.name}" is invalid at ${relative}`,
          field,
        });
      }
    }
  }
  return problems;
}

/**
 * Whether a directory entry is a symlink that must not be traversed (an alias). The {@link FileSystem} port's
 * `list` does not expose the symlink bit, so this is a structural heuristic over the root-relative path:
 *
 * - a directory whose name is a known scanned-scope alias root (`.claude`, `.agents`, `.openclaw`, `.cursor`,
 *   `.gemini`) at any level — a symlink into `installer-skills/` (doc 05/06); or
 * - the per-bundle `bundles/<id>/backlog` link — the `backlog → install-backlog` alias every bundle ships so the
 *   Backlog.md CLI resolves its recipe (TASK-102; doc 06).
 *
 * Either is recorded as a **leaf** (the link path itself) rather than walked, so the ship set names the alias
 * once and never doubles its target's bytes — `installer-skills/**` is not re-counted under a scope alias, and
 * `install-backlog/**` is not re-counted under a bundle's `backlog/`. Pure (path-based).
 *
 * @param _fs - The FileSystem port (unused; kept for a future symlink-aware port method).
 * @param _abs - The absolute path (unused; reserved).
 * @param rel - The root-relative path of the entry.
 * @returns `true` when the entry is an alias directory to record-not-traverse.
 */
function isSymlinkDir(_fs: FileSystem, _abs: string, rel: string): boolean {
  const name = rel.includes("/") ? (rel.split("/").pop() as string) : rel;
  return SCOPE_ALIAS_DIR_NAMES.has(name) || BUNDLE_BACKLOG_ALIAS_RE.test(rel);
}

/** The scanned-scope alias directory names (doc 05/06) — symlinks into `installer-skills/`, recorded not walked. */
const SCOPE_ALIAS_DIR_NAMES: ReadonlySet<string> = new Set([
  ".claude",
  ".agents",
  ".openclaw",
  ".cursor",
  ".gemini",
]);

/**
 * The per-bundle `backlog → install-backlog` alias path (TASK-102; doc 06): exactly `bundles/<id>/backlog` (the
 * single bundle segment, no deeper). Matched precisely so a real `install-backlog/` (a different basename) is
 * still walked and shipped, and only the bundle-level link is recorded as a leaf — never duplicating
 * `install-backlog/**` through it.
 */
const BUNDLE_BACKLOG_ALIAS_RE = /^bundles\/[^/]+\/backlog$/;

/**
 * Compute the {@link BuildPlan} — the pure plan the build commands act on (doc 13 §4/§5). Runs the three pure
 * reads (validate, frozen-lockfile, shippable enumeration) over the loaded project + the injected FileSystem port,
 * and returns the structured result. Performs NO effect (AC82#3: dry-run produces no artefact) — the command layer
 * formats it and the adapter (for package/publish) performs the archiving/pushing.
 *
 * @param fs - The FileSystem port (reads only).
 * @param root - The resolved project root.
 * @param input - The loaded project + the enabled-bundle ids + the `bundles/` directory names.
 * @returns The build plan.
 * @throws If `wpm.lock` is present but malformed (`parseLockfile`'s contract — a tampered lock is a defect).
 */
export function computeBuildPlan(fs: FileSystem, root: string, input: BuildPlanInput): BuildPlan {
  const { project, bundleDirectoryNames } = input;

  // (1) validate — fail the build on any coherence problem (AC82#1).
  const projectValidation = validateProject(project, bundleDirectoryNames);
  const skillProblems = payloadSkillSourceProblems(fs, root, project);
  const validation: ValidationReport = {
    ok: projectValidation.ok && skillProblems.length === 0,
    problems: [...projectValidation.problems, ...skillProblems],
  };

  // (2) frozen-lockfile — verify wpm.lock against the vendored content (AC82#2); absent ⇒ trivial pass.
  const { check, lock } = checkLockfile(fs, root);

  // (3) shippable enumeration — the file tree that would ship (AC82#3 / `build package` archive content).
  const shippable = shippableFiles(fs, root, project);

  // (4) front-door transforms — the build-time `_AGENTS.md` → `AGENTS.md` (+ per-target aliases) strip the
  // packager performs while archiving (task-90; doc 06/12). Pure policy here; the adapter performs the effect.
  const frontDoorTransforms = computeFrontDoorTransforms(shippable, project.manifest.targets);

  // The vendored summary for the preview: each pinned artifact's locked version + source (AC82#3).
  const vendored: VendoredArtifactSummary[] =
    lock !== undefined
      ? Object.entries(lock.artifacts).map(([name, entry]) => ({
          name,
          source: entry.source,
          version: entry.version,
        }))
      : [];

  return {
    ok: validation.ok && check.ok,
    name: project.manifest.meta.name,
    version: project.manifest.meta.version,
    validation,
    lock: check,
    vendored,
    shippable,
    frontDoorTransforms,
  };
}
