---
id: TASK-111
title: Assess GitHub Release Staging Without Writes
status: To Do
assignee: []
created_date: '2026-08-21 15:01'
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
priority: medium
ordinal: 111000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: maintainers need to know GitHub prerequisites, compatible state, and conflicts before activation is authorized. Source: Epic 1, Story 1.5; FR43; NFR14, NFR16-NFR18. Boundary/non-goals: assess the inactive candidate using caller-supplied or permitted read-only GitHub observations; do not create or move tags, create or edit drafts, releases, or assets, change Git state, handle credentials, or authorize activation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given an inactive verified candidate and GitHub policy and state supplied by the caller or available through permitted read-only observation; when GitHub staging is assessed; then the required tag, draft metadata, exact assets, checksums, notes, evidence, and unresolved policy facts are reported.
- [ ] #2 Given observed GitHub state matches the candidate; when assessment completes; then matching tags, drafts, releases, and assets are recognized without proposing duplicates.
- [ ] #3 Given a tag targets another commit or a release or asset conflicts with the candidate; when assessment completes; then the affected object and hard conflict are identified.
- [ ] #4 Given any assessment outcome; when Git and GitHub state are inspected afterward; then nothing has been created, changed, moved, or deleted.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
