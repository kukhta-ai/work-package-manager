import semver from "semver";
import type { BundleId, SemVer, VersionRange } from "../model/index.js";

/**
 * The `version-constraint` service (doc 13 §4): npm-style constraint checking and inter-bundle dependency
 * resolution. PURE — it imports only the `semver` library (itself pure, so permitted in the core) and the
 * task-10 model. No I/O, no CLI.
 *
 * Per doc 08, resolution is **constraint-validation, not constraint-resolution across candidates** — one
 * version of each bundle exists per project, so this validates the fixed versions against the `requires`
 * constraints (a closure check) and detects cycles; it never picks versions. Normal "unsatisfied" and
 * "cycle" outcomes are returned as **data** in the report (the operation maps them to domain errors later,
 * task-23), never thrown.
 */

/**
 * Whether `version` satisfies the npm-style `range` (doc 13 §4 — caret, tilde, comparator, exact, and
 * compound range forms). A thin, correct wrapper over `semver.satisfies`; both arguments are branded values
 * that already passed task-10's parsers (and are stored normalized), so no re-validation is needed.
 *
 * Uses semver's default prerelease semantics: a prerelease version satisfies a range only when the range
 * explicitly admits a prerelease at the same `major.minor.patch` (standard npm behavior).
 *
 * @param version - The version to test.
 * @param range - The npm-style version range.
 * @returns `true` if `version` satisfies `range`.
 */
export function satisfies(version: SemVer, range: VersionRange): boolean {
  return semver.satisfies(version, range);
}

/** A semver release level for {@link bumpSemVer} (doc 10 `project|bundle version bump <level>`). */
export type BumpLevel = "major" | "minor" | "patch";

/**
 * Compute the next {@link SemVer} from `current` by advancing one release `level` (doc 13 §4 semver logic; doc
 * 10 `project version bump`). PURE — a thin wrapper over `semver.inc` (the pure `semver` lib already imported
 * here). `major` zeroes minor+patch (`1.2.3` → `2.0.0`), `minor` zeroes patch (`1.2.3` → `1.3.0`), `patch`
 * advances patch (`1.2.3` → `1.2.4`); a `0.x` line behaves the same (`0.3.1` `minor` → `0.4.0`).
 *
 * `current` is a branded {@link SemVer}, so it already passed {@link parseSemVer} and is a complete, normalized
 * `MAJOR.MINOR.PATCH` — `semver.inc` therefore cannot return `null` for a known `level`. The guard below is
 * defensive only (it keeps the result un-cast through a real check); a thrown error here would be an internal
 * invariant violation, never reachable from a valid input.
 *
 * @param current - The current version (a normalized, valid {@link SemVer}).
 * @param level - The release level to advance (`major` / `minor` / `patch`).
 * @returns The next version as a branded {@link SemVer}.
 */
export function bumpSemVer(current: SemVer, level: BumpLevel): SemVer {
  const next = semver.inc(current, level);
  if (next === null) {
    throw new Error(`internal: could not bump "${current}" by "${level}"`);
  }
  return next as SemVer;
}

/**
 * One node of the inter-bundle dependency graph — exactly the relevant fields of a `BundleManifest`: its id,
 * its declared version, and its `requires` map (dependency id → version range).
 */
export interface BundleNode {
  /** The bundle's id. */
  readonly id: BundleId;
  /** The bundle's declared version. */
  readonly version: SemVer;
  /** The bundle's dependency constraints (dependency id → required range). */
  readonly requires: ReadonlyMap<BundleId, VersionRange>;
}

/** Why a constraint was not satisfied. */
export type UnsatisfiedReason = "missing" | "version-mismatch";

/**
 * The result of checking one `requires` edge `(from) -> (to @ range)`: whether it is satisfied, the actual
 * version of `to` when it exists, and — when unsatisfied — the reason (`missing`: `to` is not an enabled
 * node; `version-mismatch`: `to` exists but its version does not satisfy `range`).
 */
export interface ConstraintResult {
  /** The bundle that declares the dependency. */
  readonly from: BundleId;
  /** The depended-upon bundle id. */
  readonly to: BundleId;
  /** The required version range. */
  readonly range: VersionRange;
  /** Whether the constraint holds. */
  readonly satisfied: boolean;
  /** The actual version of `to`, when `to` is an enabled node. */
  readonly actualVersion?: SemVer;
  /** Why the constraint was not satisfied (absent when `satisfied` is `true`). */
  readonly reason?: UnsatisfiedReason;
}

/**
 * The full resolution report (doc 13 §4: satisfied / unsatisfied / cycle as data). `constraints` has one
 * entry per `requires` edge; `cycles` lists every detected dependency cycle as a path (e.g. `[a, b, a]`).
 * The task-20 `validate` service consumes this.
 */
export interface ResolutionReport {
  /** One result per `requires` edge in the graph. */
  readonly constraints: ConstraintResult[];
  /**
   * Detected dependency cycles, each a path that starts and ends at the same id (e.g. `[a, b, a]`).
   *
   * This is **detection, not full enumeration**: when the graph is cyclic, at least one representative cycle
   * is reported, but the exact set and order are **not** guaranteed to be exhaustive or deterministic — they
   * depend on node order (overlapping cycles may collapse to fewer entries). This is sufficient for the only
   * question the consumer asks — "is the `requires` graph cyclic?" (AC#3; `project validate` fails on any
   * cycle). The task-20 `validate` service must therefore treat `cycles.length > 0` as "cyclic" and must not
   * assume this list enumerates every elementary cycle.
   */
  readonly cycles: BundleId[][];
}

/**
 * Validate every `requires` constraint in the graph and detect dependency cycles (doc 08; doc 10
 * `project validate`). Pure and total — it always returns a {@link ResolutionReport}; it never throws for a
 * normal unsatisfied/cyclic graph, and it always terminates (the cycle DFS is guarded by visited /
 * in-progress sets).
 *
 * @param nodes - The enabled bundles as graph nodes.
 * @returns The constraint results and detected cycles.
 */
export function resolve(nodes: readonly BundleNode[]): ResolutionReport {
  const byId = new Map<BundleId, BundleNode>();
  for (const node of nodes) {
    byId.set(node.id, node);
  }

  // --- Per-edge constraint checking (AC#2) ---
  const constraints: ConstraintResult[] = [];
  for (const node of nodes) {
    for (const [to, range] of node.requires) {
      const dep = byId.get(to);
      if (dep === undefined) {
        constraints.push({ from: node.id, to, range, satisfied: false, reason: "missing" });
      } else if (!satisfies(dep.version, range)) {
        constraints.push({
          from: node.id,
          to,
          range,
          satisfied: false,
          actualVersion: dep.version,
          reason: "version-mismatch",
        });
      } else {
        constraints.push({
          from: node.id,
          to,
          range,
          satisfied: true,
          actualVersion: dep.version,
        });
      }
    }
  }

  // --- Cycle detection via DFS (AC#3) ---
  const cycles = detectCycles(nodes, byId);

  return { constraints, cycles };
}

/**
 * Detect dependency cycles via depth-first search over the `requires` edges. Uses a `visited` set (so the
 * search never re-descends a node and therefore terminates) and an `inProgress` stack (so an edge back to a
 * node currently on the stack reveals a cycle). Edges to bundles not present in the graph are skipped — a
 * missing dependency cannot close a cycle. Each cycle found is reported once (canonicalized by rotating to
 * its smallest id, then de-duplicated).
 *
 * This is **detection, not full enumeration**. It reports at least one representative cycle whenever the
 * graph is cyclic (and an empty list for an acyclic graph), which is exactly what the cyclicity check needs
 * (AC#3) — but it does **not** enumerate every elementary cycle, and the resulting set and its order are
 * **node-order-dependent** (overlapping cycles may surface as fewer entries depending on the DFS entry
 * order). Deliberately so: full SCC/elementary-cycle enumeration (Tarjan/Johnson) is unnecessary for "is the
 * `requires` graph cyclic?". Callers must not rely on the list being exhaustive or deterministic.
 */
function detectCycles(
  nodes: readonly BundleNode[],
  byId: ReadonlyMap<BundleId, BundleNode>,
): BundleId[][] {
  const visited = new Set<BundleId>();
  const inProgress = new Set<BundleId>();
  const stack: BundleId[] = [];
  const found = new Map<string, BundleId[]>();

  const recordCycle = (start: BundleId): void => {
    // Slice the on-stack path from the first occurrence of `start` to the end, then close it.
    const startIndex = stack.indexOf(start);
    const path = stack.slice(startIndex);
    const cyclePath = [...path, start];
    // Canonicalize the cyclic part (the path without the repeated tail) by rotating to its smallest id, so
    // the same cycle found from different entry points de-duplicates.
    const key = canonicalCycleKey(path);
    if (!found.has(key)) {
      found.set(key, cyclePath);
    }
  };

  const dfs = (id: BundleId): void => {
    visited.add(id);
    inProgress.add(id);
    stack.push(id);
    const node = byId.get(id);
    if (node !== undefined) {
      for (const to of node.requires.keys()) {
        if (!byId.has(to)) {
          continue; // edge to a missing bundle — cannot form a cycle
        }
        if (inProgress.has(to)) {
          recordCycle(to);
        } else if (!visited.has(to)) {
          dfs(to);
        }
      }
    }
    inProgress.delete(id);
    stack.pop();
  };

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }
  return [...found.values()];
}

/**
 * A canonical key for a cyclic path (the ids on the cycle, without the repeated closing id): rotate the
 * sequence so it begins at its lexicographically smallest id. Two encounters of the same cycle from
 * different DFS entry points then produce the same key.
 */
function canonicalCycleKey(path: readonly BundleId[]): string {
  if (path.length === 0) {
    return "";
  }
  let minIndex = 0;
  for (let i = 1; i < path.length; i++) {
    if ((path[i] as string) < (path[minIndex] as string)) {
      minIndex = i;
    }
  }
  const rotated = [...path.slice(minIndex), ...path.slice(0, minIndex)];
  return rotated.join("->");
}
