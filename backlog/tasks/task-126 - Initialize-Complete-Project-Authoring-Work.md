---
id: TASK-126
title: Initialize Complete Project Authoring Work
status: Done
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-24 19:22'
labels:
  - authoring-context
  - product
  - onboarding-epic-3
  - template-tasks
  - project-init
dependencies:
  - TASK-125
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/implementation-artifacts/investigations/authoring-agent-backlog-materialisation-investigation.md
  - >-
    _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md
priority: high
ordinal: 126000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: A fresh workspace agent needs one complete shared backlog immediately after ordinary initialization.

Boundary: New-workspace initialization appends selected project-template work and applicable pre-included-bundle work to mandatory catalogs, resolves dependencies, records provenance, validates the complete plan before mutation, and preserves typed partial-write evidence.

Non-goals: Existing-workspace evolution, drift reconciliation, task retirement, missing-backlog or fresh-clone reconstruction, replacement of mandatory tasks, or generic rollback, resume, or reconciliation behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given a valid selected project template and a new workspace request; when ordinary initialization succeeds; then one shared authoring backlog contains every mandatory project task and every project-template task exactly once with resolved Backlog.md dependencies.
- [x] #2 Given a valid selected project template includes one or more bundles; when ordinary initialization succeeds; then every pre-included bundle receives its applicable mandatory and template-defined tasks exactly once.
- [x] #3 Given initialization materialises the complete applicable task plan; when initialization succeeds; then that complete plan is already present in the authoring backlog and no separate task-generation action is required.
- [x] #4 Given distinct selected template producers use the same local stable key in one initialization plan; when ordinary initialization succeeds; then both tasks coexist under distinct producer-scoped identities with their dependencies resolved independently.
- [x] #5 Given project-template tasks have been materialised; when their Backlog.md records are inspected; then each task exposes its stable key, template origin, and defining revision independently of its displayed title.
- [x] #6 Given a project template contributed authoring tasks to an initialized workspace; when that workspace produces a work-package deliverable in any supported format; then the deliverable contains neither the template task definitions nor their materialisation provenance.
- [x] #7 Given the project template contributes no authoring tasks; when initialization succeeds; then existing mandatory-task behavior remains unchanged and no additional or duplicate task appears.
- [x] #8 Given a workspace was initialized from a project template; when the source template later changes or is removed; then the existing workspace and its authoring tasks remain unchanged.
- [x] #9 Given the complete project task contribution has a predictable definition, context, identity, dependency, cycle, rendered-title, or ownership conflict; when initialization is evaluated; then every blocker and affected contribution is reported before any workspace or authoring-backlog change.
- [x] #10 Given an unforeseen I/O failure after initialization writes begin; when initialization ends; then a typed, non-zero mutation non-success identifies completed, failed, and unattempted project, derived-artifact, and authoring-backlog boundaries in plan order, retains completed-boundary evidence, and supplies actionable forward-recovery guidance.
- [x] #11 Given initialization reports a partial write; when its recovery guidance is inspected; then it promises no generic rollback, resume, reconciliation, or successful initialized workspace.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD workflows actually run: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, and independent bmad-story-automator-review. Review APPROVE: 11/11 ACs, 0 open; stable 13-file README/product/test SHA-256 5a668c6dad1691f74c8cc4442c822a4291fd77b22188d965e16d12d3dcd62340. Focused/static/package/source-deleted/non-leakage gates passed; exact full npm test passed 137/137 files and 1892/1892 tests. Review fixed complete contribution aggregation on projection failure, inert dash-prefixed Backlog title argv, rejection of Backlog-normalized surrounding whitespace, and exact actual-ID/dependency/provenance/pristine-inventory verification before handoff preparation. Realization refinement: init uses its already-resolved built-in default bundle producer once and applies that captured semantic contribution separately to each concrete preincluded bundle id/version; no scan or later default inference is introduced. TASK-127 owns durable create/enable contribution recording.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
