import { mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runGitHubAssessment } from "../../../distribution-preparation/assess-github.js";
import { createCandidateIdentity } from "../../../distribution-preparation/candidate.js";
import { assessInactiveDistribution } from "../../../distribution-preparation/readiness.js";

const REVISION = "a".repeat(40);

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
      digests: {
        sha256: `sha256:${"1".repeat(64)}`,
        sha512: `sha512:${"2".repeat(128)}`,
      },
    },
    evidence: {
      inspection: {
        path: "evidence/inspection.json",
        status: "accepted" as const,
        digest: `sha256:${"3".repeat(64)}`,
        rawDigest: `sha256:${"4".repeat(64)}`,
      },
      quality: {
        path: "evidence/quality.json",
        status: "accepted" as const,
        digest: `sha256:${"5".repeat(64)}`,
        rawDigest: `sha256:${"6".repeat(64)}`,
      },
      packedInstall: {
        path: "evidence/packed-install.json",
        status: "accepted" as const,
        digest: `sha256:${"7".repeat(64)}`,
        rawDigest: `sha256:${"8".repeat(64)}`,
      },
    },
    releaseNotes: {
      path: "release-notes.md",
      preview: "notes",
      digest: "sha256:ab5aa97074c191d00669bf179e475f578c9a3c7a800175dadb20615aacc60c62",
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

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "wpm-github-command-"));
  const policy = join(root, "policy.json");
  const observation = join(root, "observation.json");
  writeFileSync(
    policy,
    `${JSON.stringify({ schemaVersion: 1, release: { prerelease: false } })}\n`,
  );
  writeFileSync(observation, `${JSON.stringify({ schemaVersion: 1, tags: [], releases: [] })}\n`);
  return { root, policy, observation, candidateDirectory: join(root, "candidate") };
}

function args(input: ReturnType<typeof fixture>): string[] {
  return [
    "--candidate",
    input.candidateDirectory,
    "--policy",
    input.policy,
    "--observation",
    input.observation,
  ];
}

function snapshot(input: ReturnType<typeof fixture>) {
  return readdirSync(input.root)
    .sort()
    .map((name) => [name, readFileSync(join(input.root, name))] as const);
}

describe("local GitHub staging assessment command", () => {
  it("returns usage failure for an incomplete invocation", () => {
    const out = sink();
    const err = sink();

    expect(runGitHubAssessment(["--candidate", "only"], out, err)).toBe(2);
    expect(out.text).toBe("");
    expect(err.text).toMatch(/usage:.*--candidate.*--policy.*--observation/i);
  });

  it("emits a structured valid no-write assessment", () => {
    const input = fixture();
    const before = snapshot(input);
    const out = sink();
    const err = sink();

    expect(
      runGitHubAssessment(args(input), out, err, {
        loadCandidate: () => ({ record: candidate(), findings: [] }),
      }),
    ).toBe(0);

    expect(err.text).toBe("");
    expect(JSON.parse(out.text)).toMatchObject({
      status: "assessed",
      assessment: {
        channel: "github",
        activation: "disabled",
        releaseEligibility: "ineligible",
        missing: [
          expect.objectContaining({ object: "tag" }),
          expect.objectContaining({ object: "release" }),
          expect.objectContaining({ object: "asset" }),
        ],
      },
    });
    expect(snapshot(input)).toEqual(before);
  });

  it("rejects malformed local JSON without changing any supplied input", () => {
    const input = fixture();
    writeFileSync(input.policy, "{not-json\n");
    const before = snapshot(input);
    const out = sink();

    expect(
      runGitHubAssessment(args(input), out, sink(), {
        loadCandidate: () => ({ record: candidate(), findings: [] }),
      }),
    ).toBe(1);
    expect(JSON.parse(out.text)).toMatchObject({
      status: "rejected",
      findings: [expect.objectContaining({ field: "policy.file" })],
    });
    expect(snapshot(input)).toEqual(before);
  });

  it("rejects non-UTF-8 policy bytes without changing any supplied input", () => {
    const input = fixture();
    writeFileSync(input.policy, Buffer.from([0xc3, 0x28]));
    const before = snapshot(input);
    const out = sink();

    expect(
      runGitHubAssessment(args(input), out, sink(), {
        loadCandidate: () => ({ record: candidate(), findings: [] }),
      }),
    ).toBe(1);
    expect(JSON.parse(out.text)).toMatchObject({
      status: "rejected",
      findings: [
        expect.objectContaining({
          field: "policy.file",
          detail: expect.stringMatching(/utf-8|encoded data/i),
        }),
      ],
    });
    expect(snapshot(input)).toEqual(before);
  });

  it("aggregates independently invalid policy and observation schemas without changing inputs", () => {
    const input = fixture();
    writeFileSync(input.policy, `${JSON.stringify({ schemaVersion: 2 })}\n`);
    writeFileSync(
      input.observation,
      `${JSON.stringify({ schemaVersion: 2, tags: [], releases: [] })}\n`,
    );
    const before = snapshot(input);
    const out = sink();

    expect(
      runGitHubAssessment(args(input), out, sink(), {
        loadCandidate: () => ({ record: candidate(), findings: [] }),
      }),
    ).toBe(1);
    expect(JSON.parse(out.text)).toMatchObject({
      status: "rejected",
    });
    expect(JSON.parse(out.text).findings.map(({ field }: { field: string }) => field)).toEqual([
      "observation",
      "policy",
    ]);
    expect(snapshot(input)).toEqual(before);
  });

  it.runIf(process.platform !== "win32")(
    "rejects a symlinked policy input instead of following it",
    () => {
      const input = fixture();
      const linkedPolicy = join(input.root, "linked-policy.json");
      symlinkSync(input.policy, linkedPolicy);
      const invocation = args(input);
      invocation[3] = linkedPolicy;
      const before = snapshot(input);
      const out = sink();

      expect(
        runGitHubAssessment(invocation, out, sink(), {
          loadCandidate: () => ({ record: candidate(), findings: [] }),
        }),
      ).toBe(1);
      expect(JSON.parse(out.text)).toMatchObject({
        status: "rejected",
        findings: [
          expect.objectContaining({
            field: "policy.file",
            detail: expect.stringMatching(/symbolic link/i),
          }),
        ],
      });
      expect(snapshot(input)).toEqual(before);
    },
  );

  it("rejects every persisted-candidate validation finding before assessment", () => {
    const input = fixture();
    const out = sink();

    expect(
      runGitHubAssessment(args(input), out, sink(), {
        loadCandidate: () => ({
          record: candidate(),
          findings: [
            { kind: "inconsistent", field: "artifact.digests.sha256", detail: "changed" },
            { kind: "invalid", field: "candidate.distribution", detail: "not inactive" },
          ],
        }),
      }),
    ).toBe(1);
    expect(JSON.parse(out.text).findings.map(({ field }: { field: string }) => field)).toEqual([
      "artifact.digests.sha256",
      "candidate.distribution",
    ]);
  });
});
