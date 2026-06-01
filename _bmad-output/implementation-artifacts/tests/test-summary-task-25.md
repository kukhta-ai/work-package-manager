# Test Automation Summary — task-25 (shared mutation lifecycle harness)

> bmad-qa-generate-e2e-tests output (sprint-status writes suppressed — orchestrator-owned). The harness is a
> pure use-case service (no UI/HTTP), so the "E2E" framing lands as acceptance tests through the public API as
> a black box, matching the repo's `*.acceptance.test.ts` house pattern. Framework: vitest (already present; no
> new deps).

## Generated tests

### Unit (mechanics) — `test/unit/operations/lifecycle.test.ts` (bmad-dev-story)
- [x] AC#1 six beats in order — hooks fire CHECK→APPLY→RERENDER→MATERIALISE; LOAD proven before CHECK (loaded project), RESULT after; result carries ③+④ changedPaths + ⑤ titles
- [x] AC#2 ④/⑤ automatic — bare spec arranges neither; front-door re-derived + task materialised anyway
- [x] AC#4 idempotency — second run: empty changedPaths + empty materialisedTaskTitles; FS + backlog identical
- [x] CHECK failure raises the DomainError (ConflictError); ③④⑤ skipped (no file, no task, no front-door)
- [x] AC#3 runRead loads + projects + empty-effect result; FS + backlog unchanged

### Acceptance (black box, AC-framed) — `test/unit/operations/lifecycle.acceptance.test.ts`
- [x] AC#1 "a mutating command rides the shared lifecycle" — representative `enableSetting` op; result spans the op's own file + re-derived AGENTS.md + created alias + materialised title; observable end state proves each beat
- [x] AC#2 "currency and task creation are the harness's job" — bare op; harness still ④ re-derives + ⑤ materialises
- [x] AC#3 "show/list/validate observe, they do not mutate" — `ReadSpec` projects {name, bundleCount}; empty-effect result; FS + backlog byte-identical (public snapshot)
- [x] AC#4 "the lifecycle is idempotent: a redundant re-run is a no-op" — same mutation twice; second is empty; state identical

## Coverage
- `runMutation`: all six beats + order + ④/⑤-automatic + ③④ changedPaths union + ⑤ title-idempotency + CHECK-abort (③④⑤ skipped). `runRead`: LOAD→projection→empty-effect RESULT.
- Both runners exercised end-to-end against the in-memory FS + backlog + fixture deriver. Pure/deterministic; no real fs/process/git.

## Notable divergence recorded (see story / divergence note)
- A latent fidelity gap in task-12 `MemoryFileSystem` blocked AC#4's alias idempotency: `ensureAlias` recorded the alias in a side map but `exists(linkPath)` stayed `false`, whereas the real adapter's `existsSync` follows the symlink and returns `true`. Fixed faithfully: `exists` now also consults the alias map (one line), so an idempotent re-derivation no longer "re-creates" an existing alias. `memory-fs.test.ts` (16) still green.

## Result
- `lifecycle.test.ts`: 5 passed. `lifecycle.acceptance.test.ts`: 4 passed. (Full-suite + tsc + biome verified in the gate.)

## Next steps
- task-26: a representative CONCRETE operation end-to-end (the first real `OperationSpec` riding this harness with a real template-backed deriver path).
