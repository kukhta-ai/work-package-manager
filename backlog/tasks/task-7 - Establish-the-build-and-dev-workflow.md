---
id: TASK-7
title: Establish the build and dev workflow
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-31 22:29'
labels: []
dependencies:
  - TASK-1
ordinal: 7000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A clean build leaves no artefacts from a previous build, and source-level debugging maps back to the original source
- [x] #2 A developer can run a live-rebuilding mode while working
- [x] #3 A developer can exercise the in-development command as if it were installed
- [x] #4 Backlog.md is treated as an external prerequisite, not bundled, and a user missing it is told how to obtain it (doc 12)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Build/dev workflow per doc 12. Portable clean ('node -e rmSync', no rm -rf -> Windows-CI-safe) + clean-first build ('npm run clean && tsc -p tsconfig.build.json') -> no stale artefacts (proven: a stale probe was dropped on rebuild). Sourcemaps map dist->src (cli.js.map sources=['../src/cli.ts'] + //# sourceMappingURL) so source-level debugging maps to source (AC#1). dev='tsc -p tsconfig.build.json --watch' live-rebuild verified (AC#2). npm link proven to expose wpm/installer at 0.1.0 from the in-progress build, then cleaned up (AC#3); README 'Development' documents it. backlog.md declared in peerDependencies '>=1.0.0' (NOT dependencies -> not bundled, doc 12); README 'Prerequisites' tells a missing user 'npm i -g backlog.md' (AC#4); the runtime missing-check is forward-ref'd to the task-14 backlog-md adapter. Gate green (tsc 0 / biome 12 / vitest 14). Self-verified by orchestrator. Noted-for-later (out of scope): README 'work-package-manager' wording vs manifest name 'wpm'.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
