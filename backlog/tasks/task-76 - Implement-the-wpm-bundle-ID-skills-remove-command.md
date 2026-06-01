---
id: TASK-76
title: Implement the wpm bundle ID skills remove command
status: Done
assignee: []
created_date: '2026-06-01 02:23'
updated_date: '2026-06-01 17:11'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): deregisters a payload skill, leaving its SKILL.md on disk.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The named payload skill is deregistered and the command prints that the SKILL.md was left at payload/agent-skills/name/ for the author to delete deliberately.
- [x] #2 The file content is left untouched on disk: deregister, not delete.
- [x] #3 Deregistering a name that is not registered fails with a typed not-found error and a non-zero exit.
- [x] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the name completes from registered payload skills.
- [x] #5 Help output is substantive (description, synopsis, the name positional, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle id skills remove. Skills: bmad-create-story/dev-story/qa (worker8); bmad-story-automator-review (APPROVE). Deregisters and prints the SKILL.md was left at payload/agent-skills/name/; never deletes (file stays on disk). Bug found and fixed during the build: the left-at message now captures the removed dir in the CHECK beat from the registered ref path, so a --path-relocated skill names its real dir. Not registered to NotFound exit 1. Gate 923.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
