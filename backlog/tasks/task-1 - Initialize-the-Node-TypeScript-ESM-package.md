---
id: TASK-1
title: Initialize the Node + TypeScript (ESM) package
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies: []
ordinal: 1000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The project installs and exposes a runnable 'installer' command
- [ ] #2 Running the command with a version flag prints the version and exits successfully
- [ ] #3 The codebase is TypeScript on ESM under strict type-checking, and a production build is reproducible from a clean checkout
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
