---
id: TASK-8
title: Add continuous integration
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-2
  - TASK-3
  - TASK-4
  - TASK-5
  - TASK-6
ordinal: 8000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every push and pull request is automatically checked, and a failure blocks merge
- [ ] #2 The automated checks are the same lint, type, and test gates a contributor runs locally
- [ ] #3 The checks pass on the supported range of Node versions across Linux, macOS, and Windows (doc 12)
- [ ] #4 The checks pass on the current codebase
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
