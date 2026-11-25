---
id: TASK-96
title: Teach the acceptance-criteria what-not-how contract in the authoring skill
status: Done
assignee: []
created_date: '2026-06-07 22:51'
updated_date: '2026-06-07 23:13'
labels:
  - authoring-context
  - skill
dependencies: []
ordinal: 96000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The installer-builder skill set includes a reference stating that acceptance criteria are observable outcomes, not the steps taken to reach them
- [x] #2 The reference covers, as outcomes: one concern per criterion, negative and edge behaviour, and naming a boundary contract while leaving internals unspecified
- [x] #3 The reference gives the author a check for distinguishing an outcome from a method
- [x] #4 The skill body links to the reference under its progressive-disclosure model
- [x] #5 The reference attributes its source to the task-writing conventions and does not contradict them
- [x] #6 The reference stays within the length discipline the other references follow
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Story A. Worker abb0aba9 (bmad-create-story+dev-story fell back to doc/ledger-driven; epic-1 sprint mirror excludes epic-4). Reviewer = SEPARATE subagent a92686b4 (story-automator-review fell back to manual) -> APPROVE, all 6 ACs PASS, faithful to docs/task-writing-conventions.md (7 rules->6 faithfully compressed, seam-vs-stuffing table + classifier + don't-restate-DoD present), AC-as-in-bundle-verification framed. New references/task-conventions.md (68L, in band). Linked in SKILL.md. Gate green (tsc/biome clean, 1076 passed). Skill test strengthened (REFERENCES 3->6).
<!-- SECTION:NOTES:END -->
