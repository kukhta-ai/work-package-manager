import { describe, expect, it } from "vitest";
import {
  changedGromaRecords,
  GROMA_PRODUCT_EXCLUDE,
  GROMA_SCAN_INCLUDE,
  GROMA_SCANNER_EXCLUDE,
  requireSuccessfulScan,
  TYPESCRIPT_SCANNER,
  validateGromaConfig,
} from "../../scripts/groma.mjs";

const config = () => ({
  automaticUpdates: false,
  useGitignore: true,
  exclude: [...GROMA_PRODUCT_EXCLUDE],
  scanners: [
    {
      id: "typescript",
      source: TYPESCRIPT_SCANNER,
      include: [...GROMA_SCAN_INCLUDE],
      exclude: [...GROMA_SCANNER_EXCLUDE],
    },
  ],
});
describe("Groma qualification contract", () => {
  it("accepts a pinned non-vacuous TypeScript scan without background updates", () => {
    expect(() => validateGromaConfig(config())).not.toThrow();
    expect(() => requireSuccessfulScan("ok\ncreated 0, refreshed 4, matched 3\n")).not.toThrow();
  });
  it("rejects moving plugins, ambient updater and excluded source", () => {
    expect(() => validateGromaConfig({ ...config(), automaticUpdates: true })).toThrow();
    expect(() => validateGromaConfig({ ...config(), scanners: [] })).toThrow();
    expect(() =>
      validateGromaConfig({ ...config(), exclude: [...GROMA_PRODUCT_EXCLUDE, "/src/core/**"] }),
    ).toThrow();
    expect(() =>
      validateGromaConfig({
        ...config(),
        scanners: [{ ...config().scanners[0], include: [...GROMA_SCAN_INCLUDE, "!src/core/**"] }],
      }),
    ).toThrow();

    expect(() =>
      validateGromaConfig({
        ...config(),
        scanners: [{ ...config().scanners[0], source: "@groma/scanner-typescript@latest" }],
      }),
    ).toThrow();
    expect(() =>
      validateGromaConfig({
        ...config(),
        scanners: [{ ...config().scanners[0], exclude: ["src/"] }],
      }),
    ).toThrow();
  });
  it("rejects scanner failure even if upstream printed ok", () => {
    for (const detail of [
      "scanner exploded (saved scanner data kept)",
      "evidence conflicts 1",
      "typescript · error · bad-config ×1",
    ]) {
      expect(() =>
        requireSuccessfulScan(`ok\ncreated 0, refreshed 0, matched 5\n${detail}`),
      ).toThrow();
    }
    expect(() => requireSuccessfulScan("ok\n")).toThrow();
    expect(() => requireSuccessfulScan("ok\ncreated 0, refreshed 0, matched 0\n")).toThrow();
  });
  it("reports additions, removals and changed records deterministically", () => {
    expect(
      changedGromaRecords(
        new Map([
          ["b.md", "1"],
          ["removed.md", "a"],
        ]),
        new Map([
          ["b.md", "2"],
          ["added.md", "a"],
        ]),
      ),
    ).toEqual(["added.md", "b.md", "removed.md"]);
  });
});

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGroma } from "../../scripts/groma.mjs";

describe("Groma non-mutating freshness check", () => {
  it("detects stale output including untracked input in an isolated snapshot", () => {
    const root = mkdtempSync(join(tmpdir(), "wpm-groma-fixture-"));
    try {
      for (const path of ["groma", "src", "node_modules/groma.md"])
        mkdirSync(join(root, path), { recursive: true });
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ devDependencies: { "groma.md": "0.7.8" } }),
      );
      writeFileSync(join(root, ".gitignore"), "node_modules/\n");
      writeFileSync(join(root, "groma/config.json"), JSON.stringify(config()));
      writeFileSync(join(root, "groma/owner.md"), "curated architecture\n");
      writeFileSync(join(root, "src/new-module.ts"), "export const added = true;\n");
      writeFileSync(
        join(root, "node_modules/groma.md/package.json"),
        JSON.stringify({ version: "0.7.8" }),
      );
      writeFileSync(
        join(root, "node_modules/groma.md/cli.cjs"),
        `const fs = require('node:fs');
if (process.argv[2] === 'scan') {
 if (fs.existsSync('src/new-module.ts')) fs.writeFileSync('groma/owner.md', 'new observed source');
 console.log('ok\\ncreated 0, refreshed 1, matched 0');
} else { console.log('typescript found'); }
`,
      );
      expect(spawnSync("git", ["init", "--quiet"], { cwd: root }).status).toBe(0);
      const before = readFileSync(join(root, "groma/owner.md"), "utf8");
      expect(() => runGroma(["check"], root)).toThrow(/stale/);
      expect(readFileSync(join(root, "groma/owner.md"), "utf8")).toBe(before);
      expect(readFileSync(join(root, "src/new-module.ts"), "utf8")).toBe(
        "export const added = true;\n",
      );
      // Stage corrupt generated output, then restore the correct worktree bytes.
      expect(spawnSync("git", ["add", "--all"], { cwd: root }).status).toBe(0);
      writeFileSync(join(root, "groma/owner.md"), "corrupt staged map");
      expect(spawnSync("git", ["add", "groma/owner.md"], { cwd: root }).status).toBe(0);
      writeFileSync(join(root, "groma/owner.md"), "new observed source");
      expect(() => runGroma(["check", "--snapshot", "index"], root)).toThrow(/stale/);
      expect(readFileSync(join(root, "groma/owner.md"), "utf8")).toBe("new observed source");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
