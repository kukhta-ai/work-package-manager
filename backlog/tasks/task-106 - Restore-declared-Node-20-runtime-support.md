---
id: TASK-106
title: Restore declared Node 20+ runtime support
status: Done
assignee: []
created_date: '2026-08-21 15:00'
updated_date: '2026-08-21 17:33'
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
modified_files:
  - package.json
  - package-lock.json
  - test/integration/cli.bin.test.ts
  - test/integration/package-runtime-support.test.ts
  - _bmad-output/implementation-artifacts/stories/story-task-106.md
  - _bmad-output/implementation-artifacts/tests/test-summary-task-106.md
priority: high
ordinal: 106000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: WPM declares Node >=20 and CI covers Node 20 and 22, but the locked commander@15.0.0 dependency declares Node >=22.12.0, so current package evidence cannot support the advertised consumer contract. Source: final implementation-readiness report, Separate Existing Platform-Compatibility Risk; package.json; .github/workflows/ci.yml. Boundary/non-goals: preserve the existing Node >=20 contract and Node 20/22 coverage; add no product feature, distribution activation, or upward runtime-floor change unless an authoritative design change is separately approved at a human gate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Package metadata continues to declare Node >=20 as supported.
- [x] #2 User-facing runtime-support documentation identifies Node >=20 as supported.
- [x] #3 No required production dependency in the resolved install excludes Node 20 from its supported engine range.
- [x] #4 A clean locked dependency installation completes on Node 20 and Node 22 without an unsupported-engine diagnostic caused by WPM or a required production dependency.
- [x] #5 The built wpm and installer executables start on Node 20 and Node 22 and report the same installed WPM version.
- [x] #6 The compatibility matrix continues to cover Node 20 and Node 22 on Linux, macOS, and Windows.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD workflow evidence: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, and two independent bmad-story-automator-review cycles ran literally. Review cycle 1 auto-fixed published bin-map truth and exact CI-matrix coverage; review absorption reran bmad-dev-story; cycle 2 approved with zero new findings. Node 20.20.2 and Node 22.22.1 clean install/build/bin probes passed. Final gates: focused 13/13, typecheck, Biome 201 files, production build, exact full suite 1294/1294 across 100 files, lock/diff/inventory clean. Decision: retain declared Node >=20 and exact-pin Commander 14.0.3; Node20 install diagnostics are limited to dev-only lint-staged/listr2 and no required production dependency excludes Node20.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Restored the declared Node >=20 production contract by resolving Commander 14.0.3 exactly, added generic production-engine and exact six-cell CI guards, and proved both published executable aliases against their manifest targets on Node 20 and 22. Final independent review APPROVE.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
