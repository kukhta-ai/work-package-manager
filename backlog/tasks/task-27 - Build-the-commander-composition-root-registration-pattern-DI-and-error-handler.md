---
id: TASK-27
title: >-
  Build the commander composition root, registration pattern, DI, and error
  handler
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-12
  - TASK-14
  - TASK-15
  - TASK-23
ordinal: 27000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The command-line program presents the top-level command groups and dispatches to them through one consistent registration approach (doc 10)
- [ ] #2 The real file-system, backlog, clock, and environment abstractions are assembled once at the program's entry point and supplied to the commands
- [ ] #3 A raised domain failure becomes the correct exit status with a readable message; an unexpected failure exits with the general-error status and shows detail only in a debug mode
- [ ] #4 A bundle id that collides with a reserved command verb is refused (doc 10)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
