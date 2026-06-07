---
id: TASK-94
title: Update the README and first-run UX for the workspace flow
status: To Do
assignee: []
created_date: '2026-06-06 23:38'
labels:
  - authoring-workspace
  - docs
dependencies:
  - TASK-87
  - TASK-91
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The README documents installing wpm and a flat init. Update the human-facing onboarding to the workspace flow: install wpm and backlog.md, install the authoring skill, init a workspace, cd in, author through the agent, and build into the build-output directory. Depends on 87 (workspace init) and 91 (skill delivery). Non-goals: the design-set edits (85/86).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The README first-run walkthrough covers installing the authoring skill and creating a workspace, then authoring through the agent and building into the build-output directory.
- [ ] #2 The README describes the workspace layout (authoring root, deliverable subdirectory, build output) and which parts ship.
- [ ] #3 The README states the authoring skill is the authoring-agent instruction surface and how to install or reinstall it.
- [ ] #4 The README no longer describes the deliverable as authored at the project root.
<!-- AC:END -->
