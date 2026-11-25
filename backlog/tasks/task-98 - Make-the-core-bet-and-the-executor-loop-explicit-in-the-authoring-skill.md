---
id: TASK-98
title: Make the core bet and the executor loop explicit in the authoring skill
status: Done
assignee: []
created_date: '2026-06-07 22:51'
updated_date: '2026-06-07 23:53'
labels:
  - authoring-context
  - skill
dependencies: []
ordinal: 98000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The skill states why acceptance criteria describe outcomes rather than steps: a reasoning agent adapting to an environment the author never sees
- [x] #2 The author can find in the skill the executor runtime loop it authors for, at enough depth to simulate it: detect, verify, record, resume, with idempotent re-run
- [x] #3 The skill states that recording the receipt is a precondition for a task being done
- [x] #4 The skill states the author duty to provide the bundle how-to-use close
- [x] #5 These additions respect the skill length discipline, landing new depth in a reference or existing slack rather than bloating the spine
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Story B. Worker abdc5888 (create/dev-story fell back to ledger/doc-driven). Reviewer = SEPARATE subagent a5f749e0 -> APPROVE, all 5 ACs PASS, faithful to docs 00/03/04/07/09. Bet named in SKILL spine (tightened, ~+5L, points to task-conventions.md); executor runtime loop (detect->skip->plan->do->verify->record->advance, idempotent, resume-from-receipt, contained failure) + done-gate (receipt is precondition for Done) + how-to-use close landed in quality-protocol.md (68->85, at ceiling, lower-value lines trimmed). LENGTH OK: spine got only the bet, depth in the reference (AC#5). Gate green (1076 passed); lean-spine test guard still green.
<!-- SECTION:NOTES:END -->
