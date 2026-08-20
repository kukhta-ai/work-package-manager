import { join } from "node:path";
import { editYaml } from "../../util/yaml.js";
import { NotFoundError } from "../errors.js";
import type {
  AuthoringTaskSpec,
  BundleId,
  BundleManifest,
  Project,
  VersionRange,
} from "../model/index.js";
import { type BundleNode, resolve } from "../services/version-constraint.js";
import type { ApplyContext, ApplyOutcome, OperationSpec, ReadSpec } from "./lifecycle.js";

/**
 * The `bundle <id> requires` command family (doc 10 rows 162 / 163 / 164) — declare, inspect, and drop a
 * bundle's dependency on ANOTHER bundle (its `requires` map: dependency {@link BundleId} → npm-style
 * {@link VersionRange}). The bundle-`<id>` analogue of the project-targets LIST-MGMT pattern
 * ({@link "./targets.js"}), but the structural effect edits `bundles/<id>/bundle.yml`'s `requires` MAPPING
 * (not `manifest.yml.targets`). `add`/`remove` are mutations that ride the task-25 `runMutation` six-beat
 * lifecycle (so ④ RERENDER re-renders the front-door menu and ⑤ MATERIALISE creates the doc-11 follow-up task
 * automatically); `list` is a read that rides `runRead`.
 *
 * Pure over the FileSystem port (doc 13 §1): the `bundle.yml` edit goes through the task-13 comment-preserving
 * {@link editYaml}; the cycle check through the task-18 {@link resolve} service. It imports only `node:path`, the
 * yaml leaf, the model, the errors, the version-constraint service, and the lifecycle types — never
 * `node:fs`/`commander`/`execa`, so the import-boundary rule on `src/core/operations/` holds.
 *
 * The model + schema already carry `requires` (a `Map<BundleId, VersionRange>` / `Record<string,string>`), so
 * this family adds NO model or schema change.
 *
 * Validation placement (doc 13 §7): a bad constraint range is a USAGE error (exit 2) raised at the command
 * boundary via `parseVersionRange`, so {@link addRequiresSpec} receives an already-valid {@link VersionRange} or
 * `undefined` (defaulting). A dependency that is not an enabled bundle (add) or not present (remove) is a typed
 * {@link NotFoundError} (exit 1) raised in ② CHECK — so nothing is written. A dependency cycle is a NORMAL
 * outcome returned as a non-fatal {@link ApplyOutcome.warnings} (data, never thrown): doc 10 row 162 says
 * "Warn", not "reject", so the edge is still written.
 */

/** A bundle's manifest filename, under `bundles/<id>/`. */
const BUNDLE_MANIFEST_FILE = "bundle.yml";

/**
 * Resolve the enabled HOST bundle from the loaded project, or raise a {@link NotFoundError} (defense-in-depth
 * with the routing's `requireEnabledBundle`). The loader holds a bundle in `project.bundles` ONLY when it is
 * enabled, so an absent entry is the not-found signal.
 *
 * @param project - The loaded project.
 * @param id - The host bundle id (whose `requires` map this family edits).
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
 * Detect whether adding the edge `<id> → <dep> @ <rangeStr>` introduces a dependency cycle, and if so return a
 * single human-readable warning naming the cycle path (else `[]`). Pure.
 *
 * Builds the dependency graph from the PRE-apply project's enabled bundles, OVERLAYING the new edge onto the
 * host node (because ② CHECK / ③ APPLY see the pre-apply project — the new `requires` entry is not yet in
 * `project.bundles[id].requires`). Calls the task-18 {@link resolve}; `cycles` is detection-not-enumeration, so
 * `cycles.length > 0` is the cyclic signal (doc 13 §4) — naming the first reported cycle is enough for the user.
 *
 * @param project - The pre-apply project (its enabled bundles + their `requires` maps).
 * @param id - The host bundle the edge is added to.
 * @param dep - The dependency bundle the edge points at.
 * @param rangeStr - The version range string the edge carries (the new entry's value).
 * @returns A one-element warning list when the edge is cyclic, else `[]`.
 */
function cycleWarnings(project: Project, id: string, dep: string, rangeStr: string): string[] {
  const nodes: BundleNode[] = [];
  for (const bundle of (project.bundles as ReadonlyMap<BundleId, BundleManifest>).values()) {
    if ((bundle.id as string) === id) {
      // Overlay the new/updated edge onto the host node so the graph reflects the post-write state.
      const requires = new Map(bundle.requires as ReadonlyMap<BundleId, VersionRange>);
      requires.set(dep as BundleId, rangeStr as VersionRange);
      nodes.push({ id: bundle.id, version: bundle.version, requires });
    } else {
      nodes.push({ id: bundle.id, version: bundle.version, requires: bundle.requires });
    }
  }
  const report = resolve(nodes);
  if (report.cycles.length === 0) {
    return [];
  }
  const path = (report.cycles[0] as BundleId[]).map((node) => node as string).join(" -> ");
  return [
    `adding "${dep}" to "${id}" introduces a dependency cycle (${path}) — the edge was written; review the requires graph`,
  ];
}

/** The input to {@link addRequiresSpec}: the host id, the dependency id, and the (already-validated) range or default. */
export interface AddRequiresInput {
  /** The host bundle (selected + enabled-guarded by the `bundle <id>` routing). */
  readonly id: string;
  /** The dependency bundle id to depend on (a positional). */
  readonly dep: string;
  /**
   * The version range to RECORD, as the user wrote it — already validated as a valid npm range by
   * `parseVersionRange` at the CLI boundary, but kept as the RAW string so the author's chosen syntax (e.g.
   * `^0.3.0`, `~1.2`) is written verbatim to the human-readable `bundle.yml` rather than the normalized
   * comparator form (doc 10 row 162's example stores `^0.3.0`). When `undefined`, ③ APPLY writes a LITERAL caret
   * range on the dependency's current version.
   */
  readonly constraint?: string;
}

/** The input to {@link removeRequiresSpec}: the host id + the dependency id to drop. */
export interface RemoveRequiresInput {
  /** The host bundle (selected + enabled-guarded by the `bundle <id>` routing). */
  readonly id: string;
  /** The dependency bundle id to remove from the host's `requires` map. */
  readonly dep: string;
}

/** One entry projected for `requires list`: the dependency id + its version-range string. */
export interface RequiresEntry {
  /** The depended-upon bundle's id. */
  readonly id: string;
  /** The npm-style version range it must satisfy. */
  readonly range: string;
}

/** The input to {@link listRequiresSpec}: the host bundle id to read. */
export interface RequiresListInput {
  /** The host bundle whose `requires` map to print (selected by the `bundle <id>` routing). */
  readonly id: string;
}

/**
 * `bundle <id> requires add <dep> [<constraint>]` (doc 10 row 162), a mutation. ② CHECK the dependency is an
 * enabled bundle (else a {@link NotFoundError} — 62#4, nothing written). ③ APPLY appends/overwrites the entry in
 * `bundles/<id>/bundle.yml`'s `requires` map (the constraint, or a LITERAL caret on the dependency's current
 * version when omitted — 62#1) comment-preservingly, then checks the resulting graph and returns a cycle WARNING
 * when cyclic (62#2 — the edge stays written). ④ RERENDER (the harness) re-renders the front-door. ⑤ MATERIALISE
 * the doc-11 "Adapt …" task (62#3, idempotent by title).
 *
 * @returns The add operation spec.
 */
export function addRequiresSpec(): OperationSpec<AddRequiresInput> {
  return {
    summary: (_project, { id, dep }) => `added requires ${dep} to ${id}`,

    check: (project, { id, dep }) => {
      requireBundle(project, id);
      // The DEPENDENCY must be an enabled bundle (doc 10 row 162 step 1). Distinct from the host id, which the
      // routing already guarded — a non-enabled dependency is the operation's own not-found (62#4).
      const depBundle = (project.bundles as ReadonlyMap<string, BundleManifest>).get(dep);
      if (depBundle === undefined) {
        throw new NotFoundError(
          `bundle "${dep}" is not an enabled bundle — run \`wpm bundle list\` to see enabled bundles, or \`wpm bundle enable ${dep}\``,
        );
      }
    },

    apply: (ctx: ApplyContext, project, { id, dep, constraint }): ApplyOutcome => {
      // The dependency is present (CHECK validated). Compute the range string to WRITE: the caller's validated
      // range if given, else a LITERAL caret on the dependency's current version (doc 10 row 162 / line 163).
      // The caret is written verbatim (NOT semver-normalized) so `bundle.yml` stays human-readable.
      const depBundle = requireBundle(project, dep);
      const rangeStr = constraint ?? `^${depBundle.version as string}`;

      const path = bundleManifestPath(ctx.root, id);
      const next = editYaml(ctx.fs.read(path), (doc) => {
        // `setIn(["requires", dep], …)` appends the key if absent, or overwrites its value if present (62#1),
        // promoting an empty `requires: {}` to a block map. Comments + key order survive (edited in place).
        doc.setIn(["requires", dep], rangeStr);
      });
      ctx.fs.write(path, next);

      const warnings = cycleWarnings(project, id, dep, rangeStr);
      return { changedPaths: [path], ...(warnings.length > 0 ? { warnings } : {}) };
    },

    materialise: (_project, { id, dep }) => requiresAddTasks(id, dep),
  };
}

/**
 * `bundle <id> requires remove <dep>` (doc 10 row 164), a mutation. ② CHECK the dependency IS in the host's
 * `requires` map (else a {@link NotFoundError} — 64#3, nothing written). ③ APPLY deletes the entry from
 * `bundles/<id>/bundle.yml`'s `requires` map comment-preservingly (64#1). ④ RERENDER (the harness) re-renders
 * the front-door. ⑤ MATERIALISE the doc-11 "Verify …" task (64#2, idempotent by title).
 *
 * @returns The remove operation spec.
 */
export function removeRequiresSpec(): OperationSpec<RemoveRequiresInput> {
  return {
    summary: (_project, { id, dep }) => `removed requires ${dep} from ${id}`,

    check: (project, { id, dep }) => {
      const bundle = requireBundle(project, id);
      if (!(bundle.requires as ReadonlyMap<BundleId, VersionRange>).has(dep as BundleId)) {
        throw new NotFoundError(`bundle "${id}" does not require "${dep}" — nothing to remove`);
      }
    },

    apply: (ctx: ApplyContext, _project, { id, dep }): ApplyOutcome => {
      const path = bundleManifestPath(ctx.root, id);
      const next = editYaml(ctx.fs.read(path), (doc) => {
        doc.deleteIn(["requires", dep]);
      });
      ctx.fs.write(path, next);
      return { changedPaths: [path] };
    },

    materialise: (_project, { id, dep }) => requiresRemoveTasks(id, dep),
  };
}

/**
 * `bundle <id> requires list` (doc 10 row 163), a read. Projects the host bundle's `requires` map as
 * `{ id, range }` entries in declaration order (the `Map` preserves insertion order); the command prints them
 * one per line (63#1). Changes nothing (63#2).
 *
 * @returns The list read spec.
 */
export function listRequiresSpec(): ReadSpec<RequiresListInput, readonly RequiresEntry[]> {
  return {
    summary: (_project, { id }) => `bundle ${id} requires`,
    project: (project, { id }) => {
      const bundle = requireBundle(project, id);
      const entries: RequiresEntry[] = [];
      for (const [depId, range] of bundle.requires) {
        entries.push({ id: depId as string, range: range as string });
      }
      return entries;
    },
  };
}

/**
 * The authoring task `bundle <id> requires add` materialises (doc 10 row 162; doc 11 §"Materialised by `wpm
 * bundle <id> requires add/remove`" → Add). The title + acceptance criterion are doc 11's verbatim. Title-stable,
 * so the harness de-duplicates by title (62#3 idempotent).
 *
 * @param id - The host bundle id.
 * @param dep - The newly-declared dependency id.
 * @returns The authoring-task specs (one task).
 */
function requiresAddTasks(id: string, dep: string): AuthoringTaskSpec[] {
  return [
    {
      title: `Adapt ${id}'s install-backlog and payload to use ${dep}`,
      acceptanceCriteria: [
        `the bundle's tasks actually reference and use the new dependency (rather than the requires entry being aspirational)`,
      ],
    },
  ];
}

/**
 * The authoring task `bundle <id> requires remove` materialises (doc 10 row 164; doc 11 §"Materialised by `wpm
 * bundle <id> requires add/remove`" → Remove). The title + acceptance criterion are doc 11's verbatim.
 * Title-stable, so the harness de-duplicates by title (64#2 idempotent).
 *
 * @param id - The host bundle id.
 * @param dep - The removed dependency id.
 * @returns The authoring-task specs (one task).
 */
function requiresRemoveTasks(id: string, dep: string): AuthoringTaskSpec[] {
  return [
    {
      title: `Verify ${id} no longer references ${dep}`,
      acceptanceCriteria: [
        `no install-backlog task in ${id} references ${dep}'s services; payload doesn't assume ${dep} is installed`,
      ],
    },
  ];
}
