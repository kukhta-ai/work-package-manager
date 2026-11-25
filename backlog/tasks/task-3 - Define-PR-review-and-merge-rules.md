---
id: TASK-3
title: 'Define PR, review, and merge rules'
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-31 21:54'
labels: []
dependencies:
  - TASK-2
ordinal: 3000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A contributor knows what a pull request must satisfy before it can merge: passing checks, review, and a linked task
- [x] #2 The repository's merge behaviour is documented, with the rationale for the chosen strategy
- [x] #3 Opening a pull request prompts the author for the expected information
- [x] #4 The merge gate is the same check suite a contributor can run locally, and the project Definition of Done is named as part of it (doc 07)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CONTRIBUTING.md '## Pull requests, review & merge' + .github/PULL_REQUEST_TEMPLATE.md document the verified rules: a PR needs passing three-command checks + >=1 review (never self-merge) + a linked task-<id>; --no-ff story->epic with rationale (explicit revertable unit, preserves per-story history, not squash/rebase), reviewed PR epic->dev (gh pr create --base dev), dev->main a separate human decision; merge gate = the SAME local suite (biome check/ci enforce identical rules incl the core-boundary rule) with the development DoD NAMED as part of it -- echoing doc 07's DoD-as-gate principle, explicitly distinguished from doc 07's executor-side install-receipt DoD. PR template prompts summary + Closes task-<id> + DoD checklist + pasted gate output + CI-green. Doc/template task: gate green & unchanged (tsc/biome/vitest 7/7), no testable code logic. Self-verified by orchestrator (separate lane from worker-author); appended cleanly to the task-2 file, anchors/cross-links resolve.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
