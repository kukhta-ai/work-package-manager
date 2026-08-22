import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runConvergenceAssessment } from "../../../distribution-preparation/assess-convergence.js";
import { createCandidateIdentity } from "../../../distribution-preparation/candidate.js";
import { assessGitHubStaging } from "../../../distribution-preparation/github-assessment.js";
import { assessNpmPublication } from "../../../distribution-preparation/npm-assessment.js";
import {
  ACTIVATION_FACT_KEYS,
  assessInactiveDistribution,
} from "../../../distribution-preparation/readiness.js";

const REVISION = "a".repeat(40);
const SHA256 = `sha256:${"1".repeat(64)}`;
const SHA512 = `sha512:${"2".repeat(128)}`;
const NOTES = "## Candidate\n";
const REPOSITORY = {
  type: "git",
  url: "https://github.com/example/work-package-manager.git",
  directory: null,
};
const TRUSTED_PUBLISHER = {
  provider: "github-actions",
  repository: "example/work-package-manager",
  workflow: "release.yml",
  environment: null,
  allowedAction: "publish",
};

function sink() {
  return {
    text: "",
    write(chunk: string) {
      this.text += chunk;
    },
  };
}

function candidate() {
  const binding = {
    schemaVersion: 1 as const,
    package: { name: "wpm", version: "0.1.0" },
    proposedTag: "v0.1.0",
    sourceRevision: REVISION,
    artifact: {
      path: "artifact/wpm-0.1.0.tgz",
      filename: "wpm-0.1.0.tgz",
      size: 4096,
      digests: { sha256: SHA256, sha512: SHA512 },
    },
    evidence: {
      inspection: {
        path: "evidence/inspection.json",
        status: "accepted" as const,
        digest: `sha256:${"4".repeat(64)}`,
        rawDigest: `sha256:${"5".repeat(64)}`,
      },
      quality: {
        path: "evidence/quality.json",
        status: "accepted" as const,
        digest: `sha256:${"6".repeat(64)}`,
        rawDigest: `sha256:${"7".repeat(64)}`,
      },
      packedInstall: {
        path: "evidence/packed-install.json",
        status: "accepted" as const,
        digest: `sha256:${"8".repeat(64)}`,
        rawDigest: `sha256:${"9".repeat(64)}`,
      },
    },
    releaseNotes: {
      path: "release-notes.md",
      preview: NOTES,
      digest: `sha256:${createHash("sha256").update(NOTES).digest("hex")}`,
    },
  };
  return {
    schemaVersion: 1,
    status: "prepared",
    candidateId: createCandidateIdentity(binding),
    distribution: assessInactiveDistribution(undefined),
    binding,
  };
}

function completeActivation() {
  return {
    facts: Object.fromEntries(
      ACTIVATION_FACT_KEYS.map((key) => [
        key,
        {
          ...(key === "public-npm-coordinate"
            ? { proposedValue: "wpm" }
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
}

function absentAssessments(activation = completeActivation()) {
  const github = assessGitHubStaging({
    candidate: candidate(),
    policy: {
      schemaVersion: 1,
      activation,
      release: { prerelease: false, requireImmutable: true },
    },
    observation: { schemaVersion: 1, tags: [], releases: [] },
  });
  const npm = assessNpmPublication({
    candidate: candidate(),
    archive: {
      artifact: { size: 4096, digests: { sha256: SHA256, sha512: SHA512 } },
      package: { name: "wpm", version: "0.1.0", repository: REPOSITORY },
    },
    policy: {
      schemaVersion: 1,
      activation,
      publication: {
        coordinate: "wpm",
        finalDistTag: "latest",
        repository: REPOSITORY,
        provenance: { required: true },
        authority: {
          bootstrap: { required: true },
          trustedPublisher: TRUSTED_PUBLISHER,
        },
      },
    },
    observation: {
      schemaVersion: 1,
      package: null,
      authority: {
        coordinate: "wpm",
        coordinateControl: "controlled",
        bootstrap: "available",
        credentials: "not-observed",
        trustedPublisher: TRUSTED_PUBLISHER,
      },
    },
  });
  return { github, npm };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "wpm-convergence-command-"));
  const policyPath = join(root, "policy.json");
  const githubPath = join(root, "github-assessment.json");
  const npmPath = join(root, "npm-assessment.json");
  const activation = completeActivation();
  const assessments = absentAssessments(activation);
  writeFileSync(
    policyPath,
    `${JSON.stringify({
      schemaVersion: 1,
      activation,
      requiredBoundaries: [
        "github.tag",
        "github.release",
        "github.asset",
        "npm.version",
        "npm.final-dist-tag",
      ],
    })}\n`,
  );
  writeFileSync(
    githubPath,
    `${JSON.stringify({ status: "assessed", assessment: assessments.github })}\n`,
  );
  writeFileSync(
    npmPath,
    `${JSON.stringify({ status: "assessed", assessment: assessments.npm })}\n`,
  );
  return {
    root,
    candidateDirectory: join(root, "candidate"),
    policyPath,
    githubPath,
    npmPath,
  };
}

function args(input: ReturnType<typeof fixture>) {
  return [
    "--candidate",
    input.candidateDirectory,
    "--policy",
    input.policyPath,
    "--github-assessment",
    input.githubPath,
    "--npm-assessment",
    input.npmPath,
  ];
}

function snapshot(input: ReturnType<typeof fixture>) {
  return readdirSync(input.root)
    .sort()
    .map((name) => [name, readFileSync(join(input.root, name))] as const);
}

describe("local dual-channel convergence command", () => {
  it("returns usage failure for an incomplete invocation", () => {
    const out = sink();
    const err = sink();

    expect(runConvergenceAssessment(["--candidate", "only"], out, err)).toBe(2);
    expect(out.text).toBe("");
    expect(err.text).toMatch(
      /usage:.*--candidate.*--policy.*--github-assessment.*--npm-assessment/i,
    );
  });

  it("emits one structured ready classification and changes no input", () => {
    const input = fixture();
    const before = snapshot(input);
    const out = sink();

    expect(
      runConvergenceAssessment(args(input), out, sink(), {
        loadCandidate: () => ({ record: candidate(), findings: [] }),
      }),
    ).toBe(0);
    expect(JSON.parse(out.text)).toMatchObject({
      status: "classified",
      result: {
        classification: "ready",
        activation: "disabled",
        publicationCapable: false,
        conflicts: [],
        blockers: [],
      },
    });
    expect(snapshot(input)).toEqual(before);
  });

  it("aggregates independently invalid candidate, policy, GitHub, and npm inputs", () => {
    const input = fixture();
    writeFileSync(input.policyPath, `${JSON.stringify({ schemaVersion: 2 })}\n`);
    writeFileSync(input.githubPath, `${JSON.stringify({ status: "rejected", findings: [] })}\n`);
    writeFileSync(
      input.npmPath,
      `${JSON.stringify({ status: "assessed", assessment: { schemaVersion: 2 } })}\n`,
    );
    const before = snapshot(input);
    const out = sink();

    expect(
      runConvergenceAssessment(args(input), out, sink(), {
        loadCandidate: () => ({
          record: candidate(),
          findings: [{ kind: "changed", field: "artifact.digests.sha512", detail: "changed" }],
        }),
      }),
    ).toBe(1);
    expect(JSON.parse(out.text).findings.map(({ field }: { field: string }) => field)).toEqual([
      "artifact.digests.sha512",
      "github",
      "npm",
      "policy",
    ]);
    expect(snapshot(input)).toEqual(before);
  });

  it.runIf(process.platform !== "win32")(
    "rejects a symlinked assessment instead of following it",
    () => {
      const input = fixture();
      const link = join(input.root, "linked-github.json");
      symlinkSync(input.githubPath, link);
      const invocation = args(input);
      invocation[5] = link;
      const before = snapshot(input);
      const out = sink();

      expect(
        runConvergenceAssessment(invocation, out, sink(), {
          loadCandidate: () => ({ record: candidate(), findings: [] }),
        }),
      ).toBe(1);
      expect(JSON.parse(out.text)).toMatchObject({
        status: "rejected",
        findings: [
          expect.objectContaining({
            field: "github.file",
            detail: expect.stringMatching(/symbolic link/i),
          }),
        ],
      });
      expect(snapshot(input)).toEqual(before);
    },
  );

  it("rejects an assessment that is not valid UTF-8 and changes no input", () => {
    const input = fixture();
    writeFileSync(input.npmPath, Buffer.from([0xff, 0xfe, 0xfd]));
    const before = snapshot(input);
    const out = sink();

    expect(
      runConvergenceAssessment(args(input), out, sink(), {
        loadCandidate: () => ({ record: candidate(), findings: [] }),
      }),
    ).toBe(1);
    expect(JSON.parse(out.text)).toMatchObject({
      status: "rejected",
      findings: [
        expect.objectContaining({
          field: "npm.file",
          detail: expect.stringMatching(/UTF-8/i),
        }),
      ],
    });
    expect(snapshot(input)).toEqual(before);
  });
});
