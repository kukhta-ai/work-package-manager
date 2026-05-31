---
id: TASK-29
title: Wire tab-completion plumbing
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-27
ordinal: 29000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A user can install shell completion for the common shells (doc 12)
- [ ] #2 Options with a fixed set of valid values complete to those values
- [ ] #3 Completions that depend on project state are produced by named sources that later command work can supply, without restructuring the completion wiring
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
