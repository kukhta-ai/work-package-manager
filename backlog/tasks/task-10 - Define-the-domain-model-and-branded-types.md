---
id: TASK-10
title: Define the domain model and branded types
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-6
ordinal: 10000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Bundle ids, agent names, versions, and version ranges are each a distinct type that exists only after passing validation; an invalid value cannot be constructed (doc 13)
- [ ] #2 A bundle id is rejected unless it is kebab-case and not a reserved word
- [ ] #3 The model can represent a project, its manifest, its bundles, a templated unit, an authoring-task spec, a validation report, and an operation result
- [ ] #4 The model carries no dependency on the CLI framework, the file system, or any other I/O
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
