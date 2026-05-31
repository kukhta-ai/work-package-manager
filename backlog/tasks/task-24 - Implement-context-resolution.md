---
id: TASK-24
title: Implement context resolution
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-11
  - TASK-12
  - TASK-15
ordinal: 24000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 From any working directory inside a project, the project root is located by searching upward for its manifest (doc 13)
- [ ] #2 An explicit override can point at a project regardless of the working directory
- [ ] #3 When no project is found, the outcome says so explicitly, so callers that work without one can proceed
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
