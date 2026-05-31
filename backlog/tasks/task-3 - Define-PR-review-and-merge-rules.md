---
id: TASK-3
title: 'Define PR, review, and merge rules'
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-2
ordinal: 3000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A contributor knows what a pull request must satisfy before it can merge: passing checks, review, and a linked task
- [ ] #2 The repository's merge behaviour is documented, with the rationale for the chosen strategy
- [ ] #3 Opening a pull request prompts the author for the expected information
- [ ] #4 The merge gate is the same check suite a contributor can run locally, and the project Definition of Done is named as part of it (doc 07)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
