---
id: TASK-58
title: Implement the wpm bundle ID meta command
status: To Do
assignee: []
created_date: '2026-06-01 02:21'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): edits a specific bundle bundle.yml metadata via --version, --summary, and --confirmation-level safe or dangerous. Writes are comment-preserving; structure-not-content. ID denotes the bundle-id positional.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each provided flag (--version, --summary, --confirmation-level) updates the matching bundle.yml field; omitted flags leave their fields unchanged.
- [ ] #2 The --confirmation-level value is accepted only as safe or dangerous; any other value fails as a usage error with exit code 2.
- [ ] #3 Existing comments and key order in bundle.yml are preserved across the edit.
- [ ] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles and --confirmation-level from safe and dangerous.
- [ ] #5 Help output is substantive (description, synopsis, every flag with its effect, an example); on success exits 0.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
