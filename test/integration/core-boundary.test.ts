import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execaSync } from "execa";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../helpers/tmpdir.js";

/** Exercise the real scoped Biome policy in disposable trees, never in shared product source. */
const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const biome = join(repoRoot, "node_modules/@biomejs/biome/bin/biome");

/** @returns The real analyzer exit status and diagnostics; missing tooling cannot pass. */
function biomeCheck(root: string, file: string): { code: number; output: string } {
  const result = execaSync(process.execPath, [biome, "check", "--vcs-enabled=false", file], {
    cwd: root,
    reject: false,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  const launchDiagnostic = result.exitCode === undefined ? result.message : "";
  return {
    code: result.exitCode ?? -1,
    output: [stdout, stderr, launchDiagnostic].filter(Boolean).join("\n"),
  };
}

function fixture(root: string, relative: string, moduleName: string): string {
  copyFileSync(join(repoRoot, "biome.json"), join(root, "biome.json"));
  const file = join(root, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `import mod from "${moduleName}";\nexport const used = mod;\n`, "utf8");
  return file;
}

describe("core import-boundary rule (real scoped Biome policy)", () => {
  it("rejects a forbidden filesystem import in core", async () => {
    await withTempDir((root) => {
      const file = fixture(root, "src/core/forbidden.ts", "node:fs");
      const { code, output } = biomeCheck(root, file);
      expect(output).toContain("noRestrictedImports");
      expect(code).not.toBe(0);
    });
  });

  it("accepts pure path transformations in core", async () => {
    await withTempDir((root) => {
      const file = fixture(root, "src/core/allowed.ts", "node:path");
      const { code, output } = biomeCheck(root, file);
      expect(code, output).toBe(0);
      expect(output).not.toContain("noRestrictedImports");
    });
  });

  it("allows effectful imports outside core", async () => {
    await withTempDir((root) => {
      const file = fixture(root, "src/outside.ts", "node:fs");
      const { code, output } = biomeCheck(root, file);
      expect(code, output).toBe(0);
      expect(output).not.toContain("noRestrictedImports");
    });
  });
});
