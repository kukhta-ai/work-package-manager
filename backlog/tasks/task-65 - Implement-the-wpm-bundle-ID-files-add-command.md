---
id: TASK-65
title: Implement the wpm bundle ID files add command
status: To Do
assignee: []
created_date: '2026-06-01 02:22'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): registers an authoritative reference file the agent has already placed under payload/files. Structure-not-content: it validates and records the reference, never writing file content.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When the path exists under the bundle payload/files, the reference is registered (in bundle.yml payload list or equivalent) and no file content is written or modified.
- [ ] #2 Registering a path that does not exist on disk fails with a typed error and a non-zero exit, registering nothing.
- [ ] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles and the path from files present under payload/files.
- [ ] #4 Help output is substantive (description, synopsis, the path positional, an example); on success exits 0.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
