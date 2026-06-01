---
id: TASK-67
title: Implement the wpm bundle ID files remove command
status: To Do
assignee: []
created_date: '2026-06-01 02:22'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): deregisters a payload file reference, leaving the file on disk.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The reference is deregistered and the command prints that the file was left at payload/files for the author to delete deliberately.
- [ ] #2 The file content is left untouched on disk: deregister, not delete.
- [ ] #3 Deregistering a path that is not registered fails with a typed not-found error and a non-zero exit.
- [ ] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the path completes from registered payload files.
- [ ] #5 Help output is substantive (description, synopsis, the path positional, an example); on success exits 0.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
