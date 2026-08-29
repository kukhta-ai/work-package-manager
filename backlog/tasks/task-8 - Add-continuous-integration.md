---
id: TASK-8
title: Add continuous integration
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-31 22:36'
labels: []
dependencies:
  - TASK-2
  - TASK-3
  - TASK-4
  - TASK-5
  - TASK-6
ordinal: 8000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every push and pull request is automatically checked, and a failure blocks merge
- [x] #2 The automated checks are the same lint, type, and test gates a contributor runs locally
- [x] #3 The checks pass on the supported range of Node versions across Linux, macOS, and Windows (doc 12)
- [x] #4 The checks pass on the current codebase
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
.github/workflows/ci.yml: GitHub Actions, Node 20/22 x {ubuntu,macos,windows} (6 cells, fail-fast:false), on push(all) + pull_request(dev/main), concurrency-cancel, @v4-pinned actions. Steps: checkout, setup-node(cache npm), npm ci, then the SAME three-command gate as local -- typecheck(tsc) + 'biome ci'(same biome.json incl core-boundary rule) + vitest -- plus a build step before test so the built-binary integration test RUNS (not self-skips) in CI (AC#1,2,3). AC#4 proven by running the identical gate locally (npm ci clean, typecheck OK, biome 12 clean, vitest 14/14). FOUNDATION FIX caught here: task-7 added backlog.md to peerDependencies but did NOT regenerate package-lock.json -> npm ci was FAILING (would have broken every CI cell); reconciled the lockfile (backlog.md stays a peer, NOT in dependencies -> still not bundled). 'Failure blocks merge'(AC#1) = the red status; making it a REQUIRED check is GitHub branch-protection (admin, Phase 7) -- documented honestly, not a repo file. task-14 seam noted for real backlog provisioning. Self-verified by orchestrator (npm ci-from-clean confirmed). Process note: dep-touching tasks must run 'npm ci' in verification.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
