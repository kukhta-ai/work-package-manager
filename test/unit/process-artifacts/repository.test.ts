import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
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
import { afterEach, describe, expect, it } from "vitest";
import {
  checkProcessArtifacts,
  formatProcessArtifactResult,
} from "../../../scripts/check-process-artifacts.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const temporaryRepositories: string[] = [];

function runGit(repositoryRoot: string, arguments_: string[]): string {
  const result = spawnSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(result.stderr || `git ${arguments_.join(" ")} failed`);
  return result.stdout.trim();
}

function writeFixture(repositoryRoot: string, path: string, content: string): void {
  const absolutePath = join(repositoryRoot, path);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, content);
}

function createRepositoryFixture(): { root: string; seedRevision: string } {
  const root = mkdtempSync(join(tmpdir(), "wpm-process-artifacts-"));
  temporaryRepositories.push(root);
  runGit(root, ["init"]);
  runGit(root, ["config", "user.name", "Process Artifact Test"]);
  runGit(root, ["config", "user.email", "process-artifact-test@example.invalid"]);
  writeFixture(root, "seed.txt", "seed\n");
  runGit(root, ["add", "seed.txt"]);
  runGit(root, ["commit", "-m", "seed"]);
  const seedRevision = runGit(root, ["rev-parse", "HEAD"]);

  mkdirSync(join(root, ".bmad"), { recursive: true });
  mkdirSync(join(root, "research/evolution/schemas"), { recursive: true });
  copyFileSync(
    join(REPOSITORY_ROOT, ".bmad/artifact-policy.yaml"),
    join(root, ".bmad/artifact-policy.yaml"),
  );
  copyFileSync(
    join(REPOSITORY_ROOT, "research/evolution/schemas/evolution-record.schema.json"),
    join(root, "research/evolution/schemas/evolution-record.schema.json"),
  );
  copyFileSync(
    join(REPOSITORY_ROOT, "research/evolution/schemas/gate-receipt.schema.json"),
    join(root, "research/evolution/schemas/gate-receipt.schema.json"),
  );
  writeFixture(root, "PROCESS-ARTIFACTS.md", "# Fixture policy\n");
  writeFixture(
    root,
    ".bmad/sdlc-state.yaml",
    `schemaVersion: 1
phase: 7
phaseName: Handoff
branch: feature/example
epic: example
activeStory: null
reviewCycle: 0
activeChange: null
specialists: {}
gatesPending:
  - id: candidate-review
    description: Candidate review remains pending.
    receipt: research/evolution/gates/candidate.json
waivers: []
workingMemory:
  roots: [_bmad-output, Skills-Results]
  durableEpisode: research/evolution/records/episode.yaml
designRevisionLoaded: ${seedRevision}
lastUpdated: "2026-08-26T00:00:00Z"
`,
  );
  writeFixture(
    root,
    "research/evolution/records/episode.yaml",
    `schemaVersion: 1
id: episode
title: Fixture episode
episodeStatus: closed
maturity: make-it-exist-first
architectureStatus: provisional
purpose: Exercise the process-artifact checker.
baselineRevision: ${seedRevision}
preCleanupRevision: ${seedRevision}
canonicalTruth: [PROCESS-ARTIFACTS.md]
observations:
  - statement: The fixture exists.
    evidence: [seed.txt]
decisions:
  - decision: Keep the fixture compact.
    rationale: It exercises the durable boundary.
    evidence: [seed.txt]
waivers: []
residualRisks: []
candidateDestinations: []
archive:
  status: not-configured
  rawEvidenceDisposition: cleaned-after-distillation
updatedAt: "2026-08-26T00:00:00Z"
`,
  );
  writeFixture(
    root,
    "research/evolution/gates/candidate.json",
    `${JSON.stringify(
      {
        schemaVersion: 1,
        id: "candidate",
        episodeId: "episode",
        candidate: {
          revision: null,
          baselineRevision: seedRevision,
          branch: "feature/example",
          pullRequest: null,
        },
        verdict: "pending",
        checks: [{ name: "human-review", status: "pending", evidence: [] }],
        waivers: [],
        residualRisks: ["Human review remains pending."],
        preCleanupRevision: seedRevision,
        updatedAt: "2026-08-26T00:00:00Z",
      },
      null,
      2,
    )}\n`,
  );
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "fixture"]);
  return { root, seedRevision };
}

afterEach(() => {
  while (temporaryRepositories.length > 0) {
    rmSync(temporaryRepositories.pop() as string, { recursive: true, force: true });
  }
});

function statusSnapshot(): string {
  const result = spawnSync("git", ["status", "--porcelain=v1", "-z"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(result.stderr || "git status failed");
  return result.stdout;
}

describe("repository process-artifact boundary", () => {
  it("passes on the tracked repository and never mutates the worktree", () => {
    const before = statusSnapshot();
    const result = checkProcessArtifacts({ repositoryRoot: REPOSITORY_ROOT });
    const after = statusSnapshot();

    expect(formatProcessArtifactResult(result)).toContain("process-artifact policy: PASS");
    expect(result.violations).toEqual([]);
    expect(after).toBe(before);
  });

  it("requires every durable file to be tracked and index-aligned in strict mode", () => {
    const { root } = createRepositoryFixture();
    expect(checkProcessArtifacts({ repositoryRoot: root, requireTrackedEvidence: true }).ok).toBe(
      true,
    );

    runGit(root, ["rm", "--cached", "research/evolution/gates/candidate.json"]);
    let result = checkProcessArtifacts({ repositoryRoot: root, requireTrackedEvidence: true });
    expect(result.violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "untracked-durable-evidence" })]),
    );

    runGit(root, ["add", "research/evolution/gates/candidate.json"]);
    appendFileSync(join(root, "research/evolution/gates/candidate.json"), "\n");
    result = checkProcessArtifacts({ repositoryRoot: root, requireTrackedEvidence: true });
    expect(result.violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "unstaged-durable-evidence" })]),
    );
  });

  it("rejects wrong extensions, oversized evidence, and symlinks under durable roots", () => {
    const { root } = createRepositoryFixture();
    writeFixture(root, "research/evolution/records/transcript.txt", "raw transcript\n");
    writeFixture(root, "research/evolution/records/oversized.yaml", "x".repeat(32_769));
    if (process.platform !== "win32") {
      symlinkSync("episode.yaml", join(root, "research/evolution/records/alias.yaml"));
    }

    const codes = checkProcessArtifacts({ repositoryRoot: root }).violations.map(
      ({ code }) => code,
    );
    expect(codes).toContain("unexpected-evidence-file");
    expect(codes).toContain("evidence-too-large");
    if (process.platform !== "win32") expect(codes).toContain("symlink-evidence");
  });

  it("rejects unsupported committed schema rules and nonexistent Git revisions", () => {
    const { root, seedRevision } = createRepositoryFixture();
    const schemaPath = join(root, "research/evolution/schemas/evolution-record.schema.json");
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as Record<string, unknown>;
    schema.maximum = 2;
    writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);
    let result = checkProcessArtifacts({ repositoryRoot: root });
    expect(result.violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid-evidence-schema" })]),
    );

    delete schema.maximum;
    writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);
    const recordPath = join(root, "research/evolution/records/episode.yaml");
    writeFileSync(
      recordPath,
      readFileSync(recordPath, "utf8").replace(seedRevision, "f".repeat(40)),
    );
    result = checkProcessArtifacts({ repositoryRoot: root });
    expect(result.violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "unknown-git-revision" })]),
    );
  });

  it("rejects dangling compact-state pointers when durable evidence disappears", () => {
    const { root } = createRepositoryFixture();
    rmSync(join(root, "research/evolution/records/episode.yaml"));

    const codes = checkProcessArtifacts({ repositoryRoot: root }).violations.map(
      ({ code }) => code,
    );
    expect(codes).toContain("insufficient-durable-evidence");
    expect(codes).toContain("missing-state-evidence");
  });

  it("does not permit pass verdicts to conceal waived or evidence-free checks", () => {
    const { root, seedRevision } = createRepositoryFixture();
    const gatePath = join(root, "research/evolution/gates/candidate.json");
    const gate = JSON.parse(readFileSync(gatePath, "utf8")) as Record<string, unknown>;
    gate.candidate = {
      revision: seedRevision,
      baselineRevision: seedRevision,
      branch: "feature/example",
      pullRequest: null,
    };
    gate.verdict = "pass";
    gate.checks = [{ name: "parity", status: "waived", evidence: [] }];
    writeFileSync(gatePath, `${JSON.stringify(gate, null, 2)}\n`);

    const codes = checkProcessArtifacts({ repositoryRoot: root }).violations.map(
      ({ code }) => code,
    );
    expect(codes).toContain("invalid-pass-verdict");
    expect(codes).toContain("unbound-waived-check");
    expect(codes).toContain("missing-terminal-evidence");
  });
});
