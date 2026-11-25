---
id: TASK-100
title: Verify the authoring surfaces equip a context-less agent
status: Done
assignee: []
created_date: '2026-06-07 22:51'
updated_date: '2026-06-08 00:20'
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
- [x] #1 An agent given only the authoring front door and the installed skill, without the design docs, authors a minimal valid bundle (a kind:state detect/setup/verify task with acceptance criteria) unaided
- [x] #2 Each point where the agent lacks needed context to proceed is recorded
- [x] #3 Every recorded context gap is resolved in the authoring surfaces or explicitly deferred with a reason
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Story C dogfood. A COLD authoring-agent subagent (aa1ef7c1), restricted to ONLY the two runtime surfaces (workspace AGENTS.md + installer-builder skill; no docs/ledger), authored a VALID bundle unaided in /tmp/dogfood/demo: project demo, bundle editorconfig with a kind:state detect/setup/verify trio (real what-not-how ACs) + a .editorconfig payload; wpm project validate clean, build dry-run + tarball package succeeded (archive un-nested, _AGENTS.md->AGENTS.md+CLAUDE.md). So the surfaces ARE largely self-sufficient (AC#1). GAP LOG (AC#2) -> resolution (AC#3): [BLOCKER] recipe-authoring command 'cd wip/bundles/<id> && backlog ...' FAILS (Backlog.md resolves a backlog/ dir; install-backlog isn't one) -> RESOLVED in skill (working invocation via ln -sfn install-backlog backlog + caveat) + DEFERRED root fix TASK-102 (orchestrator empirically confirmed; also hits the executor at install time). [payload-skill stub limbo] -> TASK-103. [bundle-template ships into archive + empty _AGENTS.md menu bullet] -> TASK-104. [valid != good] -> RESOLVED (validate row notes structural-only). [zip default needs binary] -> RESOLVED (command-reference --format tarball note). [scaffolded trio lacks -m milestone] -> minor; conventions already require -m (template-polish, low priority). Orchestrator fixed skill surfaces (conventions/SKILL/authoring-workflow recipe invocation; command-reference validate+build rows). Gate green: tsc/biome clean, 1076 passed.
<!-- SECTION:NOTES:END -->
