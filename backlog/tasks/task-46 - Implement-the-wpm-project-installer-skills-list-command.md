---
id: TASK-46
title: Implement the wpm project installer-skills list command
status: To Do
assignee: []
created_date: '2026-06-01 02:20'
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
- [ ] #1 The command enumerates the helper SKILL.md files under root installer-skills, excluding the main installer skill and the advisor skills.
- [ ] #2 The command reads and reports only, with no change on disk, and exits 0 on success.
- [ ] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [ ] #4 Help output is substantive (description, synopsis, an example).
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
