---
id: TASK-25
title: Implement the shared mutation lifecycle harness
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-19
  - TASK-21
  - TASK-23
  - TASK-24
ordinal: 25000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every state-changing operation runs the same sequence: load the project, check the requested change, apply it, re-derive the front-door artefacts, materialise any authoring tasks, and report a result (doc 13)
- [ ] #2 Re-deriving artefacts and materialising tasks happen automatically around an operation's change, without each operation arranging them
- [ ] #3 A read-only operation loads and reports without changing anything
- [ ] #4 Repeating an operation whose effect is already present makes no further change
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
