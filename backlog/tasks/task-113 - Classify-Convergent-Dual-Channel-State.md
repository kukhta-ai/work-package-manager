---
id: TASK-113
title: Classify Convergent Dual-Channel State
status: To Do
assignee: []
created_date: '2026-08-21 15:01'
labels:
  - onboarding-epic-1
  - distribution-preparation
  - release-state
  - no-write
dependencies:
  - TASK-111
  - TASK-112
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md
priority: medium
ordinal: 113000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: maintainers need one deterministic result that distinguishes safe progress, compatible partial completion, absence, and conflict for one exact candidate. Source: Epic 1, Story 1.7; FR45; NFR16, NFR18; final readiness refinement for the ready boundary. Boundary/non-goals: combine supplied GitHub and npm assessments only; do not mutate local or remote release state, roll back compatible completion, overwrite or retag objects, reuse versions, decide unresolved activation policy, or infer equivalence between independently rebuilt artifacts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For one persisted candidate and its two channel assessments, combined state receives exactly one classification under this precedence: conflicting, blocked, complete, resumable, matching, ready.
- [ ] #2 After higher-precedence conditions are excluded, candidate-identity disagreement between assessments or a hard conflict from either channel classifies the result as conflicting.
- [ ] #3 After conflicting is excluded, absence of a required candidate binding, bounded activation fact, or read-only observation needed to derive a non-empty required-boundary set or the next safe boundary classifies the result as blocked.
- [ ] #4 After conflicting and blocked are excluded, a non-empty required-boundary set whose every required channel boundary is externally complete and candidate-matching classifies the result as complete.
- [ ] #5 After conflicting, blocked, and complete are excluded, at least one complete required boundary plus at least one outstanding required boundary, with all completed or observed objects candidate-compatible, classifies the result as resumable.
- [ ] #6 After higher-precedence conditions are excluded, no complete required boundary plus at least one candidate-bound external object, with every observed object candidate-compatible, classifies the result as matching.
- [ ] #7 A candidate-matching immutable npm version awaiting its approved final dist-tag is compatible but incomplete for combined classification.
- [ ] #8 Ready requires a non-empty required-boundary set, sufficient required facts, no complete required boundary, and no candidate-bound external object.
- [ ] #9 An explicitly empty required-boundary policy produces no ready result.
- [ ] #10 A conflicting result identifies every mismatched candidate identity and the affected channel or object.
- [ ] #11 A blocked result identifies each missing binding, activation fact, or required observation.
- [ ] #12 A resumable result preserves compatible completed work.
- [ ] #13 A resumable result identifies only the outstanding forward boundary.
- [ ] #14 Recovery guidance for a conflicting result does not recommend rollback, overwrite, retagging, or version reuse.
- [ ] #15 Repeated evaluation of identical candidate, policy, and channel observations produces the same classification and evidence.
- [ ] #16 Combined-state evaluation changes no local or external release state.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
