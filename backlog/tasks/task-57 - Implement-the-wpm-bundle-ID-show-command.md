---
id: TASK-57
title: Implement the wpm bundle ID show command
status: To Do
assignee: []
created_date: '2026-06-01 02:21'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): in the context of a specific bundle (bundle then the bundle id), prints that bundle metadata from bundle.yml plus a tree summary. Here ID denotes the bundle-id positional that selects the bundle.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For an enabled bundle id, the command prints its bundle.yml metadata and a tree summary of the bundle.
- [ ] #2 An id that is not an enabled bundle fails with a typed not-found error and a non-zero exit.
- [ ] #3 The command reads and reports only, with no change on disk, and exits 0 on success.
- [ ] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles.
- [ ] #5 Help output is substantive (description, synopsis, an example).
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
