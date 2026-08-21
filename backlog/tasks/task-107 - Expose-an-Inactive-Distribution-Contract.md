---
id: TASK-107
title: Expose an Inactive Distribution Contract
status: To Do
assignee: []
created_date: '2026-08-21 15:00'
labels:
  - onboarding-epic-1
  - distribution-preparation
  - distribution-policy
dependencies: []
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md
priority: high
ordinal: 107000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: maintainers need preparation to fail closed so unresolved activation facts cannot imply that WPM is publicly obtainable or eligible for release. Source: Epic 1, Story 1.1; FR39; NFR14-NFR15. Boundary/non-goals: report inactive readiness only; do not select a public identity or channel policy, configure credentials or trust, create tags or releases, publish to npm, mutate remote state, or claim an unavailable public coordinate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given one or more items in the bounded activation-fact inventory are unresolved or lack the required authorization or control evidence; when distribution readiness is assessed; then the distribution is reported as inactive and every unresolved inventory item is reported together.
- [ ] #2 Given distribution is inactive; when package metadata, documentation, CLI help, and bootstrap guidance are inspected; then none presents an unresolved coordinate or channel as canonical or publicly obtainable.
- [ ] #3 Given a proposed package coordinate is unresolved, observed as occupied by incompatible state, or lacks explicit WPM authorization plus read-only evidence of availability or WPM control; when release eligibility is assessed; then package metadata or registry state alone cannot make it eligible.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
