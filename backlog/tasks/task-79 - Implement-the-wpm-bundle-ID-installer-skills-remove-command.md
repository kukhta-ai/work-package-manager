---
id: TASK-79
title: Implement the wpm bundle ID installer-skills remove command
status: Done
assignee: []
created_date: '2026-06-01 02:23'
updated_date: '2026-06-01 18:45'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): deregisters a bundle-scoped install-time helper skill, leaving its SKILL.md on disk.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The named helper is deregistered and the command prints that the SKILL.md was left at bundles/id/installer-skills/name/ for the author to delete deliberately.
- [x] #2 The file content is left untouched on disk: deregister, not delete.
- [x] #3 Deregistering a name that is not registered fails with a typed not-found error and a non-zero exit.
- [x] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the name completes from registered bundle helpers.
- [x] #5 Help output is substantive (description, synopsis, the name positional, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle id installer-skills remove. Skills: create-story/dev-story/qa (worker9); APPROVE. Deregisters from the registry and leaves the SKILL.md on disk (scan-list still shows it until manual delete). Not registered to NotFound exit 1. Gate 1009.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
