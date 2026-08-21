---
id: TASK-108
title: Establish the Clean Exact Package Boundary
status: To Do
assignee: []
created_date: '2026-08-21 15:00'
labels:
  - onboarding-epic-1
  - distribution-preparation
  - packaging
dependencies:
  - TASK-106
  - TASK-107
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md
priority: high
ordinal: 108000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: maintainers need inspectable evidence of exactly what a consumer receives from a clean revision, independent of contributor-local state. Source: Epic 1, Story 1.2; FR40; NFR7, NFR10, NFR17. Boundary/non-goals: this is a generic revision-scoped package and ship-set contract; it does not assert that assets introduced by later stories already exist, activate distribution, publish an artifact, include development or authoring-only state, or create a special inspection path for each artifact type.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a clean checkout at a specific source revision without ignored build output, caches, or contributor-local state; when the distributable package is produced; then packaging succeeds without requiring any absent local state.
- [ ] #2 Given a package has been produced from a clean checkout; when its source binding is inspected; then the package is bound to the evaluated revision and its declared ship set.
- [ ] #3 Given a produced package; when its boundary is inspected; then its paths, package identity, version, and executable targets are reported.
- [ ] #4 Given a produced package; when its declared ship set is inspected; then every runtime, executable, template, WPM skill, document, license, and metadata asset required by that revision is present and resolvable.
- [ ] #5 Given a later source revision declares another required ship-set asset; when that revision is inspected through the same package-boundary contract; then omission of that asset is rejected without requiring a special-case inspection rule for its artifact type.
- [ ] #6 Given prohibited development, backlog, planning, workspace-authoring, credential, or preparation content is present, or required content is absent; when inspection completes; then the package is rejected and every detected violation is identified.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
