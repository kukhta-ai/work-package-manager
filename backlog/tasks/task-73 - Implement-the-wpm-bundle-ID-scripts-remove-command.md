---
id: TASK-73
title: Implement the wpm bundle ID scripts remove command
status: Done
assignee: []
created_date: '2026-06-01 02:23'
updated_date: '2026-06-01 16:25'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): deregisters an install-time script reference, leaving the file on disk.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The reference is deregistered and the command prints that the file was left at installer-scripts for the author to delete deliberately.
- [x] #2 The file content is left untouched on disk: deregister, not delete.
- [x] #3 Deregistering a path that is not registered fails with a typed not-found error and a non-zero exit.
- [x] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the path completes from registered installer-scripts.
- [x] #5 Help output is substantive (description, synopsis, the path positional, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle id scripts remove. Skills: create-story/dev-story/qa (worker7); story-automator-review (APPROVE). Deregisters and prints the file was left at installer-scripts/path; file stays on disk. Gate 856.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
