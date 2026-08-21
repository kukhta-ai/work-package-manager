---
id: TASK-123
title: Configure Personal Authoring Clients in One Setup Action
status: To Do
assignee: []
created_date: '2026-08-21 15:01'
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
- [ ] #1 Given an agent or headless caller supplies one or more supported authoring-client IDs; when setup is invoked; then exactly those IDs authorize setup without a prompt.
- [ ] #2 Given an explicit supported authoring-client selection; when a selected client's detection probe is absent or another supported client is detected; then the explicit selection remains valid and detection adds no client.
- [ ] #3 Given a human invokes setup without IDs; when setup requests authorization; then Codex and Claude Code appear together in one chooser with detection shown only as context.
- [ ] #4 Given a human has selected one or both clients in the chooser; when setup presents the selected destinations; then one destination summary receives exactly one confirmation before writes.
- [ ] #5 Given a human declines or cancels the confirmation; when setup concludes; then cancellation is reported.
- [ ] #6 Given a human declines or cancels setup confirmation; when personal, workspace, and deliverable surfaces are inspected afterward; then every surface remains unchanged.
- [ ] #7 Given the selection is empty or unsupported, required packaged content or HOME is unavailable, a selected destination is predictably unusable, or any selected destination has ambiguous or user-modified ownership; when the complete selected set is evaluated; then every predictable blocker and its recovery are reported together before the first write.
- [ ] #8 Given setup preflight rejects the complete selected set; when the setup result is inspected; then it is machine-distinguishable and non-zero.
- [ ] #9 Given the complete selected set has a predictable blocker; when selected, unselected, workspace, and deliverable surfaces are inspected afterward; then every surface remains unchanged.
- [ ] #10 Given selected destinations are absent, current WPM-owned, older WPM-owned, or recognizably WPM-owned legacy installations; when the same setup action runs or is repeated; then the only WPM-owned skill installed, left unchanged, updated, or migrated in each selected personal scope is `wpm-create-package`, and its outcome is reported per scope.
- [ ] #11 Given setup has reconciled a selected personal scope; when that scope is inspected; then it contains exactly one managed `wpm-create-package` copy.
- [ ] #12 Given setup has reconciled a selected personal scope containing unrelated content; when that scope is inspected; then the unrelated content is preserved.
- [ ] #13 Given an unowned or user-modified legacy `installer-builder` copy does not occupy the current bootstrap destination; when setup reconciles that client; then the legacy copy is preserved, reported as unowned or modified, and not represented as migrated.
- [ ] #14 Given setup succeeds; when its result and retained defaults are inspected; then the selected authoring-client IDs are available as workspace-creation defaults.
- [ ] #15 Given setup succeeds; when deliverable targets and unselected personal scopes are inspected; then `manifest.yml.targets` and every unselected personal scope remain unchanged.
- [ ] #16 Given setup succeeds; when its user-facing result is inspected; then it reports only applicable reload guidance plus the exact `wpm-create-package` next action.
- [ ] #17 Given an unforeseen failure occurs after one or more selected writes begin; when setup ends; then the typed non-success identifies completed, failed, and unattempted clients and destinations with recovery guidance and a non-zero result.
- [ ] #18 Given setup reported a partial write and the same authorized action is retried after the failed boundary is recoverable; when setup completes; then managed personal content converges without duplicates or corruption and without claiming generic rollback or resume.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
