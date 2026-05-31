---
id: TASK-1
title: Initialize the Node + TypeScript (ESM) package
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-31 21:42'
labels: []
dependencies: []
ordinal: 1000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The project installs and exposes a runnable 'installer' command
- [x] #2 Running the command with a version flag prints the version and exits successfully
- [x] #3 The codebase is TypeScript on ESM under strict type-checking, and a production build is reproducible from a clean checkout
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: ESM-only TS package (name=wpm, strict NodeNext, target ES2022). Thin hand-rolled src/cli.ts (no commander yet -> task-27): --version/-V prints version from a package.json JSON import (reproducible), --help/no-args prints usage. src/version.ts is the single version source. Two-config TS: tsconfig.json (noEmit base, type-checks src+test+vitest.config.ts) + tsconfig.build.json (src-only emit -> dist). Minimal biome.json + vitest + one smoke + one bin-symlink test. REFINEMENTS (recorded): (1) dual bin {wpm, installer} both -> dist/cli.js, reconciling docs' wpm(prose)/installer(doc10 tree, doc12 bin example, AC#1 literal) naming. (2) feature/foundation-task-N sub-branch naming (git can't nest under the feature/foundation branch). BOUNDARY: minimal Biome/vitest here on purpose; task-5 adds the core-boundary noRestrictedImports rule + husky/lint-staged, task-6 adds the unit/integration split + tmpdir helpers. REVIEW: 1 cycle; reviewer caught a false-clean tsconfig (tests not type-checked) [BLOCKING] + a CJS __dirname leak in the bin test [SHOULD], both fixed. Gate verified independently by orchestrator: tsc --noEmit clean over src+test, biome 9 files clean, vitest 7/7, reproducible npm ci+build byte-stable, installer/wpm --version -> 0.1.0.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
