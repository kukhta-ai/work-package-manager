---
id: TASK-131
title: Keep release-gate tests honest across supported path dialects
status: Done
assignee: []
created_date: '2026-08-28 14:40'
updated_date: '2026-08-28 15:09'
labels:
  - follow-up
  - ci
  - cross-platform
  - release-gate
dependencies:
  - TASK-130
priority: high
ordinal: 131000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The first complete PR matrix exposed test-created roots and in-memory alias observations that are equivalent on disk but use different native spellings on macOS and Windows. Preserve the real product rejection of unsafe aliased inputs while making the harness and fake filesystem express canonical, platform-independent evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Through-edge tests that require a real canonical root receive one on each supported operating system.
- [x] #2 Deliberately noncanonical or aliased roots remain rejected before mutation with the existing actionable safety result.
- [x] #3 An in-memory absolute alias observation accepts separator-dialect-equivalent spellings of the same target and still rejects a different target.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Gate diagnosis: literal bmad-investigate @ PR #5 cross-platform CI confirmed macOS /var -> /private/var and Windows RUNNER~1 -> runneradmin are test-owned temp-root aliases; the product guard is correct. Windows also exposed MemoryFileSystem's documented POSIX observation of absolute aliases being compared against an unnormalized native target. Keep relative alias targets byte-exact.

Scope correction: removed the full macOS/Windows matrix criterion because that is the enclosing Phase-6 PR gate, not a per-story outcome; TASK-131's observable contract is fully captured by AC1-AC3 and the final matrix remains pending before PR merge.

BMAD evidence: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, and independent bmad-story-automator-review cycle 1 all ran literally for ignored story 4-4. Review auto-fixed the remaining packed-install canonical temp root and added a relative-alias byte-exact regression; no unresolved findings. Focused result: 6 files / 160 tests; typecheck, focused Biome, process-artifact policy, and diff check pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Canonical test-owned roots now cross workspace safety boundaries with their native real path on macOS and Windows. Absolute alias observations compare across equivalent separator dialects while relative targets remain byte-exact and different targets still fail. Product canonical-safety guards are unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
