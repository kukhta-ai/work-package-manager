---
id: TASK-30
title: Author the minimal project template
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-16
ordinal: 30000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Initialising from the minimal project template produces a working project: a manifest, an always-read front-door file, the unattended-loop instructions, an entry README, and the project's orchestrator skill (doc 06/07)
- [ ] #2 The front-door file carries recognition-and-kickoff, the install shape, and the standing rules described in doc 07
- [ ] #3 On-demand stubs for an advisor skill, an install-time skill, and a payload skill are available for later use (doc 06)
- [ ] #4 Every placeholder in the template is substituted in the produced project, leaving no unresolved markers
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
