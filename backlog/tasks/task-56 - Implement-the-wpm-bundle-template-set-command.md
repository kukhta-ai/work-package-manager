---
id: TASK-56
title: Implement the wpm bundle template set command
status: To Do
assignee: []
created_date: '2026-06-01 02:21'
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
- [ ] #1 Given a name that resolves to a bundle-scope template, the command replaces the contents of bundles/bundle-template/ from that template files tree.
- [ ] #2 A name that does not resolve, or resolves to a non-bundle-scope template, fails with a typed error and a non-zero exit, changing nothing.
- [ ] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the name positional completes from bundle-scope templates.
- [ ] #4 Help output is substantive (description, synopsis, the name positional, an example); on success exits 0.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
