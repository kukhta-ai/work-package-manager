---
id: TASK-71
title: Implement the wpm bundle ID scripts add command
status: To Do
assignee: []
created_date: '2026-06-01 02:23'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): registers an install-time tooling script the agent placed under installer-scripts (install-time tooling, not delivered to the user). Same shape as files add against installer-scripts. Structure-not-content.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When the path exists under the bundle installer-scripts, the reference is registered and no file content is written or modified.
- [ ] #2 Registering a path that does not exist on disk fails with a typed error and a non-zero exit, registering nothing.
- [ ] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the path completes from files present under installer-scripts.
- [ ] #4 Help output is substantive (description, synopsis, the path positional, an example); on success exits 0.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
