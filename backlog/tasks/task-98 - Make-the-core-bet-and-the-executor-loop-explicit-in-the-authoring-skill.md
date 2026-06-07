---
id: TASK-98
title: Make the core bet and the executor loop explicit in the authoring skill
status: To Do
assignee: []
created_date: '2026-06-07 22:51'
labels:
  - authoring-context
  - skill
dependencies: []
ordinal: 98000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The skill states why acceptance criteria describe outcomes rather than steps: a reasoning agent adapting to an environment the author never sees
- [ ] #2 The author can find in the skill the executor runtime loop it authors for, at enough depth to simulate it: detect, verify, record, resume, with idempotent re-run
- [ ] #3 The skill states that recording the receipt is a precondition for a task being done
- [ ] #4 The skill states the author duty to provide the bundle how-to-use close
- [ ] #5 These additions respect the skill length discipline, landing new depth in a reference or existing slack rather than bloating the spine
<!-- AC:END -->
