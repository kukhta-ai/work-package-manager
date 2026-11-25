---
id: TASK-6
title: Set up the vitest test harness
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-31 22:23'
labels: []
dependencies:
  - TASK-1
ordinal: 6000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tests run with a single command and report pass or fail per test
- [x] #2 Pure logic can be exercised in tests without touching the real file system or invoking real subprocesses
- [x] #3 Type errors surface from a dedicated check separate from the test run
- [x] #4 At least one test of each kind (isolated-logic and through-the-edges) passes on the current codebase
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
vitest harness formalized into first-class unit/integration projects (vitest.config.ts 'projects'; scripts test + test:unit/test:integration via --project, no glob drift; typecheck=tsc kept separate -> AC#3). Moved cli.smoke->test/unit/ (isolated-logic via OutputSink, no fs/subprocess -> AC#2) and cli.bin->test/integration/ (through-the-edges; import depth fixed; also resolved task-1's __dirname F2). Added documented test/helpers/tmpdir.ts (makeTempDir/removeTempDir/withTempDir -- unique mkdtemp dirs, never-throw recursive+force cleanup, withTempDir finally-cleans sync+async+throw and forwards return) + its own integration test. Deferred test/snapshot+test/fixtures to tasks 16+ (no content yet, documented in config). Gate green: tsc 0, biome 12 clean, vitest 14/14 (unit 5 + integration 9); single-command + per-layer scripts verified; no temp-dir leak. Dedicated reviewer APPROVE; 2 non-blocking NITs (untested optional prefix arg; deferred snapshot flavour). IDE 'cannot find node:fs/process' diagnostics confirmed SPURIOUS post-move ghosts (tsc includes the moved file and is clean).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
