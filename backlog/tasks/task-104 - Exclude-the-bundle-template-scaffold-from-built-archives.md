---
id: TASK-104
title: Exclude the bundle-template scaffold from built archives
status: Done
assignee: []
created_date: '2026-06-08 00:16'
updated_date: '2026-08-20 00:03'
labels:
  - authoring-context
  - bug
  - product
dependencies: []
ordinal: 104000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A built archive contains no bundle-template scaffold directory and no unsubstituted placeholder (.tmpl) files
- [x] #2 The init-generated executor front door has no empty or dangling menu entry when the project has no bundles yet
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed via actual BMAD workflow chain: bmad-create-story -> bmad-dev-story -> bmad-qa-generate-e2e-tests -> bmad-story-automator-review (2 cycles), with a second bmad-dev-story review-fix absorption pass. Build ship-set now excludes bundles/bundle-template, disabled/orphaned direct bundle entries, and builder-source .tmpl files while preserving enabled runtime payload/templates content (including nested files/symlinks); tar/git/conditional-zip share the same plan. Executor front door reads runtime manifest summaries and has no stale choose-from placeholder. All three starter recipe tasks render the requested version milestone, including prerelease/build semver. Docs 06/10/12 were reconciled to the filtered ship-set contract. Cycle 1 fixed 1 HIGH, 2 MEDIUM, 1 LOW; cycle 2 found no product issue. Final evidence: focused unit 41/41, built E2E 24/24, full suite 1,256/1,256 across 99 files, typecheck/lint/build/inventory/diff hygiene clean.
<!-- SECTION:NOTES:END -->
