---
id: TASK-82
title: Implement the wpm build dry-run command
status: Done
assignee: []
created_date: '2026-06-01 02:24'
updated_date: '2026-06-01 22:08'
labels:
  - cli
dependencies:
  - TASK-33
  - TASK-20
  - TASK-22
  - TASK-48
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): validates and previews what would ship without producing an artefact. Runs project validate, verifies wpm.lock against vendored content (frozen-lockfile), and prints the file tree that would ship with each vendored artifact locked version and source. Backs the validate and integrity services (doc 13 section 4). Deeper checks (independence, simulate, slug uniqueness, DoD) live as review-phase tasks (doc 11), deliberately not here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The command runs project validate and fails fast on any validation error.
- [x] #2 The command verifies wpm.lock against the vendored content and fails on hash drift (frozen-lockfile).
- [x] #3 On success it prints the file tree that would ship, with each vendored artifact locked version and source, and produces no artefact.
- [x] #4 The command exits 0 when validation and the lockfile check pass and non-zero otherwise.
- [x] #5 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [x] #6 Help output is substantive (description, synopsis, an example).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
build dry-run. BMAD skills: bmad-create-story/dev-story/qa-generate-e2e-tests (worker13); bmad-story-automator-review (reviewer APPROVE). PURE computeBuildPlan in build.ts: project validate (fail-fast) + frozen-lockfile verify (reuses task-22 integrity.ts; fresh project = no wpm.lock = trivial pass; drift/missing/extra fail; currentVendored iterates only lock.artifacts so an unpinned authored skill is never flagged extra) + shippableFiles enumeration (excludes .authoring-backlog/.git/node_modules/dist/disabled-bundles, keeps bundles/bundle-template/, records scope-alias symlink dirs once as leaves). Prints the would-ship tree with each vendored version+source; produces NO artefact. Boundary clean (core-boundary fixture passes). Verified on the real binary. Gate 1174.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
