---
id: TASK-61
title: Implement the wpm bundle ID version set command
status: Done
assignee: []
created_date: '2026-06-01 02:22'
updated_date: '2026-06-01 14:39'
labels:
  - cli
dependencies:
  - TASK-33
  - TASK-18
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): sets a specific bundle version to an explicit semver value (the rare case). Validates semver via the version-constraint service; writes are comment-preserving.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given an explicit version that is valid semver, the command writes it to the bundle bundle.yml version preserving comments and prints it.
- [x] #2 A value that is not valid semver fails as a usage error with exit code 2 and changes nothing.
- [x] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles.
- [x] #4 Help output is substantive (description, synopsis, the version positional, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle id version set. Skills: bmad-create-story/dev-story/qa-generate-e2e-tests (worker); bmad-story-automator-review (reviewer APPROVE). setBundleVersionSpec parses the explicit semver at the boundary (invalid or partial maps to UsageError exit 2, changing nothing), comment-preserving write, materialises nothing per doc-10 row 161; summary reports the value apply wrote. Gate 713.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
