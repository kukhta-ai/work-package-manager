import { join } from "node:path";
import { editYaml } from "../../util/yaml.js";
import type { Project, SemVer } from "../model/index.js";
import { type BumpLevel, bumpSemVer } from "../services/version-constraint.js";
import type { ApplyContext, ApplyOutcome, OperationSpec, ReadSpec } from "./lifecycle.js";

/**
 * The `project version` command family (doc 10 rows `project version` / `version bump` / `version set`) — the
 * **VERSION pattern**, the project's release version (doc 08, distinct from per-bundle versions). `version` is a
 * read that rides the task-25 `runRead`; `bump` and `set` are mutations that ride `runMutation`, so the
 * harness's ④ RERENDER re-renders the front-door + orchestrator automatically (doc 10 line 34, "derived
 * artefacts stay current automatically") and no operation arranges currency itself. The manifest write goes
 * through the task-13 comment-preserving {@link editYaml}; the semver maths through the task-18
 * {@link bumpSemVer}. Pure over the FileSystem port — imports only `node:path`, the model, the yaml leaf, and
 * the version service; never `node:fs`/`commander`.
 *
 * NEITHER mutation materialises authoring tasks: advancing the *project* release version produces no per-bundle
 * work (that is *bundle* version bump, a later task), so both specs omit `materialise`. The bump/set operation
 * shape and the `bumpSemVer` primitive established here are reused verbatim by `bundle <id> version`.
 *
 * Validation placement (doc 13 §7): a bad CLI argument is a USAGE error (exit 2), surfaced at the command layer
 * — `bump`'s level is constrained by commander `.choices`, and `set`'s explicit value is `parseSemVer`-checked
 * at the boundary and raised as a `UsageError`. So {@link setVersionSpec} receives an already-valid
 * {@link SemVer} and {@link bumpVersionSpec} an already-valid {@link BumpLevel}; the specs do no re-validation.
 */

/** The project manifest filename at the root. */
const MANIFEST_FILE = "manifest.yml";

/** The input to {@link bumpVersionSpec}: the (commander-validated) release level to advance. */
export interface BumpVersionInput {
  /** The semver level to advance — `major`, `minor`, or `patch`. */
  readonly level: BumpLevel;
}

/** The input to {@link setVersionSpec}: the (already-parsed) explicit version to set. */
export interface SetVersionInput {
  /** The explicit semver to write (already validated by `parseSemVer` at the CLI boundary). */
  readonly version: SemVer;
}

/** Write `version` into `manifest.yml`'s `project.version`, comment-preservingly; return the changed path. */
function writeProjectVersion(ctx: ApplyContext, version: SemVer): ApplyOutcome {
  const manifestPath = join(ctx.root, MANIFEST_FILE);
  const next = editYaml(ctx.fs.read(manifestPath), (doc) => {
    doc.setIn(["project", "version"], version);
  });
  ctx.fs.write(manifestPath, next);
  return { changedPaths: [manifestPath] };
}

/**
 * `project version` (doc 10 row 142), a read. Projects `manifest.yml`'s `project.version`; the command prints
 * it. Changes nothing on disk (AC#2).
 *
 * @returns The read spec projecting the project's release version.
 */
export function readVersionSpec(): ReadSpec<void, SemVer> {
  return {
    summary: "project version",
    project: (project: Project) => project.manifest.meta.version,
  };
}

/**
 * `project version bump <level>` (doc 10 row 143), a mutation. ③ APPLY computes the next semver from the current
 * `manifest.yml` project version via {@link bumpSemVer} and writes it back comment-preservingly; ④ RERENDER (the
 * harness) re-renders the front-door + orchestrator (AC#3). No `check`, no `materialise`. The `summary` is the
 * new version, so the command prints it (AC#1).
 *
 * @returns The bump operation spec.
 */
export function bumpVersionSpec(): OperationSpec<BumpVersionInput> {
  return {
    // The harness resolves `summary` against the POST-APPLY project (doc 13 §5/§8), whose `meta.version` is
    // already the bumped value `apply` wrote — so report that directly. Re-running `bumpSemVer` here would
    // double-bump (it would advance the already-advanced version again).
    summary: (project) => project.manifest.meta.version,
    apply: (ctx, project, { level }) =>
      writeProjectVersion(ctx, bumpSemVer(project.manifest.meta.version, level)),
  };
}

/**
 * `project version set <explicit>` (doc 10 row 144), a mutation. ③ APPLY writes the (already-validated) explicit
 * version to `manifest.yml`'s `project.version` comment-preservingly; ④ RERENDER re-renders the derived
 * artefacts (AC#3). No `check`, no `materialise`. The `summary` is the version, so the command prints it (AC#1).
 *
 * @returns The set operation spec.
 */
export function setVersionSpec(): OperationSpec<SetVersionInput> {
  return {
    // Report the POST-APPLY project version (doc 13 §5/§8 resolves `summary` after `apply`); it equals the
    // `version` just written, so the manifest stays the single source of truth for what is printed.
    summary: (project) => project.manifest.meta.version,
    apply: (ctx, _project, { version }) => writeProjectVersion(ctx, version),
  };
}
