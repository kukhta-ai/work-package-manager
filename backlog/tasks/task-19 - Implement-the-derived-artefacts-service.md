---
id: TASK-19
title: Implement the derived-artefacts service
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-11
  - TASK-16
ordinal: 19000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a project, the always-read front-door file, the orchestrator skill, and the set of scope aliases that should exist are derived from it (doc 13)
- [ ] #2 The derived aliases correspond to the project's declared target agents, at both project and bundle level
- [ ] #3 Deriving twice from the same project yields identical results, and re-deriving onto an already-current project changes nothing
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
