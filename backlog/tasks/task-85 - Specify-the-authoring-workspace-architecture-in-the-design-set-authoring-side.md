---
id: TASK-85
title: >-
  Specify the authoring-workspace architecture in the design set (authoring
  side)
status: Done
assignee: []
created_date: '2026-06-06 23:38'
updated_date: '2026-06-07 00:31'
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
- [x] #1 The design set defines one consistent vocabulary for the three workspace regions: the authoring workspace root, the deliverable subdirectory (wip), and the build-output directory (builds).
- [x] #2 doc 06 states that during authoring the bundle-project skeleton lives under the workspace deliverable subdirectory, and that the built archive is that same skeleton un-nested to the archive root with its content unchanged.
- [x] #3 doc 01 describes the author workspace: an authoring front door and the authoring backlog at the root, the deliverable under its subdirectory, and builds isolated in the build-output directory.
- [x] #4 doc 04 states the authoring agent operates from the workspace root and treats the deliverable subdirectory as the artifact it is building, not as instructions addressed to it.
- [x] #5 doc 11 places the authoring backlog at the workspace root and states it remains gitignored and builder-time only.
- [x] #6 doc 12 shows the directory scaffold of a generated authoring workspace, distinct from the shipped-artifact scaffold.
- [x] #7 The docs state that the authoring front door and the authoring backlog are never part of any shipped artifact.
- [x] #8 No updated doc still describes the deliverable as authored at the project root, and cross-references among the changed docs remain consistent.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD skills run (Rule 3 evidence): worker subagent aa1a8fd8 ran bmad-create-story (story at _bmad-output/implementation-artifacts/stories/story-task-85.md) + bmad-dev-story (the doc edits); qa-generate-e2e-tests N/A (docs-only, no executable behaviour). Reviewer = SEPARATE subagent a5a915d6 ran bmad-story-automator-review -> APPROVE, all 8 ACs PASS, vocabulary consistent across docs 01/04/06/11/12, no stale project-root authoring claims, fixed core (00/13) intact, _AGENTS.md prefix correctly deferred to task-86. Edited docs 01,04,06,11,12: introduced the authoring-workspace vocabulary (workspace root + authoring front door + .authoring-backlog; deliverable subdir wip/; build-output builds/); built archive = wip/ un-nested to archive root, content unchanged; wrapper never ships. Gate unaffected (docs-only; no .ts/.json/test changes). Decision: dir names wip/ and builds/ confirmed (per AC#1).
<!-- SECTION:NOTES:END -->
