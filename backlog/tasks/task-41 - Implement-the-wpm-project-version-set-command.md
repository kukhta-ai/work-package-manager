---
id: TASK-41
title: Implement the wpm project version set command
status: Done
assignee: []
created_date: '2026-06-01 02:19'
updated_date: '2026-06-01 12:36'
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
- [x] #1 Given an explicit version that is valid semver, the command writes it to manifest.yml project version preserving comments and prints it.
- [x] #2 A value that is not valid semver fails as a usage error with exit code 2 and changes nothing.
- [x] #3 The derived AGENTS.md and installer skill are re-rendered.
- [x] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [x] #5 Help output is substantive (description, synopsis, the version positional, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
wpm project version set <explicit> (MUTATION). runMutation: validate semver at the boundary (parseSemVer -> UsageError exit 2 on a bad/partial semver, NOT ValidationError -- a bad CLI arg is exit 2 per doc-13 §7) changing nothing; APPLY writes comment-preservingly; ④ re-renders; prints. Reviewer APPROVE. Gate green.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
