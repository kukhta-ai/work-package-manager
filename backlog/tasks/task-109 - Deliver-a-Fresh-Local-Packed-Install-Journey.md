---
id: TASK-109
title: Deliver a Fresh Local Packed-Install Journey
status: Done
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-21 23:39'
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
modified_files:
  - >-
    _bmad-output/implementation-artifacts/1-3-deliver-a-fresh-local-packed-install-journey.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - _bmad-output/implementation-artifacts/tests/test-summary-task-109.md
  - CHANGELOG.md
  - CONTRIBUTING.md
  - README.md
  - distribution-preparation/packed-install.js
  - distribution-preparation/verify-packed-install.js
  - package.json
  - test/integration/distribution-preparation/packed-install.test.ts
  - test/integration/distribution-preparation/public-surfaces.test.ts
  - test/unit/distribution-preparation/packed-install.test.ts
priority: high
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: a package user or bootstrap agent needs consumer-side proof that the exact local package works without the source repository and remains inert until explicit setup. Source: Epic 1, Story 1.3; FR2, FR41; NFR10. Boundary/non-goals: exercise one inspected local artifact in a fresh supported environment; do not acquire WPM publicly, run setup implicitly, mutate coding-agent configuration, or claim assets not declared by the evaluated revision.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given an inspected package for a specific source revision and a fresh supported environment without its source checkout; when that exact package is installed; then installation succeeds.
- [x] #2 Given the exact package is installed in the fresh environment; when each declared executable is invoked; then every executable starts and reports the installed package version consistently.
- [x] #3 Given only the installed package is available; when its resources are resolved; then every packaged resource required by that revision's declared ship set remains available without a repository-relative path.
- [x] #4 Given snapshots of supported coding-agent personal and workspace configuration; when the package is installed without explicit WPM setup; then every configuration remains unchanged.
- [x] #5 Given a required prerequisite is absent or unsupported; when installation or invocation is attempted; then the failure identifies the prerequisite and an actionable recovery condition.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD workflows actually run: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, and independent bmad-story-automator-review. Review cycle 1 APPROVE with 0 open findings after one HIGH and three MEDIUM packed-install defects were auto-fixed. Stable product/test hash 6f9ff96d046ffa5f96c10bc5ad34f7d2f2658c90122e916ed3a65fc36e7bf2db.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered a source-free fresh local packed-install proof that consumes the exact accepted TASK-108 artifact, invokes both real declared npm shims, resolves every declared installed resource, preserves six Codex and Claude configuration surfaces, and reports actionable Node, npm, artifact, root, shim, Windows-path, and resource recovery. Final gates: 83/83 focused, typecheck, lint, Biome 217 files, build, dist exclusion, diff-check, and full npm test 1368/1368 across 109 files.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
