---
id: TASK-15
title: Implement the Clock and Environment ports
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-6
ordinal: 15000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Everything time-dependent and environment-dependent the builder does is reached through replaceable abstractions for the clock and the environment (doc 13)
- [ ] #2 Tests can pin the current time, the working directory, the platform, and environment variables to fixed values
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
