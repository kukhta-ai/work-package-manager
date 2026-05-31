---
id: TASK-18
title: Implement version-constraint resolution
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-10
ordinal: 18000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a version and an npm-style constraint, the result correctly states whether the version satisfies it, across caret, tilde, comparator, exact, and range forms (doc 13)
- [ ] #2 Given a graph of inter-bundle dependency constraints and the available versions, each constraint is reported as satisfied or unsatisfied
- [ ] #3 A dependency cycle is detected and reported rather than looping
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
