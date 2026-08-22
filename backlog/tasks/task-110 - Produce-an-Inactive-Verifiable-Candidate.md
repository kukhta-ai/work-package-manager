---
id: TASK-110
title: Produce an Inactive Verifiable Candidate
status: Done
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-22 01:51'
labels:
  - onboarding-epic-1
  - distribution-preparation
  - candidate
dependencies:
  - TASK-109
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md
modified_files:
  - CHANGELOG.md
  - CONTRIBUTING.md
  - README.md
  - >-
    _bmad-output/implementation-artifacts/1-4-produce-an-inactive-verifiable-candidate.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - _bmad-output/implementation-artifacts/tests/test-summary-task-110.md
  - distribution-preparation/candidate.js
  - distribution-preparation/prepare-candidate.js
  - package.json
  - test/integration/distribution-preparation/packed-install.test.ts
  - test/integration/distribution-preparation/public-surfaces.test.ts
  - test/unit/distribution-preparation/candidate.test.ts
  - test/unit/distribution-preparation/prepare-candidate.test.ts
priority: medium
ordinal: 110000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: later channel assessments must bind to one auditable packed artifact instead of rebuilding or guessing. Source: Epic 1, Story 1.4; FR42; NFR16-NFR17. Boundary/non-goals: persist a revision-bound inactive candidate and its evidence only; do not choose public identity or policy facts, rebuild separate channel artifacts, create tags, releases, or assets, publish to npm, or mutate trust settings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given an exact package that passed inspection, quality checks, and packed-install verification; when candidate preparation completes; then one inactive record binds its package and version, proposed tag, source commit, exact artifact, size, digests, verification evidence, and release-note preview.
- [x] #2 Given any recorded package, revision, artifact, digest, quality, or install evidence is missing or inconsistent; when eligibility is assessed; then the candidate is ineligible and every discrepancy is reported.
- [x] #3 Given public identity or channel-policy decisions remain unresolved; when candidate preparation runs; then the candidate can still be prepared locally but remains inactive with those facts reported.
- [x] #4 Given candidate preparation succeeds or fails; when external state is inspected afterward; then no tag, release, asset, npm version, dist-tag, or trust setting has changed.
- [x] #5 Given the exact package bytes, source revision, proposed tag, and verification evidence are unchanged; when candidate preparation is repeated; then the candidate retains the same package identity, digests, and evidence binding without creating a second candidate identity.
- [x] #6 Given any package bytes, source revision, proposed tag, or required verification evidence differs from the recorded binding; when candidate preparation is repeated; then the prior candidate identity is not silently reused and the changed binding is reported before channel assessment.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD workflows actually run: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, and independent bmad-story-automator-review. Review cycle 1 APPROVE with 0 open findings after five HIGH and two MEDIUM candidate-identity, persistence, evidence, path, and encoding defects were auto-fixed. Stable product/test hash c73ffd42bd752c5ba2bab2dacbe36ea0d1c6751e789413e91d61a9722cce1ac6.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered one deterministic local inactive candidate bound to the exact inspected and packed-install-verified artifact, revision, proposed tag, SHA-256/SHA-512, raw and semantic evidence, release notes, and complete unresolved public facts. Identical reruns reuse the same identity; changed or corrupt bindings fail without overwrite; Git, GitHub, npm, and trust state remain unchanged. Final gates: 16/16 candidate units, 69/69 distribution units, 8/8 public surfaces, typecheck, Biome 221 files, build, npm dry-run non-leakage, diff-check, and full npm test 1385/1385 across 111 files.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
