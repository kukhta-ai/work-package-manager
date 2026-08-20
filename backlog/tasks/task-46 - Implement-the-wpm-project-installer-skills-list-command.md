---
id: TASK-46
title: Implement the wpm project installer-skills list command
status: Done
assignee: []
created_date: '2026-06-01 02:20'
updated_date: '2026-06-01 18:45'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): lists the project-scoped install-time helper skills under root installer-skills, excluding the main installer skill and the per-bundle advisor skills.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The command enumerates the helper SKILL.md files under root installer-skills, excluding the main installer skill and the advisor skills.
- [x] #2 The command reads and reports only, with no change on disk, and exits 0 on success.
- [x] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [x] #4 Help output is substantive (description, synopsis, an example).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
project installer-skills list. Skills: create-story/dev-story/qa (worker9); APPROVE. SCAN-based, EXCLUDES the main installer skill and the advisor skills via the same isReservedInstallerSkillName predicate. Verified: with demo-installer, web-advisor and real-helper on disk, list shows only real-helper. Gate 1009.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
