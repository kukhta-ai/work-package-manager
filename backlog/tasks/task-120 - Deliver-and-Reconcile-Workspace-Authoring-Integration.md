---
id: TASK-120
title: Deliver and Reconcile Workspace Authoring Integration
status: Done
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-23 13:53'
labels:
  - onboarding-epic-2
  - authoring-onboarding
  - workspace-integration
  - reconciliation
  - legacy-migration
dependencies:
  - TASK-119
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/validation-report.md
  - >-
    _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md
modified_files:
  - src/adapters/backlog-cli.ts
  - src/adapters/fake-backlog.ts
  - src/adapters/memory-fs.ts
  - src/adapters/node-fs.ts
  - src/cli.ts
  - src/completion/enums.ts
  - src/core/errors.ts
  - src/core/operations/init-project.ts
  - src/core/operations/workspace-authoring-integration.ts
  - src/core/ports/backlog.ts
  - src/core/ports/filesystem.ts
  - src/core/ports/index.ts
  - src/core/services/integrity.ts
  - src/core/services/workspace-authoring-integration.ts
  - src/util/exit.ts
  - src/util/symlink.ts
  - test/helpers/workspace.ts
  - test/integration/adapters/backlog-cli.test.ts
  - test/integration/adapters/backlog-parity.test.ts
  - test/integration/adapters/node-fs.test.ts
  - test/integration/cli.build.e2e.test.ts
  - test/integration/cli.init.test.ts
  - test/integration/cli.workspace-authoring-integration.test.ts
  - test/integration/distribution-preparation/package-preparation.test.ts
  - test/integration/distribution-preparation/packed-install.test.ts
  - test/integration/distribution-preparation/public-surfaces.test.ts
  - test/integration/docs-template-examples.e2e.test.ts
  - test/unit/cli/skill-commands.test.ts
  - test/unit/completion/completion.test.ts
  - test/unit/operations/init-project.test.ts
  - test/unit/operations/lifecycle.acceptance.test.ts
  - test/unit/operations/lifecycle.test.ts
  - test/unit/operations/workspace-authoring-integration.test.ts
  - test/unit/templates/default-bundle.test.ts
  - test/unit/util/symlink.test.ts
  - >-
    _bmad-output/implementation-artifacts/2-7-deliver-and-reconcile-workspace-authoring-integration.md
  - _bmad-output/implementation-artifacts/tests/test-summary-task-120.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
priority: high
ordinal: 120000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: Every explicitly selected authoring client needs coherent workspace-local WPM skills and a native front door independent of personal state.

Boundary: One whole workspace-integration capability covers selection, complete preflight, five-skill materialisation, managed state, idempotent reapplication, user-content preservation, typed partial failure, and legacy adoption.

Non-goals: Personal setup, deliverable-target changes, generated-deliverable content, agent-process ownership, generic rollback or resume machinery, or a separate required onboarding step for detection, update, reconciliation, or migration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given an explicit non-empty selection of supported workspace authoring clients; when workspace integration is applied; then only the selected clients receive their native workspace scopes and front doors.
- [x] #2 Given an explicit workspace authoring-client selection; when workspace integration reads or records that selection; then the selection neither derives from nor changes the deliverable's target agents.
- [x] #3 Given the workspace authoring-client selection is empty or contains an unsupported client; when integration is requested; then the selection is rejected with a machine-distinguishable result.
- [x] #4 Given workspace integration rejects its authoring-client selection; when workspace and deliverable surfaces are inspected afterward; then every surface remains unchanged.
- [x] #5 Given workspace creation or adoption has a predictable target, Backlog.md, authoring-task-plan, selected-client, destination, or ownership conflict; when the complete workspace request is evaluated; then every predictable blocker and its recovery are reported before the first write.
- [x] #6 Given the complete workspace request has a predictable blocker; when workspace, integration, authoring-backlog, and handoff surfaces are inspected afterward; then every surface remains unchanged.
- [x] #7 Given the complete workspace request has a predictable blocker; when its operation result is inspected; then no prepared handoff is claimed.
- [x] #8 Given workspace integration succeeds; when a selected client inspects its native scope; then `wpm-author`, `wpm-author-bundle`, `wpm-author-recipe`, `wpm-author-skill`, and `wpm-review-package` are independently available at one coherent WPM version.
- [x] #9 Given workspace integration succeeds; when a selected client's native front door is inspected; then it directs a fresh authoring session first to `wpm-author`.
- [x] #10 Given workspace integration succeeds; when package-owned installers, advisors, and payload skills are inspected; then they retain their package-owned names rather than acquiring the reserved `wpm-` prefix.
- [x] #11 Given workspace integration has been applied; when its managed authoring state is inspected; then it records the selected clients, installed skill versions, WPM-owned paths, integration origin, and reconciliation facts outside `wip/`.
- [x] #12 Given WPM-owned integration already exists alongside user-authored content; when integration is reapplied; then matching WPM-owned content remains unchanged and stale WPM-owned content converges to the requested version.
- [x] #13 Given WPM-owned integration already exists alongside user-authored content; when integration is reapplied; then surrounding user-authored content is preserved.
- [x] #14 Given workspace integration is applied or reapplied; when managed client scopes and front doors are inspected; then no duplicate managed integration exists.
- [x] #15 Given an unforeseen failure occurs after integration writes begin; when the operation ends; then the typed non-success identifies completed, failed, and unattempted boundaries with recovery guidance and a non-zero result.
- [x] #16 Given a reported partial integration write and the same authorized request; when the request is repeated after the failed boundary is recoverable; then managed integration converges without duplicate or corrupted content and without claiming generic rollback or resume.
- [x] #17 Given a recognized WPM-owned legacy `installer-builder` workspace; when adoption succeeds; then the new family is available.
- [x] #18 Given a recognized WPM-owned legacy workspace is adopted; when its deliverable and authoring backlog are inspected; then the deliverable is unchanged and the authoring-backlog history is preserved.
- [x] #19 Given an integration path is unowned, user-modified, or ambiguously owned; when adoption is evaluated; then the conflict is reported before integration mutation.
- [x] #20 Given adoption has an ownership conflict; when the integration path is inspected afterward; then its existing content remains unchanged.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Literal BMAD workflows completed: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, and independent bmad-story-automator-review cycle 1. Realization refinement: TASK-120 uses a bounded operation-specific immutable observation and pure action plan with typed six-beat boundary evidence, preserving the four injected ports, complete preflight-before-effect semantics, no hidden post-write replanning, and no generic rollback or resume subsystem. Reviewer fixed fresh partial-init plan identity across revisions, canonical SemVer and managed-marker safety, dual-native source-free packed proof, aggregate-target preservation, and symlink-aware legacy test walkers; independent audit ended at 0 open. Final stable src/test hash 0dd4ad89ed91c2abcd19c894143dca74745d3b46bccc679a24e149547a73958d. Focused 156/156, lint 249, typecheck, build, built/nonleak 26/26, package/public 17/17, packed dual-native 2/2. First full run found only three test-walker regressions; the required replacement full gate passed 127/127 files and 1614/1614 tests in 447.42s. Wrong-cwd Backlog probe recovery: only backlog/config.yml and one agent-created untracked TASK-128 were affected; root restored the config byte-for-byte and removed only that untracked file after confirming the CLI had no undo/delete surface. No surviving TASK-128 or unrelated Backlog mutation. No live Claude behavior is claimed; authenticated Claude six-skill parity remains the user-approved post-TASK127 exact-final-revision gate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered explicit selected-client workspace authoring integration with exact five-skill native scopes, managed front doors/state, complete preflight/no-write rejection, strict legacy adoption, user-content preservation, canonical idempotent update, and typed convergent partial-failure retry. Independent review APPROVE: 20/20 AC, 0 open; replacement full gate 1614/1614.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
