---
id: TASK-127
title: Materialise Complete Bundle Authoring Work on Create and Enable
status: To Do
assignee: []
created_date: '2026-08-21 15:01'
labels:
  - authoring-context
  - product
  - onboarding-epic-3
  - template-tasks
  - bundle-lifecycle
dependencies:
  - TASK-126
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/implementation-artifacts/investigations/authoring-agent-backlog-materialisation-investigation.md
  - >-
    _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md
priority: high
ordinal: 127000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: Bundle creation and enablement must produce complete filling, review, and validation work without relying on author memory.

Boundary: Keep creation and enablement together. Creation uses the selected or recorded bundle-template contribution; enablement uses only the bundle's recorded contribution and adds missing work while preserving existing human state. Both validate the complete plan before mutation and retain typed partial-write evidence.

Non-goals: Inferring the current default for legacy bundles, evolving or reconciling existing contributions, automatic retirement, missing-backlog or fresh-clone reconstruction, a separate generation action, or generic rollback, resume, or reconciliation behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a valid explicit or recorded default bundle template; when a bundle is created; then every mandatory and template-provided bundle task appears exactly once with resolved Backlog.md dependencies.
- [ ] #2 Given a valid explicit or recorded default bundle template; when a bundle is created initially disabled; then its complete applicable authoring work is materialised.
- [ ] #3 Given bundle creation materialises the complete applicable task plan; when the operation completes; then no separate task-generation action is required.
- [ ] #4 Given bundle-template tasks have been materialised; when their Backlog.md records are inspected; then each task exposes its bundle scope, stable key, template origin, and defining revision independently of its displayed title.
- [ ] #5 Given a bundle template contributed authoring tasks to a workspace; when that workspace produces a work-package deliverable in any supported format; then the deliverable contains neither the template task definitions nor their materialisation provenance.
- [ ] #6 Given a disabled bundle has a recorded template contribution and is missing applicable work; when it is enabled; then only missing mandatory or template-defined tasks are added.
- [ ] #7 Given a disabled bundle has existing authoring tasks and is enabled; when its complete task plan is materialised; then existing task identities, statuses, notes, acceptance criteria, and user-authored content remain unchanged.
- [ ] #8 Given the selected bundle template contributes no authoring tasks; when a bundle is created from that template; then mandatory bundle-task behavior remains unchanged and no additional or duplicate task appears.
- [ ] #9 Given an older bundle has no recorded template contribution; when that bundle is enabled; then mandatory bundle-task behavior remains intact; and no current default contribution is inferred retroactively.
- [ ] #10 Given the same recorded contribution is encountered again for the same bundle scope; when task materialisation runs; then no duplicate task is created.
- [ ] #11 Given the same recorded contribution is encountered again for the same bundle scope; when existing materialised tasks are inspected afterward; then their human-authored state remains unchanged.
- [ ] #12 Given a bundle's template contribution was materialised; when the source or default template later changes or is removed; then the existing bundle and its authoring tasks remain unchanged.
- [ ] #13 Given the complete bundle task contribution has a predictable definition, context, identity, dependency, cycle, rendered-title, or ownership conflict; when creation or enablement is evaluated; then every blocker and affected contribution is reported before the bundle, manifest, or authoring backlog changes.
- [ ] #14 Given an unforeseen I/O failure after bundle creation or enablement writes begin; when the operation ends; then a typed, non-zero mutation non-success identifies completed, failed, and unattempted bundle, manifest, derived-artifact, and authoring-backlog boundaries in plan order, retains completed-boundary evidence, and supplies actionable forward-recovery guidance.
- [ ] #15 Given bundle creation or enablement reports a partial write; when its recovery guidance is inspected; then it promises no generic rollback, resume, reconciliation, or successful completed operation.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
