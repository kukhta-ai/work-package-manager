---
id: TASK-87
title: Scaffold the authoring workspace on wpm init
status: To Do
assignee: []
created_date: '2026-06-06 23:38'
updated_date: '2026-06-06 23:50'
labels:
  - authoring-workspace
dependencies:
  - TASK-85
  - TASK-86
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make wpm init create the workspace per the spec (tasks 85/86): the authoring front door (AGENTS.md plus a CLAUDE.md alias) and the authoring backlog at the workspace root, the deliverable skeleton under the deliverable subdirectory, an empty build-output directory, and a gitignore that excludes the builder-time regions. Extends the current init, which scaffolds the deliverable at the project root, reusing the template, render, derive, and materialise services. Non-goals: workspace resolution (88); build packaging (89); build-time executor front door (90); authoring-skill delivery (91).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After init of a new project, the workspace root holds an authoring front door and the authoring backlog (a Backlog.md root with the authoring task prefix), and the deliverable skeleton (manifest, bundles tree, default bundle template, installer-skills, templates) lives under the deliverable subdirectory.
- [ ] #2 An empty build-output directory exists after init.
- [ ] #3 The workspace gitignore excludes the authoring backlog and the build-output directory.
- [ ] #4 The authoring front door addresses the authoring agent, orienting it toward authoring the deliverable rather than installing it.
- [ ] #5 init refuses when the target path already exists and creates nothing.
- [ ] #6 --list-templates prints the available templates and exits without creating anything, and --param k=v still feeds placeholder substitution.
- [ ] #7 The project-wide authoring tasks, and a per-bundle set for each template-preincluded bundle, are materialised into the workspace-root authoring backlog with their identities unchanged.
- [ ] #8 The deliverable subdirectory contains the rendered per-project installer skill and the executor front door scaffolded under the reserved build-stripped prefix, author-editable and not under its canonical auto-discovered name.
<!-- AC:END -->



## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
