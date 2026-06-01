---
id: TASK-54
title: Implement the wpm bundle list command
status: To Do
assignee: []
created_date: '2026-06-01 02:20'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): lists each enabled bundle with its version and its state and migration task counts. Reads each bundle.yml and scans its install-backlog for kind:state and kind:migration counts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The command enumerates manifest.yml bundles and prints, per bundle, its id, the version from bundle.yml, and the counts of kind:state and kind:migration tasks in its install-backlog.
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
