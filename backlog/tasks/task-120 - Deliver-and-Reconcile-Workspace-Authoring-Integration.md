---
id: TASK-120
title: Deliver and Reconcile Workspace Authoring Integration
status: To Do
assignee: []
created_date: '2026-08-21 15:01'
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
- [ ] #1 Given an explicit non-empty selection of supported workspace authoring clients; when workspace integration is applied; then only the selected clients receive their native workspace scopes and front doors.
- [ ] #2 Given an explicit workspace authoring-client selection; when workspace integration reads or records that selection; then the selection neither derives from nor changes the deliverable's target agents.
- [ ] #3 Given the workspace authoring-client selection is empty or contains an unsupported client; when integration is requested; then the selection is rejected with a machine-distinguishable result.
- [ ] #4 Given workspace integration rejects its authoring-client selection; when workspace and deliverable surfaces are inspected afterward; then every surface remains unchanged.
- [ ] #5 Given workspace creation or adoption has a predictable target, Backlog.md, authoring-task-plan, selected-client, destination, or ownership conflict; when the complete workspace request is evaluated; then every predictable blocker and its recovery are reported before the first write.
- [ ] #6 Given the complete workspace request has a predictable blocker; when workspace, integration, authoring-backlog, and handoff surfaces are inspected afterward; then every surface remains unchanged.
- [ ] #7 Given the complete workspace request has a predictable blocker; when its operation result is inspected; then no prepared handoff is claimed.
- [ ] #8 Given workspace integration succeeds; when a selected client inspects its native scope; then `wpm-author`, `wpm-author-bundle`, `wpm-author-recipe`, `wpm-author-skill`, and `wpm-review-package` are independently available at one coherent WPM version.
- [ ] #9 Given workspace integration succeeds; when a selected client's native front door is inspected; then it directs a fresh authoring session first to `wpm-author`.
- [ ] #10 Given workspace integration succeeds; when package-owned installers, advisors, and payload skills are inspected; then they retain their package-owned names rather than acquiring the reserved `wpm-` prefix.
- [ ] #11 Given workspace integration has been applied; when its managed authoring state is inspected; then it records the selected clients, installed skill versions, WPM-owned paths, integration origin, and reconciliation facts outside `wip/`.
- [ ] #12 Given WPM-owned integration already exists alongside user-authored content; when integration is reapplied; then matching WPM-owned content remains unchanged and stale WPM-owned content converges to the requested version.
- [ ] #13 Given WPM-owned integration already exists alongside user-authored content; when integration is reapplied; then surrounding user-authored content is preserved.
- [ ] #14 Given workspace integration is applied or reapplied; when managed client scopes and front doors are inspected; then no duplicate managed integration exists.
- [ ] #15 Given an unforeseen failure occurs after integration writes begin; when the operation ends; then the typed non-success identifies completed, failed, and unattempted boundaries with recovery guidance and a non-zero result.
- [ ] #16 Given a reported partial integration write and the same authorized request; when the request is repeated after the failed boundary is recoverable; then managed integration converges without duplicate or corrupted content and without claiming generic rollback or resume.
- [ ] #17 Given a recognized WPM-owned legacy `installer-builder` workspace; when adoption succeeds; then the new family is available.
- [ ] #18 Given a recognized WPM-owned legacy workspace is adopted; when its deliverable and authoring backlog are inspected; then the deliverable is unchanged and the authoring-backlog history is preserved.
- [ ] #19 Given an integration path is unowned, user-modified, or ambiguously owned; when adoption is evaluated; then the conflict is reported before integration mutation.
- [ ] #20 Given adoption has an ownership conflict; when the integration path is inspected afterward; then its existing content remains unchanged.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
