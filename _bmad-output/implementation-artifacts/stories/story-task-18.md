# Story task-18 — Implement version-constraint resolution

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned
> — steered from docs/13 §4 + docs/08 + docs/10 + the task-10 model). Phase C services tier. doc 13 §4
> `version-constraint`. PURE: reuses `semver` (added + proven at task-10) + the task-10 model. Synchronous.

## Story
As `project validate` (task-20) and the dependency-aware operations, I need to (a) decide whether a version
satisfies an npm-style constraint, and (b) over the inter-bundle `requires` graph, report each constraint as
satisfied/unsatisfied and detect any dependency cycle — so a breaking change in a depended-upon bundle, a
missing dependency, or a circular `requires` surfaces at validate time (doc 08) instead of at install time.

## Acceptance criteria (the contract)
1. Given a version and an npm-style constraint, the result correctly states whether the version satisfies it,
   across caret, tilde, comparator, exact, and range forms (doc 13).
2. Given a graph of inter-bundle dependency constraints and the available versions, each constraint is
   reported as satisfied or unsatisfied.
3. A dependency cycle is detected and reported rather than looping.

## Developer context (the docs)
- doc 08 §"Identity vs version" / §"The dependency contract": `bundle.yml.requires` is a map dep-bundle-id →
  npm-style constraint (`^0.3.0`, `~1.2.0`, `>=2.0.0 <3.0.0`); `wpm project validate` checks every constraint
  against the dependee's declared `version`. Resolution is **constraint-VALIDATION, not constraint-resolution
  across candidates** — "no SAT solver, just a closure check" (one version of each bundle exists per
  project). So `resolve` validates the FIXED versions against the constraints; it does not pick versions.
- doc 10 `project validate`: "For each bundle's `requires`: required bundle ID is enabled, and its declared
  `bundle.yml.version` satisfies the version constraint" + "No circular `requires` (depth-first walk detects
  cycles)".
- doc 13 §4: `version-constraint` is a pure service, unit-tested against semver fixtures; provides
  `satisfies(version, range)` and `resolve(requiresGraph)` → satisfied / unsatisfied / **cycle**.
- task-10 model: `SemVer`/`VersionRange` (branded, normalized), `BundleManifest = {id: BundleId, version:
  SemVer, requires: ReadonlyMap<BundleId, VersionRange>}` — exactly the graph node shape. `semver` is a dep
  (task-10), pure → allowed in core.

## Design — `src/core/services/version-constraint.ts` (PURE; boundary rule applies)
- **`satisfies(version: SemVer, range: VersionRange): boolean`** (AC#1) — `semver.satisfies(version, range)`.
  Both args are branded (already passed task-10's parsers, stored normalized), so this is a thin correct
  call. DEFAULT semver prerelease semantics (no `includePrerelease`): a prerelease satisfies a range only if
  the range explicitly admits a prerelease at the same `[major,minor,patch]` — standard npm behavior; test
  it explicitly so it's documented.
- **The graph node + input**: `interface BundleNode { id: BundleId; version: SemVer; requires:
  ReadonlyMap<BundleId, VersionRange> }`. `resolve(nodes: readonly BundleNode[]): ResolutionReport`. (A node
  is exactly a `BundleManifest`'s relevant fields; the operation will pass the Project's bundles.)
- **`resolve` report** (AC#2, AC#3) — `interface ResolutionReport { constraints: ConstraintResult[]; cycles:
  BundleId[][] }`:
  - `ConstraintResult = { from: BundleId; to: BundleId; range: VersionRange; satisfied: boolean;
    actualVersion?: SemVer; reason?: "missing" | "version-mismatch" }`. For EVERY `requires` edge
    `(from)->(to @ range)`: if `to` is not an enabled node → `satisfied:false, reason:"missing"`; else if its
    `version` does NOT `satisfies(range)` → `satisfied:false, reason:"version-mismatch", actualVersion`; else
    `satisfied:true, actualVersion`. (`actualVersion` present whenever `to` exists.)
  - `cycles`: detect via DFS over the `requires` edges with `visited` + `inProgress` (on-stack) sets — when an
    edge reaches a node currently on the DFS stack, record the cycle PATH (the on-stack slice from that node
    back to itself, e.g. `[a, b, a]`). Cycle-safe: `visited` prevents re-descent so it TERMINATES; handle a
    **self-loop** (`a->a` → `[a, a]`) and **multi-node** cycles. Edges to MISSING nodes are skipped in the
    cycle DFS (they can't form a cycle). Dedup cycles (normalize so the same cycle isn't reported twice from
    different DFS entry points — e.g. canonicalize by rotating to the smallest id, or track found cycles).
  - Normal unsatisfied/cycle outcomes are **DATA** in the report (NOT thrown; like task-17's not-found). The
    task-20 validate service consumes this report; the operation maps it to the Constraint domain error
    (task-23) later.
- **PURE**: import only `semver` + the task-10 model (`SemVer`/`VersionRange`/`BundleId`). NO `node:fs`/
  `commander`/`execa` — boundary clean on `src/core/services/`.
- Export: `satisfies`, `resolve`, `BundleNode`, `ConstraintResult`, `ResolutionReport`.

## Tests (`test/unit/services/version-constraint.test.ts` — pure)
- `satisfies` across ALL AC#1 forms, satisfying + non-satisfying:
  - caret `^1.2.3` (1.2.3 ✓, 1.9.0 ✓, 2.0.0 ✗); `^0.3.0` (0.3.5 ✓, 0.4.0 ✗— 0.x caret pins minor); tilde
    `~1.2.0` (1.2.9 ✓, 1.3.0 ✗); comparator `>=2.0.0` (2.0.0 ✓, 1.9.9 ✗) and compound `>=2.0.0 <3.0.0`
    (2.5.0 ✓, 3.0.0 ✗); exact `=1.2.3`/bare `1.2.3` (1.2.3 ✓, 1.2.4 ✗); wildcard `1.x` (1.5.0 ✓, 2.0.0 ✗);
    prerelease (`1.2.3-alpha.1` vs `^1.2.3` ✗ by default; vs `>=1.2.3-alpha.0 <2` ✓).
- `resolve`:
  - all-satisfied graph (core 0.3.2, web-handoff requires core ^0.3.0) → all `satisfied:true`, no cycles.
  - missing dep (web-handoff requires `doc-handoff` not enabled) → `satisfied:false, reason:"missing"`.
  - version-mismatch (core 0.4.0, web-handoff requires core ^0.3.0) → `satisfied:false,
    reason:"version-mismatch", actualVersion:"0.4.0"`.
  - mix (one ok + one missing + one mismatch) → each edge reported correctly.
  - empty graph → `{constraints:[], cycles:[]}`.
  - self-loop (a requires a) → cycle `[a,a]` reported; terminates.
  - 2-node cycle (a->b->a) → cycle reported; terminates.
  - 3-node cycle (a->b->c->a) → cycle reported; terminates.
  - diamond DAG (a->b, a->c, b->d, c->d) → NO cycle (no false positive); constraints all reported.
  - assert resolve does not hang on any cyclic input (it returns).

## DoD
- Pure (boundary clean — verify biome on `src/core/services/`). `tsc --noEmit` clean, `biome check .` clean,
  `vitest run` green, `npm ci` clean (no new deps — semver already a dep). JSDoc every public fn/type; no
  dead code.

## Previous-story intelligence (carried forward)
- task-10: `semver` default import (`import semver from "semver"`) type-checks under `verbatimModuleSyntax`
  and works at ESM runtime; `parseSemVer`/`parseVersionRange` store the NORMALIZED form (so a `VersionRange`
  is already a comparator string — `satisfies` is correct on it). task-17 decision echo: normal "no" results
  are DATA in a discriminated/report shape, not throws. Run `biome check --write` before the gate.

## Boundaries (do NOT do here)
- No version-RESOLUTION across candidates (there's one version per bundle — closure check only). No `validate`
  service (task-20 consumes this report). No wiring into operations / no domain-error throwing (task-23). No
  new deps. Don't edit docs/, AGENTS.md, backlog/, .bmad/ (incl. sprint-status), task-5's biome.json,
  task-10–17.
