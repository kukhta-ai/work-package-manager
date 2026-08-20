import { join } from "node:path";
import type { Project, ValidationReport } from "../model/index.js";
import type { FileSystem } from "../ports/index.js";
import {
  type Lockfile,
  parseLockfile,
  type VendoredArtifact,
  type VendoredFile,
  type VerifyResult,
  verifyLockfile,
} from "../services/integrity.js";
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
/** The default bundle scaffold under `bundles/`, always shippable even without a manifest entry (doc 10). */
const BUNDLE_TEMPLATE_DIR = "bundle-template";

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
}

/** The input to {@link computeBuildPlan}: the loaded project plus the inputs the shell pre-reads for it. */
export interface BuildPlanInput {
  /** The loaded project (manifest + every enabled bundle's parsed `bundle.yml`). */
  readonly project: Project;
  /** The enabled bundle ids (`manifest.bundles`) — drives the disabled-dir exclusion. */
  readonly enabledBundleIds: readonly string[];
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
 * root-relative paths, EXCLUDING the builder-time working dirs ({@link NON_SHIPPABLE_TOP_LEVEL}) and any DISABLED
 * bundle directory (a `bundles/<id>/` whose `<id>` is neither enabled nor the `bundle-template/` scaffold — doc 06
 * line 153: "the build never includes it"). The walk does NOT recurse into symlinked directories: in a generated
 * project the only symlinks are the scope aliases (`.claude/skills → installer-skills/`, etc.), so skipping
 * symlinked dirs records the alias path itself without doubling its target's bytes. Pure over the port.
 *
 * @param fs - The FileSystem port.
 * @param root - The project root.
 * @param enabledBundleIds - The manifest-enabled bundle ids (the disabled-dir filter).
 * @returns The sorted, root-relative shippable file paths.
 */
export function shippableFiles(
  fs: FileSystem,
  root: string,
  enabledBundleIds: readonly string[],
): string[] {
  const enabled = new Set<string>(enabledBundleIds);
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
      // Prune disabled bundle directories: a bundles/<id>/ not enabled in the manifest and not the scaffold.
      if (rel === BUNDLES_DIR && entry.kind === "directory") {
        if (entry.name !== BUNDLE_TEMPLATE_DIR && !enabled.has(entry.name)) {
          continue;
        }
      }

      if (entry.kind === "directory") {
        // Do not traverse a symlinked directory (a scope alias): record the link path itself as a leaf so the
        // ship set names the alias without duplicating installer-skills/ under it. `isSymlink` is best-effort —
        // the in-memory fake has no symlink-dir distinction, so a real alias only appears through the real
        // adapter, where it is detected; absent the distinction the dir is walked normally (harmless in tests).
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
  return out.sort();
}

/**
 * Whether a directory entry is a symlink that must not be traversed (a scope alias). The {@link FileSystem} port's
 * `list` does not expose the symlink bit, so this is a structural heuristic: a directory whose name is a known
 * scanned-scope alias root (`.claude`, `.agents`, `.openclaw`, `.cursor`, `.gemini`) at any level is treated as an
 * alias and recorded as a leaf rather than walked. This prevents the scope aliases — the only symlinks a generated
 * project carries (doc 06) — from double-counting `installer-skills/` content in the ship set. Pure (name-based).
 *
 * @param _fs - The FileSystem port (unused; kept for a future symlink-aware port method).
 * @param _abs - The absolute path (unused; reserved).
 * @param rel - The root-relative path of the entry.
 * @returns `true` when the entry is a scope-alias directory to record-not-traverse.
 */
function isSymlinkDir(_fs: FileSystem, _abs: string, rel: string): boolean {
  const name = rel.includes("/") ? (rel.split("/").pop() as string) : rel;
  return SCOPE_ALIAS_DIR_NAMES.has(name);
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
  const { project, enabledBundleIds, bundleDirectoryNames } = input;

  // (1) validate — fail the build on any coherence problem (AC82#1).
  const validation = validateProject(project, bundleDirectoryNames);

  // (2) frozen-lockfile — verify wpm.lock against the vendored content (AC82#2); absent ⇒ trivial pass.
  const { check, lock } = checkLockfile(fs, root);

  // (3) shippable enumeration — the file tree that would ship (AC82#3 / `build package` archive content).
  const shippable = shippableFiles(fs, root, enabledBundleIds);

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
  };
}
