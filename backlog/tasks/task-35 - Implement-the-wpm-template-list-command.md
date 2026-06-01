---
id: TASK-35
title: Implement the wpm template list command
status: To Do
assignee: []
created_date: '2026-06-01 02:18'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-aware command (doc 10): lists the templates available to instantiate from across the project-local templates directory and the CLI built-ins, indicating shadowing. Project-aware (doc 10 section 17): works inside or outside a project, falling back to built-ins only when no project resolves. Exercises two-tier template resolution (doc 12 template-resolver).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Inside a project the listing includes both project-local templates and built-ins; outside any project it lists built-ins only.
- [ ] #2 When a project-local template shares a name with a built-in, the listing shows the project-local one shadowing the built-in.
- [ ] #3 The --scope project or --scope bundle option filters the listing to templates of that scope.
- [ ] #4 The command reads and reports only, with no change on disk, and exits 0 on success.
- [ ] #5 Help output is substantive (description, synopsis, the --scope flag and its values, an example) and --scope completes from the finite set project and bundle.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
