---
id: TASK-31
title: Author the default bundle template
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-16
ordinal: 31000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Adding a bundle from the default template produces a working bundle: its descriptor, its install-backlog gated by a Definition of Done, and its scope notes (doc 07)
- [ ] #2 The produced bundle carries a detect-then-setup-then-verify task scaffold (doc 06/09)
- [ ] #3 Every placeholder in the template is substituted in the produced bundle
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
