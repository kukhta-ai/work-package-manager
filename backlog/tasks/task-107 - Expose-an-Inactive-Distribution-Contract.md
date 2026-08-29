---
id: TASK-107
title: Expose an Inactive Distribution Contract
status: Done
assignee: []
created_date: '2026-08-21 15:00'
updated_date: '2026-08-21 20:55'
labels:
  - onboarding-epic-1
  - distribution-preparation
  - distribution-policy
dependencies: []
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md
modified_files:
  - .github/workflows/ci.yml
  - CHANGELOG.md
  - CONTRIBUTING.md
  - FAQ.md
  - README.md
  - >-
    _bmad-output/implementation-artifacts/1-1-expose-an-inactive-distribution-contract.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - _bmad-output/implementation-artifacts/tests/test-summary-task-107.md
  - biome.json
  - distribution-preparation/assess-readiness.js
  - distribution-preparation/readiness.js
  - docs/12-builder-architecture.md
  - package.json
  - test/integration/distribution-preparation/assessment.test.ts
  - test/integration/distribution-preparation/public-surfaces.test.ts
  - test/unit/distribution-preparation/readiness.test.ts
  - tsconfig.json
priority: high
ordinal: 107000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: maintainers need preparation to fail closed so unresolved activation facts cannot imply that WPM is publicly obtainable or eligible for release. Source: Epic 1, Story 1.1; FR39; NFR14-NFR15. Boundary/non-goals: report inactive readiness only; do not select a public identity or channel policy, configure credentials or trust, create tags or releases, publish to npm, mutate remote state, or claim an unavailable public coordinate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given one or more items in the bounded activation-fact inventory are unresolved or lack the required authorization or control evidence; when distribution readiness is assessed; then the distribution is reported as inactive and every unresolved inventory item is reported together.
- [x] #2 Given distribution is inactive; when package metadata, documentation, CLI help, and bootstrap guidance are inspected; then none presents an unresolved coordinate or channel as canonical or publicly obtainable.
- [x] #3 Given a proposed package coordinate is unresolved, observed as occupied by incompatible state, or lacks explicit WPM authorization plus read-only evidence of availability or WPM control; when release eligibility is assessed; then package metadata or registry state alone cannot make it eligible.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Actual BMAD workflow evidence: bmad-create-story; bmad-dev-story; bmad-qa-generate-e2e-tests; separate bmad-story-automator-review cycles 1 and 2, with worker review re-absorption. Implemented a local-only immutable eight-fact inactive-distribution assessment, aggregate fail-closed diagnostics, npm private guard, truthful public surfaces, and non-shipping preparation tooling. Review closed 6 MEDIUM and 2 LOW findings across both cycles with 0 open. Final stable-diff evidence: focused 31/31, typecheck, Biome 206 files, build with no preparation output under dist, full npm test 1325/1325 across 103 files in 423.44s, diff/inventory/lock checks clean. No identity/channel selection, publication, credentials, release, or remote mutation was introduced.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Inactive distribution preparation now fails closed: all bounded activation facts are reported together, metadata or registry observations cannot confer eligibility, package/public surfaces cannot imply unresolved public acquisition, and the preparation assessor remains local-only and excluded from shipped output. Independent review approved all 3 acceptance criteria with no open findings.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
