---
id: TASK-64
title: Implement the wpm bundle ID requires remove command
status: To Do
assignee: []
created_date: '2026-06-01 02:22'
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
- [ ] #1 The named dependency entry is removed from this bundle bundle.yml requires map.
- [ ] #2 An authoring task to verify this bundle no longer references the dependency in install-backlog tasks or payload is materialised, idempotent by title.
- [ ] #3 Removing a dependency not present in the requires map fails with a typed not-found error and a non-zero exit.
- [ ] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the dependency id completes from this bundle current requires entries.
- [ ] #5 Help output is substantive (description, synopsis, the dependency positional, an example); on success exits 0.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
