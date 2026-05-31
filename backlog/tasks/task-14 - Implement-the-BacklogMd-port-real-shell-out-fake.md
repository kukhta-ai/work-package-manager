---
id: TASK-14
title: Implement the BacklogMd port (real shell-out + fake)
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-6
ordinal: 14000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The builder can initialise a backlog and create, list, edit, and archive tasks in it through one replaceable abstraction (doc 13)
- [ ] #2 Tasks created this way carry the acceptance criteria, dependencies, labels, and prefixed ids that Backlog.md records, matching the flag mechanics in doc 08
- [ ] #3 Logic that uses this abstraction can run in tests without invoking the real Backlog.md tool
- [ ] #4 Through this abstraction there is no way to create or edit the content of a bundle's install-backlog — only authoring-side backlogs (doc 13 no-mirror)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
