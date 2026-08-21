---
id: TASK-108
title: Establish the Clean Exact Package Boundary
status: Done
assignee: []
created_date: '2026-08-21 15:00'
updated_date: '2026-08-21 22:17'
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
modified_files:
  - .github/workflows/ci.yml
  - CHANGELOG.md
  - CONTRIBUTING.md
  - LICENSE
  - README.md
  - >-
    _bmad-output/implementation-artifacts/1-2-establish-the-clean-exact-package-boundary.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - _bmad-output/implementation-artifacts/tests/test-summary-task-108.md
  - distribution-preparation/package-archive.js
  - distribution-preparation/package-boundary.js
  - distribution-preparation/prepare-package.js
  - package.json
  - test/integration/cli.build.e2e.test.ts
  - test/integration/distribution-preparation/package-preparation.test.ts
  - test/integration/distribution-preparation/public-surfaces.test.ts
  - test/unit/distribution-preparation/package-archive.test.ts
  - test/unit/distribution-preparation/package-boundary.test.ts
  - test/unit/distribution-preparation/prepare-package.test.ts
priority: high
ordinal: 108000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: maintainers need inspectable evidence of exactly what a consumer receives from a clean revision, independent of contributor-local state. Source: Epic 1, Story 1.2; FR40; NFR7, NFR10, NFR17. Boundary/non-goals: this is a generic revision-scoped package and ship-set contract; it does not assert that assets introduced by later stories already exist, activate distribution, publish an artifact, include development or authoring-only state, or create a special inspection path for each artifact type.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given a clean checkout at a specific source revision without ignored build output, caches, or contributor-local state; when the distributable package is produced; then packaging succeeds without requiring any absent local state.
- [x] #2 Given a package has been produced from a clean checkout; when its source binding is inspected; then the package is bound to the evaluated revision and its declared ship set.
- [x] #3 Given a produced package; when its boundary is inspected; then its paths, package identity, version, and executable targets are reported.
- [x] #4 Given a produced package; when its declared ship set is inspected; then every runtime, executable, template, WPM skill, document, license, and metadata asset required by that revision is present and resolvable.
- [x] #5 Given a later source revision declares another required ship-set asset; when that revision is inspected through the same package-boundary contract; then omission of that asset is rejected without requiring a special-case inspection rule for its artifact type.
- [x] #6 Given prohibited development, backlog, planning, workspace-authoring, credential, or preparation content is present, or required content is absent; when inspection completes; then the package is rejected and every detected violation is identified.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD workflows actually run: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, and independent bmad-story-automator-review. Review cycle 1 APPROVE with 0 open findings after five HIGH and three MEDIUM package-boundary defects were auto-fixed. Stable product/test hash 45bbf491e7b3bbf7f253eb8c7a65e86c5b34af2ce41a71467855aa5e4f8e7301.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented a clean revision-bound exact npm package inspection boundary with generic declared ship-set comparison, resolvable archive/link/bin validation, deterministic aggregate rejection evidence, cross-platform npm execution, clean-input refusal, CI integration, documentation, and QA coverage. Final gates: 59/59 distribution, 8/8 runtime/bin, 1/1 generated-package non-leakage, typecheck, Biome 213 files, build, diff-check, and full npm test 1353/1353 across 107 files.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
