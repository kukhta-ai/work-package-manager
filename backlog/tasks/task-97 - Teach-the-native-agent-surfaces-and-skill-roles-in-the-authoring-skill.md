---
id: TASK-97
title: Teach the native agent surfaces and skill roles in the authoring skill
status: Done
assignee: []
created_date: '2026-06-07 22:51'
updated_date: '2026-06-07 23:13'
labels:
  - authoring-context
  - skill
dependencies: []
ordinal: 97000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A reference distinguishes the skill roles an author places, stating for each where it lives and what triggers it
- [x] #2 The reference states that skills are discovered only from scanned scopes and that a skill outside a scanned scope is inert
- [x] #3 The reference states the executor front-door and per-target alias mechanic, consistent with the author-owned reserved-prefix front door
- [x] #4 The reference warns against a bare skills directory and against placing a payload skill in a scanned scope
- [x] #5 The skill body links to the reference under progressive disclosure, it is attributed to doc 05, and it stays within the length discipline
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Story A. Same worker/reviewer as 96 -> APPROVE, all 5 ACs PASS, faithful to docs/05 (5 skill roles w/ where+trigger; per-agent scope table EXACT incl. Hermes personal ~/.hermes/skills/; discovery-location-bound + description-load-bearing + inert-outside-scope + mid-session-clone-won't-fire; never-bare-skills + payload-no-alias; front-door/alias mechanic consistent w/ author-owned _AGENTS.md). New references/native-surfaces.md (74L). Does NOT duplicate conventions.md _AGENTS.md section (defers rationale to it). Linked in SKILL.md (count four->six). Gate green.
<!-- SECTION:NOTES:END -->
