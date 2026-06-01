# Test Automation Summary — task-18 (version-constraint resolution)

> `bmad-qa-generate-e2e-tests` output. Framework: **vitest**. No HTTP API / UI (a CLI), so the API/E2E-UI
> bands are N/A. The version-constraint service is pure (no I/O), so it is fully unit-testable; the
> "acceptance" band is `resolve` over a realistic graph built from actual task-10 `BundleManifest`s — the
> shape the loaded `Project` carries and the task-20 `validate` service will pass.

## Generated / relevant tests

### Unit (service behavior — AC#1/#2/#3), `bmad-dev-story`
- [x] `test/unit/services/version-constraint.test.ts` — `satisfies` across all npm forms (caret incl. 0.x
  pinning, tilde, comparator + compound range, exact/bare, x-range, prerelease default semantics), satisfying
  + non-satisfying; `resolve` for all-satisfied, missing dep, version-mismatch (+ actualVersion), a mix,
  empty graph, self-loop / 2-node / 3-node cycles, a non-cyclic diamond DAG (no false positive), cycle
  de-duplication, and termination on cyclic input.

### Acceptance (resolve over a real BundleManifest graph), this skill
- [x] `test/unit/services/version-constraint.acceptance.test.ts`
  - Healthy project (core 0.3.2, doc-handoff 1.2.0, web-handoff 0.2.0 requires {core ^0.3.0, doc-handoff
    ~1.2.0}) built from real `BundleManifest`s → all constraints satisfied, no cycles (AC#1/#2 end-to-end).
  - Breaking bump (core → 0.4.0) → `version-mismatch` on web-handoff→core with `actualVersion` 0.4.0; the
    doc-handoff edge stays satisfied (AC#2).
  - Cyclic variant (core ↔ web-handoff) → the cycle is reported and `resolve` terminates (AC#3).

## Coverage
- AC#1 (satisfies across forms): covered (unit, all forms).
- AC#2 (per-constraint satisfied/unsatisfied over a graph): covered (unit + acceptance, missing + mismatch).
- AC#3 (cycle detected, not looping): covered (unit self/2/3-node + acceptance; termination asserted).

## Result
`npx vitest run` → 255 passed (26 files). `tsc --noEmit` clean, `biome check .` clean.
(Note: when run concurrently with other vitest processes, the unrelated real-`backlog` integration tests can
transiently collide on Backlog.md's global state — the task-14 concurrency caveat; an isolated run is clean.
The version-constraint service itself is pure and has no shared state.)

## Next steps
- Run in CI (the matrix runs the three-command gate).
- The `ResolutionReport` is consumed by the task-20 `validate` service (constraints resolve, no cycles), and
  the operation maps unsatisfied/cycle outcomes to the Constraint domain error (task-23).
