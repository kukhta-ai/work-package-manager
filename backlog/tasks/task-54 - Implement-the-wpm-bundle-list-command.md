---
id: TASK-54
title: Implement the wpm bundle list command
status: Done
assignee: []
created_date: '2026-06-01 02:20'
updated_date: '2026-06-01 20:19'
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
- [x] #1 The command enumerates manifest.yml bundles and prints, per bundle, its id, the version from bundle.yml, and the counts of kind:state and kind:migration tasks in its install-backlog.
- [x] #2 The command reads and reports only, with no change on disk, and exits 0 on success.
- [x] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [x] #4 Help output is substantive (description, synopsis, an example).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle list. Skills: bmad-create-story/dev-story/qa (worker11); bmad-story-automator-review APPROVE. Enumerates manifest.bundles; per bundle reads bundle.yml version + fs-SCANS bundles/id/install-backlog/tasks for kind:state vs kind:migration LABELS (frontmatter labels block, whole-token match, no body miscount; the install-backlog is not a discoverable Backlog.md root per the doc-07:67 note). Prints a table; read-only. Gate 1111.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
