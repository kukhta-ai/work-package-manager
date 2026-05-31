# Story task-6 — Set up the vitest test harness

> Lean implementation spec (BMAD create-story output). Formalizes task-1's minimal vitest into the proper
> harness per `docs/12` §"Testing: vitest" and `_bmad-output/test-artifacts/test-design.md` §1/§6. Reconcile
> with what exists; do NOT duplicate task-5's `test/integration/core-boundary.test.ts`.

## Acceptance criteria (the contract)
1. Tests run with a single command and report pass/fail per test.
2. Pure logic can be exercised without touching the real file system or invoking real subprocesses.
3. Type errors surface from a dedicated check separate from the test run.
4. At least one test of each kind (isolated-logic and through-the-edges) passes on the current codebase.

## What already exists (reconcile, don't rebuild)
- `test/cli.smoke.test.ts` — exercises `run()` in-process via an `OutputSink` (no fs, no subprocess) →
  **isolated logic** → MOVE to `test/unit/`.
- `test/cli.bin.test.ts` — spawns the built `dist/cli.js` through a symlink → **through-the-edges** → MOVE
  to `test/integration/`.
- `test/integration/core-boundary.test.ts` (task-5) — already in `test/integration/`; **leave as is**.
- `vitest.config.ts` — minimal (node env, `include: test/**/*.test.ts`). `package.json` scripts: `test` =
  `vitest run`, `test:watch` = `vitest`, `typecheck` = `tsc` (already separate from `test` — AC#3 holds).
- The husky pre-commit hook is now live, so `biome check .` MUST stay clean (the formatter will run on
  staged files at commit).

## Approach / deliverables
1. **Unit/integration split (doc 12; test-design §6).** Create `test/unit/` and `test/integration/`. Move
   the two files into their right home (fixing relative import depth: `../` → `../../` since they go one
   level deeper). Leave the boundary test put. (`test/snapshot/` + `test/fixtures/` are named by the design
   but have no content until render/derived-artefacts exist — tasks 16+; do NOT create empty dirs now, to
   keep `biome check .`/git clean. Note this boundary in the report.)
2. **vitest.config.ts — make the two layers first-class via `projects`.** Two projects:
   - `unit` → `include: ["test/unit/**/*.test.ts"]`
   - `integration` → `include: ["test/integration/**/*.test.ts"]`
   Both: `environment: "node"`, `globals: false` (we import from "vitest" explicitly, matching existing
   tests). No shared mutable state. Keep it simple. `vitest run` with no filter runs BOTH projects (AC#1).
3. **Scripts (AC#1, AC#3).** Keep `test` = `vitest run` (single command — AC#1). Add `test:unit` =
   `vitest run --project unit` and `test:integration` = `vitest run --project integration`. Keep
   `test:watch` = `vitest`. Confirm `typecheck` = `tsc` stays a SEPARATE command (AC#3). (Use `--project`
   so the split is config-driven, not a second path glob that could drift from the config.)
4. **tmpdir helper — `test/helpers/tmpdir.ts` (doc 12 "real command sequences in a tmpdir").** A small,
   documented helper. Two public surfaces:
   - `makeTempDir(prefix?)` → an absolute, uniquely-named dir via `fs.mkdtempSync(join(os.tmpdir(), ...))`.
   - `removeTempDir(dir)` → bulletproof recursive remove (`rmSync({recursive,force})`, never throws).
   - `withTempDir(fn)` → creates a dir, runs `fn(dir)` (sync or async), removes it in `finally`, returns
     fn's result. This is TEST code, so `node:fs`/`node:os`/`node:path` are fine (core boundary is scoped to
     `src/core/**`). Determinism: unique per call, cleaned up. JSDoc every export.
   - Add ONE tiny integration test (`test/integration/tmpdir.test.ts`) that uses the helper (create →
     assert exists & empty → write a file via node:fs → cleanup → assert gone) so the helper is exercised
     (no dead code) and gives a second through-the-edges example.
5. **AC#2 demonstration.** The moved `test/unit/cli.smoke.test.ts` already exercises pure logic with no real
   fs/subprocess (OutputSink) — that's the isolated-logic example. (Fake ports memory-fs/fake-backlog are
   tasks 12–15; not built now — the OutputSink + tmpdir helper satisfy AC#2 today, per the directive.)
6. **AC#4.** After moves, `vitest run` green with ≥1 unit + ≥1 integration passing; report per-file
   breakdown (unit: cli.smoke; integration: cli.bin, core-boundary, tmpdir).

## Gate / DoD
- `tsc --noEmit` clean (moved files must still type-check — fix import depth), `biome check .` clean (run
  formatter; hook enforces it), `vitest run` green. Document the tmpdir helper's public functions; no dead
  code.

## Boundaries (do NOT do here)
- No fake ports (memory-fs/fake-backlog — tasks 12–15). No snapshot tests / fixtures content (tasks 16+).
  No CI workflow (task-8). Don't touch task-5's boundary test, `biome.json`, `docs/`, `AGENTS.md`,
  `backlog/`, `.bmad/`.
