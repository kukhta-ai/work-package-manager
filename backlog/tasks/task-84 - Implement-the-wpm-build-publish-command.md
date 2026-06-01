---
id: TASK-84
title: Implement the wpm build publish command
status: To Do
assignee: []
created_date: '2026-06-01 02:24'
updated_date: '2026-06-01 02:24'
labels:
  - cli
dependencies:
  - TASK-33
  - TASK-20
  - TASK-22
  - TASK-83
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): builds the package and pushes it to a destination such as a registry URL or git remote. The optional distribution step layered on build package.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The command first builds the package (running validate and the lockfile check) and then pushes the result to the given destination.
- [ ] #2 A failure in the build step prevents any push and surfaces as a non-zero exit.
- [ ] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [ ] #4 Help output is substantive (description, synopsis, the destination positional, an example); on success exits 0.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
