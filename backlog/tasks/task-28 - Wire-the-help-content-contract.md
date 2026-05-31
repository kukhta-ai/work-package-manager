---
id: TASK-28
title: Wire the --help content contract
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-27
ordinal: 28000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every command's help shows how to invoke it, its options with their effects, and at least one worked example (doc 10 discoverability)
- [ ] #2 No registered command has empty or missing help
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
