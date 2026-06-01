---
id: TASK-43
title: Implement the wpm project targets list command
status: To Do
assignee: []
created_date: '2026-06-01 02:19'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): prints the target agents recorded in manifest.yml.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The command prints the entries of manifest.yml targets.
- [ ] #2 The command reads and reports only, with no change on disk, and exits 0 on success.
- [ ] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [ ] #4 Help output is substantive (description, synopsis, an example).
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
