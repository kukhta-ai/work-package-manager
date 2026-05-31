---
id: TASK-4
title: 'Define versioning, release, and changelog conventions'
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-1
ordinal: 4000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A contributor can determine, for any change, whether it is a major, minor, or patch release of the builder
- [ ] #2 The steps from tagging a version to a published release are documented (doc 12)
- [ ] #3 Release history is recorded in a human-readable changelog with an in-progress section for unreleased changes
- [ ] #4 The builder's own version is clearly distinguished from the independent versions of the bundles it produces (doc 08)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
