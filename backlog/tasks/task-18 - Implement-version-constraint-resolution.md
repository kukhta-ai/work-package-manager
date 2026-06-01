---
id: TASK-18
title: Implement version-constraint resolution
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 01:37'
labels: []
dependencies:
  - TASK-10
ordinal: 18000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given a version and an npm-style constraint, the result correctly states whether the version satisfies it, across caret, tilde, comparator, exact, and range forms (doc 13)
- [x] #2 Given a graph of inter-bundle dependency constraints and the available versions, each constraint is reported as satisfied or unsatisfied
- [x] #3 A dependency cycle is detected and reported rather than looping
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Version-constraint service src/core/services/version-constraint.ts (PURE: semver + task-10 model only, boundary-clean). satisfies(version,range)=semver.satisfies -- correct across caret(^, incl ^0.3.0 0.x-minor-pinning)/tilde(~)/comparator(>=)/compound(>=2 <3)/exact(=)/bare/x-range/prerelease-default (AC#1; reviewer-verified 16 forms). resolve(nodes)->ResolutionReport{constraints,cycles}: one ConstraintResult per requires edge -> satisfied / missing / version-mismatch (with actualVersion) (AC#2). detectCycles: colored DFS (visited+inProgress+stack), reports cycle path, dedups via canonical smallest-id rotation, skips missing-node edges, TERMINATES (AC#3) -- reviewer brute-forced 20,000 digraphs: reports >=1 cycle IFF cyclic (ZERO false-neg/pos, no DAG false-positive). Normal unsatisfied/cycle = DATA (never thrown; consistent with task-17); report shaped for task-20 validate. SKILLS RUN (Rule 3): worker bmad-create-story + bmad-dev-story + bmad-qa-generate-e2e-tests (impl) + bmad-dev-story (cycle-1 doc fix) -- all head-less, sprint-status suppressed; reviewer bmad-story-automator-review (report-only) -> APPROVE. Cycle-1 [SHOULD] F1: documented detectCycles as DETECTION-not-enumeration (set/order not exhaustive or deterministic; sufficient for the cyclicity check; task-20 must treat cycles.length>0 as cyclic) -- no logic change, no Tarjan added. F2 NIT left (actualVersion on satisfied edges = correct/useful). No new deps (semver from task-10). Gate green (tsc 0 / biome 69 / vitest 255 / npm ci clean).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
