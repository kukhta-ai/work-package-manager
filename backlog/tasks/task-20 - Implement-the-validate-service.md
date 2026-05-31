---
id: TASK-20
title: Implement the validate service
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-11
  - TASK-18
ordinal: 20000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Validating a project reports whether every dependency constraint resolves, whether the dependency graph is acyclic, whether at least one target agent is declared, and whether any bundle directory is missing from the manifest (doc 10/13)
- [ ] #2 A valid project reports no problems; each kind of broken project reports its specific problem
- [ ] #3 Review-phase concerns such as step-slug uniqueness and Definition-of-Done compliance are out of scope here (doc 11)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
