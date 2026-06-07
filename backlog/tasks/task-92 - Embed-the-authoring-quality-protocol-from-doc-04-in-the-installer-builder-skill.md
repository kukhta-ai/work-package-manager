---
id: TASK-92
title: >-
  Embed the authoring quality protocol from doc 04 in the installer-builder
  skill
status: To Do
assignee: []
created_date: '2026-06-06 23:38'
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
- [ ] #1 The installer-builder skill set includes a reference that distills doc 04: the three author decisions, the simulate-the-executor move, the independence and leaked-coupling check, and the must-nots.
- [ ] #2 The skill body links to that reference under its progressive-disclosure model.
- [ ] #3 The reference stays within the length discipline the other references follow.
- [ ] #4 The reference attributes its source to doc 04 and does not contradict it.
<!-- AC:END -->
