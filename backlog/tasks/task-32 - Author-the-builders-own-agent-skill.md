---
id: TASK-32
title: Author the builder's own agent skill
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-9
ordinal: 32000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent reading the builder's own skill can drive the command-line surface to author a bundle-project without external instruction (doc 12)
- [ ] #2 The skill activates on intents like authoring a bundle-project or building an installer, and conveys the SDLC-agnostic and thin-builder principles (doc 13)
- [ ] #3 Detailed material is reachable on demand rather than front-loaded (progressive disclosure, doc 05)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
