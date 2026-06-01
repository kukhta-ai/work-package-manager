---
id: TASK-49
title: Implement the wpm project root command
status: Done
assignee: []
created_date: '2026-06-01 02:20'
updated_date: '2026-06-01 12:51'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): prints the resolved project root path on a single line for shell composition.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The command resolves the project root by walking up from the working directory for manifest.yml and prints the path on a single line with no padding, composable in a shell substitution.
- [x] #2 The command reads and reports only, with no change on disk, and exits 0 on success.
- [x] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [x] #4 Help output is substantive (description, synopsis, an example).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
wpm project root (read). Prints the resolved project root on a single line, no padding (composable in cd $(wpm project root)). Read-only exit 0; no-project typed exit 1. Reviewer APPROVE.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
