---
id: TASK-11
title: Implement the three schemas with validators
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-10
ordinal: 11000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A well-formed manifest, bundle descriptor, and template descriptor each parse into the model and serialize back without losing information (doc 06/10)
- [ ] #2 The manifest yields release identity, the enabled-bundle list, and target agents; a bundle descriptor yields its id, version, summary, confirmation level, and dependency constraints; a template descriptor yields its scope and parameters
- [ ] #3 A malformed descriptor is rejected with a message identifying what is wrong
- [ ] #4 Invalid ids are rejected on the same rules the model enforces
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
