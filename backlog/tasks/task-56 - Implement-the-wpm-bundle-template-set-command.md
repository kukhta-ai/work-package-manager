---
id: TASK-56
title: Implement the wpm bundle template set command
status: Done
assignee: []
created_date: '2026-06-01 02:21'
updated_date: '2026-06-01 20:19'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): replaces the project default bundle template contents from a named bundle-scope template in the registry. Exercises two-tier template resolution (doc 12).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given a name that resolves to a bundle-scope template, the command replaces the contents of bundles/bundle-template/ from that template files tree.
- [x] #2 A name that does not resolve, or resolves to a non-bundle-scope template, fails with a typed error and a non-zero exit, changing nothing.
- [x] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the name positional completes from bundle-scope templates.
- [x] #4 Help output is substantive (description, synopsis, the name positional, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle template set. Skills: bmad-create-story/dev-story/qa (worker11); bmad-story-automator-review APPROVE. resolveTemplate(name, bundle-scope) BEFORE any write, so a project-scope or unresolved name gives a typed error exit 1 changing nothing (AC56#2); on success clears + copies the resolved template files verbatim into bundles/bundle-template/ (placeholders preserved). FORWARD-ITEM (recorded, NOT a defect, reviewer concurs): create-bundle.ts resolves the bundle template from the REGISTRY not bundles/bundle-template/, so set is currently inert for bundle new (doc-10:150 step2 vs code) -- reconcile at task-34 plus a createBundle default-source fix. Gate 1111.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
