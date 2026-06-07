---
id: TASK-92
title: >-
  Embed the authoring quality protocol from doc 04 in the installer-builder
  skill
status: Done
assignee: []
created_date: '2026-06-06 23:38'
updated_date: '2026-06-07 00:38'
labels:
  - authoring-workspace
  - docs
dependencies: []
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The installer-builder skill points at doc 04 (the protocol for making a good package: make the implicit explicit, simulate the executor, force the three author decisions, hunt leaked couplings, do not confabulate, do not over-pin) but does not carry it. Add it as a reference the skill loads on demand so the quality discipline reaches the agent. Content-only; independent of the workspace layout. Non-goals: skill delivery mechanism (91).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The installer-builder skill set includes a reference that distills doc 04: the three author decisions, the simulate-the-executor move, the independence and leaked-coupling check, and the must-nots.
- [x] #2 The skill body links to that reference under its progressive-disclosure model.
- [x] #3 The reference stays within the length discipline the other references follow.
- [x] #4 The reference attributes its source to doc 04 and does not contradict it.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD skills (Rule 3): worker a659a8cb ran bmad-create-story (story _bmad-output/.../story-task-92.md) + bmad-dev-story; qa N/A (content-only). Reviewer = SEPARATE subagent a5357693; bmad-story-automator-review FELL BACK to manual adversarial review (the skill needs a live story-automator/tmux session + sprint-status sync, absent in a standalone worktree -- surfaced per Rule 3) -> APPROVE, all 4 ACs PASS, faithful distillation of doc 04 with explicit attribution, no contradictions. Added references/quality-protocol.md (68 lines, within the 67-83 sibling band) distilling the three author decisions, simulate-the-executor (incl. upgrade sim), leaked-coupling hunt, and the must-nots; linked from SKILL.md progressive-disclosure list (count fixed three->four files). Gate unaffected (content-only; no .ts/.json/test).
<!-- SECTION:NOTES:END -->
