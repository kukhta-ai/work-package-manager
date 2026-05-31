---
id: TASK-2
title: Define the branching model and branch-naming convention
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-31 21:49'
labels: []
dependencies:
  - TASK-1
ordinal: 2000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A contributor can find the documented branching model and knows which branch is releasable at all times
- [x] #2 Branch names follow one documented convention, illustrated by examples
- [x] #3 It is unambiguous what may never be committed directly to the main branch
- [x] #4 The convention does not contradict the executor's branch-per-bundle behaviour (doc 09)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CONTRIBUTING.md '## Branching model' documents the verified model: main always-releasable/protected/no-direct-commits; dev integration; feature/<epic> + hyphenated feature/<epic>-task-<id> story branches (with the slash->hyphen rationale: git file-vs-dir ref clash); fix/<epic>/<issue>; --no-ff merge-and-delete; one story/working-tree at a time. Examples table + explicit never-to-main rule. AC#4: distinguished from doc 09's per-bundle ISOLATION at install time (verified doc 09 prescribes no git branch -- grep found 0 git-branch refs -- so there is no conflict to reconcile; worker corrected the brief's 'branch-per-bundle' phrasing to match the source). Doc-only task: gate green and unchanged (tsc/biome/vitest 7/7), no testable code logic so no new tests added. Self-verified by orchestrator (separate lane from the worker-author). File structured so task-3/4 append PR/merge + versioning sections.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
