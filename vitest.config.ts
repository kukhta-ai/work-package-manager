import { defineConfig } from "vitest/config";

/**
 * Vitest harness (task-6) for the `wpm` builder, per `docs/12` §"Testing: vitest" and the test-design
 * (`_bmad-output/test-artifacts/test-design.md` §1, §6).
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
 * **Integration tests run serially** (`fileParallelism: false`, a single fork). They drive stateful, shared
 * external resources — the real `backlog` CLI (which keeps per-machine global state), the real `src/core/`
 * directory (the import-boundary fixture test writes there), and the built binary — so running their files
 * in parallel workers lets those resources collide. Serial execution is the robust fix (a stateful-external
 * integration suite is legitimately serial); it is NOT masking with retries. The **unit** project stays
 * fully parallel — it is pure, in-memory, and shares no state.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          globals: false,
          include: ["test/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          globals: false,
          include: ["test/integration/**/*.test.ts"],
          // Serialize the integration files: no parallel file workers, so stateful external resources
          // (the real `backlog` CLI, the shared src/core/ fixture path, the built binary) never collide.
          fileParallelism: false,
        },
      },
    ],
  },
});
