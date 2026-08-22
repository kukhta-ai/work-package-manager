import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resolveNpmInvocation } from "../../../distribution-preparation/prepare-package.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const ENTRY = join(REPO_ROOT, "distribution-preparation", "prepare-package.js");
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
  git(source, "config", "user.name", "WPM package test");
  git(source, "config", "user.email", "package-test@example.invalid");
  git(source, "config", "core.autocrlf", "false");
  git(source, "add", "--force", "--all");
  git(source, "commit", "--message", "clean package fixture");
}

function npm(cwd: string, ...args: string[]): void {
  const invocation = resolveNpmInvocation();
  execFileSync(invocation.executable, [...invocation.argumentPrefix, ...args], {
    cwd,
    stdio: "pipe",
    timeout: 180_000,
  });
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

function minimalCommittedPackage(): string {
  const source = join(temporaryRoot("wpm-package-binding-"), "source");
  mkdirSync(source, { recursive: true });
  writeFileSync(join(source, ".gitignore"), "node_modules/\ndist/\n");
  writeFileSync(join(source, "README.md"), "fixture\n");
  writeFileSync(join(source, "LICENSE"), "fixture license\n");
  writeFileSync(
    join(source, "package.json"),
    `${JSON.stringify(
      {
        name: "fixture",
        version: "1.0.0",
        files: ["dist"],
        scripts: { clean: 'node -e ""' },
      },
      null,
      2,
    )}\n`,
  );
  initializeGit(source);
  return source;
}

function rejectedCommittedPackage(): string {
  const source = join(temporaryRoot("wpm-package-rejection-"), "source");
  mkdirSync(join(source, "assets", "_bmad-output"), { recursive: true });
  writeFileSync(join(source, ".gitignore"), "node_modules/\ndist/\n");
  writeFileSync(join(source, "README.md"), "fixture\n");
  writeFileSync(join(source, "assets", "_bmad-output", "plan.md"), "must not ship\n");
  writeFileSync(
    join(source, "package.json"),
    `${JSON.stringify(
      {
        name: "rejected-fixture",
        version: "1.0.0",
        private: true,
        license: "MIT",
        files: ["assets", "missing-root"],
        bin: { rejected: "./dist/missing.js" },
        scripts: { clean: 'node -e ""' },
      },
      null,
      2,
    )}\n`,
  );
  initializeGit(source);
  return source;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("clean revision package preparation", () => {
  it("uses the maintainer command exit convention for invalid invocation", () => {
    const result = spawnSync(process.execPath, [ENTRY, "--unknown"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/^usage:/);
    expect(result.stdout).toBe("");
  });

  it("rejects a requested revision that is not the checked-out commit before packing", () => {
    const source = minimalCommittedPackage();
    const firstRevision = git(source, "rev-parse", "HEAD");
    writeFileSync(join(source, "README.md"), "second revision\n");
    git(source, "add", "README.md");
    git(source, "commit", "--message", "second revision");

    const result = spawnSync(process.execPath, [ENTRY, "--revision", firstRevision], {
      cwd: source,
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/requested revision.*checked-out revision/i);
    expect(result.stdout).toBe("");
  });

  it("rejects a dirty checkout instead of claiming a source binding", () => {
    const source = minimalCommittedPackage();
    writeFileSync(join(source, "README.md"), "dirty\n");

    const result = spawnSync(process.execPath, [ENTRY, "--revision", "HEAD"], {
      cwd: source,
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/checkout is not clean/i);
    expect(result.stdout).toBe("");
  });

  it("rejects ignored contributor-local state before a lifecycle build can consume it", () => {
    const source = minimalCommittedPackage();
    writeFileSync(join(source, "local-build-input.txt"), "ambient contributor input\n");
    writeFileSync(join(source, ".gitignore"), "node_modules/\ndist/\nlocal-build-input.txt\n");
    git(source, "add", ".gitignore");
    git(source, "commit", "--message", "ignore contributor-only build input");

    const result = spawnSync(process.execPath, [ENTRY, "--revision", "HEAD"], {
      cwd: source,
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/ignored contributor-local state.*local-build-input\.txt/is);
    expect(result.stdout).toBe("");
  });

  it("produces one real archive but rejects its complete prohibited and missing boundary", () => {
    const source = rejectedCommittedPackage();
    const output = join(dirname(source), "artifacts");

    const result = spawnSync(process.execPath, [ENTRY, "--revision", "HEAD", "--output", output], {
      cwd: source,
      encoding: "utf8",
      timeout: 60_000,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout) as {
      status: string;
      sourceRevision: string;
      package: { name: string; version: string; executableTargets: Record<string, string> };
      artifact: { path: string; size: number };
      violations: Array<{ kind: string; path: string }>;
    };
    expect(report).toMatchObject({
      status: "rejected",
      sourceRevision: git(source, "rev-parse", "HEAD"),
      package: {
        name: "rejected-fixture",
        version: "1.0.0",
        executableTargets: { rejected: "./dist/missing.js" },
      },
    });
    expect(report.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "prohibited-planning",
          path: "assets/_bmad-output/plan.md",
        }),
        expect.objectContaining({ kind: "missing-required-path", path: "LICENSE" }),
        expect.objectContaining({ kind: "missing-required-path", path: "missing-root" }),
        expect.objectContaining({ kind: "missing-bin-target", path: "dist/missing.js" }),
      ]),
    );
    expect(report.artifact.size).toBeGreaterThan(0);
    expect(existsSync(report.artifact.path)).toBe(true);
  });

  it("builds from a clean copied revision, packs real bytes, and reports the exact boundary", () => {
    const root = temporaryRoot("wpm-clean-package-");
    const source = join(root, "source");
    const output = join(root, "artifacts");
    copyCurrentSource(source);
    initializeGit(source);

    npm(source, "ci", "--ignore-scripts", "--no-audit", "--no-fund");
    expect(existsSync(join(source, "dist"))).toBe(false);
    mkdirSync(join(source, "dist"));
    writeFileSync(join(source, "dist", "stale-sentinel.js"), "stale\n");

    const result = spawnSync(process.execPath, [ENTRY, "--revision", "HEAD", "--output", output], {
      cwd: source,
      encoding: "utf8",
      timeout: 180_000,
    });

    const report = JSON.parse(result.stdout) as {
      status: string;
      sourceRevision: string;
      sourceBinding: { requestedRevision: string; checkoutRevision: string; clean: boolean };
      package: { name: string; version: string; executableTargets: Record<string, string> };
      artifact: { path: string; size: number };
      expectedPaths: string[];
      actualPaths: string[];
      violations: unknown[];
    };
    expect({ status: result.status, stderr: result.stderr, violations: report.violations }).toEqual(
      {
        status: 0,
        stderr: "",
        violations: [],
      },
    );

    const revision = git(source, "rev-parse", "HEAD");
    expect(report).toMatchObject({
      status: "accepted",
      sourceRevision: revision,
      sourceBinding: { requestedRevision: "HEAD", checkoutRevision: revision, clean: true },
      package: {
        name: "wpm",
        version: "0.1.0",
        executableTargets: { installer: "./dist/cli.js", wpm: "./dist/cli.js" },
      },
      violations: [],
    });
    expect(report.expectedPaths).toEqual(report.actualPaths);
    expect(report.actualPaths).toEqual(
      expect.arrayContaining([
        "LICENSE",
        "README.md",
        "package.json",
        "dist/cli.js",
        "agent-skills/installer-builder/SKILL.md",
        "agent-skills/wpm-author-bundle/SKILL.md",
        "docs/00-foundation-and-lineage.md",
        "templates/project/minimal/template.yml",
      ]),
    );
    expect(report.actualPaths).not.toEqual(
      expect.arrayContaining([
        "dist/stale-sentinel.js",
        "src/cli.ts",
        "backlog/config.yml",
        "_bmad-output/implementation-artifacts/sprint-status.yaml",
        "distribution-preparation/package-boundary.js",
      ]),
    );
    expect(report.artifact.size).toBeGreaterThan(0);
    expect(existsSync(report.artifact.path)).toBe(true);

    const extracted = join(root, "extracted");
    mkdirSync(extracted);
    execFileSync("tar", ["-xzf", report.artifact.path, "-C", extracted]);
    const extractedSkillRoot = join(extracted, "package", "agent-skills", "wpm-author-bundle");
    const extractedSkillPath = join(extractedSkillRoot, "SKILL.md");
    const expectedSkill = readFileSync(
      join(REPO_ROOT, "agent-skills", "wpm-author-bundle", "SKILL.md"),
      "utf8",
    );
    expect(readdirSync(extractedSkillRoot)).toEqual(["SKILL.md"]);
    expect(readFileSync(extractedSkillPath, "utf8")).toBe(expectedSkill);

    rmSync(source, { recursive: true, force: true });
    expect(existsSync(source)).toBe(false);
    const sourceFreeSkill = readFileSync(extractedSkillPath, "utf8");
    expect(sourceFreeSkill).toContain("name: wpm-author-bundle");
    expect(sourceFreeSkill).toContain("## Establish the boundary before changing state");
    expect(sourceFreeSkill).not.toMatch(/\]\((?:\.\.?\/|references\/|scripts\/|assets\/)/);
  }, 240_000);
});
