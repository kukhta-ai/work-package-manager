# Story task-1 — Initialize the Node + TypeScript (ESM) package

> Lean implementation spec (BMAD create-story output, grounded in docs/12 §"Engineering decisions"
> and docs/13 §1). This is the bootstrap story: it stands up the package skeleton, the toolchain, and a
> thin runnable entry point. It deliberately does NOT introduce commander (task-27), the core
> import-boundary lint rule / husky / lint-staged (task-5), or the unit/integration test split +
> tmpdir helpers (task-6). Those boundaries are recorded below.

## Acceptance criteria (the contract)
1. The project installs and exposes a runnable `installer` command.
2. Running the command with a version flag prints the version and exits successfully.
3. The codebase is TypeScript on ESM under strict type-checking, and a production build is reproducible
   from a clean checkout (`npm ci && npm run build`).

## Approach (the how, within doc 13's layering)
The hexagon does not exist yet — this story only stands up the package and a thin entry point that, per
doc 13 §6, is the future composition root. `cli.ts` stays minimal: a tiny hand-rolled argv check, no
framework. Version is sourced from `package.json` via a JSON import (`resolveJsonModule`) so it is baked
into the build and reproducible (no runtime file read, no drift). The entry point keeps a
`#!/usr/bin/env node` shebang; `tsc` preserves leading comments so the built `dist/cli.js` stays
directly executable.

`bin` exposes BOTH `wpm` (the working name used throughout docs/00–13, FOUNDATION, the repo) AND
`installer` (so AC#1's literal "'installer' command" and docs/10's command-tree name are satisfied). This
is a recorded refinement reconciling the doc set's wpm/installer naming (docs/10 names the binary
`installer` as a "working placeholder"; docs/12 §Distribution and the repo use `wpm`). See the divergence
note in the report.

To keep `cli.ts` testable without spawning a process (and without a print-port, which doc 13 §3 forbids
the core from having — though `cli.ts` is the driving adapter, not the core), the arg-handling logic is a
small pure function `run(argv, out)` that takes the args and an output sink and returns an exit code. The
executable tail (`#!/usr/bin/env node` + `process.exit(run(process.argv.slice(2), process.stdout))`) is
the only impure part. This lets the smoke test assert AC#2 in-process.

## Files to add
- `package.json` — name `wpm`, version `0.1.0`, `type: module`, `engines.node >=20`, dual `bin`
  (`wpm` + `installer` → `./dist/cli.js`), scripts (build/typecheck/test/lint/format/dev), exact-pinned
  devDeps (typescript, vitest, @biomejs/biome, @types/node).
- `tsconfig.json` — strict, NodeNext module + resolution, ES2022 target, `outDir dist`, `rootDir src`,
  `declaration`, `resolveJsonModule`, `sourceMap`, plus `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `verbatimModuleSyntax`.
- `biome.json` — minimal: recommended rules + formatter (enough that `biome check .` passes). NO
  `noRestrictedImports` core-boundary rule (task-5), NO husky/lint-staged (task-5).
- `vitest.config.ts` — minimal config (node environment, include test globs).
- `src/cli.ts` — the thin entry point: shebang + `run(argv, out)` pure helper + impure tail.
- `src/version.ts` — re-exports the version from `package.json` (single source via JSON import), so other
  modules don't each import the manifest.
- `test/cli.smoke.test.ts` — ONE smoke test proving AC#2 (`run(['--version'], sink)` → prints `0.1.0`,
  returns exit code 0) and a couple of adjacent assertions (`-V`, `--help`, no-args usage). NOT the
  unit/integration split (task-6).

## Tests (qa for this story)
- Smoke test (`test/cli.smoke.test.ts`): drives the `run()` helper in-process with a string-collecting
  sink. Asserts: `--version`/`-V` print exactly the package version and return 0; `--help`/`-h` and
  no-args print a one-line usage and return 0; an unknown flag returns a non-zero usage code (2, matching
  doc 13 §7's "usage = exit 2", established early so the convention is consistent — though the full typed
  error model is task-23). This is an in-process integration-style smoke for AC#2; the heavier
  integration/tmpdir surface is task-6 onward.
- Reproducible-build evidence (AC#3): `npm ci && npm run build` from clean produces `dist/cli.js` with a
  shebang; `node dist/cli.js --version` prints `0.1.0`. Shown as gate evidence in the report.

## Boundaries with neighbouring tasks (do NOT do these here)
- task-5 (toolchain hardening): the Biome `noRestrictedImports` core-boundary rule, husky pre-commit,
  lint-staged. This story ships only a *minimal* biome.json.
- task-6 (test harness): the `test/unit` vs `test/integration` split, fake ports, tmpdir helpers. This
  story ships only ONE smoke test and a minimal vitest config.
- task-27 (CLI composition root): commander, the command tree, the top-level error handler wiring. This
  story's `cli.ts` is intentionally a hand-rolled stub that task-27 will replace/expand.

## Definition of Done (project-wide)
1. `tsc --noEmit` clean; `biome check .` clean.
2. Tests added and green (vitest).
3. Public functions documented; no dead code; core import-boundary not violated (n/a — no core yet, but
   `cli.ts` imports nothing forbidden).
