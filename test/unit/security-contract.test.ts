import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeJson } from "../../scripts/json.mjs";
import {
  SETUP_CONTRACT_DIGEST,
  validateAnalyzerPins,
  validateAnalyzerReceipt,
} from "../../scripts/quality-tools.mjs";
import {
  createSecuritySnapshot,
  recordOfflineEvidence,
  requireSemgrepCoverage,
} from "../../scripts/security.mjs";
import {
  gitleaksSourceArguments,
  osvSourceArguments,
  semgrepSourceArguments,
} from "../../scripts/security-commands.mjs";

const pins = validateAnalyzerPins(
  decodeJson(
    readFileSync(fileURLToPath(new URL("../../quality/toolchain.json", import.meta.url)), "utf8"),
  ),
);
describe("mandatory native scanner controls", () => {
  it("keeps source suppression disabled in the production and native-qualification command contract", () => {
    const semgrep = semgrepSourceArguments({
      rules: "/trusted/rules.yml",
      output: "/private/report.json",
      targets: ["src", "scripts"],
    });
    expect(semgrep).toEqual(
      expect.arrayContaining(["--strict", "--disable-nosem", "--no-git-ignore"]),
    );
    const gitleaks = gitleaksSourceArguments({
      config: "/trusted/gitleaks.toml",
      ignore: "/trusted/empty-ignore",
      output: "/private/report.json",
    });
    expect(gitleaks.slice(gitleaks.indexOf("--config"), gitleaks.indexOf("--config") + 2)).toEqual([
      "--config",
      "/trusted/gitleaks.toml",
    ]);
    expect(gitleaks).toContain("--ignore-gitleaks-allow");
    expect(gitleaks[gitleaks.indexOf("--gitleaks-ignore-path") + 1]).toBe("/trusted/empty-ignore");
    for (const downloadDatabase of [true, false]) {
      const osv = osvSourceArguments({
        config: "/trusted/empty-osv.toml",
        database: "/private/db",
        output: "/private/report.json",
        downloadDatabase,
      });
      expect(osv[osv.indexOf("--config") + 1]).toBe("/trusted/empty-osv.toml");
      expect(osv).toContain("--no-resolve");
      expect(osv.includes("--download-offline-databases")).toBe(downloadDatabase);
    }
  });
});
describe("analyzer provenance", () => {
  it("binds dependency locks and library bytes alongside wrapper bytes", () => {
    const observed = {
      lockfileDigest: "lock",
      inputDigest: "input",
      pythonInventoryDigest: "all libraries",
      digests: { semgrep: "wrapper", zizmor: "wrapper2" },
    };
    const receipt = {
      schemaVersion: 2,
      setupContractDigest: SETUP_CONTRACT_DIGEST,
      freshEnvironmentQualification: {
        sameVersionTamperRepaired: true,
        corruptWheelRejected: true,
      },
      pins,
      ...observed,
    };
    expect(validateAnalyzerReceipt(receipt, observed)).toBe(receipt);
    for (const changed of [
      { ...observed, lockfileDigest: "different lock" },
      { ...observed, pythonInventoryDigest: "changed dependency code" },
      { ...observed, digests: {} },
    ]) {
      expect(() => validateAnalyzerReceipt(receipt, changed)).toThrow();
    }
    expect(() =>
      validateAnalyzerPins({ ...pins, python: { ...pins.python, semgrep: "latest" } }),
    ).toThrow();
  });
});
describe("Git-selected scanner source", () => {
  it("includes new source, honors deletions and excludes ignored private tool state", () => {
    const root = mkdtempSync(join(tmpdir(), "wpm-security-source-"));
    const output = mkdtempSync(join(tmpdir(), "wpm-security-output-"));
    try {
      expect(spawnSync("git", ["init", "--quiet"], { cwd: root }).status).toBe(0);
      writeFileSync(join(root, ".gitignore"), ".quality/\n");
      mkdirSync(join(root, "src"));
      writeFileSync(join(root, "src/deleted.ts"), "export const old = true;\n");
      expect(spawnSync("git", ["add", "--all"], { cwd: root }).status).toBe(0);
      rmSync(join(root, "src/deleted.ts"));
      writeFileSync(join(root, "src/added.ts"), "export const added = true;\n");
      mkdirSync(join(root, ".quality"));
      writeFileSync(join(root, ".quality/private.txt"), "private fixture state\n");
      const snapshot = createSecuritySnapshot(root, output);
      try {
        expect(snapshot.selected).toContain("src/added.ts");
        expect(snapshot.selected).not.toContain("src/deleted.ts");
        expect(existsSync(join(snapshot.root, ".quality"))).toBe(false);
        expect(readFileSync(join(root, ".quality/private.txt"), "utf8")).toBe(
          "private fixture state\n",
        );
      } finally {
        snapshot.cleanup();
      }
      symlinkSync(output, join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
      expect(() => createSecuritySnapshot(root, output)).toThrow(/escapes checkout/);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(output, { recursive: true, force: true });
    }
  });
});
describe("offline vulnerability evidence", () => {
  it("retains database identity and failure context before a failed scan is raised", () => {
    const root = mkdtempSync(join(tmpdir(), "wpm-osv-evidence-"));
    try {
      const directory = join(root, "db");
      mkdirSync(directory);
      writeFileSync(join(directory, "npm.zip"), "database fixture bytes");
      const lockfile = join(root, "package-lock.json");
      writeFileSync(lockfile, "{}");
      const output = join(root, "evidence/receipt.json");
      const result = recordOfflineEvidence({
        directory,
        output,
        lockfile,
        startedAt: "2026-11-05T00:00:00Z",
        exitStatus: 1,
        error: "download incomplete",
      });
      expect(result.status).toBe("failed");
      expect(result.databases[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.error).toBe("download incomplete");
      expect(decodeJson(readFileSync(output, "utf8"))).toEqual(result);
      const missing = recordOfflineEvidence({
        directory: join(root, "missing"),
        output,
        lockfile,
        startedAt: "2026-11-05T00:00:00Z",
        exitStatus: 0,
      });
      expect(missing.status).toBe("failed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("complete Semgrep coverage", () => {
  it("rejects a new unscanned source even when another file was analyzed", () => {
    const report = { paths: { scanned: ["src/current.ts"] }, errors: [] };
    expect(() => requireSemgrepCoverage(report, ["src/current.ts", "src/new.ts"])).toThrow(
      /new.ts/,
    );
    expect(() =>
      requireSemgrepCoverage(report, ["src/current.ts", "src/contracts.d.ts"]),
    ).not.toThrow();
    expect(() => requireSemgrepCoverage({ paths: { scanned: [] } }, [])).toThrow();
  });
});
