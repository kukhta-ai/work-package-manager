---
id: TASK-55
title: Implement the wpm bundle template show command
status: Done
assignee: []
created_date: '2026-06-01 02:21'
updated_date: '2026-06-01 20:19'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): inspects the project default bundle template at bundles/bundle-template/, printing its metadata and tree. This is the project default scaffold, not a specific bundle (the verb template is reserved among cross-bundle ops).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The command prints the template metadata and a tree summary of bundles/bundle-template/.
- [x] #2 The command reads and reports only, with no change on disk, and exits 0 on success.
- [x] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [x] #4 Help output is substantive (description, synopsis, an example).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle template show. Skills: create-story/dev-story/qa (worker11); APPROVE. Inspects bundles/bundle-template/ (metadata + tree summary); read-only; an absent dir gives a helpful NotFound exit 1. Gate 1111.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
