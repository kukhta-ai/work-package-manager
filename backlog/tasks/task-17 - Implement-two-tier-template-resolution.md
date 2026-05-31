---
id: TASK-17
title: Implement two-tier template resolution
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-11
  - TASK-12
ordinal: 17000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Resolving a template name finds a project-local template before a built-in one of the same name (doc 10/12)
- [ ] #2 Templates can be listed, filtered to those valid for a project versus for a bundle
- [ ] #3 A name matching no template yields a clear not-found outcome
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
