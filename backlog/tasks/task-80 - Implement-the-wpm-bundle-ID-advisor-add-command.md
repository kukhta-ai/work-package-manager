---
id: TASK-80
title: Implement the wpm bundle ID advisor add command
status: To Do
assignee: []
created_date: '2026-06-01 02:23'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): scaffolds this bundle pull-UX advisor (one per bundle). Renders the advisor stub at installer-skills/id-advisor/ from the project template advisor snippet and materialises a write-advisor-content task (doc 11). No-op if the advisor already exists. Also run automatically by bundle new. Structure-not-content.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The advisor stub at installer-skills/id-advisor/SKILL.md is rendered from the project template advisor snippet with frontmatter plus a placeholder description and body and no invented prose.
- [ ] #2 A write-advisor-content task for the bundle is materialised, idempotent by title.
- [ ] #3 When the advisor already exists the command is a no-op.
- [ ] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles.
- [ ] #5 Help output is substantive (description, synopsis, an example); on success exits 0.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
