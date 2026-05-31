import { defineConfig } from "vitest/config";

/**
 * Minimal vitest configuration for the bootstrap story (task-1).
 *
 * Only enough to run the single CLI smoke test in a Node environment. The richer
 * unit/integration split, fake ports, and tmpdir helpers are task-6 — deliberately
 * not introduced here (see _bmad-output/.../stories/story-task-1.md).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
