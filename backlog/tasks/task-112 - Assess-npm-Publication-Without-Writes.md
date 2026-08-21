---
id: TASK-112
title: Assess npm Publication Without Writes
status: To Do
assignee: []
created_date: '2026-08-21 15:01'
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
priority: medium
ordinal: 112000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: maintainers need to distinguish compatible npm state, missing authority or provenance, and immutable conflicts before publication is authorized. Source: Epic 1, Story 1.6; FR44; NFR14, NFR16-NFR18. Boundary/non-goals: assess the inactive candidate using caller-supplied or permitted read-only registry observations; do not select a public coordinate, publish or republish, mutate dist-tags or ownership, configure credentials or trust, overwrite immutable state, or authorize activation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given an inactive verified candidate and npm policy and state supplied by the caller or available through permitted read-only observation; when npm publication is assessed; then the required coordinate, version, exact artifact, final dist-tag, provenance, repository identity, authority, and unresolved policy facts are reported.
- [ ] #2 Given observed npm state matches the candidate and its approved final tag; when assessment completes; then it is recognized without proposing republication.
- [ ] #3 Given an immutable npm version has candidate-matching bytes and metadata but its approved final dist-tag is absent or differs; when assessment completes; then the version is reported as compatible state requiring later manual dist-tag authority rather than as a hard immutable-version conflict.
- [ ] #4 Given existing registry bytes or immutable metadata for the candidate version differ from the candidate; when assessment completes; then the affected version is reported as a hard conflict.
- [ ] #5 Given a compatible version still needs later manual dist-tag authority or an immutable version is conflicting; when assessment reports the recovery boundary; then overwrite, version reuse, republication, or automatic tag repair is not presented as safe.
- [ ] #6 Given any assessment outcome; when npm and trust state are inspected afterward; then no package, tag, ownership, credential, or trusted-publisher state has changed.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
