---
id: TASK-94
title: Update the README and first-run UX for the workspace flow
status: Done
assignee: []
created_date: '2026-06-06 23:38'
updated_date: '2026-06-07 05:23'
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
- [x] #1 The README first-run walkthrough covers installing the authoring skill and creating a workspace, then authoring through the agent and building into the build-output directory.
- [x] #2 The README describes the workspace layout (authoring root, deliverable subdirectory, build output) and which parts ship.
- [x] #3 The README states the authoring skill is the authoring-agent instruction surface and how to install or reinstall it.
- [x] #4 The README no longer describes the deliverable as authored at the project root.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD (Rule 3): worker a8d7e69a ran bmad-create-story (story _bmad-output/.../story-task-94.md) + bmad-dev-story (doc-driven fallback; skills gate on epic-1 sprint mirror); qa N/A. Reviewer = SEPARATE subagent a0167a37 (story-automator-review fell back to manual) -> APPROVE, all 4 ACs PASS, CLI accuracy audited command-by-command vs code (skill install / init / build dry-run+package / user scopes / .authoring-backlog all ACCURATE), AC#4 grep clean (no project-root authoring claim). IMPL: README "Getting started" 5-step workspace walkthrough (install wpm+backlog.md -> wpm skill install -> wpm init -> cd -> author via agent -> build into builds/) + "authoring workspace layout" tree (root front door+.authoring-backlog / wip/ deliverable / builds/) + "only wip/ ships" + skill-is-the-instruction-surface paragraph. README.md only (+ story artifact). NON-BLOCKING NOTE (tracked): the builds/ routing (build writes into builds/) and the _AGENTS.md->AGENTS.md prefix strip are documented at the DESIGN-CONTRACT level (the ACs mandate it) but are implemented by the immediately-following task-89 (builds/ routing; build currently writes to cwd) and task-90 (prefix strip; _AGENTS.md currently ships verbatim). Both are pending in THIS epic; ensure 89+90 land before any release (epic ends in a handoff, not a release).
<!-- SECTION:NOTES:END -->
