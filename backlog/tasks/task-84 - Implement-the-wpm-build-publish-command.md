---
id: TASK-84
title: Implement the wpm build publish command
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
  - TASK-83
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): builds the package and pushes it to a destination such as a registry URL or git remote. The optional distribution step layered on build package.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The command first builds the package (running validate and the lockfile check) and then pushes the result to the given destination.
- [x] #2 A failure in the build step prevents any push and surfaces as a non-zero exit.
- [x] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [x] #4 Help output is substantive (description, synopsis, the destination positional, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
build publish. Skills: bmad-create-story/dev-story/qa (worker13); bmad-story-automator-review APPROVE. THE LAST TASK. Builds the package (validate + lock + produce) THEN pushes to destination. AC84#2 build-fails-no-push PROVEN: the strict sequence (if not plan.ok throw; createArchive; pushArchive) throws BEFORE any push, so a build/validate failure publishes nothing (exit 1, no archive). Destinations: a local directory (archive copied via the fs port) or a git remote (git push via runSync), headless-tested; npm/registry HTTP push deferred as a documented v1 scope (doc-10:183 leaves the destination open). Verified on the real binary (local dir). Gate 1174.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
