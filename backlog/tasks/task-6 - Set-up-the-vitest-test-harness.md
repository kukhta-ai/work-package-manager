---
id: TASK-6
title: Set up the vitest test harness
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-1
ordinal: 6000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tests run with a single command and report pass or fail per test
- [ ] #2 Pure logic can be exercised in tests without touching the real file system or invoking real subprocesses
- [ ] #3 Type errors surface from a dedicated check separate from the test run
- [ ] #4 At least one test of each kind (isolated-logic and through-the-edges) passes on the current codebase
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
