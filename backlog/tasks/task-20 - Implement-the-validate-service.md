---
id: TASK-20
title: Implement the validate service
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 02:00'
labels: []
dependencies:
  - TASK-11
  - TASK-18
ordinal: 20000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Validating a project reports whether every dependency constraint resolves, whether the dependency graph is acyclic, whether at least one target agent is declared, and whether any bundle directory is missing from the manifest (doc 10/13)
- [x] #2 A valid project reports no problems; each kind of broken project reports its specific problem
- [x] #3 Review-phase concerns such as step-slug uniqueness and Definition-of-Done compliance are out of scope here (doc 11)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validate service src/core/services/validate.ts (PURE: composes task-18 resolve + the task-10 model; boundary-clean). validateProject(project, bundleDirectoryNames) -> ValidationReport runs EXACTLY the four doc-13-section-4 checks, AGGREGATING all problems (no fail-fast): (1) constraints resolve + (2) acyclic via task-18 resolve (one BundleNode per enabled bundle -- COMPOSES, does NOT reimplement semver); (3) >=1 target (manifest.targets empty); (4) no orphan bundle dir (a name in bundleDirectoryNames not in manifest.bundles, except 'bundle-template'). Valid project -> {ok:true, problems:[]}; each broken kind -> a field-precise ValidationProblem (missing / version-mismatch with range+actual / cycle path / no-targets / orphan) (AC#1, AC#2; reviewer independently built a maximally-broken project -> all 7 problems reported in ONE pass). Review-phase concerns (step-slug uniqueness, DoD compliance) AND scope-alias well-formedness deliberately OUT OF SCOPE (AC#3; only a JSDoc note documents the exclusion). bundleDirectoryNames supplied as DATA by the operation (read via the FS port) -> validate stays pure; invalid project = data, never thrown (consistent w/ task-17/18/19). SKILLS RUN (Rule 3): worker bmad-create-story + bmad-dev-story + bmad-qa-generate-e2e-tests (all head-less, sprint-status suppressed); reviewer bmad-story-automator-review (report-only) -> APPROVE with ZERO findings. No new deps. Gate green (tsc 0 / biome 77 / vitest 288 / npm ci clean, single process).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
