---
id: TASK-41
title: Implement the wpm project version set command
status: To Do
assignee: []
created_date: '2026-06-01 02:19'
labels:
  - cli
dependencies:
  - TASK-33
  - TASK-18
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): sets the project release version in manifest.yml to an explicit semver value (the rare, non-bump case). Validates semver via the version-constraint service; writes are comment-preserving.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given an explicit version that is valid semver, the command writes it to manifest.yml project version preserving comments and prints it.
- [ ] #2 A value that is not valid semver fails as a usage error with exit code 2 and changes nothing.
- [ ] #3 The derived AGENTS.md and installer skill are re-rendered.
- [ ] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [ ] #5 Help output is substantive (description, synopsis, the version positional, an example); on success exits 0.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
