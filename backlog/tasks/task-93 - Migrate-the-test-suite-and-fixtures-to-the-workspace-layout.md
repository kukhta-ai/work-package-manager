---
id: TASK-93
title: Migrate the test suite and fixtures to the workspace layout
status: To Do
assignee: []
created_date: '2026-06-06 23:38'
updated_date: '2026-06-06 23:50'
labels:
  - authoring-workspace
dependencies:
  - TASK-87
  - TASK-88
  - TASK-89
  - TASK-90
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The unit, integration, and snapshot tests and their fixtures assume the deliverable at the project root. Update them to the workspace layout so the suite reflects and guards the new structure. Depends on the behavioral tasks 87-90. Non-goals: new behavior beyond what 87-90 define.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Fixtures represent authoring workspaces with the deliverable nested under its subdirectory rather than deliverables at the project root.
- [ ] #2 Integration tests drive the workspace flow end to end: init creates a workspace, project-bound commands resolve the nested deliverable, and build produces an un-nested archive in the build-output directory.
- [ ] #3 A regression test fails if any builder-time region (the authoring backlog, the authoring front door, or the build-output directory) appears inside a build artifact.
- [ ] #4 A regression test fails if any deliverable executor front door appears in the authoring tree under its canonical auto-discovered name; it must appear only under the reserved prefix.
- [ ] #5 Snapshot expectations reflect the workspace layout and the prefix-stripped executor front door as it appears in the archive.
<!-- AC:END -->



## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
