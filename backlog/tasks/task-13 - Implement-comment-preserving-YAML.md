---
id: TASK-13
title: Implement comment-preserving YAML
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-12
ordinal: 13000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A configuration file edited programmatically keeps its comments and key order; only the intended change differs (doc 12)
- [ ] #2 A file read and written back without changes is byte-for-byte identical
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
