---
id: TASK-111
title: Assess GitHub Release Staging Without Writes
status: Done
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-22 03:39'
labels:
  - onboarding-epic-1
  - distribution-preparation
  - github
  - no-write
dependencies:
  - TASK-110
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md
modified_files:
  - CHANGELOG.md
  - CONTRIBUTING.md
  - README.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - >-
    _bmad-output/implementation-artifacts/1-5-assess-github-release-staging-without-writes.md
  - _bmad-output/implementation-artifacts/tests/test-summary-task-111.md
  - distribution-preparation/prepare-candidate.js
  - distribution-preparation/github-assessment.js
  - distribution-preparation/assess-github.js
  - package.json
  - test/integration/distribution-preparation/packed-install.test.ts
  - test/integration/distribution-preparation/public-surfaces.test.ts
  - test/unit/distribution-preparation/github-assessment.test.ts
  - test/unit/distribution-preparation/assess-github.test.ts
priority: medium
ordinal: 111000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: maintainers need to know GitHub prerequisites, compatible state, and conflicts before activation is authorized. Source: Epic 1, Story 1.5; FR43; NFR14, NFR16-NFR18. Boundary/non-goals: assess the inactive candidate using caller-supplied or permitted read-only GitHub observations; do not create or move tags, create or edit drafts, releases, or assets, change Git state, handle credentials, or authorize activation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given an inactive verified candidate and GitHub policy and state supplied by the caller or available through permitted read-only observation; when GitHub staging is assessed; then the required tag, draft metadata, exact assets, checksums, notes, evidence, and unresolved policy facts are reported.
- [x] #2 Given observed GitHub state matches the candidate; when assessment completes; then matching tags, drafts, releases, and assets are recognized without proposing duplicates.
- [x] #3 Given a tag targets another commit or a release or asset conflicts with the candidate; when assessment completes; then the affected object and hard conflict are identified.
- [x] #4 Given any assessment outcome; when Git and GitHub state are inspected afterward; then nothing has been created, changed, moved, or deleted.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD workflows actually run: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, and independent bmad-story-automator-review. Review cycle 1 APPROVE with 0 open findings after one HIGH, five MEDIUM, and one LOW candidate/schema/evidence/read-safety/determinism defects were auto-fixed. Stable product/test hash 135b2193be4b27b7b75be75e6e28960f4a93eac56bc55e6f81fa7443e6856c19.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered a deterministic read-only GitHub staging assessment over the exact inactive candidate plus caller-supplied policy and observations. It reports required, matching, missing, and conflicting tag/release/asset/checksum/note/evidence/policy state; treats conflicts as data; rejects invalid evidence safely; remains disabled/ineligible; and leaves candidate, policy, observations, Git tags, GitHub/npm/trust state unchanged. Final gates: 20/20 evaluator/command, 89/89 distribution units, 23/23 integrations, typecheck, Biome 225 files, build, npm non-leakage, diff-check, and full npm test 1406/1406 across 113 files.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
