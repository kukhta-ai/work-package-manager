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
        "agent-skills/wpm-create-package/SKILL.md",
        "agent-skills/wpm-author/SKILL.md",
        "agent-skills/wpm-author-bundle/SKILL.md",
        "agent-skills/wpm-author-recipe/SKILL.md",
        "agent-skills/wpm-author-skill/SKILL.md",
        "agent-skills/wpm-review-package/SKILL.md",
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
    const extractedRouterSkillRoot = join(extracted, "package", "agent-skills", "wpm-author");
    const extractedRouterSkillPath = join(extractedRouterSkillRoot, "SKILL.md");
    const expectedRouterSkill = readFileSync(
      join(REPO_ROOT, "agent-skills", "wpm-author", "SKILL.md"),
      "utf8",
    );
    expect(readdirSync(extractedRouterSkillRoot)).toEqual(["SKILL.md"]);
    expect(readFileSync(extractedRouterSkillPath, "utf8")).toBe(expectedRouterSkill);

    const extractedSkillRoot = join(extracted, "package", "agent-skills", "wpm-author-bundle");
    const extractedSkillPath = join(extractedSkillRoot, "SKILL.md");
    const expectedSkill = readFileSync(
      join(REPO_ROOT, "agent-skills", "wpm-author-bundle", "SKILL.md"),
      "utf8",
    );
    expect(readdirSync(extractedSkillRoot)).toEqual(["SKILL.md"]);
    expect(readFileSync(extractedSkillPath, "utf8")).toBe(expectedSkill);

    const extractedRecipeSkillRoot = join(
      extracted,
      "package",
      "agent-skills",
      "wpm-author-recipe",
    );
    const extractedRecipeSkillPath = join(extractedRecipeSkillRoot, "SKILL.md");
    const expectedRecipeSkill = readFileSync(
      join(REPO_ROOT, "agent-skills", "wpm-author-recipe", "SKILL.md"),
      "utf8",
    );
    expect(readdirSync(extractedRecipeSkillRoot)).toEqual(["SKILL.md"]);
    expect(readFileSync(extractedRecipeSkillPath, "utf8")).toBe(expectedRecipeSkill);

    const extractedAuthorSkillRoot = join(extracted, "package", "agent-skills", "wpm-author-skill");
    const extractedAuthorSkillPath = join(extractedAuthorSkillRoot, "SKILL.md");
    const expectedAuthorSkill = readFileSync(
      join(REPO_ROOT, "agent-skills", "wpm-author-skill", "SKILL.md"),
      "utf8",
    );
    expect(readdirSync(extractedAuthorSkillRoot)).toEqual(["SKILL.md"]);
    expect(readFileSync(extractedAuthorSkillPath, "utf8")).toBe(expectedAuthorSkill);

    const extractedReviewSkillRoot = join(
      extracted,
      "package",
      "agent-skills",
      "wpm-review-package",
    );
    const extractedReviewSkillPath = join(extractedReviewSkillRoot, "SKILL.md");
    const expectedReviewSkill = readFileSync(
      join(REPO_ROOT, "agent-skills", "wpm-review-package", "SKILL.md"),
      "utf8",
    );
    expect(readdirSync(extractedReviewSkillRoot)).toEqual(["SKILL.md"]);
    expect(readFileSync(extractedReviewSkillPath, "utf8")).toBe(expectedReviewSkill);

    const extractedCreatePackageSkillRoot = join(
      extracted,
      "package",
      "agent-skills",
      "wpm-create-package",
    );
    const extractedCreatePackageSkillPath = join(extractedCreatePackageSkillRoot, "SKILL.md");
    const expectedCreatePackageSkill = readFileSync(
      join(REPO_ROOT, "agent-skills", "wpm-create-package", "SKILL.md"),
      "utf8",
    );
    expect(readdirSync(extractedCreatePackageSkillRoot)).toEqual(["SKILL.md"]);
    expect(readFileSync(extractedCreatePackageSkillPath, "utf8")).toBe(expectedCreatePackageSkill);

    rmSync(source, { recursive: true, force: true });
    expect(existsSync(source)).toBe(false);
    const sourceFreeRouterSkill = readFileSync(extractedRouterSkillPath, "utf8");
    expect(sourceFreeRouterSkill).toContain("name: wpm-author");
    expect(sourceFreeRouterSkill).toContain("## Take one complete Backlog CLI snapshot");
    expect(sourceFreeRouterSkill).not.toMatch(/\]\((?:\.\.?\/|references\/|scripts\/|assets\/)/);

    const sourceFreeSkill = readFileSync(extractedSkillPath, "utf8");
    expect(sourceFreeSkill).toContain("name: wpm-author-bundle");
    expect(sourceFreeSkill).toContain("## Establish the boundary before changing state");
    expect(sourceFreeSkill).not.toMatch(/\]\((?:\.\.?\/|references\/|scripts\/|assets\/)/);

    const sourceFreeRecipeSkill = readFileSync(extractedRecipeSkillPath, "utf8");
    expect(sourceFreeRecipeSkill).toContain("name: wpm-author-recipe");
    expect(sourceFreeRecipeSkill).toContain("## Model current desired state");
    expect(sourceFreeRecipeSkill).not.toMatch(/\]\((?:\.\.?\/|references\/|scripts\/|assets\/)/);

    const sourceFreeAuthorSkill = readFileSync(extractedAuthorSkillPath, "utf8");
    expect(sourceFreeAuthorSkill).toContain("name: wpm-author-skill");
    expect(sourceFreeAuthorSkill).toContain("## Classify before any write or mutation");
    expect(sourceFreeAuthorSkill).not.toMatch(/\]\((?:\.\.?\/|references\/|scripts\/|assets\/)/);

    const sourceFreeReviewSkill = readFileSync(extractedReviewSkillPath, "utf8");
    expect(sourceFreeReviewSkill).toContain("name: wpm-review-package");
    expect(sourceFreeReviewSkill).toContain("## Evaluate the complete bounded catalog");
    expect(sourceFreeReviewSkill).not.toMatch(/\]\((?:\.\.?\/|references\/|scripts\/|assets\/)/);

    const sourceFreeCreatePackageSkill = readFileSync(extractedCreatePackageSkillPath, "utf8");
    expect(sourceFreeCreatePackageSkill).toContain("name: wpm-create-package");
    expect(sourceFreeCreatePackageSkill).toContain(
      "## Establish readiness before any write or mutation",
    );
    expect(sourceFreeCreatePackageSkill).not.toMatch(
      /\]\((?:\.\.?\/|references\/|scripts\/|assets\/)/,
    );

    const nativeCodexBundleRoot = join(
      root,
      "codex-host",
      ".agents",
      "skills",
      "wpm-author-bundle",
    );
    const nativeClaudeBundleRoot = join(
      root,
      "claude-host",
      ".claude",
      "skills",
      "wpm-author-bundle",
    );
    mkdirSync(nativeCodexBundleRoot, { recursive: true });
    mkdirSync(nativeClaudeBundleRoot, { recursive: true });
    copyFileSync(extractedSkillPath, join(nativeCodexBundleRoot, "SKILL.md"));
    copyFileSync(extractedSkillPath, join(nativeClaudeBundleRoot, "SKILL.md"));
    expect(readFileSync(join(nativeCodexBundleRoot, "SKILL.md"), "utf8")).toBe(sourceFreeSkill);
    expect(readFileSync(join(nativeClaudeBundleRoot, "SKILL.md"), "utf8")).toBe(sourceFreeSkill);

    const nativeCodexRecipeRoot = join(
      root,
      "codex-host",
      ".agents",
      "skills",
      "wpm-author-recipe",
    );
    const nativeClaudeRecipeRoot = join(
      root,
      "claude-host",
      ".claude",
      "skills",
      "wpm-author-recipe",
    );
    mkdirSync(nativeCodexRecipeRoot, { recursive: true });
    mkdirSync(nativeClaudeRecipeRoot, { recursive: true });
    copyFileSync(extractedRecipeSkillPath, join(nativeCodexRecipeRoot, "SKILL.md"));
    copyFileSync(extractedRecipeSkillPath, join(nativeClaudeRecipeRoot, "SKILL.md"));
    expect(readFileSync(join(nativeCodexRecipeRoot, "SKILL.md"), "utf8")).toBe(
      sourceFreeRecipeSkill,
    );
    expect(readFileSync(join(nativeClaudeRecipeRoot, "SKILL.md"), "utf8")).toBe(
      sourceFreeRecipeSkill,
    );

    const nativeCodexAuthorRoot = join(root, "codex-host", ".agents", "skills", "wpm-author-skill");
    const nativeClaudeAuthorRoot = join(
      root,
      "claude-host",
      ".claude",
      "skills",
      "wpm-author-skill",
    );
    mkdirSync(nativeCodexAuthorRoot, { recursive: true });
    mkdirSync(nativeClaudeAuthorRoot, { recursive: true });
    copyFileSync(extractedAuthorSkillPath, join(nativeCodexAuthorRoot, "SKILL.md"));
    copyFileSync(extractedAuthorSkillPath, join(nativeClaudeAuthorRoot, "SKILL.md"));
    expect(readFileSync(join(nativeCodexAuthorRoot, "SKILL.md"), "utf8")).toBe(
      sourceFreeAuthorSkill,
    );
    expect(readFileSync(join(nativeClaudeAuthorRoot, "SKILL.md"), "utf8")).toBe(
      sourceFreeAuthorSkill,
    );

    const nativeCodexReviewRoot = join(
      root,
      "codex-host",
      ".agents",
      "skills",
      "wpm-review-package",
    );
    const nativeClaudeReviewRoot = join(
      root,
      "claude-host",
      ".claude",
      "skills",
      "wpm-review-package",
    );
    mkdirSync(nativeCodexReviewRoot, { recursive: true });
    mkdirSync(nativeClaudeReviewRoot, { recursive: true });
    copyFileSync(extractedReviewSkillPath, join(nativeCodexReviewRoot, "SKILL.md"));
    copyFileSync(extractedReviewSkillPath, join(nativeClaudeReviewRoot, "SKILL.md"));
    expect(readFileSync(join(nativeCodexReviewRoot, "SKILL.md"), "utf8")).toBe(
      sourceFreeReviewSkill,
    );
    expect(readFileSync(join(nativeClaudeReviewRoot, "SKILL.md"), "utf8")).toBe(
      sourceFreeReviewSkill,
    );

    const nativeCodexCreatePackageRoot = join(
      root,
      "codex-host",
      ".agents",
      "skills",
      "wpm-create-package",
    );
    const nativeClaudeCreatePackageRoot = join(
      root,
      "claude-host",
      ".claude",
      "skills",
      "wpm-create-package",
    );
    mkdirSync(nativeCodexCreatePackageRoot, { recursive: true });
    mkdirSync(nativeClaudeCreatePackageRoot, { recursive: true });
    copyFileSync(extractedCreatePackageSkillPath, join(nativeCodexCreatePackageRoot, "SKILL.md"));
    copyFileSync(extractedCreatePackageSkillPath, join(nativeClaudeCreatePackageRoot, "SKILL.md"));
    expect(readFileSync(join(nativeCodexCreatePackageRoot, "SKILL.md"), "utf8")).toBe(
      sourceFreeCreatePackageSkill,
    );
    expect(readFileSync(join(nativeClaudeCreatePackageRoot, "SKILL.md"), "utf8")).toBe(
      sourceFreeCreatePackageSkill,
    );

    const nativeCodexRouterRoot = join(root, "codex-host", ".agents", "skills", "wpm-author");
    const nativeClaudeRouterRoot = join(root, "claude-host", ".claude", "skills", "wpm-author");
    mkdirSync(nativeCodexRouterRoot, { recursive: true });
    mkdirSync(nativeClaudeRouterRoot, { recursive: true });
    copyFileSync(extractedRouterSkillPath, join(nativeCodexRouterRoot, "SKILL.md"));
    copyFileSync(extractedRouterSkillPath, join(nativeClaudeRouterRoot, "SKILL.md"));
    expect(readFileSync(join(nativeCodexRouterRoot, "SKILL.md"), "utf8")).toBe(
      sourceFreeRouterSkill,
    );
    expect(readFileSync(join(nativeClaudeRouterRoot, "SKILL.md"), "utf8")).toBe(
      sourceFreeRouterSkill,
    );
  }, 240_000);
});
