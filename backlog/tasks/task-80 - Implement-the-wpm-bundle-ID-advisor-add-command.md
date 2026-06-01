---
id: TASK-80
title: Implement the wpm bundle ID advisor add command
status: Done
assignee: []
created_date: '2026-06-01 02:23'
updated_date: '2026-06-01 19:31'
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
- [x] #1 The advisor stub at installer-skills/id-advisor/SKILL.md is rendered from the project template advisor snippet with frontmatter plus a placeholder description and body and no invented prose.
- [x] #2 A write-advisor-content task for the bundle is materialised, idempotent by title.
- [x] #3 When the advisor already exists the command is a no-op.
- [x] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles.
- [x] #5 Help output is substantive (description, synopsis, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle id advisor add. BMAD skills: bmad-create-story/dev-story/qa-generate-e2e-tests (worker10); bmad-story-automator-review (reviewer APPROVE). The bundle-new step-6 action exposed standalone: APPLY = the existing scaffoldAdvisor (renders installer-skills/id-advisor/SKILL.md at ROOT from the advisor snippet, no-op if exists); MATERIALISE = the single Write advisor content for id task, idempotent by title. No-op keyed on a double signal (advisor path in changedPaths AND no materialised task), robust against the rerender re-ensuring the scope alias. advisor.ts refactored (advisorSkillDir + advisorContentTaskTitle); create-bundle reuses the title PROVEN byte-identical to pre-Q (advisor-stub SHA256 + task title unchanged via a pre-Q binary diff). Verified on the real binary. Gate 1058.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
