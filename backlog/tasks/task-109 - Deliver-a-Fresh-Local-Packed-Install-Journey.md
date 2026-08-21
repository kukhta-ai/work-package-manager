---
id: TASK-109
title: Deliver a Fresh Local Packed-Install Journey
status: To Do
assignee: []
created_date: '2026-08-21 15:01'
labels:
  - onboarding-epic-1
  - distribution-preparation
  - packed-install
dependencies:
  - TASK-108
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md
priority: high
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: a package user or bootstrap agent needs consumer-side proof that the exact local package works without the source repository and remains inert until explicit setup. Source: Epic 1, Story 1.3; FR2, FR41; NFR10. Boundary/non-goals: exercise one inspected local artifact in a fresh supported environment; do not acquire WPM publicly, run setup implicitly, mutate coding-agent configuration, or claim assets not declared by the evaluated revision.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given an inspected package for a specific source revision and a fresh supported environment without its source checkout; when that exact package is installed; then installation succeeds.
- [ ] #2 Given the exact package is installed in the fresh environment; when each declared executable is invoked; then every executable starts and reports the installed package version consistently.
- [ ] #3 Given only the installed package is available; when its resources are resolved; then every packaged resource required by that revision's declared ship set remains available without a repository-relative path.
- [ ] #4 Given snapshots of supported coding-agent personal and workspace configuration; when the package is installed without explicit WPM setup; then every configuration remains unchanged.
- [ ] #5 Given a required prerequisite is absent or unsupported; when installation or invocation is attempted; then the failure identifies the prerequisite and an actionable recovery condition.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
