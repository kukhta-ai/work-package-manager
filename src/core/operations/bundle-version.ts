import { join } from "node:path";
import { editYaml } from "../../util/yaml.js";
import { NotFoundError } from "../errors.js";
import type {
  AuthoringTaskSpec,
  BundleId,
  BundleManifest,
  Project,
  SemVer,
  VersionRange,
} from "../model/index.js";
import { type BumpLevel, bumpSemVer } from "../services/version-constraint.js";
import type { ApplyContext, ApplyOutcome, OperationSpec, ReadSpec } from "./lifecycle.js";

/**
 * The `bundle <id> version` command family (doc 10 rows 159 / 160 / 161) — the bundle-`<id>` analogue of the
 * project {@link "./version.js"} VERSION pattern, operating on a SINGLE bundle's `version` rather than the
 * project's release version. `version` (bare) is a read that rides the task-25 `runRead`; `bump` and `set` are
 * mutations that ride `runMutation`, so the harness's ④ RERENDER re-renders the front-door menu automatically
 * (doc 10 line 34) and a changed bundle version flows to the menu. The `bundle.yml` write goes through the
 * task-13 comment-preserving {@link editYaml}; the semver maths through the task-18 {@link bumpSemVer}. Pure over
 * the FileSystem port — imports only `node:path`, the model, the yaml leaf, and the version service; never
 * `node:fs`/`commander`/`execa`.
 *
 * Two divergences from the project VERSION pattern, both doc-mandated:
 * - The structural effect edits `bundles/<id>/bundle.yml`'s top-level `version` (not `manifest.yml`'s
 *   `project.version`); the target id rides in the input (the per-bundle routing resolved + enabled-guarded it).
 * - `bump` MATERIALISES the doc-11 §"Materialised by `wpm bundle <id> version bump`" task set (the project
 *   version bump materialises nothing), INCLUDING — per doc 10 row 160 / doc 11 — a version-constraint review for
 *   every OTHER enabled bundle whose `requires` map names `<id>`. `set` materialises nothing (doc 10 row 161).
 *
 * Validation placement (doc 13 §7): a bad CLI argument is a USAGE error (exit 2) surfaced at the command layer —
 * `bump`'s level is constrained by commander `.choices`, and `set`'s explicit value is `parseSemVer`-checked at
 * the boundary and raised as a `UsageError`. So {@link setBundleVersionSpec} receives an already-valid
 * {@link SemVer} and {@link bumpBundleVersionSpec} an already-valid {@link BumpLevel}; the specs do no
 * re-validation.
 */

/** A bundle's manifest filename, under `bundles/<id>/`. */
const BUNDLE_MANIFEST_FILE = "bundle.yml";

/**
 * Resolve the enabled bundle `id` from the loaded project, or raise a {@link NotFoundError} (defense-in-depth
 * with the routing's `requireEnabledBundle`). The loader holds a bundle in `project.bundles` ONLY when it is
 * enabled, so an absent entry is the not-found signal — keeping each spec total even though the routing already
 * guarded the id.
 *
 * @param project - The loaded project.
 * @param id - The target bundle id.
 * @returns The bundle's parsed manifest.
 * @throws {NotFoundError} When `<id>` is not an enabled bundle.
 */
function requireBundle(project: Project, id: string): BundleManifest {
  const bundle = (project.bundles as ReadonlyMap<string, BundleManifest>).get(id);
  if (bundle === undefined) {
    throw new NotFoundError(`bundle "${id}" is not an enabled bundle`);
  }
  return bundle;
}

/** Write `version` into `bundles/<id>/bundle.yml`'s top-level `version`, comment-preservingly; return the path. */
function writeBundleVersion(ctx: ApplyContext, id: string, version: SemVer): ApplyOutcome {
  const path = join(ctx.root, "bundles", id, BUNDLE_MANIFEST_FILE);
  const next = editYaml(ctx.fs.read(path), (doc) => {
    doc.setIn(["version"], version);
  });
  ctx.fs.write(path, next);
  return { changedPaths: [path] };
}

/** The input selecting which enabled bundle to read (`bundle <id> version`). */
export interface BundleVersionReadInput {
  /** The bundle id to read (selected by the `bundle <id>` routing). */
  readonly id: string;
}

/** The input to {@link bumpBundleVersionSpec}: the target id + the (commander-validated) level to advance. */
export interface BumpBundleVersionInput {
  /** The bundle id to bump (selected by the `bundle <id>` routing). */
  readonly id: string;
  /** The semver level to advance — `major`, `minor`, or `patch`. */
  readonly level: BumpLevel;
}

/** The input to {@link setBundleVersionSpec}: the target id + the (already-parsed) explicit version. */
export interface SetBundleVersionInput {
  /** The bundle id to set (selected by the `bundle <id>` routing). */
  readonly id: string;
  /** The explicit semver to write (already validated by `parseSemVer` at the CLI boundary). */
  readonly version: SemVer;
}

/**
 * `bundle <id> version` (doc 10 row 159), a read. Projects `bundles/<id>/bundle.yml`'s `version`; the command
 * prints it. Changes nothing on disk (59#2).
 *
 * @returns The read spec projecting the bundle's version.
 */
export function readBundleVersionSpec(): ReadSpec<BundleVersionReadInput, SemVer> {
  return {
    summary: (_project, { id }) => `bundle ${id} version`,
    project: (project, { id }) => requireBundle(project, id).version,
  };
}

/**
 * `bundle <id> version set <v>` (doc 10 row 161), a mutation. ② CHECK the id is an enabled bundle; ③ APPLY writes
 * the (already-validated) explicit version to `bundles/<id>/bundle.yml`'s `version` comment-preservingly; ④
 * RERENDER (the harness) re-renders the front-door (61#1's implicit currency). No `materialise` (setting a
 * version queues no per-bundle work — doc 10 row 161). The `summary` is the POST-APPLY version, so the command
 * prints it (61#1).
 *
 * @returns The set operation spec.
 */
export function setBundleVersionSpec(): OperationSpec<SetBundleVersionInput> {
  return {
    // The harness resolves `summary` against the POST-APPLY (reloaded) project, whose bundle `version` is the
    // value `apply` just wrote — report it directly so `bundle.yml` stays the single source of what is printed.
    summary: (project, { id }) => `${requireBundle(project, id).version}`,
    check: (project, { id }) => {
      requireBundle(project, id);
    },
    apply: (ctx, _project, { id, version }) => writeBundleVersion(ctx, id, version),
  };
}

/**
 * `bundle <id> version bump <level>` (doc 10 row 160), a mutation. ③ APPLY computes the next semver from the
 * bundle's CURRENT version via {@link bumpSemVer} and writes it back comment-preservingly; ④ RERENDER (the
 * harness) re-renders the front-door; ⑤ MATERIALISE the doc-11 bump task set (idempotent by title), including a
 * version-constraint review for every OTHER enabled bundle whose `requires` map names `<id>`. The `summary` is
 * the POST-APPLY version, so the command prints it (60#1).
 *
 * **The prev→new pair (the one subtlety).** doc 10 row 160 / 60#2 require the materialised titles to name BOTH
 * `<prev>` and `<new>`. But the harness gives `materialise` the POST-APPLY project, whose bundle `version` is
 * already `<new>`, and a bump is NOT invertible (a `minor`/`major` bump zeroes lower fields), so `<prev>` cannot
 * be reconstructed from the post-apply project. The only beat that sees the pre-apply version is ③ APPLY — so it
 * captures the `{ prev, next }` transition into a per-invocation `let` the ⑤ plan reads. This is NOT shared
 * module state: the CLI builds a FRESH `bumpBundleVersionSpec()` per `run()`, so two successive/concurrent bumps
 * never alias; the closure does no I/O (the only effect is `apply`'s port write). The lifecycle always runs ③
 * before ⑤ for a mutation, so the transition is set when ⑤ reads it.
 *
 * @returns The bump operation spec.
 */
export function bumpBundleVersionSpec(): OperationSpec<BumpBundleVersionInput> {
  // Per-invocation capture of the version transition: ③ APPLY sets it (the only beat that sees the pre-apply
  // version), ⑤ MATERIALISE reads it. A fresh spec per `run()` keeps this local un-shared across invocations.
  let transition: { prev: SemVer; next: SemVer } | undefined;

  return {
    // Report the POST-APPLY bundle version directly (it equals `next`). Re-running `bumpSemVer` here would
    // DOUBLE-bump — the post-apply project already holds the advanced version (the task-40 lesson).
    summary: (project, { id }) => `${requireBundle(project, id).version}`,

    check: (project, { id }) => {
      requireBundle(project, id);
    },

    apply: (ctx, project, { id, level }) => {
      const prev = requireBundle(project, id).version;
      const next = bumpSemVer(prev, level);
      transition = { prev, next };
      return writeBundleVersion(ctx, id, next);
    },

    materialise: (project, { id }) => {
      // ③ APPLY (which always precedes ⑤) set `transition`. `next` also equals the post-apply bundle version
      // (defensive fallback); `prev` has no post-apply source, so a missing transition is an internal invariant
      // violation, never a normal path — the fallback keeps the plan total rather than throwing.
      const next = transition?.next ?? requireBundle(project, id).version;
      const prev = transition?.prev ?? next;
      return bumpAuthoringTasks(project, id, prev, next);
    },
  };
}

/**
 * The authoring tasks a bundle version bump materialises (doc 10 row 160; doc 11 §"Materialised by `wpm bundle
 * <id> version bump`"): the three per-bundle review tasks, PLUS — for every OTHER enabled bundle whose `requires`
 * map names `<id>` — a version-constraint review (so a dependant re-checks its pin against the new version). The
 * titles + acceptance criteria are doc 11's verbatim (the `→` in the migration title is the literal U+2192 doc
 * 11 uses). Title-stable, so the harness de-duplicates by title (60#2 idempotent).
 *
 * The requirer scan walks the POST-APPLY project's bundles — the loader reads EVERY enabled bundle's `bundle.yml`
 * into `project.bundles`, each with its `requires` map — and includes those whose `requires` map has `<id>` as a
 * key. The bumped bundle is skipped (`other.id !== id`): a bundle reviewing its own constraint on itself is
 * meaningless. The requirer-constraint title is keyed on `<id>` + `<new>` (NOT the requirer's id, per doc 11), so
 * multiple requirers collapse to ONE de-duplicated task ("re-check pins against `<id>`@`<new>`").
 *
 * @param project - The post-apply project (its enabled bundles + their `requires` maps).
 * @param id - The bumped bundle id.
 * @param prev - The bundle's previous version.
 * @param next - The bundle's new version.
 * @returns The authoring-task specs (title-idempotent).
 */
function bumpAuthoringTasks(
  project: Project,
  id: string,
  prev: SemVer,
  next: SemVer,
): AuthoringTaskSpec[] {
  const tasks: AuthoringTaskSpec[] = [
    {
      title: `Review state-tasks for ${id} at ${next}`,
      acceptanceCriteria: [
        `state tasks edited in this release have their milestone advanced to ${next}`,
      ],
    },
    {
      title: `Consider migration tasks for ${id} ${prev}→${next}`,
      acceptanceCriteria: [
        `any state task whose AC changed in this release has either had its milestone bumped or had a corresponding kind:migration authored`,
      ],
    },
    {
      title: `Simulate upgrade for ${id} from ${prev} to ${next}`,
      acceptanceCriteria: [
        `agent walks the upgrade path, verifies from-version gates fire correctly on migration tasks, verifies state-task edits don't break the upgrade; closes on a clean walk`,
      ],
    },
  ];
  // For every OTHER enabled bundle whose `requires` map names `<id>`: a version-constraint review (doc 11).
  for (const other of (project.bundles as ReadonlyMap<BundleId, BundleManifest>).values()) {
    if (
      other.id !== id &&
      (other.requires as ReadonlyMap<BundleId, VersionRange>).has(id as BundleId)
    ) {
      tasks.push({
        title: `Review version constraint on ${id} at ${next}`,
        acceptanceCriteria: [
          `${other.id}'s bundle.yml.requires.${id} constraint still satisfies ${next}; if not, either widen the constraint or author a migration in ${other.id} to match the new contract`,
        ],
      });
    }
  }
  return tasks;
}
