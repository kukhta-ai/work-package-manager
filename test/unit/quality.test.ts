import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { inspectGraph } from "../../scripts/architecture.mjs";
import { assertGoCacheBoundaries, setupAnalyzers } from "../../scripts/quality-tools.mjs";

function withCacheFixture(run: (root: string, outside: string) => void) {
  const owned = realpathSync.native(mkdtempSync(join(tmpdir(), "wpm-go-cache boundary-")));
  const root = join(owned, "project");
  const outside = join(owned, "outside");
  mkdirSync(root);
  mkdirSync(join(outside, "00"), { recursive: true });
  writeFileSync(join(outside, "00/sentinel"), "preserve outside bytes");
  try {
    run(root, outside);
  } finally {
    rmSync(owned, { recursive: true, force: true });
  }
}

describe("bounded Go cache cleanup", () => {
  it
    .runIf(process.platform === "linux")
    .each([
      ".quality",
      ".quality/go-build",
      ".quality/go-mod",
      ".quality/go-build/00",
      ".quality/go-mod/cache",
    ])("rejects a linked %s without touching the outside target", (path) => {
    withCacheFixture((root, outside) => {
      const link = join(root, path);
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(outside, link, "dir");
      expect(() => assertGoCacheBoundaries(root)).toThrow(/Go cache/);
      expect(readFileSync(join(outside, "00/sentinel"), "utf8")).toBe("preserve outside bytes");
    });
  });

  it.runIf(process.platform === "linux")(
    "rejects a linked project ancestor and non-directory boundary",
    () => {
      withCacheFixture((root, outside) => {
        mkdirSync(join(root, "checkout"));
        const alias = join(outside, "alias");
        symlinkSync(root, alias, "dir");
        expect(() => assertGoCacheBoundaries(join(alias, "checkout"))).toThrow(/canonical/);
        writeFileSync(join(root, ".quality"), "not a cache directory");
        expect(() => assertGoCacheBoundaries(root)).toThrow(/directory boundaries/);
        expect(readFileSync(join(root, ".quality"), "utf8")).toBe("not a cache directory");
      });
    },
  );

  it.runIf(process.platform === "linux")(
    "allows missing caches but rechecks a later cache replacement",
    () => {
      withCacheFixture((root, outside) => {
        expect(() => assertGoCacheBoundaries(root)).not.toThrow();
        expect(existsSync(join(root, ".quality"))).toBe(false);
        const cache = join(root, ".quality/go-build");
        mkdirSync(join(cache, "00"), { recursive: true });
        writeFileSync(join(cache, "00/owned"), "owned cache bytes");
        expect(() => assertGoCacheBoundaries(root)).not.toThrow();
        rmSync(cache, { recursive: true });
        symlinkSync(outside, cache, "dir");
        expect(() => assertGoCacheBoundaries(root)).toThrow(/directory boundaries/);
        expect(readFileSync(join(outside, "00/sentinel"), "utf8")).toBe("preserve outside bytes");
      });
    },
  );

  it
    .runIf(process.platform === "linux")
    .each([
      ".quality",
      ".quality/go-build",
      ".quality/go-mod/cache",
      "unreadable",
      "malformed",
      "missing-root",
    ])("rejects unavailable or unsafe mount coverage: %s", (path) => {
    withCacheFixture((root, outside) => {
      const native = createRequire(import.meta.url)("node:fs") as typeof import("node:fs");
      const originalRead = native.readFileSync;
      const mount = join(root, path).replaceAll("\\", "\\134").replaceAll(" ", "\\040");
      const rootMount = "1 1 0:1 / / rw - overlay overlay rw\n";
      const spy = vi
        .spyOn(native, "readFileSync")
        .mockImplementation((...args: Parameters<typeof originalRead>) => {
          if (args[0] !== "/proc/self/mountinfo") return originalRead(...args);
          if (path === "unreadable") throw new Error("mountinfo unavailable");
          if (path === "malformed") return "not mountinfo\n";
          const selected = `2 1 0:1 / ${mount} rw - ext4 /dev/fixture rw\n`;
          return path === "missing-root" ? selected : rootMount + selected;
        });
      syncBuiltinESMExports();
      try {
        expect(() => assertGoCacheBoundaries(root)).toThrow(/mount/);
        expect(readFileSync(join(outside, "00/sentinel"), "utf8")).toBe("preserve outside bytes");
      } finally {
        spy.mockRestore();
        syncBuiltinESMExports();
      }
    });
  });

  it.skipIf(process.platform === "linux")(
    "rejects opt-in cleanup on unqualified hosts before provisioning",
    () => {
      expect(() => setupAnalyzers({ cleanGoCaches: true })).toThrow(/requires Linux/);
    },
  );
});

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
