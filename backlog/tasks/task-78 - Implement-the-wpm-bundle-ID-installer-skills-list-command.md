---
id: TASK-78
title: Implement the wpm bundle ID installer-skills list command
status: Done
assignee: []
created_date: '2026-06-01 02:23'
updated_date: '2026-06-01 18:45'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): lists the bundle-scoped install-time helper skills under bundles/id/installer-skills.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The command enumerates the helper SKILL.md files under the bundle installer-skills directory.
- [x] #2 The command reads and reports only, with no change on disk, and exits 0 on success.
- [x] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles.
- [x] #4 Help output is substantive (description, synopsis, an example).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle id installer-skills list. Skills: create-story/dev-story/qa (worker9); story-automator-review APPROVE. SCAN-based: enumerates SKILL.md files under bundles/id/installer-skills/ (shows manually-placed and deregistered-but-left helpers). DIVERGENCE recorded: list SCANS while add/remove/completion use the registry -- the deliberate payload-vs-installer-skill split (payload registered-for-build, installer-skills union-scanned-at-install). Gate 1009.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
