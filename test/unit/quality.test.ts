import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inspectGraph } from "../../scripts/architecture.mjs";

describe("quality gates fail closed", () => {
  it("rejects an empty graph instead of treating no files as success", () => {
    expect(() => inspectGraph({ modules: [] })).toThrow(/empty/);
  });
  it("reports the complete transitive effect chain", () => {
    expect(
      inspectGraph({
        modules: [
          {
            source: "src/core/a.ts",
            dependencies: [{ module: "bridge", resolved: "src/util/bridge.ts" }],
          },
          {
            source: "src/util/bridge.ts",
            dependencies: [{ module: "node:fs", resolved: "node:fs" }],
          },
        ],
      }),
    ).toEqual(["src/core/a.ts -> src/util/bridge.ts -> node:fs"]);
  });
  it("rejects a first-party dependency that disappeared from analyzer coverage", () => {
    expect(
      inspectGraph({
        modules: [
          {
            source: "src/core/a.ts",
            dependencies: [{ module: "bridge", resolved: "src/util/bridge.ts" }],
          },
        ],
      }),
    ).toEqual(["src/core/a.ts -> src/util/bridge.ts (first-party module was not analyzed)"]);
  });
  it("rejects unknown modes rather than skipping checks", () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../../scripts/quality.mjs", import.meta.url)), "empty"],
      { encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unknown quality mode");
  });
  it("refuses a reduced release qualification before invoking any analyzer", () => {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("../../scripts/quality.mjs", import.meta.url)),
        "release",
        "--policy-only",
      ],
      { encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("release qualification requires all checks");
  });
});
