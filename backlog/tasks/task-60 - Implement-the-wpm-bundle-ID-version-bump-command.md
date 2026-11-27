---
id: TASK-60
title: Implement the wpm bundle ID version bump command
status: Done
assignee: []
created_date: '2026-06-01 02:22'
updated_date: '2026-06-01 14:39'
labels:
  - cli
dependencies:
  - TASK-33
  - TASK-18
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): advances a specific bundle version by a semver level and writes it back, then materialises the bump review tasks (state-task review, migration consideration, simulate upgrade, and a requirer-constraint review for every bundle whose requires names this one) per the doc 11 catalog. Exercises version-constraint semver (doc 13 section 4).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given a level of major, minor, or patch, the command computes the next semver from the bundle current version, writes it back preserving comments, and prints the new version.
- [x] #2 The bump materialises the state-task review, the migration-consideration task, and the simulate-upgrade task for the bundle, plus a review-version-constraint task for every bundle whose requires map names this one, idempotent by title.
- [x] #3 A missing or invalid level fails as a usage error with exit code 2 and changes nothing.
- [x] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles and the level from major, minor, patch.
- [x] #5 Help output is substantive (description, synopsis, the level positional and its values, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle id version bump. Skills: bmad-create-story/dev-story/qa-generate-e2e-tests (worker); bmad-story-automator-review (reviewer APPROVE). bumpBundleVersionSpec computes next semver via bumpSemVer, comment-preserving write; materialises the 3 per-bundle review tasks PLUS a review-version-constraint task for every other enabled bundle whose requires names this id, idempotent by title, into .authoring-backlog. prev-to-next captured in a per-invocation factory-local transition (set in APPLY beat, read in MATERIALISE beat) so summary reports the post-apply version with no double-bump (task-40 lesson). DIVERGENCE: materialised-task titles and ACs conformed verbatim to doc-11 section 75-78, superseding the older story-sketch strings (doc wins). Proven on the real binary against real Backlog.md: 2-bundle requirer scan materialised 4 tasks, re-bump idempotent to one occurrence. Gate 713.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
