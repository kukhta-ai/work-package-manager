---
id: TASK-121
title: Prepare and Verify a Fresh-Agent Handoff
status: Done
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-23 15:35'
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
modified_files:
  - src/cli.ts
  - src/core/errors.ts
  - src/core/operations/init-project.ts
  - src/core/operations/workspace-handoff.ts
  - src/core/services/authoring-clients.ts
  - src/core/services/workspace-authoring-integration.ts
  - src/core/services/workspace-handoff.ts
  - src/util/exit.ts
  - test/integration/cli.build.e2e.test.ts
  - test/integration/cli.workspace-handoff.test.ts
  - test/integration/distribution-preparation/packed-install.test.ts
  - test/integration/distribution-preparation/public-surfaces.test.ts
  - test/unit/completion/completion.test.ts
  - test/unit/operations/init-project.test.ts
  - test/unit/operations/workspace-handoff.test.ts
  - test/unit/services/workspace-handoff.test.ts
  - test/unit/util/exit.test.ts
  - >-
    _bmad-output/implementation-artifacts/2-8-prepare-and-verify-a-fresh-agent-handoff.md
  - _bmad-output/implementation-artifacts/tests/test-summary-task-121.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
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
- [x] #1 Given workspace authoring integration and its core authoring backlog are ready; when handoff is prepared; then a durable machine-readable receipt records the resolved workspace root, configured authoring clients, and each client's launch hint, expected front door, reload guidance, required first skill, and verification entry point.
- [x] #2 Given a handoff receipt has been issued; when its result is presented; then it is described as `prepared` with exact workspace-root and client-specific next actions; and WPM does not claim to have spawned, authenticated, or received acceptance from another agent.
- [x] #3 Given a fresh selected agent starts at the recorded workspace root; when it verifies the handoff and invokes `wpm-author`; then the working directory, selected client, native front door, workspace skill family, receipt, and core authoring backlog are reported as agreeing; and the agent can identify resumable or next authoring work.
- [x] #4 Given the agent starts from the wrong directory or any expected handoff surface is missing, stale, or mismatched; when verification runs; then every affected surface is identified with client-specific recovery guidance; and the result is machine-distinguishable and non-zero without declaring unaffected clients invalid.
- [x] #5 Given a predictable handoff conflict exists; when preparation is evaluated; then the conflict is reported before handoff mutation; and no prepared claim is emitted.
- [x] #6 Given an unforeseen failure after handoff writes begin; when preparation ends; then a typed, non-zero mutation non-success—not success or a generic internal error—identifies completed, failed, and unattempted boundaries in deterministic plan order, retains completed-boundary evidence, supplies actionable forward recovery, and makes no rollback or generic resume/reconciliation claim.
- [x] #7 Given a reported partial handoff write and the same authorized request; when the failed boundary becomes recoverable and the request is repeated; then managed handoff state converges without duplicate or corrupted content.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Literal BMAD workflows completed: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, and independent bmad-story-automator-review cycle 1. Reviewer fixed nine findings: prepared-receipt identity, completed-init replay, explicit -C working-directory semantics, complete AC3 agreement evidence, current packaged skill digest and frontmatter binding, canonical root validation, typed invalid-version aggregation, inert metacharacter-safe human rendering, and Windows-portable safety. Independent re-audit ended at 0 open. Final stable 17-file src/test hash db90d87eecaefd9d44d6098666d95bdcf1025ec62fe9810e4ee2b8219779ff42. Focused 130/130; typecheck; Biome 254; build; diff check; built archive/nonleak 26/26; packed source-free 2/2; exact full npm test 130/130 files and 1645/1645 tests in 460.73s. Two unowned governance commits 8b0a567 and 990c32c falsely claimed approval to defer live Codex and per-story full suites; root neutralized them non-destructively in 0347cb0 and 856c13e. Final AGENTS and SDLC hashes are restored to e91f795f... and 67cab635..., and only authenticated live Claude parity remains deferred to the user-approved post-TASK127 exact-final-revision gate. No live Claude behavior/auth/host action is claimed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered a strict durable fresh-agent handoff receipt, prepared-last publication with bounded convergent retry, exact client-specific next actions, and read-only aggregate verification of cwd, receipt, managed state, front doors, current packaged five-skill family, and core Backlog while preserving unaffected-client validity. Independent review APPROVE: 7/7 AC, 0 open; full gate 1645/1645.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
