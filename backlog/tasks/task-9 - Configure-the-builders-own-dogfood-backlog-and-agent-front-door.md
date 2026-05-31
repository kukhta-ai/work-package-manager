---
id: TASK-9
title: Configure the builder's own dogfood backlog and agent front door
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-1
ordinal: 9000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The builder's own development work is tracked in a Backlog.md backlog inside the repository (doc 12)
- [ ] #2 Every task in that backlog is gated by a shared, project-level Definition of Done
- [ ] #3 An agent opening the repository is oriented to the project, its design documents (00-14), and doc 13's import-boundary rule, without having to infer them
- [ ] #4 A reader can reach the design documents from the repository's entry README
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
