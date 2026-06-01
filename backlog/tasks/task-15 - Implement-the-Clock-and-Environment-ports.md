---
id: TASK-15
title: Implement the Clock and Environment ports
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 00:41'
labels: []
dependencies:
  - TASK-6
ordinal: 15000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Everything time-dependent and environment-dependent the builder does is reached through replaceable abstractions for the clock and the environment (doc 13)
- [x] #2 Tests can pin the current time, the working directory, the platform, and environment variables to fixed values
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Clock + Environment ports (src/core/ports/clock.ts now():Date; environment.ts cwd()/platform()/getEnv() -- pure interfaces, 0 imports, boundary-guarded) + real adapters (SystemClock, ProcessEnvironment using Date/process OUTSIDE the core) + settable fakes (FixedClock set/advance + Date/ISO/epoch ctor; FakeEnvironment setCwd/setPlatform/setEnv/deleteEnv). Completes doc 13 section-3's FOUR ports (FileSystem, BacklogMd, Clock, Environment). AC#1 replaceable abstractions (core driven by real OR fake; type-level assertions); AC#2 fakes PIN time/cwd/platform/env (the 'pin all four at once' test). Fake-faithfulness via live differential (both return a FRESH Date each now() -> mutation-safe; getEnv(unset) strictly undefined in both real+fake); FixedClock design sound (fresh-Date-per-call, epoch default, throw-on-invalid); real-adapter integration test leak-free (restores process.env in afterEach, runs serial). SKILLS RUN (Rule 3 -- FIRST FULLY SKILL-DRIVEN STORY): worker invoked bmad-create-story + bmad-dev-story + bmad-qa-generate-e2e-tests (ALL loaded+ran head-less; their sprint-status writes suppressed, orchestrator-owned); reviewer invoked bmad-story-automator-review (report-only) -> APPROVE. No new deps. Gate green (tsc 0 / biome 60 / vitest 196 / npm ci clean). 3 non-blocking NITs (FixedClock 'ISO string' aspirational not enforced; Environment/symlink platform duplication documented + deferred to a later unify task; env fake mutable by design).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
