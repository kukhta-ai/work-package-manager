---
id: TASK-112
title: Assess npm Publication Without Writes
status: Done
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-22 05:42'
labels:
  - onboarding-epic-1
  - distribution-preparation
  - npm
  - no-write
dependencies:
  - TASK-110
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md
modified_files:
  - >-
    _bmad-output/implementation-artifacts/1-6-assess-npm-publication-without-writes.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - _bmad-output/implementation-artifacts/tests/test-summary-task-112.md
  - distribution-preparation/assess-github.js
  - distribution-preparation/assess-npm.js
  - distribution-preparation/assessment-contract.js
  - distribution-preparation/assessment-files.js
  - distribution-preparation/github-assessment.js
  - distribution-preparation/npm-assessment.js
  - distribution-preparation/prepare-candidate.js
  - package.json
  - test/integration/distribution-preparation/packed-install.test.ts
  - test/integration/distribution-preparation/public-surfaces.test.ts
  - test/unit/distribution-preparation/assess-npm.test.ts
  - test/unit/distribution-preparation/npm-assessment.test.ts
priority: medium
ordinal: 112000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: maintainers need to distinguish compatible npm state, missing authority or provenance, and immutable conflicts before publication is authorized. Source: Epic 1, Story 1.6; FR44; NFR14, NFR16-NFR18. Boundary/non-goals: assess the inactive candidate using caller-supplied or permitted read-only registry observations; do not select a public coordinate, publish or republish, mutate dist-tags or ownership, configure credentials or trust, overwrite immutable state, or authorize activation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given an inactive verified candidate and npm policy and state supplied by the caller or available through permitted read-only observation; when npm publication is assessed; then the required coordinate, version, exact artifact, final dist-tag, provenance, repository identity, authority, and unresolved policy facts are reported.
- [x] #2 Given observed npm state matches the candidate and its approved final tag; when assessment completes; then it is recognized without proposing republication.
- [x] #3 Given an immutable npm version has candidate-matching bytes and metadata but its approved final dist-tag is absent or differs; when assessment completes; then the version is reported as compatible state requiring later manual dist-tag authority rather than as a hard immutable-version conflict.
- [x] #4 Given existing registry bytes or immutable metadata for the candidate version differ from the candidate; when assessment completes; then the affected version is reported as a hard conflict.
- [x] #5 Given a compatible version still needs later manual dist-tag authority or an immutable version is conflicting; when assessment reports the recovery boundary; then overwrite, version reuse, republication, or automatic tag repair is not presented as safe.
- [x] #6 Given any assessment outcome; when npm and trust state are inspected afterward; then no package, tag, ownership, credential, or trusted-publisher state has changed.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Actual BMAD workflows run: bmad-create-story, bmad-dev-story, and bmad-qa-generate-e2e-tests by the persistent worker; bmad-story-automator-review cycle 1 by the independent reviewer in auto-fix mode. Delivered a local read-only npm assessment over an exact inactive candidate and closed caller-supplied policy, registry, and trust observations. Classification distinguishes exact match, compatible immutable version requiring later manual dist-tag authority, unresolved provenance/authority, and hard immutable conflicts; all unsafe overwrite, reuse, republication, unpublish/re-publish, and automatic tag-repair actions remain prohibited. Review resolved 2 HIGH and 5 MEDIUM findings covering exact archive repository binding, unresolved immutable metadata, authority classification, independent invalid-input aggregation, explicit unknown repository state, invalid semver-like tags, and occupied-coordinate conflicts. No network, credential, ownership, tag, trust, publication, or activation mutation capability was introduced. Final evidence: evaluator/command 32/32, distribution units 121/121, integrations 24/24, typecheck, Biome 231 files, build, diff hygiene, dist scan, npm dry-run 421 entries with zero leaks, and one exact npm test run 1439/1439 across 115 files in 461.20s. Stable executable/test hash 095c5bf5ebc5c373023c2e3aa3737aaf9edf6044369ff733d49e27915841dd5a.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented and independently approved the inactive, no-write npm publication assessment. Exact archive identity and immutable metadata are bound to the candidate; matching publication is recognized, missing or differing final-tag state is classified as compatible manual-authority work, unresolved facts remain unresolved, and differing immutable bytes or metadata are hard conflicts. All six acceptance criteria and three Definition-of-Done items are verified; full regression passed 1439/1439 with zero open review findings.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
