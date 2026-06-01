# Test Automation Summary — task-20 (validate service)

> `bmad-qa-generate-e2e-tests` output. Framework: **vitest**. No HTTP API / UI (a CLI), so the API/E2E-UI
> bands are N/A. The validate service is pure (composes task-18 + the model; no I/O), so it is fully
> unit-testable; the "acceptance" band is `validateProject` over a realistic `Project`, the way the `project
> validate` operation calls it.

## Generated / relevant tests

### Unit (service behavior — AC#1/#2/#3), `bmad-dev-story`
- [x] `test/unit/services/validate.test.ts` — valid project → `{ok:true, problems:[]}`; each broken kind
  reports its specific problem (missing-dep, version-mismatch with actual version, dependency cycle, empty
  targets, orphan dir); `bundle-template` NOT flagged; enabled-but-no-dir is fine (only EXTRA dirs are
  orphans); a multi-broken project aggregates ALL problems; an empty project (no bundles, one target) is
  valid.

### Acceptance (validateProject over a real project), this skill
- [x] `test/unit/services/validate.acceptance.test.ts`
  - Healthy 3-bundle project (core 0.3.2, doc-handoff 1.2.0, web-handoff 0.2.0 requires {core ^0.3.0,
    doc-handoff ~1.2.0}, targets claude-code+codex, dirs [core, doc-handoff, web-handoff, bundle-template]) →
    `{ ok: true, problems: [] }` — all four checks pass (AC#1/#2).
  - Deliberately-broken project (core → 0.4.0 breaking web-handoff's ^0.3.0; orphan dir "experimental"; empty
    targets) → `ok:false` with the specific problems aggregated: version-mismatch on web-handoff→core naming
    actual 0.4.0; orphan "experimental"; no target agents declared (AC#1/#2). The satisfied doc-handoff
    constraint is not reported.
  - Confirms a review-phase concern is NOT reported — no message mentions step-slug or Definition-of-Done
    (AC#3).

## Coverage
- AC#1 (the four checks: constraints resolve, acyclic, ≥1 target, no orphan dir): covered (unit +
  acceptance).
- AC#2 (valid → no problems; each broken kind → its specific problem; all aggregated): covered.
- AC#3 (review-phase concerns out of scope): covered (asserted absent).

## Result
`npx vitest run` → 288 passed (31 files), run as a single process. `tsc --noEmit` clean, `biome check .`
clean.

## Next steps
- Run in CI (the matrix runs the three-command gate).
- The `project validate` operation (and the §5 CHECK step of mutating operations) calls `validateProject`:
  resolve the project (task-17/24/25) → list `bundles/` dir names via the FileSystem port → validate → map
  the report to the exit code / Constraint+Validation domain error (task-23).
