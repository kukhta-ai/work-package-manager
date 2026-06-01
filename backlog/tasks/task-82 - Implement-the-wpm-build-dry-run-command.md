---
id: TASK-82
title: Implement the wpm build dry-run command
status: To Do
assignee: []
created_date: '2026-06-01 02:24'
updated_date: '2026-06-01 02:24'
labels:
  - cli
dependencies:
  - TASK-33
  - TASK-20
  - TASK-22
  - TASK-48
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): validates and previews what would ship without producing an artefact. Runs project validate, verifies wpm.lock against vendored content (frozen-lockfile), and prints the file tree that would ship with each vendored artifact locked version and source. Backs the validate and integrity services (doc 13 section 4). Deeper checks (independence, simulate, slug uniqueness, DoD) live as review-phase tasks (doc 11), deliberately not here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The command runs project validate and fails fast on any validation error.
- [ ] #2 The command verifies wpm.lock against the vendored content and fails on hash drift (frozen-lockfile).
- [ ] #3 On success it prints the file tree that would ship, with each vendored artifact locked version and source, and produces no artefact.
- [ ] #4 The command exits 0 when validation and the lockfile check pass and non-zero otherwise.
- [ ] #5 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [ ] #6 Help output is substantive (description, synopsis, an example).
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
