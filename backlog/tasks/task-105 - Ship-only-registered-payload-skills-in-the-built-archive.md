---
id: TASK-105
title: Ship only registered payload skills in the built archive
status: Done
assignee: []
created_date: '2026-06-08 13:24'
updated_date: '2026-08-20 13:43'
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

Post-close Phase-6 CI remediation: the GitHub matrix exposed stale same-path Info-ZIP output and six Windows-only test/path seams. The persistent worker actually re-invoked bmad-dev-story and bmad-qa-generate-e2e-tests for the ZIP repair, then bmad-dev-story for the Windows case; the separate reviewer actually invoked bmad-story-automator-review through clean absorption cycles. The ZIP repair deletes prior output before archiving and partial output on failure. The concluded bmad-investigate case partitioned all 284 Windows failures into six bounded mechanisms without changing production toolAvailable. Local evidence: typecheck/lint/build green; exact-final 1286/1286 across 99 files; reviewer APPROVE with 0 open findings. Commits: 15b671e (ZIP), 8fe975d (Windows contracts). External Windows Node 20/22 CI remains the empirical Phase-6 confirmation.

Phase-6 Windows CI Follow-up #2: run 32368788474 proved the first remediation closed 280/284 Windows failures. Node 22 retained 4 deterministic failures; Node 20 retained those 4 plus 3 real-subprocess tests exceeding the unit 5s budget. Actual bmad-investigate concluded five bounded mechanisms; the persistent worker actually invoked bmad-dev-story and bmad-qa-generate-e2e-tests; the separate reviewer actually invoked bmad-story-automator-review through clean absorption. Fix: three portable-output expectations corrected; ZIP availability requires a zero-exit version probe; all prior ZIP failure/cleanup cases preserved; the real tar/Git packager suite moved to the existing serialized integration budget. Evidence: red 1/13, packager 13/13, focused 42/42, typecheck/lint/build green, exact full 1288/1288 across 99 files, final review APPROVE with 0 open findings. Commit 8443c0b. External Windows Node 20/22 rerun remains the empirical gate.

Correction to the preceding Phase-6 note: direct Windows run 32368788474 refuted its provisional statement that production toolAvailable should remain unchanged; the authoritative Follow-up #2 conclusion and commit 8443c0b require a zero-exit usability probe.
<!-- SECTION:NOTES:END -->
