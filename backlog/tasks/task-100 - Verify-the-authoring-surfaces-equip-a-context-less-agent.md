---
id: TASK-100
title: Verify the authoring surfaces equip a context-less agent
status: To Do
assignee: []
created_date: '2026-06-07 22:51'
labels:
  - authoring-context
  - verify
dependencies:
  - TASK-96
  - TASK-97
  - TASK-98
  - TASK-99
ordinal: 100000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent given only the authoring front door and the installed skill, without the design docs, authors a minimal valid bundle (a kind:state detect/setup/verify task with acceptance criteria) unaided
- [ ] #2 Each point where the agent lacks needed context to proceed is recorded
- [ ] #3 Every recorded context gap is resolved in the authoring surfaces or explicitly deferred with a reason
<!-- AC:END -->
