---
id: TASK-36
title: Implement the wpm template show command
status: To Do
assignee: []
created_date: '2026-06-01 02:18'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-aware command (doc 10): prints the metadata and a file-tree summary of one template, resolved by name with project-local taking priority over built-in. Exercises two-tier template resolution (doc 12).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a template name, the command resolves it with project-local priority over built-in and prints its metadata from template.yml plus a tree summary of its files tree.
- [ ] #2 The --scope option disambiguates when a project-scope and a bundle-scope template share a name.
- [ ] #3 A name matching no available template fails with a typed not-found error and a non-zero exit.
- [ ] #4 The command reads and reports only, with no change on disk, and exits 0 on success.
- [ ] #5 Help output is substantive (description, synopsis, the positional and --scope, an example); the name positional completes from available template names and --scope from project and bundle.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
