---
id: TASK-40
title: Implement the wpm project version bump command
status: To Do
assignee: []
created_date: '2026-06-01 02:19'
labels:
  - cli
dependencies:
  - TASK-33
  - TASK-18
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): advances the project release version in manifest.yml by a semver level (major, minor, or patch) and writes it back, re-rendering derived artefacts. Exercises the version-constraint service semver logic (doc 13 section 4); writes are comment-preserving.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a level of major, minor, or patch, the command computes the next semver from the current manifest.yml project version, writes it back preserving comments, and prints the new version.
- [ ] #2 A missing or invalid level argument fails as a usage error with exit code 2 and changes nothing.
- [ ] #3 The derived AGENTS.md and installer skill are re-rendered to reflect any version-dependent content.
- [ ] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [ ] #5 Help output is substantive (description, synopsis, the level positional and its values, an example) and the level completes from major, minor, patch; on success exits 0.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
