---
id: TASK-123
title: Configure Personal Authoring Clients in One Setup Action
status: Done
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-24 15:29'
labels:
  - onboarding-epic-2
  - authoring-onboarding
  - personal-setup
  - reconciliation
  - legacy-migration
dependencies:
  - TASK-122
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/validation-report.md
  - >-
    _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md
modified_files:
  - README.md
  - src/adapters/memory-fs.ts
  - src/adapters/node-fs.ts
  - src/cli.ts
  - src/core/errors.ts
  - src/core/operations/init-project.ts
  - src/core/operations/install-authoring-skill.ts
  - src/core/operations/personal-authoring-setup.ts
  - src/core/ports/filesystem.ts
  - src/core/services/personal-authoring-setup.ts
  - src/util/code-unit-order.ts
  - src/util/confirm.ts
  - src/util/exit.ts
  - test/integration/adapters/node-fs.test.ts
  - test/integration/cli.build.e2e.test.ts
  - test/integration/cli.init.test.ts
  - test/integration/cli.skill-install.test.ts
  - test/integration/distribution-preparation/package-preparation.test.ts
  - test/integration/distribution-preparation/packed-install.test.ts
  - test/unit/adapters/memory-fs.test.ts
  - test/unit/cli/personal-authoring-setup-commands.test.ts
  - test/unit/cli/skill-commands.test.ts
  - test/unit/completion/completion.test.ts
  - test/unit/operations/init-project.test.ts
  - test/unit/operations/install-authoring-skill.test.ts
  - test/unit/operations/personal-authoring-setup.test.ts
  - test/unit/operations/workspace-handoff.test.ts
  - test/unit/services/personal-authoring-setup.test.ts
  - test/unit/util/code-unit-order.test.ts
  - test/unit/util/exit.test.ts
  - >-
    _bmad-output/implementation-artifacts/2-10-configure-personal-authoring-clients-in-one-setup-action.md
  - _bmad-output/implementation-artifacts/tests/test-summary-task-123.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
priority: high
ordinal: 123000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: WPM must become available in explicitly selected personal authoring clients without unintended personal changes or setup bureaucracy.

Boundary: One whole setup action covers interactive or headless authorization, complete preflight, install/update/no-change outcomes, ownership preservation, legacy migration, retained defaults, typed partial failure, and convergent retry.

Non-goals: Workspace integration, deliverable-target changes, agent installation or process ownership, generic rollback or resume machinery, or separate required user steps for detection, update, reconciliation, or migration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given an agent or headless caller supplies one or more supported authoring-client IDs; when setup is invoked; then exactly those IDs authorize setup without a prompt.
- [x] #2 Given an explicit supported authoring-client selection; when a selected client's detection probe is absent or another supported client is detected; then the explicit selection remains valid and detection adds no client.
- [x] #3 Given a human invokes setup without IDs; when setup requests authorization; then Codex and Claude Code appear together in one chooser with detection shown only as context.
- [x] #4 Given a human has selected one or both clients in the chooser; when setup presents the selected destinations; then one destination summary receives exactly one confirmation before writes.
- [x] #5 Given a human declines or cancels the confirmation; when setup concludes; then cancellation is reported.
- [x] #6 Given a human declines or cancels setup confirmation; when personal, workspace, and deliverable surfaces are inspected afterward; then every surface remains unchanged.
- [x] #7 Given the selection is empty or unsupported, required packaged content or HOME is unavailable, a selected destination is predictably unusable, or any selected destination has ambiguous or user-modified ownership; when the complete selected set is evaluated; then every predictable blocker and its recovery are reported together before the first write.
- [x] #8 Given setup preflight rejects the complete selected set; when the setup result is inspected; then it is machine-distinguishable and non-zero.
- [x] #9 Given the complete selected set has a predictable blocker; when selected, unselected, workspace, and deliverable surfaces are inspected afterward; then every surface remains unchanged.
- [x] #10 Given selected destinations are absent, current WPM-owned, older WPM-owned, or recognizably WPM-owned legacy installations; when the same setup action runs or is repeated; then the only WPM-owned skill installed, left unchanged, updated, or migrated in each selected personal scope is `wpm-create-package`, and its outcome is reported per scope.
- [x] #11 Given setup has reconciled a selected personal scope; when that scope is inspected; then it contains exactly one managed `wpm-create-package` copy.
- [x] #12 Given setup has reconciled a selected personal scope containing unrelated content; when that scope is inspected; then the unrelated content is preserved.
- [x] #13 Given an unowned or user-modified legacy `installer-builder` copy does not occupy the current bootstrap destination; when setup reconciles that client; then the legacy copy is preserved, reported as unowned or modified, and not represented as migrated.
- [x] #14 Given setup succeeds; when its result and retained defaults are inspected; then the selected authoring-client IDs are available as workspace-creation defaults.
- [x] #15 Given setup succeeds; when deliverable targets and unselected personal scopes are inspected; then `manifest.yml.targets` and every unselected personal scope remain unchanged.
- [x] #16 Given setup succeeds; when its user-facing result is inspected; then it reports only applicable reload guidance plus the exact `wpm-create-package` next action.
- [x] #17 Given an unforeseen failure occurs after one or more selected writes begin; when setup ends; then the typed non-success identifies completed, failed, and unattempted clients and destinations with recovery guidance and a non-zero result.
- [x] #18 Given setup reported a partial write and the same authorized action is retried after the failed boundary is recoverable; when setup completes; then managed personal content converges without duplicates or corruption and without claiming generic rollback or resume.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Literal BMAD workflows completed: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, and independent bmad-story-automator-review cycle 1. Independent review closed all findings and ended at 0 open. The concrete filesystem refinement favors public-path no-clobber preservation and truthful typed partials over continuous old/new visibility: request-bound deterministic quarantine evidence is recorded in applying state, exact public/private preimages and parent identities are guarded, public races are preserved, interrupted effects remain observable, and identical retries converge without generic rollback/resume. Review additionally closed canonical/no-follow HOME and UTF-8 handling, complete source-missing aggregation, confirmation/no-op/final-publication races, deterministic code-unit ordering, fake/real parity, capability/device checks, and exact retained-default/client ownership. Stable path-ordered README+src+test manifest: 30 records including two explicit deletions, SHA-256 f55d6dd373a67aab8edd226eeac52759e365be85b9ff5573b93a0d18f75f0c62. Focused 323/323; typecheck; Biome 260; build; diff check; package/source-free/nonleak 34/34; exact full npm test 134/134 files and 1823/1823 tests in 461.52s. Final archive SHA-256 d29c3c21ae0a952c2e334f66a3789538cfd25e3a4f107e66de71a1690c1b876e. Installed CLI setup selected only Codex, preserved unselected Claude and unrelated content, and repeated unchanged. One fresh live Codex discovery attempt was blocked before model execution by account usage limit; it is non-acceptance evidence, was not retried, and did not affect deterministic AC evidence. No live Claude claim.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered one consent-safe personal authoring setup action with explicit/headless and single-chooser interactive authorization, complete cross-client no-write preflight, strict current/legacy ownership, exact selected-only reconciliation, retained workspace defaults independent of targets, deterministic typed partial evidence, and no-clobber identical retry. Independent review APPROVE: 18/18 AC, 0 open; full gate 1823/1823.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
