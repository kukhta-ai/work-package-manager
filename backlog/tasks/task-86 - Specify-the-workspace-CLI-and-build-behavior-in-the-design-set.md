---
id: TASK-86
title: Specify the workspace CLI and build behavior in the design set
status: Done
assignee: []
created_date: '2026-06-06 23:38'
updated_date: '2026-06-07 01:01'
labels:
  - authoring-workspace
  - docs
dependencies:
  - TASK-85
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Companion to task 85: evolves the CLI and build docs so the tool creates and operates the workspace. The executor front door becomes a build artifact so it never competes with the authoring front door in the working tree, and the install contract and process are clarified to apply to the un-nested archive. Edits the human-owned design set. Depends on task 85 so the layout vocabulary is fixed first. Docs: 10, 12, 07, 09, and the authoring-backlog catalog in 11. Non-goals: the layout and authoring-side spec (task 85); any code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 doc 10 specifies that init creates an authoring workspace (authoring front door and authoring backlog at the root, the deliverable subdirectory, and the build-output directory) rather than the deliverable at the project root.
- [x] #2 doc 10 specifies that project-bound commands resolve the workspace and operate on the deliverable subdirectory, and that a command run anywhere within the workspace resolves the same deliverable root.
- [x] #3 doc 10 specifies that a project-bound command run outside any workspace fails, naming the workspace marker and pointing at init or the -C override.
- [x] #4 doc 10 specifies that build writes the packaged artifact into the build-output directory, named by the project release name and version, with the artifact root being the un-nested deliverable.
- [x] #5 doc 12 specifies that the authoring backlog, the authoring front door, and the build-output directory are excluded from every build artifact.
- [x] #6 docs 07 and 09 state that the install contract and installation process apply to the un-nested built archive whose root is the deliverable, and that the workspace wrapper is not part of the shipped artifact.
- [x] #7 doc 12 specifies that the deliverable executor front door is author-owned content held under a reserved, build-stripped prefix so it is editable but not auto-discovered during authoring, and that the build restores it to its canonical name in the archive, while the per-project installer skill and advisors remain authored deliverable content.
- [x] #8 the authoring-backlog catalog in doc 11 keeps a task to verify the author-owned executor front door reflects the current manifest bundles and targets, since the front door is author-owned rather than auto-regenerated.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD skills (Rule 3): worker aaf08c79 ran bmad-create-story (story _bmad-output/.../story-task-86.md) + bmad-dev-story (cycle 1: docs 07/09/10/11/12); cycle 2 worker af68ff76 applied reviewer fixes. qa N/A (docs-only). Reviewer = SEPARATE subagent a15e4141, bmad-story-automator-review FELL BACK to manual (skill auto-fixes+mutates sprint-status; this gate is read-only). Cycle1 verdict=CHANGES-REQUESTED: 1 BLOCKING (doc-13 context-resolution still said 'walk up to manifest.yml=project root', which contradicts the new workspace model -> from the workspace root, walking up never enters wip/) + 3 nits. Cycle2 fixed all: doc-13 line130 walk-up reconciled to marker wip/manifest.yml -> parent=workspace root, deliverable root=<workspace>/wip (+ project root->deliverable root at 63/100/151), doc-13 PRINCIPLES untouched; nits: doc-06 over-claim tightened, doc-10 'project root'->'deliverable root (wip/)' gloss, doc-12 per-bundle alias creation made explicit. Verified by orchestrator (doc-13 diff + grep clean; 3 nits confirmed). DECISIONS pinned: workspace marker=wip/manifest.yml (not .authoring-backlog/ [gitignored] nor bare AGENTS.md [too generic]); _AGENTS.md reserved leading-underscore prefix, build strips->AGENTS.md+CLAUDE.md/GEMINI.md aliases per targets (project + per bundle); installer skill+advisors unprefixed. SCOPE NOTE for gate: doc-13 + doc-06 edited beyond task-86's stated 07/09/10/11/12 scope -- a necessary realization reconciliation (the contract code tasks 87-90 implement against doc-13), not a fixed-core change. Gate unaffected (docs-only).
<!-- SECTION:NOTES:END -->
