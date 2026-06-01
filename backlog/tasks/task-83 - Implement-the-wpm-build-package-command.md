---
id: TASK-83
title: Implement the wpm build package command
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
  - TASK-82
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): produces a distributable artefact. Runs project validate, verifies wpm.lock (frozen-lockfile), and produces the distributable in the chosen --format, printing the output path. Backs the validate and integrity services (doc 13 section 4).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The command runs project validate and verifies wpm.lock, failing on validation error or hash drift before producing anything.
- [ ] #2 It produces a distributable in the --format value of zip, tarball, or git, defaulting to zip, and prints the output path.
- [ ] #3 An unsupported --format value fails as a usage error with exit code 2.
- [ ] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [ ] #5 Help output is substantive (description, synopsis, the --format flag and its values, an example) and --format completes from zip, tarball, git; on success exits 0.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
