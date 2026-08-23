import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resolveInstalledExecutableInvocation } from "../../../distribution-preparation/packed-install.js";
import { resolveNpmInvocation } from "../../../distribution-preparation/prepare-package.js";
import { ACTIVATION_FACT_KEYS } from "../../../distribution-preparation/readiness.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const tempRoots: string[] = [];
const NPM_REPOSITORY = {
  type: "git",
  url: "https://github.com/example/work-package-manager.git",
  directory: null,
};
const WORKSPACE_SKILL_NAMES = [
  "wpm-author",
  "wpm-author-bundle",
  "wpm-author-recipe",
  "wpm-author-skill",
  "wpm-review-package",
] as const;

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

function directorySnapshot(root: string): Array<readonly [string, string]> {
  const snapshot: Array<readonly [string, string]> = [];
  const walk = (directory: string, prefix = ""): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const path = join(directory, entry.name);
      const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const stat = lstatSync(path, { bigint: true });
      const metadata = `${stat.mode}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
      if (entry.isDirectory()) {
        snapshot.push([`${relativePath}/`, `directory:${metadata}`]);
        walk(path, relativePath);
      } else if (entry.isSymbolicLink()) {
        snapshot.push([relativePath, `symlink:${metadata}:${readlinkSync(path)}`]);
      } else {
        const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
        snapshot.push([relativePath, `file:${metadata}:sha256:${digest}`]);
      }
    }
  };
  walk(root);
  return snapshot;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("fresh local packed-install and inactive-candidate journey", () => {
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
    const sourcePackagePath = join(source, "package.json");
    const sourcePackage = JSON.parse(readFileSync(sourcePackagePath, "utf8")) as Record<
      string,
      unknown
    >;
    sourcePackage.repository = NPM_REPOSITORY;
    writeFileSync(sourcePackagePath, `${JSON.stringify(sourcePackage, undefined, 2)}\n`);
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

    const installedWpm = result.executables.find(({ name }) => name === "wpm");
    expect(installedWpm).toBeDefined();
    if (installedWpm === undefined) throw new Error("accepted packed install did not expose wpm");
    const installedWorkspace = join(consumer, "accepted-authoring-workspace");
    const installedInvocation = resolveInstalledExecutableInvocation(
      process.platform,
      installedWpm.shimPath,
      [
        "init",
        "accepted-authoring-workspace",
        "--at",
        installedWorkspace,
        "--authoring-client",
        "codex",
        "--authoring-client",
        "claude-code",
      ],
    );
    const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
    const installedEnv = {
      ...process.env,
      [pathKey]: [
        dirname(installedInvocation.shimPath),
        process.env[pathKey] ?? process.env.PATH ?? "",
      ]
        .filter((entry) => entry !== "")
        .join(delimiter),
    };
    const installedInit = spawnSync(installedInvocation.executable, installedInvocation.args, {
      cwd: consumer,
      encoding: "utf8",
      timeout: 180_000,
      env: installedEnv,
    });
    expect({ status: installedInit.status, stderr: installedInit.stderr }).toEqual({
      status: 0,
      stderr: "",
    });
    const installedState = JSON.parse(
      readFileSync(join(installedWorkspace, ".wpm-authoring.json"), "utf8"),
    ) as {
      status: string;
      integrationVersion: string;
      selectedClients: string[];
    };
    expect(installedState).toMatchObject({
      status: "complete",
      integrationVersion: inspection.package.version,
      selectedClients: ["codex", "claude-code"],
    });
    const installedReceipt = JSON.parse(
      readFileSync(join(installedWorkspace, ".wpm-handoff.json"), "utf8"),
    ) as {
      status: string;
      workspaceRoot: string;
      integrationVersion: string;
      configuredClients: string[];
      clients: Array<{
        id: string;
        frontDoor: string;
        firstSkill: { name: string; invocation: string };
        verification: { command: string; args: string[]; workingDirectory: string };
      }>;
    };
    expect(installedReceipt).toMatchObject({
      status: "prepared",
      workspaceRoot: installedWorkspace,
      integrationVersion: inspection.package.version,
      configuredClients: ["codex", "claude-code"],
      clients: [
        {
          id: "codex",
          frontDoor: "AGENTS.md",
          firstSkill: { name: "wpm-author", invocation: "$wpm-author" },
        },
        {
          id: "claude-code",
          frontDoor: "CLAUDE.md",
          firstSkill: { name: "wpm-author", invocation: "/wpm-author" },
        },
      ],
    });
    for (const client of installedReceipt.clients) {
      expect(client.verification).toEqual({
        command: "wpm",
        args: ["-C", installedWorkspace, "authoring", "handoff", "verify", "--client", client.id],
        workingDirectory: installedWorkspace,
      });
      const verificationInvocation = resolveInstalledExecutableInvocation(
        process.platform,
        installedWpm.shimPath,
        client.verification.args,
      );
      const receivingVerification = spawnSync(
        verificationInvocation.executable,
        verificationInvocation.args,
        {
          cwd: installedWorkspace,
          encoding: "utf8",
          timeout: 180_000,
          env: installedEnv,
        },
      );
      expect(
        {
          client: client.id,
          status: receivingVerification.status,
          stderr: receivingVerification.stderr,
        },
        client.id,
      ).toEqual({ client: client.id, status: 0, stderr: "" });
      expect(receivingVerification.stdout).toContain("verified fresh-agent handoff");
      expect(receivingVerification.stdout).toContain(`${client.id}: valid`);
    }
    for (const nativeScope of [".agents", ".claude"]) {
      for (const skillName of WORKSPACE_SKILL_NAMES) {
        expect(
          readFileSync(
            join(installedWorkspace, nativeScope, "skills", skillName, "SKILL.md"),
            "utf8",
          ),
        ).toBe(
          readFileSync(
            join(result.environment.packageRoot, "agent-skills", skillName, "SKILL.md"),
            "utf8",
          ),
        );
      }
    }
    const installedAgents = readFileSync(join(installedWorkspace, "AGENTS.md"), "utf8");
    const installedClaude = readFileSync(join(installedWorkspace, "CLAUDE.md"), "utf8");
    expect(installedAgents).toContain("<!-- wpm:workspace-authoring:start -->");
    expect(installedAgents).toContain("$wpm-author");
    expect(installedClaude).toContain("<!-- wpm:workspace-authoring:start -->");
    expect(installedClaude).toContain("/wpm-author");
    expect(existsSync(source)).toBe(false);

    const installReportPath = join(root, "packed-install-report.json");
    const qualityPath = join(root, "quality-report.json");
    const notesPath = join(root, "release-notes.md");
    const candidateOutput = join(root, "candidate output");
    const externalStatePath = join(root, "external-state.json");
    const npmConfigPath = join(root, "isolated.npmrc");
    const npmCredentialPath = join(root, "isolated-npm-credentials.json");
    writeFileSync(installReportPath, String(verification.stdout));
    writeFileSync(
      qualityPath,
      `${JSON.stringify({
        status: "accepted",
        sourceRevision: inspection.sourceRevision,
        checks: [
          { name: "build", status: "passed" },
          { name: "lint", status: "passed" },
          { name: "package-boundary", status: "passed" },
          { name: "packed-install", status: "passed" },
          { name: "tests", status: "passed" },
          { name: "typecheck", status: "passed" },
        ],
      })}\n`,
    );
    writeFileSync(notesPath, "## Inactive candidate\n\n- Exact local package verification.\n");
    writeFileSync(
      externalStatePath,
      `${JSON.stringify({
        github: { tag: null, release: null, assets: [] },
        npm: { version: null, distTags: {} },
        trust: { github: "unconfigured", npm: "unconfigured" },
      })}\n`,
    );
    writeFileSync(npmConfigPath, "registry=https://registry.invalid.example/\n");
    writeFileSync(
      npmCredentialPath,
      `${JSON.stringify({ token: "sentinel-not-for-assessment" })}\n`,
    );
    const tagsBefore = git(REPO_ROOT, "tag", "--list");
    const externalStateBefore = readFileSync(externalStatePath);
    const npmConfigBefore = readFileSync(npmConfigPath);
    const npmCredentialBefore = readFileSync(npmCredentialPath);

    const candidateArgs = [
      "--inspection",
      reportPath,
      "--install",
      installReportPath,
      "--quality",
      qualityPath,
      "--tag",
      "v0.1.0",
      "--notes",
      notesPath,
      "--output",
      candidateOutput,
    ];
    const candidate = npm(
      REPO_ROOT,
      "run",
      "--silent",
      "package:prepare-candidate",
      "--",
      ...candidateArgs,
    );
    expect({ status: candidate.status, stderr: candidate.stderr }).toEqual({
      status: 0,
      stderr: "",
    });
    const prepared = JSON.parse(String(candidate.stdout)) as {
      status: string;
      outcome: string;
      candidateId: string;
      distribution: {
        status: string;
        activation: string;
        releaseEligibility: string;
        publicationCapable: boolean;
        unresolvedFacts: Array<{ key: string }>;
      };
      binding: {
        sourceRevision: string;
        package: { name: string; version: string };
        proposedTag: string;
        artifact: {
          path: string;
          size: number;
          digests: { sha256: string; sha512: string };
        };
      };
    };
    expect(prepared).toMatchObject({
      status: "prepared",
      outcome: "created",
      distribution: {
        status: "inactive",
        activation: "disabled",
        releaseEligibility: "ineligible",
        publicationCapable: false,
      },
      binding: {
        sourceRevision: inspection.sourceRevision,
        package: { name: inspection.package.name, version: inspection.package.version },
        proposedTag: "v0.1.0",
        artifact: { size: inspection.artifact.size },
      },
    });
    expect(prepared.distribution.unresolvedFacts.map(({ key }) => key)).toEqual(
      ACTIVATION_FACT_KEYS,
    );
    expect(prepared.binding.artifact.digests.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(prepared.binding.artifact.digests.sha512).toMatch(/^sha512:[a-f0-9]{128}$/);
    expect(readFileSync(join(candidateOutput, prepared.binding.artifact.path))).toEqual(
      readFileSync(inspection.artifact.path),
    );
    expect(readFileSync(join(candidateOutput, prepared.binding.artifact.path))).toEqual(
      readFileSync(result.artifact.frozenPath),
    );
    const candidateRecord = JSON.parse(
      readFileSync(join(candidateOutput, "candidate.json"), "utf8"),
    ) as {
      candidateId: string;
      distribution: { unresolvedFacts: Array<{ key: string }> };
      binding: {
        sourceRevision: string;
        proposedTag: string;
        package: { name: string; version: string };
        artifact: {
          filename: string;
          size: number;
          digests: { sha256: string; sha512: string };
        };
        evidence: Record<
          string,
          { path: string; status: string; digest: string; rawDigest: string }
        >;
        releaseNotes: { path: string; preview: string; digest: string };
      };
    };
    expect(candidateRecord.candidateId).toBe(prepared.candidateId);
    expect(candidateRecord.distribution.unresolvedFacts.map(({ key }) => key)).toEqual(
      ACTIVATION_FACT_KEYS,
    );
    for (const [name, sourcePath] of [
      ["inspection", reportPath],
      ["quality", qualityPath],
      ["packedInstall", installReportPath],
    ] as const) {
      const evidence = candidateRecord.binding.evidence[name];
      if (evidence === undefined) throw new Error(`missing persisted ${name} evidence`);
      expect(evidence).toMatchObject({ status: "accepted" });
      expect(evidence.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(evidence.rawDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(readFileSync(join(candidateOutput, evidence.path))).toEqual(readFileSync(sourcePath));
    }
    expect(readFileSync(join(candidateOutput, candidateRecord.binding.releaseNotes.path))).toEqual(
      readFileSync(notesPath),
    );
    expect(candidateRecord.binding.releaseNotes.preview).toBe(readFileSync(notesPath, "utf8"));
    expect(candidateRecord.binding.releaseNotes.digest).toMatch(/^sha256:[a-f0-9]{64}$/);

    const repeated = npm(
      REPO_ROOT,
      "run",
      "--silent",
      "package:prepare-candidate",
      "--",
      ...candidateArgs,
    );
    expect({ status: repeated.status, stderr: repeated.stderr }).toEqual({
      status: 0,
      stderr: "",
    });
    expect(JSON.parse(String(repeated.stdout))).toMatchObject({
      status: "prepared",
      outcome: "reused",
      candidateId: prepared.candidateId,
    });

    const changed = npm(
      REPO_ROOT,
      "run",
      "--silent",
      "package:prepare-candidate",
      "--",
      ...candidateArgs.map((value) => (value === "v0.1.0" ? "v0.1.1" : value)),
    );
    expect(changed.status).toBe(1);
    expect(JSON.parse(String(changed.stdout))).toMatchObject({
      status: "rejected",
      releaseEligibility: "ineligible",
      findings: [expect.objectContaining({ kind: "changed", field: "proposedTag" })],
    });

    const githubPolicyPath = join(root, "github-policy.json");
    const githubObservationPath = join(root, "github-observation.json");
    writeFileSync(
      githubPolicyPath,
      `${JSON.stringify({
        schemaVersion: 1,
        release: { prerelease: false, requireImmutable: true },
      })}\n`,
    );
    writeFileSync(
      githubObservationPath,
      `${JSON.stringify({ schemaVersion: 1, tags: [], releases: [] })}\n`,
    );
    const assessGithub = () => {
      const candidateBefore = directorySnapshot(candidateOutput);
      const policyBefore = readFileSync(githubPolicyPath);
      const observationBefore = readFileSync(githubObservationPath);
      const assessment = npm(
        REPO_ROOT,
        "run",
        "--silent",
        "package:assess-github",
        "--",
        "--candidate",
        candidateOutput,
        "--policy",
        githubPolicyPath,
        "--observation",
        githubObservationPath,
      );
      expect({ status: assessment.status, stderr: assessment.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(directorySnapshot(candidateOutput)).toEqual(candidateBefore);
      expect(readFileSync(githubPolicyPath)).toEqual(policyBefore);
      expect(readFileSync(githubObservationPath)).toEqual(observationBefore);
      expect(git(REPO_ROOT, "tag", "--list")).toBe(tagsBefore);
      expect(readFileSync(externalStatePath)).toEqual(externalStateBefore);
      return JSON.parse(String(assessment.stdout)) as {
        status: string;
        assessment: {
          activation: string;
          releaseEligibility: string;
          publicationCapable: boolean;
          unresolvedPolicyFacts: Array<{ key: string }>;
          matches: Array<{ object: string; state: string }>;
          missing: Array<{ object: string }>;
          conflicts: Array<{ object: string; field: string }>;
        };
      };
    };

    const absentAssessment = assessGithub();
    expect(absentAssessment).toMatchObject({
      status: "assessed",
      assessment: {
        activation: "disabled",
        releaseEligibility: "ineligible",
        publicationCapable: false,
      },
    });
    expect(absentAssessment.assessment.unresolvedPolicyFacts.map(({ key }) => key)).toEqual(
      ACTIVATION_FACT_KEYS,
    );
    expect(absentAssessment.assessment.missing.map(({ object }) => object)).toEqual([
      "tag",
      "release",
      "asset",
    ]);

    const matchingObservation = {
      schemaVersion: 1,
      tags: [
        {
          name: candidateRecord.binding.proposedTag,
          targetRevision: candidateRecord.binding.sourceRevision,
        },
      ],
      releases: [
        {
          id: 21,
          tagName: candidateRecord.binding.proposedTag,
          name: candidateRecord.binding.proposedTag,
          body: candidateRecord.binding.releaseNotes.preview,
          draft: true,
          prerelease: false,
          immutable: false,
          assets: [
            {
              id: 31,
              name: candidateRecord.binding.artifact.filename,
              state: "uploaded",
              size: candidateRecord.binding.artifact.size,
              digest: candidateRecord.binding.artifact.digests.sha256,
            },
          ],
        },
      ],
    };
    writeFileSync(githubObservationPath, `${JSON.stringify(matchingObservation)}\n`);
    const matchingAssessment = assessGithub();
    expect(
      matchingAssessment.assessment.matches.map(({ object, state }) => `${object}:${state}`),
    ).toEqual(["tag:matching", "release:matching-draft", "asset:matching"]);
    expect(matchingAssessment.assessment.missing).toEqual([]);
    expect(matchingAssessment.assessment.conflicts).toEqual([]);

    const conflictingObservation = structuredClone(matchingObservation);
    const conflictingTag = conflictingObservation.tags[0];
    const conflictingRelease = conflictingObservation.releases[0];
    const conflictingAsset = conflictingRelease?.assets[0];
    if (
      conflictingTag === undefined ||
      conflictingRelease === undefined ||
      conflictingAsset === undefined
    ) {
      throw new Error("matching GitHub observation fixture is incomplete");
    }
    conflictingTag.targetRevision = "f".repeat(40);
    conflictingRelease.name = "another release";
    conflictingRelease.body = "different release notes";
    conflictingAsset.digest = `sha256:${"0".repeat(64)}`;
    writeFileSync(githubObservationPath, `${JSON.stringify(conflictingObservation)}\n`);
    const conflictingAssessment = assessGithub();
    expect(
      conflictingAssessment.assessment.conflicts.map(({ object, field }) => `${object}.${field}`),
    ).toEqual(["tag.targetRevision", "release.bodyDigest", "release.name", "asset.digest"]);

    const repository = NPM_REPOSITORY;
    const trustedPublisher = {
      provider: "github-actions",
      repository: "example/work-package-manager",
      workflow: "release.yml",
      environment: null,
      allowedAction: "publish",
    };
    const npmPolicyPath = join(root, "npm-policy.json");
    const npmObservationPath = join(root, "npm-observation.json");
    writeFileSync(
      npmPolicyPath,
      `${JSON.stringify({
        schemaVersion: 1,
        publication: {
          coordinate: candidateRecord.binding.package.name,
          finalDistTag: "latest",
          repository,
          provenance: { required: true },
          authority: {
            bootstrap: { required: true },
            trustedPublisher,
          },
        },
      })}\n`,
    );
    writeFileSync(
      npmObservationPath,
      `${JSON.stringify({
        schemaVersion: 1,
        package: null,
        authority: {
          coordinate: candidateRecord.binding.package.name,
          coordinateControl: "unknown",
          bootstrap: "unknown",
          credentials: "not-observed",
          trustedPublisher: null,
        },
      })}\n`,
    );
    const assessNpm = () => {
      const candidateBefore = directorySnapshot(candidateOutput);
      const policyBefore = readFileSync(npmPolicyPath);
      const observationBefore = readFileSync(npmObservationPath);
      const assessment = npm(
        REPO_ROOT,
        "run",
        "--silent",
        "package:assess-npm",
        "--",
        "--candidate",
        candidateOutput,
        "--policy",
        npmPolicyPath,
        "--observation",
        npmObservationPath,
      );
      expect({ status: assessment.status, stderr: assessment.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(directorySnapshot(candidateOutput)).toEqual(candidateBefore);
      expect(readFileSync(npmPolicyPath)).toEqual(policyBefore);
      expect(readFileSync(npmObservationPath)).toEqual(observationBefore);
      expect(readFileSync(npmConfigPath)).toEqual(npmConfigBefore);
      expect(readFileSync(npmCredentialPath)).toEqual(npmCredentialBefore);
      expect(git(REPO_ROOT, "tag", "--list")).toBe(tagsBefore);
      expect(readFileSync(externalStatePath)).toEqual(externalStateBefore);
      return JSON.parse(String(assessment.stdout)) as {
        status: string;
        assessment: {
          activation: string;
          publicationCapable: boolean;
          matches: Array<{ object: string; state: string }>;
          missing: Array<{ object: string }>;
          manualAuthority: Array<{ object: string; expected: string; observed: string | null }>;
          conflicts: Array<{ object: string; field: string }>;
          safeActions: string[];
          prohibitedActions: string[];
        };
      };
    };

    const absentNpmAssessment = assessNpm();
    expect(absentNpmAssessment).toMatchObject({
      status: "assessed",
      assessment: {
        activation: "disabled",
        publicationCapable: false,
        safeActions: [],
      },
    });
    expect(absentNpmAssessment.assessment.missing.map(({ object }) => object)).toEqual([
      "version",
      "tag",
    ]);

    const candidateSha512 = candidateRecord.binding.artifact.digests.sha512;
    const candidateIntegrity = `sha512-${Buffer.from(
      candidateSha512.slice("sha512:".length),
      "hex",
    ).toString("base64")}`;
    const matchingNpmObservation = {
      schemaVersion: 1,
      package: {
        coordinate: candidateRecord.binding.package.name,
        versions: [
          {
            version: candidateRecord.binding.package.version,
            integrity: candidateIntegrity,
            repository,
            provenance: {
              status: "present",
              repository,
              sourceRevision: candidateRecord.binding.sourceRevision,
            },
          },
        ],
        distTags: [{ name: "latest", targetVersion: candidateRecord.binding.package.version }],
        owners: ["maintainer"],
      },
      authority: {
        coordinate: candidateRecord.binding.package.name,
        coordinateControl: "controlled",
        bootstrap: "available",
        credentials: "not-observed",
        trustedPublisher,
      },
    };
    writeFileSync(npmObservationPath, `${JSON.stringify(matchingNpmObservation)}\n`);
    const matchingNpmAssessment = assessNpm();
    expect(
      matchingNpmAssessment.assessment.matches.map(({ object, state }) => `${object}:${state}`),
    ).toEqual([
      "version:matching",
      "tag:matching",
      "authority:matching",
      "authority:matching",
      "authority:matching",
    ]);
    expect(matchingNpmAssessment.assessment.manualAuthority).toEqual([]);
    expect(matchingNpmAssessment.assessment.conflicts).toEqual([]);

    const manualTagObservation = structuredClone(matchingNpmObservation);
    manualTagObservation.package.distTags = [];
    writeFileSync(npmObservationPath, `${JSON.stringify(manualTagObservation)}\n`);
    const manualTagAssessment = assessNpm();
    expect(manualTagAssessment.assessment.conflicts).toEqual([]);
    expect(manualTagAssessment.assessment.manualAuthority).toEqual([
      expect.objectContaining({
        object: "tag",
        expected: candidateRecord.binding.package.version,
        observed: null,
      }),
    ]);
    expect(manualTagAssessment.assessment.safeActions).toEqual([]);

    const conflictingNpmObservation = structuredClone(matchingNpmObservation);
    const conflictingVersion = conflictingNpmObservation.package.versions[0];
    if (conflictingVersion === undefined) throw new Error("matching npm version is missing");
    conflictingVersion.integrity = `sha512-${Buffer.alloc(64, 0xff).toString("base64")}`;
    conflictingVersion.repository = {
      ...repository,
      url: "https://github.com/other/project.git",
    };
    conflictingVersion.provenance = { status: "absent" } as never;
    writeFileSync(npmObservationPath, `${JSON.stringify(conflictingNpmObservation)}\n`);
    const conflictingNpmAssessment = assessNpm();
    expect(
      conflictingNpmAssessment.assessment.conflicts.map(
        ({ object, field }) => `${object}.${field}`,
      ),
    ).toEqual(["version.integrity", "version.provenance", "version.repository"]);
    expect(conflictingNpmAssessment.assessment.safeActions).toEqual([]);
    expect(conflictingNpmAssessment.assessment.prohibitedActions).toEqual(
      expect.arrayContaining([
        "automatic-dist-tag-repair",
        "overwrite",
        "republication",
        "unpublish-and-republish",
        "version-reuse",
      ]),
    );

    const activation = {
      facts: Object.fromEntries(
        ACTIVATION_FACT_KEYS.map((key) => [
          key,
          {
            ...(key === "public-npm-coordinate"
              ? { proposedValue: candidateRecord.binding.package.name }
              : key.endsWith("evidence")
                ? {}
                : { proposedValue: `decision:${key}` }),
            authorization: { decision: "authorized", reference: `authorization:${key}` },
            ...(key === "public-npm-coordinate" || key.endsWith("evidence")
              ? { evidence: { kind: "controlled", reference: `evidence:${key}` } }
              : {}),
          },
        ]),
      ),
    };
    writeFileSync(
      githubPolicyPath,
      `${JSON.stringify({
        schemaVersion: 1,
        activation,
        release: { prerelease: false, requireImmutable: true },
      })}\n`,
    );
    writeFileSync(
      npmPolicyPath,
      `${JSON.stringify({
        schemaVersion: 1,
        activation,
        publication: {
          coordinate: candidateRecord.binding.package.name,
          finalDistTag: "latest",
          repository,
          provenance: { required: true },
          authority: { bootstrap: { required: true }, trustedPublisher },
        },
      })}\n`,
    );

    writeFileSync(
      githubObservationPath,
      `${JSON.stringify({ schemaVersion: 1, tags: [], releases: [] })}\n`,
    );
    const readyGithubAssessment = assessGithub();
    writeFileSync(
      npmObservationPath,
      `${JSON.stringify({
        schemaVersion: 1,
        package: null,
        authority: matchingNpmObservation.authority,
      })}\n`,
    );
    const readyNpmAssessment = assessNpm();
    writeFileSync(githubObservationPath, `${JSON.stringify(matchingObservation)}\n`);
    const completeGithubAssessment = assessGithub();
    writeFileSync(npmObservationPath, `${JSON.stringify(matchingNpmObservation)}\n`);
    const completeNpmAssessment = assessNpm();
    writeFileSync(npmObservationPath, `${JSON.stringify(manualTagObservation)}\n`);
    const manualNpmAssessment = assessNpm();
    writeFileSync(githubObservationPath, `${JSON.stringify(conflictingObservation)}\n`);
    const conflictingGithubAssessmentWithActivation = assessGithub();
    writeFileSync(npmObservationPath, `${JSON.stringify(conflictingNpmObservation)}\n`);
    const conflictingNpmAssessmentWithActivation = assessNpm();

    const convergencePolicyPath = join(root, "convergence-policy.json");
    const githubAssessmentPath = join(root, "github-assessment.json");
    const npmAssessmentPath = join(root, "npm-assessment.json");
    const classifyConvergence = (
      githubAssessment: unknown,
      npmAssessment: unknown,
      requiredBoundaries: readonly string[],
    ) => {
      writeFileSync(
        convergencePolicyPath,
        `${JSON.stringify({ schemaVersion: 1, activation, requiredBoundaries })}\n`,
      );
      writeFileSync(githubAssessmentPath, `${JSON.stringify(githubAssessment)}\n`);
      writeFileSync(npmAssessmentPath, `${JSON.stringify(npmAssessment)}\n`);
      const candidateBefore = directorySnapshot(candidateOutput);
      const policyBefore = readFileSync(convergencePolicyPath);
      const githubBefore = readFileSync(githubAssessmentPath);
      const npmBefore = readFileSync(npmAssessmentPath);
      const githubObservationBefore = readFileSync(githubObservationPath);
      const npmObservationBefore = readFileSync(npmObservationPath);
      const assessment = npm(
        REPO_ROOT,
        "run",
        "--silent",
        "package:classify-convergence",
        "--",
        "--candidate",
        candidateOutput,
        "--policy",
        convergencePolicyPath,
        "--github-assessment",
        githubAssessmentPath,
        "--npm-assessment",
        npmAssessmentPath,
      );
      expect({ status: assessment.status, stderr: assessment.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(directorySnapshot(candidateOutput)).toEqual(candidateBefore);
      expect(readFileSync(convergencePolicyPath)).toEqual(policyBefore);
      expect(readFileSync(githubAssessmentPath)).toEqual(githubBefore);
      expect(readFileSync(npmAssessmentPath)).toEqual(npmBefore);
      expect(readFileSync(githubObservationPath)).toEqual(githubObservationBefore);
      expect(readFileSync(npmObservationPath)).toEqual(npmObservationBefore);
      expect(readFileSync(npmConfigPath)).toEqual(npmConfigBefore);
      expect(readFileSync(npmCredentialPath)).toEqual(npmCredentialBefore);
      expect(git(REPO_ROOT, "tag", "--list")).toBe(tagsBefore);
      expect(readFileSync(externalStatePath)).toEqual(externalStateBefore);
      return JSON.parse(String(assessment.stdout)) as {
        status: string;
        result: {
          classification: string;
          requiredBoundaries: string[];
          completedBoundaries: string[];
          outstandingBoundaries: string[];
          conflicts: unknown[];
          blockers: unknown[];
          recovery: { safeActions: string[]; prohibitedActions: string[] };
        };
      };
    };
    const allBoundaries = [
      "github.tag",
      "github.release",
      "github.asset",
      "npm.version",
      "npm.final-dist-tag",
    ];

    const ready = classifyConvergence(readyGithubAssessment, readyNpmAssessment, allBoundaries);
    expect(ready).toMatchObject({
      status: "classified",
      result: { classification: "ready", completedBoundaries: [], conflicts: [], blockers: [] },
    });

    const resumable = classifyConvergence(
      completeGithubAssessment,
      readyNpmAssessment,
      allBoundaries,
    );
    expect(resumable.result).toMatchObject({
      classification: "resumable",
      completedBoundaries: ["github.tag", "github.release", "github.asset"],
      outstandingBoundaries: ["npm.version", "npm.final-dist-tag"],
      conflicts: [],
      blockers: [],
    });

    const complete = classifyConvergence(
      completeGithubAssessment,
      completeNpmAssessment,
      allBoundaries,
    );
    expect(complete.result).toMatchObject({
      classification: "complete",
      completedBoundaries: allBoundaries,
      outstandingBoundaries: [],
      conflicts: [],
      blockers: [],
    });

    const matching = classifyConvergence(readyGithubAssessment, manualNpmAssessment, [
      "npm.final-dist-tag",
    ]);
    expect(matching.result).toMatchObject({
      classification: "matching",
      completedBoundaries: [],
      outstandingBoundaries: ["npm.final-dist-tag"],
      conflicts: [],
      blockers: [],
    });

    const blocked = classifyConvergence(readyGithubAssessment, readyNpmAssessment, []);
    expect(blocked.result).toMatchObject({
      classification: "blocked",
      requiredBoundaries: [],
      conflicts: [],
      blockers: [expect.objectContaining({ kind: "missing-policy" })],
    });

    const conflicting = classifyConvergence(
      conflictingGithubAssessmentWithActivation,
      conflictingNpmAssessmentWithActivation,
      allBoundaries,
    );
    expect(conflicting.result.classification).toBe("conflicting");
    expect(conflicting.result.conflicts.length).toBeGreaterThanOrEqual(7);
    expect(conflicting.result.recovery.safeActions).toEqual([]);
    expect(conflicting.result.recovery.prohibitedActions).toEqual(
      expect.arrayContaining([
        "overwrite",
        "republication",
        "retagging",
        "rollback",
        "version-reuse",
      ]),
    );

    const corruptCandidateOutput = join(root, "corrupt candidate");
    cpSync(candidateOutput, corruptCandidateOutput, { recursive: true, preserveTimestamps: true });
    const corruptRecordPath = join(corruptCandidateOutput, "candidate.json");
    const corruptRecord = JSON.parse(readFileSync(corruptRecordPath, "utf8")) as {
      binding: { proposedTag: string };
    };
    corruptRecord.binding.proposedTag = "v0.1.1";
    writeFileSync(corruptRecordPath, `${JSON.stringify(corruptRecord, undefined, 2)}\n`);
    const corruptCandidateBefore = directorySnapshot(corruptCandidateOutput);
    const policyBeforeCorruptAssessment = readFileSync(githubPolicyPath);
    const observationBeforeCorruptAssessment = readFileSync(githubObservationPath);
    const corruptAssessment = npm(
      REPO_ROOT,
      "run",
      "--silent",
      "package:assess-github",
      "--",
      "--candidate",
      corruptCandidateOutput,
      "--policy",
      githubPolicyPath,
      "--observation",
      githubObservationPath,
    );
    expect({ status: corruptAssessment.status, stderr: corruptAssessment.stderr }).toEqual({
      status: 1,
      stderr: "",
    });
    expect(JSON.parse(String(corruptAssessment.stdout))).toMatchObject({
      status: "rejected",
      releaseEligibility: "ineligible",
      findings: expect.arrayContaining([
        expect.objectContaining({ field: "candidate.candidateId" }),
      ]),
    });
    expect(directorySnapshot(corruptCandidateOutput)).toEqual(corruptCandidateBefore);
    expect(readFileSync(githubPolicyPath)).toEqual(policyBeforeCorruptAssessment);
    expect(readFileSync(githubObservationPath)).toEqual(observationBeforeCorruptAssessment);
    expect(readFileSync(npmConfigPath)).toEqual(npmConfigBefore);
    expect(readFileSync(npmCredentialPath)).toEqual(npmCredentialBefore);
    expect(git(REPO_ROOT, "tag", "--list")).toBe(tagsBefore);
    expect(readFileSync(externalStatePath)).toEqual(externalStateBefore);

    expect(git(REPO_ROOT, "tag", "--list")).toBe(tagsBefore);
    expect(readFileSync(externalStatePath)).toEqual(externalStateBefore);
    expect(readFileSync(npmConfigPath)).toEqual(npmConfigBefore);
    expect(readFileSync(npmCredentialPath)).toEqual(npmCredentialBefore);
  }, 300_000);
});
