import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execaSync } from "execa";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Proves the core import-boundary rule (doc 13 §1; AGENTS.md invariant) actually fires.
 *
 * `biome.json` scopes a `style/noRestrictedImports` rule to `src/core/**`, forbidding the CLI framework
 * (`commander`), the subprocess library (`execa`), the completion library (`omelette`), and the OS /
 * file-system modules (`node:fs`, `node:fs/promises`, `node:os`, `node:child_process`) — while leaving the
 * pure `node:path` / `node:url` allowed. `src/core/` does not exist yet (it is created from task-10 on), so
 * this test exercises the rule by writing temporary fixture files under `src/core/`, running Biome on them,
 * and asserting the boundary is enforced **and correctly scoped**, then deleting every fixture so the
 * committed tree stays clean (which AC#1 — "clean on the current codebase" — depends on).
 */

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const coreDir = join(repoRoot, "src", "core");

/**
 * Absolute paths of every fixture we may create. Names are suffixed with the process id so that two
 * concurrently-running vitest processes use distinct files and never clobber each other's fixtures or
 * cleanup (these are written into the shared real `src/core/` directory). Cleanup is exhaustive regardless
 * of which test ran.
 */
const pid = process.pid;
const fixtures = {
  forbidden: join(coreDir, `__boundary_fixture_forbidden_${pid}__.ts`),
  allowed: join(coreDir, `__boundary_fixture_allowed_${pid}__.ts`),
  outsideCore: join(repoRoot, "src", `__boundary_fixture_outside_${pid}__.ts`),
} as const;

/** Whether this test created `src/core/` itself (so it should remove it on cleanup), vs it pre-existing. */
let createdCoreDir = false;

/**
 * Run `biome check` on a single file and return its exit code and combined output.
 *
 * Biome exits non-zero when it reports a diagnostic. Execa resolves the local npm binary cross-platform and,
 * with rejection disabled, preserves stdout/stderr plus an explicit launch diagnostic when no process starts.
 *
 * @param filePath - Absolute path of the file to check.
 * @returns The process exit `code` (non-null) and the combined stdout+stderr `output`.
 */
function biomeCheck(filePath: string): { code: number; output: string } {
  const result = execaSync("biome", ["check", filePath], {
    cwd: repoRoot,
    preferLocal: true,
    localDir: repoRoot,
    reject: false,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  const launchDiagnostic =
    result.exitCode === undefined
      ? ([result.shortMessage, result.originalMessage, result.message].find(
          (value): value is string => typeof value === "string" && value.length > 0,
        ) ?? "Biome process did not launch")
      : "";
  return {
    code: result.exitCode ?? -1,
    output: [stdout, stderr, launchDiagnostic].filter((value) => value.length > 0).join("\n"),
  };
}

/**
 * Write a fixture `.ts` file that imports {@link moduleName}, creating `src/core/` first if needed
 * (remembering whether we created it, so cleanup can remove it).
 */
function writeFixture(filePath: string, moduleName: string): void {
  if (!existsSync(coreDir)) {
    mkdirSync(coreDir, { recursive: true });
    createdCoreDir = true;
  }
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  // A use of the import keeps it from being elided and mirrors how core code would consume it.
  writeFileSync(filePath, `import mod from "${moduleName}";\nexport const used = mod;\n`, "utf8");
}

/** Remove every possible fixture and the `src/core/` dir if this test created it. Never throws. */
function cleanup(): void {
  for (const p of Object.values(fixtures)) {
    rmSync(p, { force: true });
  }
  if (createdCoreDir) {
    rmSync(coreDir, { recursive: true, force: true });
    createdCoreDir = false;
  }
}

// Safety net beyond each test's own finally: guarantees the working tree is clean even if an assertion
// throws mid-test.
afterAll(cleanup);

describe("core import-boundary rule (biome noRestrictedImports, scoped to src/core/**)", () => {
  it("reports a violation when a src/core file imports a FORBIDDEN module (node:fs)", () => {
    try {
      writeFixture(fixtures.forbidden, "node:fs");
      const { code, output } = biomeCheck(fixtures.forbidden);
      expect(output).toContain("noRestrictedImports");
      expect(code).not.toBe(0);
    } finally {
      cleanup();
    }
  });

  it("does NOT report the boundary rule when a src/core file imports an ALLOWED module (node:path)", () => {
    try {
      writeFixture(fixtures.allowed, "node:path");
      const { output } = biomeCheck(fixtures.allowed);
      // The boundary rule must not fire for a pure, allowed import — proving the rule is scoped to the
      // forbidden module set, not a blanket ban on all imports in core.
      expect(output).not.toContain("noRestrictedImports");
    } finally {
      cleanup();
    }
  });

  it("does NOT apply the core boundary to files OUTSIDE src/core (a src/ file importing node:fs)", () => {
    try {
      writeFixture(fixtures.outsideCore, "node:fs");
      const { output } = biomeCheck(fixtures.outsideCore);
      // The override is scoped to src/core/** — the CLI/adapter layers legitimately use node:fs, so the
      // rule must not fire here.
      expect(output).not.toContain("noRestrictedImports");
    } finally {
      cleanup();
    }
  });
});
