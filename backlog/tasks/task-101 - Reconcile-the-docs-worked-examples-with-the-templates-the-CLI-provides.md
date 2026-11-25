---
id: TASK-101
title: Reconcile the docs worked examples with the templates the CLI provides
status: Done
assignee: []
created_date: '2026-06-07 22:51'
updated_date: '2026-08-19 19:48'
labels:
  - authoring-context
  - docs
  - human-gated
dependencies: []
ordinal: 101000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No shipped doc presents a worked example using a project or bundle template the CLI cannot resolve
- [x] #2 Every project and bundle template named in the docs is resolvable by the CLI, or the doc no longer names it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed via actual BMAD workflow chain: bmad-create-story -> bmad-dev-story -> bmad-qa-generate-e2e-tests -> bmad-story-automator-review (2 cycles), including a second bmad-dev-story review-fix absorption pass. Reconciled shipped docs with the real built-in inventory (project/minimal, bundle/default), corrected relative files-add examples, aligned init destination/version/task IDs, and added static plus built-CLI drift coverage. Review cycle 1 auto-fixed 3 MEDIUM + 2 LOW findings; cycle 2 found 0. Final evidence: docs guard 11/11, TASK-101 E2E 2/2, typecheck/lint/build clean, full suite 1,250/1,250 across 99 files, inventories exact, git diff --check clean. The first worker continuation and original reviewer session later stalled without command activity and were replaced/recovered by orchestration; required skills had already run and final independent review used the replacement persistent reviewer.
<!-- SECTION:NOTES:END -->
