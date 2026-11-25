---
id: TASK-9
title: Configure the builder's own dogfood backlog and agent front door
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 11:16'
labels: []
dependencies:
  - TASK-1
ordinal: 9000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The builder's own development work is tracked in a Backlog.md backlog inside the repository (doc 12)
- [x] #2 Every task in that backlog is gated by a shared, project-level Definition of Done
- [x] #3 An agent opening the repository is oriented to the project, its design documents (00-14), and doc 13's import-boundary rule, without having to infer them
- [x] #4 A reader can reach the design documents from the repository's entry README
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Epic-gate disposition (Phase 6, tea trace flagged these as the only 2 unchecked ACs in the foundation): AC#3/#4 are observably SATISFIED by the existing repo orientation docs and ticked now (task-9 was a freehand pre-Rule-3 task that never ticked them; no code/doc change needed). AC#4: README.md lists docs/00-foundation-and-lineage.md through 14-lineage-reference.md as the design specification and says read docs/00 then 01-14 in order -- a reader reaches the design docs from the entry README. AC#3: README orients an agent to the project + points at docs 00-14 and AGENTS.md (the development front door); AGENTS.md/CLAUDE.md mandate reading docs 00-14 and name doc 13's import-boundary rule, so an agent opening the repo is oriented without inferring. Surfaced to the user in the milestone status.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
