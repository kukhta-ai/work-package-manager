---
id: TASK-75
title: Implement the wpm bundle ID skills list command
status: Done
assignee: []
created_date: '2026-06-01 02:23'
updated_date: '2026-06-01 17:11'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): lists the registered payload skills of a bundle.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The command enumerates the registered payload skills for the bundle.
- [x] #2 The command reads and reports only, with no change on disk, and exits 0 on success.
- [x] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles.
- [x] #4 Help output is substantive (description, synopsis, an example).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle id skills list. Skills: bmad-create-story/dev-story/qa-generate-e2e-tests (worker8); bmad-story-automator-review (APPROVE). Enumerates the registered payload skills (registry-based; the P/F installer-skills families will use scan-based list instead); read-only. Gate 923.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
