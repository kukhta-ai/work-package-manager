import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resolveNpmInvocation } from "../../../distribution-preparation/prepare-package.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const tempRoots: string[] = [];

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function initializeGit(source: string): void {
  git(source, "init", "--initial-branch=main");
  git(source, "config", "user.name", "WPM packed-install test");
  git(source, "config", "user.email", "packed-install@example.invalid");
  git(source, "config", "core.autocrlf", "false");
  git(source, "add", "--force", "--all");
  git(source, "commit", "--message", "clean packed-install fixture");
}

function copyCurrentSource(destination: string): void {
  mkdirSync(destination, { recursive: true });
  const files = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  )
    .split("\0")
    .filter((path) => path !== "" && path !== ".serena" && !path.startsWith(".serena/"));

  for (const relativePath of files) {
    const sourcePath = join(REPO_ROOT, relativePath);
    const destinationPath = join(destination, relativePath);
    mkdirSync(dirname(destinationPath), { recursive: true });
    const stat = lstatSync(sourcePath);
    if (stat.isSymbolicLink()) symlinkSync(readlinkSync(sourcePath), destinationPath);
    else copyFileSync(sourcePath, destinationPath);
  }
}

function npm(cwd: string, ...args: string[]): ReturnType<typeof spawnSync> {
  const invocation = resolveNpmInvocation();
  return spawnSync(invocation.executable, [...invocation.argumentPrefix, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 300_000,
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("fresh local packed-install journey", () => {
  it("rejects bad invocation and a missing inspected report actionably", () => {
    const badInvocation = npm(
      REPO_ROOT,
      "run",
      "--silent",
      "package:verify-install",
      "--",
      "--bad",
    );
    expect(badInvocation.status).toBe(2);
    expect(badInvocation.stderr).toMatch(/^usage:/i);

    const missing = npm(
      REPO_ROOT,
      "run",
      "--silent",
      "package:verify-install",
      "--",
      "--report",
      join(temporaryRoot("wpm-packed-install-missing-"), "missing.json"),
    );
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/package inspection report.*npm run package:inspect/is);
  });

  it("installs the exact inspected archive without its source checkout and preserves agent config", () => {
    const root = temporaryRoot("wpm-packed-install-journey-");
    const source = join(root, "source");
    const artifacts = join(root, "artifacts");
    const reportPath = join(root, "inspection-report.json");
    const consumer = join(root, "consumer");
    copyCurrentSource(source);
    initializeGit(source);

    const dependencies = npm(source, "ci", "--ignore-scripts", "--no-audit", "--no-fund");
    expect({ status: dependencies.status, stderr: dependencies.stderr }).toEqual({
      status: 0,
      stderr: "",
    });
    const preparation = npm(
      source,
      "run",
      "--silent",
      "package:inspect",
      "--",
      "--revision",
      "HEAD",
      "--output",
      artifacts,
    );
    expect({ status: preparation.status, stderr: preparation.stderr }).toEqual({
      status: 0,
      stderr: "",
    });
    const inspection = JSON.parse(String(preparation.stdout)) as {
      status: string;
      sourceRevision: string;
      artifact: { path: string; size: number };
      package: { name: string; version: string; executableTargets: Record<string, string> };
      expectedPaths: string[];
    };
    writeFileSync(reportPath, String(preparation.stdout));
    expect(inspection.status).toBe("accepted");
    expect(existsSync(inspection.artifact.path)).toBe(true);

    const missingArtifactReport = join(root, "missing-artifact-report.json");
    writeFileSync(
      missingArtifactReport,
      JSON.stringify({
        ...inspection,
        artifact: { ...inspection.artifact, path: join(root, "missing-package.tgz") },
      }),
    );
    const missingArtifact = npm(
      REPO_ROOT,
      "run",
      "--silent",
      "package:verify-install",
      "--",
      "--report",
      missingArtifactReport,
    );
    expect(missingArtifact.status).toBe(1);
    expect(missingArtifact.stderr).toMatch(/inspected package artifact.*rerun.*package:inspect/is);

    rmSync(source, { recursive: true, force: true });
    expect(existsSync(source)).toBe(false);

    const verification = npm(
      REPO_ROOT,
      "run",
      "--silent",
      "package:verify-install",
      "--",
      "--report",
      reportPath,
      "--output",
      consumer,
    );
    expect({ status: verification.status, stderr: verification.stderr }).toEqual({
      status: 0,
      stderr: "",
    });
    const result = JSON.parse(String(verification.stdout)) as {
      status: string;
      sourceRevision: string;
      package: { name: string; version: string; executableTargets: Record<string, string> };
      artifact: { inspectedPath: string; frozenPath: string; size: number };
      environment: { root: string; packageRoot: string; workspace: string };
      installation: { status: string };
      executables: Array<{ name: string; version: string; shimPath: string }>;
      resources: {
        status: string;
        resolvedPaths: string[];
        missingPaths: string[];
        probe: { status: string; command: string; output: string };
      };
      configuration: {
        status: string;
        surfaces: Array<{ path: string; unchanged: boolean }>;
      };
    };

    expect(result).toMatchObject({
      status: "accepted",
      sourceRevision: inspection.sourceRevision,
      package: inspection.package,
      artifact: {
        inspectedPath: resolve(inspection.artifact.path),
        size: inspection.artifact.size,
      },
      installation: { status: "installed" },
      resources: { status: "accepted", missingPaths: [], probe: { status: "accepted" } },
      configuration: { status: "unchanged" },
    });
    expect(result.artifact.frozenPath).not.toBe(result.artifact.inspectedPath);
    expect(readFileSync(result.artifact.frozenPath)).toEqual(
      readFileSync(result.artifact.inspectedPath),
    );
    expect(result.environment.root).toBe(resolve(consumer));
    expect(result.environment.packageRoot).toBe(realpathSync(result.environment.packageRoot));
    expect(result.environment.packageRoot.startsWith(resolve(consumer))).toBe(true);
    expect(result.environment.packageRoot.startsWith(resolve(source))).toBe(false);
    expect(result.executables).toHaveLength(
      Object.keys(inspection.package.executableTargets).length,
    );
    expect(result.executables.map(({ name }) => name).sort()).toEqual(
      Object.keys(inspection.package.executableTargets).sort(),
    );
    expect(result.executables.every(({ version }) => version === inspection.package.version)).toBe(
      true,
    );
    expect(result.executables.every(({ shimPath }) => existsSync(shimPath))).toBe(true);
    expect(result.resources.resolvedPaths).toEqual(inspection.expectedPaths);
    expect(result.resources.probe.command).toMatch(/template show minimal --scope project/);
    expect(result.resources.probe.output).toMatch(/minimal/i);
    expect(result.configuration.surfaces.length).toBeGreaterThanOrEqual(6);
    expect(result.configuration.surfaces.every(({ unchanged }) => unchanged)).toBe(true);

    expect(readFileSync(join(consumer, "home", ".agents", "config.toml"), "utf8")).toBe(
      'model = "preserve-codex-personal"\n',
    );
    expect(readFileSync(join(consumer, "home", ".claude", "settings.json"), "utf8")).toContain(
      "preserve-claude-personal",
    );
    expect(readFileSync(join(consumer, "workspace", "AGENTS.md"), "utf8")).toContain(
      "preserve-codex-workspace",
    );
    expect(readFileSync(join(consumer, "workspace", "CLAUDE.md"), "utf8")).toContain(
      "preserve-claude-workspace",
    );
  }, 300_000);
});
