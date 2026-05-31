---
id: TASK-12
title: Implement the FileSystem port (real + in-memory adapters)
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-6
ordinal: 12000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All file-system access the builder needs is reached through one replaceable abstraction, so logic can run against an in-memory file system in tests (doc 13)
- [ ] #2 A write either fully succeeds or leaves the previous file intact — a partial or corrupt file is never observed after an interrupted write
- [ ] #3 Requesting a scope alias yields a working alias on POSIX, and on Windows falls back to a copy with the user warned, without the caller needing to know which happened (doc 12)
- [ ] #4 Writing into a not-yet-existing directory path succeeds, creating parents as needed
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
