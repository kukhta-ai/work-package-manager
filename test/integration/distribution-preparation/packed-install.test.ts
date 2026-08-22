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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resolveNpmInvocation } from "../../../distribution-preparation/prepare-package.js";
import { ACTIVATION_FACT_KEYS } from "../../../distribution-preparation/readiness.js";

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

    const installReportPath = join(root, "packed-install-report.json");
    const qualityPath = join(root, "quality-report.json");
    const notesPath = join(root, "release-notes.md");
    const candidateOutput = join(root, "candidate output");
    const externalStatePath = join(root, "external-state.json");
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
    const tagsBefore = git(REPO_ROOT, "tag", "--list");
    const externalStateBefore = readFileSync(externalStatePath);

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
    expect(git(REPO_ROOT, "tag", "--list")).toBe(tagsBefore);
    expect(readFileSync(externalStatePath)).toEqual(externalStateBefore);

    expect(git(REPO_ROOT, "tag", "--list")).toBe(tagsBefore);
    expect(readFileSync(externalStatePath)).toEqual(externalStateBefore);
  }, 300_000);
});
