---
id: TASK-106
title: Restore declared Node 20+ runtime support
status: To Do
assignee: []
created_date: '2026-08-21 15:00'
labels:
  - maintenance
  - platform-compatibility
  - node
dependencies: []
references:
  - package.json
  - .github/workflows/ci.yml
  - >-
    _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-21-final.md
priority: high
ordinal: 106000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: WPM declares Node >=20 and CI covers Node 20 and 22, but the locked commander@15.0.0 dependency declares Node >=22.12.0, so current package evidence cannot support the advertised consumer contract. Source: final implementation-readiness report, Separate Existing Platform-Compatibility Risk; package.json; .github/workflows/ci.yml. Boundary/non-goals: preserve the existing Node >=20 contract and Node 20/22 coverage; add no product feature, distribution activation, or upward runtime-floor change unless an authoritative design change is separately approved at a human gate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Package metadata continues to declare Node >=20 as supported.
- [ ] #2 User-facing runtime-support documentation identifies Node >=20 as supported.
- [ ] #3 No required production dependency in the resolved install excludes Node 20 from its supported engine range.
- [ ] #4 A clean locked dependency installation completes on Node 20 and Node 22 without an unsupported-engine diagnostic caused by WPM or a required production dependency.
- [ ] #5 The built wpm and installer executables start on Node 20 and Node 22 and report the same installed WPM version.
- [ ] #6 The compatibility matrix continues to cover Node 20 and Node 22 on Linux, macOS, and Windows.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
