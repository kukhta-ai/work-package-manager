---
id: TASK-105
title: Ship only registered payload skills in the built archive
status: Done
assignee: []
created_date: '2026-06-08 13:24'
updated_date: '2026-08-20 09:34'
labels:
  - authoring-context
  - bug
  - product
  - build
dependencies: []
ordinal: 105000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A payload skill that is on disk but not registered in bundle.yml does not appear in the built archive
- [x] #2 A skill deregistered via skills remove no longer appears in a subsequent built archive
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD evidence: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, and separate bmad-story-automator-review were actually invoked. Three review cycles converged cleanly. Decision: bundle.yml payload.skills is authoritative; arbitrary skill-document basenames authorize their containing directory package; payload names and package roots are unique/non-overlapping; unsafe or reserved paths are rejected only for payload skills; install/uninstall recipes, other payload categories, installer skills, docs, and agent aliases retain independent shipping semantics. Evidence: exact custom/two.md add-build-remove-rebuild tar/git parity; registered/unregistered symlink coverage; focused 194/194; built E2E 27/27; typecheck/lint/build clean; full 1278/1278 across 99 files; final review fresh findings 0.
<!-- SECTION:NOTES:END -->
