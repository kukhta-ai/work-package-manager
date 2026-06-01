# Test Automation Summary — task-21 (authoring-task materialisation service)

> `bmad-qa-generate-e2e-tests` output. Framework: **vitest**. No HTTP API / UI (a CLI), so the API/E2E-UI
> bands are N/A. The materialisation engine is a service over the BacklogMd port; its acceptance band is the
> materialise -> re-run idempotency round through the **real** `backlog` CLI (the tool the operation uses).

## Generated / relevant tests

### Unit (engine behavior — AC#1/#2), `bmad-dev-story`
- [x] `test/unit/services/materialisation.test.ts` (FakeBacklog, no subprocess) — all-created-when-new with
  title + acceptance criteria (verified via `taskDetail`/`listTasks`); idempotent second run creates nothing
  / skips all / no duplicates; partial overlap creates only the genuinely-new; empty specs → nothing;
  within-batch duplicate title created once.

### Acceptance / integration (real Backlog.md round-trip), this skill
- [x] `test/integration/services/materialisation.test.ts` (real `backlog` CLI; env-isolated HOME/XDG per the
  task-14 fix; tmpdir; skips gracefully if `backlog` is absent)
  - `materialiseAuthoringTasks` with 3 specs → `created` 3, the real backlog lists 3; the SAME run again →
    `created` `[]`, `skipped` all 3, the real backlog still lists 3 (NO duplicates in the actual tool) —
    AC#1/#2 end-to-end.
  - Partial overlap (one pre-created title) → only the new spec created in the real backlog.

## Coverage
- AC#1 (a task created per new title): covered (unit + real-backlog).
- AC#2 (re-run creates nothing / changes nothing): covered (unit + real-backlog no-duplicates).

## Result
`npx vitest run` → 295 passed (33 files), run as a single process. The real-backlog integration test ran
(not skipped). `tsc --noEmit` clean, `biome check .` clean.

## Next steps
- Run in CI (the matrix runs the three-command gate).
- The §5 MATERIALISE step of each mutating operation (tasks 25/26+) calls `materialiseAuthoringTasks` with the
  spec catalog that operation produces (doc 11's per-originating-operation catalog, supplied by the operation
  / a later materialisation planner) — the title-idempotency makes re-running a mutating operation a no-op
  for its authoring tasks.
