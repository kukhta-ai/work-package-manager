import { defineConfig } from "vitest/config";

/**
 * Vitest harness (task-6) for the `wpm` builder, per `docs/12` §"Testing: vitest". Raw test-design
 * projections are working memory under the policy in `PROCESS-ARTIFACTS.md`.
 *
 * The two test flavours that exist today are first-class **projects** so they can be run together (the
 * single `vitest run` — AC#1) or in isolation (`vitest run --project unit` / `--project integration`):
 *
 * - **unit** — isolated logic: no real file system, no subprocess (e.g. the CLI `run()` smoke via an
 *   `OutputSink`). Fakes (memory-fs / fake-backlog) arrive with tasks 12–15.
 * - **integration** — through-the-edges: real tmpdir / real subprocess (the built-binary symlink run, the
 *   core-boundary check, the tmpdir helper).
 *
 * (A `snapshot` flavour and `test/fixtures/` are named by the design but have no content until render /
 * derived-artefacts exist — tasks 16+; they are added then.) `globals: false` everywhere: tests import
 * from "vitest" explicitly. Type-checking is a separate command (`npm run typecheck` = `tsc`), not part of
 * this run (AC#3).
 *
 * Integration files use at most four isolated fork processes. Their setup allocates fresh user state before
 * test imports; source and architecture fixtures live in temporary trees, and the linked-bin test owns its
 * complete producer checkout and dependencies. The shared dist/ is built before the suite and read only.
 * Tests within each file remain sequential, preserving scoped PATH/editor changes and native filesystem
 * spies. Existing case budgets remain; legacy synchronous children also rely on the outer gate deadline.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          sequence: { groupOrder: 0 },
          environment: "node",
          globals: false,
          include: ["test/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          // Vitest schedules projects with different worker limits in distinct groups.
          sequence: { groupOrder: 1 },
          environment: "node",
          globals: false,
          include: ["test/integration/**/*.test.ts"],
          pool: "forks",
          isolate: true,
          maxWorkers: 4,
          fileParallelism: true,
          setupFiles: ["test/integration/setup.ts"],
          // Each integration test drives the REAL `backlog` CLI (and the built binary) over multiple
          // subprocess round-trips (an `init` + several `bundle new` + the command under test), so a single
          // test legitimately takes several seconds — and Windows command startup makes real bundle creation
          // roughly 40–43s per bundle, with measured multi-command journeys reaching 85–95s on supported
          // hosts. Give every integration test one bounded 120s budget; the robust fix for a stateful-external
          // suite is a measured budget, not retries. Unit tests keep the fast default, and hook timing
          // retains its existing platform-specific contract.
          testTimeout: 120_000,
          hookTimeout: process.platform === "win32" ? 120_000 : 60_000,
        },
      },
    ],
  },
});
