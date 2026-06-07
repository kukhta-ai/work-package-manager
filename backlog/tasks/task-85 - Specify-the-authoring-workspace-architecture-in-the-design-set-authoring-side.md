---
id: TASK-85
title: >-
  Specify the authoring-workspace architecture in the design set (authoring
  side)
status: To Do
assignee: []
created_date: '2026-06-06 23:38'
labels:
  - authoring-workspace
  - docs
dependencies: []
ordinal: 85000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The design set describes the deliverable authored in place at the project root, where the executor front door (docs 06/07) and the authoring-agent stance collide. This task evolves the spec to an authoring workspace that wraps the deliverable, separating the authoring surface from the deliverable. It updates the authoring-side docs only; the shipped-artifact contract is unchanged because the built archive is the un-nested deliverable. This edits the human-owned design set and is the contract the implementation tasks conform to. Docs: 01, 04, 06, 11, 12. Non-goals: CLI and build behavior (task 86); any code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The design set defines one consistent vocabulary for the three workspace regions: the authoring workspace root, the deliverable subdirectory (wip), and the build-output directory (builds).
- [ ] #2 doc 06 states that during authoring the bundle-project skeleton lives under the workspace deliverable subdirectory, and that the built archive is that same skeleton un-nested to the archive root with its content unchanged.
- [ ] #3 doc 01 describes the author workspace: an authoring front door and the authoring backlog at the root, the deliverable under its subdirectory, and builds isolated in the build-output directory.
- [ ] #4 doc 04 states the authoring agent operates from the workspace root and treats the deliverable subdirectory as the artifact it is building, not as instructions addressed to it.
- [ ] #5 doc 11 places the authoring backlog at the workspace root and states it remains gitignored and builder-time only.
- [ ] #6 doc 12 shows the directory scaffold of a generated authoring workspace, distinct from the shipped-artifact scaffold.
- [ ] #7 The docs state that the authoring front door and the authoring backlog are never part of any shipped artifact.
- [ ] #8 No updated doc still describes the deliverable as authored at the project root, and cross-references among the changed docs remain consistent.
<!-- AC:END -->
