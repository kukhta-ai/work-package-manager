---
id: TASK-59
title: Implement the wpm bundle ID version command
status: Done
assignee: []
created_date: '2026-06-01 02:22'
updated_date: '2026-06-01 14:39'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): with no subcommand, prints a specific bundle current version from bundle.yml. ID denotes the bundle-id positional.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The command prints the value of the bundle bundle.yml version to stdout.
- [x] #2 The command reads and reports only, with no change on disk, and exits 0 on success.
- [x] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles.
- [x] #4 Help output is substantive (description, synopsis, an example) and documents the bump and set subcommands.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle id version (read). BMAD skills run: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests (worker); bmad-story-automator-review (reviewer, APPROVE). readBundleVersionSpec in src/core/operations/bundle-version.ts projects bundles ID bundle.yml version via the comment-preserving yaml leaf; ONE bundleVersionModule appended to PER_BUNDLE_MODULES, no routing change (reuses the task-57 per-bundle registry). Gate 713 green.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
