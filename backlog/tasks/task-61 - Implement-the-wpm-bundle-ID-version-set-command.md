---
id: TASK-61
title: Implement the wpm bundle ID version set command
status: To Do
assignee: []
created_date: '2026-06-01 02:22'
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
- [ ] #1 Given an explicit version that is valid semver, the command writes it to the bundle bundle.yml version preserving comments and prints it.
- [ ] #2 A value that is not valid semver fails as a usage error with exit code 2 and changes nothing.
- [ ] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles.
- [ ] #4 Help output is substantive (description, synopsis, the version positional, an example); on success exits 0.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
