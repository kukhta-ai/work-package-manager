---
id: TASK-26
title: Implement one representative operation end-to-end through the lifecycle
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-17
  - TASK-25
ordinal: 26000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One state-changing operation works end to end through the shared sequence — validating input, producing files from a template, recording the change in the project, re-deriving artefacts, and materialising its authoring tasks (doc 13)
- [ ] #2 Its reported result and its effects on the project are observable without involving the command-line surface
- [ ] #3 It demonstrates that an operation composes the services and abstractions correctly, ahead of any per-command work
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
