---
id: TASK-88
title: Resolve the workspace and deliverable root for project-bound commands
status: To Do
assignee: []
created_date: '2026-06-06 23:38'
labels:
  - authoring-workspace
dependencies:
  - TASK-86
  - TASK-87
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound commands currently walk up from the working directory to a manifest at the project root. Update resolution so commands find the workspace and operate on the nested deliverable subdirectory from anywhere within the workspace, with -C targeting a workspace. Conforms to the resolution spec in doc 10 (task 86). Non-goals: build packaging (89); init scaffolding (87).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A project-bound command run at the workspace root operates on the deliverable in the deliverable subdirectory.
- [ ] #2 A project-bound command run anywhere within the workspace, including inside the deliverable or a bundle directory, resolves the same deliverable root.
- [ ] #3 The -C/--project option targets a workspace at the given path.
- [ ] #4 Run outside any workspace, a project-bound command exits non-zero, names the missing workspace marker, and suggests init or the -C override.
- [ ] #5 Resolution distinguishes a workspace from an unwrapped directory and does not silently operate on a bare deliverable that is not inside a workspace.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
