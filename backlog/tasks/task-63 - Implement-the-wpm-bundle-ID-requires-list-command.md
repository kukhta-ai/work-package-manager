---
id: TASK-63
title: Implement the wpm bundle ID requires list command
status: Done
assignee: []
created_date: '2026-06-01 02:22'
updated_date: '2026-06-01 15:31'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): prints this bundle requires map, one dependency id and constraint per line.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The command prints each entry of this bundle bundle.yml requires map as a dependency id and its version constraint.
- [x] #2 The command reads and reports only, with no change on disk, and exits 0 on success.
- [x] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles.
- [x] #4 Help output is substantive (description, synopsis, an example).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle id requires list. Skills: bmad-create-story/dev-story/qa-generate-e2e-tests (worker6); bmad-story-automator-review (APPROVE). Read-only projection of the requires map, one dep id plus constraint per line (normalized display). Gate 788.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
