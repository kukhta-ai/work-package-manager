---
id: TASK-16
title: Implement the template render engine
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-11
ordinal: 16000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a template's file tree and a set of parameter values, the corresponding output files are produced with every placeholder substituted (doc 13)
- [ ] #2 Rendering performs substitution only — no conditional logic and no computed content (Structure-not-Content, doc 10)
- [ ] #3 Files meant to be placed at initialisation and snippets meant to be produced on demand are distinguishable and handled accordingly (doc 12)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
