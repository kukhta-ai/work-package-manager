---
id: TASK-89
title: Package the build as the un-nested deliverable into the build-output directory
status: To Do
assignee: []
created_date: '2026-06-06 23:38'
labels:
  - authoring-workspace
dependencies:
  - TASK-86
  - TASK-87
  - TASK-88
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make wpm build emit the deliverable as the archive root and write artifacts into the build-output directory, per the build spec (task 86). The archive un-nests the deliverable subdirectory so an end user unpacking it finds the manifest at the archive root. Builds on the existing build enumeration and exclusions. Non-goals: build-time executor front door generation (90).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 build package writes an archive into the build-output directory, named by the project release name, version, and chosen format.
- [ ] #2 The archive root is the un-nested deliverable, with the manifest at the archive root.
- [ ] #3 The authoring backlog, the authoring front door, and the build-output directory are absent from the archive.
- [ ] #4 Disabled bundle directories and builder-time working directories remain excluded from the archive.
- [ ] #5 build dry-run previews the would-ship un-nested tree and produces no artifact.
- [ ] #6 build run outside a workspace exits non-zero, naming the missing workspace.
- [ ] #7 Re-packaging unchanged project state reproduces an identical archive layout.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
