---
id: TASK-23
title: Define the typed error model and exit-code mapping
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 02:44'
labels: []
dependencies:
  - TASK-10
ordinal: 23000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Failures are expressed as distinct categories — bad usage, not found, conflict, unsatisfiable constraint, and invalid input (doc 13)
- [x] #2 The core signals failure by raising these; it never terminates the process or writes directly to the error stream
- [x] #3 Each failure category maps to one documented exit status (success, usage error, and everything-else), decided in a single place
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Typed error model + exit-code mapping src/core/errors.ts (PURE, 0 imports, boundary-clean -- the core RAISES, never exits/prints; AC#2 enforced by a STATIC source-scan no-I/O guard test). DomainError base extends Error with a category discriminator + optional detail{field?,id?}; 5 subclasses UsageError/NotFoundError/ConflictError/ConstraintError/ValidationError (AC#1, five distinct categories), each fixing its category; ES2022 prototype-chain fix (Object.setPrototypeOf(this, new.target.prototype) + name=new.target.name) so instanceof holds for self/DomainError/Error and NOT for siblings (reviewer-verified all 5 x 8 checks + sibling-distinctness + base-not-instanceof-subclass). isDomainError type guard. exitCodeFor(error):0|1|2 is the SINGLE source of truth (AC#3): usage->2; the other four categories + ANY non-domain value->1 (reviewer exhaustively verified 15 non-domain values); 0 = the caller's success path (never returned here). Category-driven (a bad CLI arg modeled as UsageError->2, not ValidationError). SECURITY: a spoofed plain object with category 'usage' can NOT get exit 2 -- it must be a real DomainError instance via the instanceof gate. Existing services' plain throws untouched (operations 25/26 will raise these typed errors). SKILLS RUN (Rule 3): worker bmad-create-story + bmad-dev-story + bmad-qa-generate-e2e-tests (all head-less, sprint-status suppressed); reviewer bmad-story-automator-review (report-only) -> APPROVE, zero findings. No new deps. Gate green (tsc 0 / biome 86 / vitest 349 / npm ci clean, single process). Phase D begins.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
