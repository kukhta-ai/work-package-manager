---
id: TASK-9
title: Configure the builder's own dogfood backlog and agent front door
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-31 22:41'
labels: []
dependencies:
  - TASK-1
ordinal: 9000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The builder's own development work is tracked in a Backlog.md backlog inside the repository (doc 12)
- [x] #2 Every task in that backlog is gated by a shared, project-level Definition of Done
- [ ] #3 An agent opening the repository is oriented to the project, its design documents (00-14), and doc 13's import-boundary rule, without having to infer them
- [ ] #4 A reader can reach the design documents from the repository's entry README
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified both ACs read-only via the backlog CLI (no hand-edits to the task directory): AC#1 -- the in-repo Backlog.md root tracks all 33 foundation stories; AC#2 -- the project-level definitionOfDone is configured (the 3 items: typecheck+biome / tests / docs+no-dead-code+core-boundary) and appears on every task. Already established by the Step-0 bootstrap -- ratified, not rebuilt. Deliverable: CONTRIBUTING.md '## Tracking work -- the dogfood backlog' (doc 12 Dogfooding) documents the dogfooding rationale, CLI-only operation, the To Do->In Progress->Done lifecycle + the quoted shared DoD gate, a cross-link to the task-3 merge-gate, and an AGENTS.md front-door pointer (AGENTS.md/CLAUDE.md left UNMODIFIED, human-owned). Doc-only: gate green (tsc 0 / biome 12 / vitest 14). Self-verified by orchestrator. Completes Phase A (tasks 1-9).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
