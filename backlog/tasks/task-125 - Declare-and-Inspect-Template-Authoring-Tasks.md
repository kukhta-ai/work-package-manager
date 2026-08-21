---
id: TASK-125
title: Declare and Inspect Template Authoring Tasks
status: To Do
assignee: []
created_date: '2026-08-21 15:01'
labels:
  - authoring-context
  - product
  - onboarding-epic-3
  - template-tasks
  - template-inspection
dependencies: []
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/implementation-artifacts/investigations/authoring-agent-backlog-materialisation-investigation.md
priority: high
ordinal: 125000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: Template and package authors need to understand additional authoring work and its defects before selecting a template.

Boundary: Extend the existing project- and bundle-template inspection surfaces for inert, declarative authoring-task packs. Identity is producer-scoped, contextual values are limited to documented WPM context, and inspection is read-only.

Non-goals: Task materialisation; replacement of mandatory tasks; prompts, hooks, or executable interpolation; template evolution, drift reconciliation, retirement, or missing-backlog/fresh-clone reconstruction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a valid template declares additional authoring tasks; when it is inspected through the existing template-show experience; then the template identity and revision and each task's stable key, task text, observable acceptance outcomes, dependencies, and materialisation scope are shown.
- [ ] #2 Given a valid authoring-task contribution is inspected; when its relationship to mandatory WPM work is reported; then it is identified as additional work that cannot replace or disable the mandatory catalog.
- [ ] #3 Given a task uses contextual values in its text or acceptance outcomes; when the task contribution is inspected; then every value is resolved from literal text or documented WPM-provided context.
- [ ] #4 Given template tasks depend on one another or on mandatory WPM project or bundle tasks; when the contribution is inspected; then every dependency resolves through a documented stable reference.
- [ ] #5 Given distinct template producers declare the same local stable key; when their otherwise-valid contributions are inspected; then their producer-scoped identities remain distinct and neither declaration is rejected as a duplicate of the other.
- [ ] #6 Given one template producer and revision declares the same local stable key more than once; when its contribution is inspected; then the duplicate declaration is reported as invalid.
- [ ] #7 Given a template declares no additional authoring tasks; when it is inspected; then it reports no additional authoring-task contribution.
- [ ] #8 Given a contribution is malformed, has duplicate keys or rendered-title collisions, requires unavailable context, has unresolved or cyclic dependencies, or contains unsupported non-declarative content; when it is inspected; then every detected problem is reported together and the contribution is not presented as valid.
- [ ] #9 Given any template contribution is inspected; when inspection completes successfully or with validation findings; then inspection leaves the template unchanged and performs no project, bundle, or authoring-backlog mutation.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
