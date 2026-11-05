import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/unit/vnext/**/*.test.ts", "test/unit/services/integrity*.test.ts"],
    globals: false,
  },
});
