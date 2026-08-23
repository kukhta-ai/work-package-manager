---
id: TASK-121
title: Prepare and Verify a Fresh-Agent Handoff
status: In Progress
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-23 15:14'
labels:
  - onboarding-epic-2
  - authoring-onboarding
  - handoff
  - verification
  - partial-mutation
dependencies:
  - TASK-120
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/validation-report.md
  - >-
    _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md
priority: high
ordinal: 121000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: A fresh session needs durable proof of the correct workspace root and authoring surfaces without reconstructing prior conversation.

Boundary: Covers handoff receipt preparation, exact next actions, cross-surface verification, adapter-specific diagnostics, typed partial-mutation evidence, and convergent retry.

Non-goals: Spawning, authenticating, or owning an agent process; claiming agent acceptance; fresh-clone or missing-backlog reconstruction; automatic rollback; or a generic resume or reconciliation engine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given workspace authoring integration and its core authoring backlog are ready; when handoff is prepared; then a durable machine-readable receipt records the resolved workspace root, configured authoring clients, and each client's launch hint, expected front door, reload guidance, required first skill, and verification entry point.
- [ ] #2 Given a handoff receipt has been issued; when its result is presented; then it is described as `prepared` with exact workspace-root and client-specific next actions; and WPM does not claim to have spawned, authenticated, or received acceptance from another agent.
- [ ] #3 Given a fresh selected agent starts at the recorded workspace root; when it verifies the handoff and invokes `wpm-author`; then the working directory, selected client, native front door, workspace skill family, receipt, and core authoring backlog are reported as agreeing; and the agent can identify resumable or next authoring work.
- [ ] #4 Given the agent starts from the wrong directory or any expected handoff surface is missing, stale, or mismatched; when verification runs; then every affected surface is identified with client-specific recovery guidance; and the result is machine-distinguishable and non-zero without declaring unaffected clients invalid.
- [ ] #5 Given a predictable handoff conflict exists; when preparation is evaluated; then the conflict is reported before handoff mutation; and no prepared claim is emitted.
- [ ] #6 Given an unforeseen failure after handoff writes begin; when preparation ends; then a typed, non-zero mutation non-success—not success or a generic internal error—identifies completed, failed, and unattempted boundaries in deterministic plan order, retains completed-boundary evidence, supplies actionable forward recovery, and makes no rollback or generic resume/reconciliation claim.
- [ ] #7 Given a reported partial handoff write and the same authorized request; when the failed boundary becomes recoverable and the request is repeated; then managed handoff state converges without duplicate or corrupted content.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Literal bmad-create-story, bmad-dev-story, and bmad-qa-generate-e2e-tests completed for Story 2.8. Worker focused, static, build, packed source-free, and generated non-leakage gates pass; stable product/test hash b4c1b1a38f0827e3004d8611344403df30a0208a24cdadf3ec9c173bb84a22a9. Independent bmad-story-automator-review remains pending. PROCESS POLICY UPDATE (user-approved 2026-08-23): fast-gates-v2 is effective for this active review. Complete the independent semantic audit plus focused/static/build/package evidence, but do not launch an ordinary-story exact full npm test or live-client matrix unless a named concrete cross-cutting risk satisfies and records the policy exception. The complete exact suite and live Codex/externally authenticated Claude six-skill matrix run once after TASK-127 from one clean exact revision. Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-08-23-fast-gates-v2.md.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
