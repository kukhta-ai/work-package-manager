---
id: TASK-83
title: Implement the wpm build package command
status: Done
assignee: []
created_date: '2026-06-01 02:24'
updated_date: '2026-06-01 22:08'
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
- [x] #1 The command runs project validate and verifies wpm.lock, failing on validation error or hash drift before producing anything.
- [x] #2 It produces a distributable in the --format value of zip, tarball, or git, defaulting to zip, and prints the output path.
- [x] #3 An unsupported --format value fails as a usage error with exit code 2.
- [x] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [x] #5 Help output is substantive (description, synopsis, the --format flag and its values, an example) and --format completes from zip, tarball, git; on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
build package. Skills: bmad-create-story/dev-story/qa (worker13); bmad-story-automator-review APPROVE. Validates + verifies the lock BEFORE producing (broken project to exit 1, no archive). Produces the distributable in --format zip|tarball|git (default zip) via the packager.ts ADAPTER (createArchive over runSync: tar -czf / git archive / zip -r), prints the path; the archive contains exactly the plan shippable set. Unsupported --format to UsageError exit 2; a missing tool for a valid format (e.g. absent zip) to a distinct ValidationError exit 1 -- surfaced by the runSync spawn-failure fix (a latent bug where a missing tool reported success). Verified on the real binary (tarball). Gate 1174.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
