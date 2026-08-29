---
id: TASK-64
title: Implement the wpm bundle ID requires remove command
status: Done
assignee: []
created_date: '2026-06-01 02:22'
updated_date: '2026-06-01 15:31'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): removes a dependency entry from this bundle requires map and materialises a verification task that the bundle no longer references the dependency (doc 11).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The named dependency entry is removed from this bundle bundle.yml requires map.
- [x] #2 An authoring task to verify this bundle no longer references the dependency in install-backlog tasks or payload is materialised, idempotent by title.
- [x] #3 Removing a dependency not present in the requires map fails with a typed not-found error and a non-zero exit.
- [x] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the dependency id completes from this bundle current requires entries.
- [x] #5 Help output is substantive (description, synopsis, the dependency positional, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle id requires remove. Skills: bmad-create-story/dev-story/qa (worker6); bmad-story-automator-review (APPROVE). Removes the named entry (not present to NotFound exit 1); materialises Verify id no longer references dep, idempotent by title, into .authoring-backlog (doc-11:83). Gate 788.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
