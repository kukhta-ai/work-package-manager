---
id: TASK-7
title: Establish the build and dev workflow
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-1
ordinal: 7000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A clean build leaves no artefacts from a previous build, and source-level debugging maps back to the original source
- [ ] #2 A developer can run a live-rebuilding mode while working
- [ ] #3 A developer can exercise the in-development command as if it were installed
- [ ] #4 Backlog.md is treated as an external prerequisite, not bundled, and a user missing it is told how to obtain it (doc 12)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
