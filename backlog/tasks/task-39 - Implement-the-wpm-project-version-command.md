---
id: TASK-39
title: Implement the wpm project version command
status: Done
assignee: []
created_date: '2026-06-01 02:19'
updated_date: '2026-06-01 12:36'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): with no subcommand, prints the project release version from manifest.yml. The bare read of the release version, distinct from per-bundle versions (doc 08).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The command prints the value of manifest.yml project version to stdout.
- [x] #2 The command reads and reports only, with no change on disk, and exits 0 on success.
- [x] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [x] #4 Help output is substantive (description, synopsis, an example) and documents the bump and set subcommands.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
wpm project version (read; VERSION pattern). runRead projects manifest.meta.version; read-only exit 0; help documents bump/set; no-project typed error. Reviewer APPROVE. Gate green (595).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
