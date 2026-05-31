---
id: TASK-21
title: Implement the authoring-task materialisation service
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-14
ordinal: 21000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a set of authoring-task specifications, a task is created for each whose title does not already exist (doc 11)
- [ ] #2 Running the same materialisation again creates nothing and changes nothing
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
