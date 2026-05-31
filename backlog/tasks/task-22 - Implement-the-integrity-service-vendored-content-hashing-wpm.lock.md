---
id: TASK-22
title: Implement the integrity service (vendored-content hashing + wpm.lock)
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-12
ordinal: 22000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each vendored third-party artifact is pinned to a recorded source, resolved version, and content fingerprint (doc 08/13)
- [ ] #2 Verification passes when vendored content matches its pinned fingerprint and fails when the content has drifted
- [ ] #3 The recorded pins are sufficient to determine later exactly which version of each artifact was bundled and from where
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
