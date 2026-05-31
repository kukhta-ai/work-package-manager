---
id: TASK-2
title: Define the branching model and branch-naming convention
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-1
ordinal: 2000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A contributor can find the documented branching model and knows which branch is releasable at all times
- [ ] #2 Branch names follow one documented convention, illustrated by examples
- [ ] #3 It is unambiguous what may never be committed directly to the main branch
- [ ] #4 The convention does not contradict the executor's branch-per-bundle behaviour (doc 09)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
