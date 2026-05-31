---
id: TASK-23
title: Define the typed error model and exit-code mapping
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-10
ordinal: 23000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Failures are expressed as distinct categories — bad usage, not found, conflict, unsatisfiable constraint, and invalid input (doc 13)
- [ ] #2 The core signals failure by raising these; it never terminates the process or writes directly to the error stream
- [ ] #3 Each failure category maps to one documented exit status (success, usage error, and everything-else), decided in a single place
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
