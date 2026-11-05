import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveNpmInvocation } from "../../distribution-preparation/prepare-package.js";
import { digest, publintArchive } from "../../scripts/candidate.mjs";

const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
describe("publint archive qualification", () => {
  it("lints actual tarball bytes without executing package prepack scripts or replacing the archive", () => {
    const root = mkdtempSync(join(tmpdir(), "wpm-publint-fixture-"));
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          name: "wpm-publint-fixture",
          version: "1.0.0",
          type: "module",
          bin: { wpm: "cli.js" },
          files: ["cli.js"],
          scripts: {
            prepack: "node -e \"require('node:fs').writeFileSync('prepack-ran', 'yes')\"",
          },
        }),
      );
      writeFileSync(join(root, "cli.js"), '#!/usr/bin/env node\nconsole.log("fixture");\n');
      chmodSync(join(root, "cli.js"), 0o755);
      const npm = resolveNpmInvocation();
      const packed = spawnSync(
        npm.executable,
        [...npm.argumentPrefix, "pack", "--ignore-scripts", "--silent", "--pack-destination", root],
        { cwd: root, encoding: "utf8", timeout: 30_000 },
      );
      expect(packed.status, packed.stderr).toBe(0);
      const archive = join(root, "wpm-publint-fixture-1.0.0.tgz");
      const before = digest(readFileSync(archive));
      expect(() => publintArchive(sourceRoot, archive)).not.toThrow();
      expect(digest(readFileSync(archive))).toBe(before);
      expect(existsSync(join(root, "prepack-ran"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
