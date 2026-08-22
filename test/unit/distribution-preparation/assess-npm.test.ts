import { mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runNpmAssessment } from "../../../distribution-preparation/assess-npm.js";
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

function exactArchive() {
  const artifact = candidate().binding.artifact;
  return {
    artifact: { size: artifact.size, digests: artifact.digests },
    package: { name: "wpm", version: "0.1.0", repository: null },
  };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "wpm-npm-command-"));
  const policy = join(root, "policy.json");
  const observation = join(root, "observation.json");
  writeFileSync(
    policy,
    `${JSON.stringify({ schemaVersion: 1, publication: { coordinate: "wpm" } })}\n`,
  );
  writeFileSync(
    observation,
    `${JSON.stringify({
      schemaVersion: 1,
      package: null,
      authority: { coordinate: "wpm", credentials: "not-observed" },
    })}\n`,
  );
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

describe("local npm publication assessment command", () => {
  it("returns usage failure for an incomplete invocation", () => {
    const out = sink();
    const err = sink();

    expect(runNpmAssessment(["--candidate", "only"], out, err)).toBe(2);
    expect(out.text).toBe("");
    expect(err.text).toMatch(/usage:.*--candidate.*--policy.*--observation/i);
  });

  it("emits a structured valid no-write assessment and changes no input", () => {
    const input = fixture();
    const before = snapshot(input);
    const out = sink();

    expect(
      runNpmAssessment(args(input), out, sink(), {
        loadCandidate: () => ({ record: candidate(), archive: exactArchive(), findings: [] }),
      }),
    ).toBe(0);
    expect(JSON.parse(out.text)).toMatchObject({
      status: "assessed",
      assessment: {
        channel: "npm",
        activation: "disabled",
        publicationCapable: false,
        safeActions: [],
      },
    });
    expect(snapshot(input)).toEqual(before);
  });

  it("aggregates malformed policy, invalid observation, and candidate findings", () => {
    const input = fixture();
    writeFileSync(input.policy, "{bad\n");
    writeFileSync(input.observation, `${JSON.stringify({ schemaVersion: 2 })}\n`);
    const before = snapshot(input);
    const out = sink();

    expect(
      runNpmAssessment(args(input), out, sink(), {
        loadCandidate: () => ({
          record: candidate(),
          archive: exactArchive(),
          findings: [{ kind: "changed", field: "artifact.digests.sha512", detail: "changed" }],
        }),
      }),
    ).toBe(1);
    expect(JSON.parse(out.text).findings.map(({ field }: { field: string }) => field)).toEqual([
      "artifact.digests.sha512",
      "observation",
      "policy.file",
    ]);
    expect(snapshot(input)).toEqual(before);
  });

  it("aggregates independently invalid policy and observation schemas", () => {
    const input = fixture();
    writeFileSync(input.policy, `${JSON.stringify({ schemaVersion: 2, publication: {} })}\n`);
    writeFileSync(input.observation, `${JSON.stringify({ schemaVersion: 2, package: null })}\n`);
    const out = sink();

    expect(
      runNpmAssessment(args(input), out, sink(), {
        loadCandidate: () => ({ record: candidate(), archive: exactArchive(), findings: [] }),
      }),
    ).toBe(1);
    expect(JSON.parse(out.text).findings.map(({ field }: { field: string }) => field)).toEqual([
      "observation",
      "policy",
    ]);
  });

  it("rejects a candidate loader result that lacks exact archive metadata", () => {
    const input = fixture();
    const out = sink();

    expect(
      runNpmAssessment(args(input), out, sink(), {
        loadCandidate: () => ({ record: candidate(), findings: [] }),
      }),
    ).toBe(1);
    expect(JSON.parse(out.text)).toMatchObject({
      status: "rejected",
      findings: [
        expect.objectContaining({ field: "candidate", detail: expect.stringMatching(/archive/) }),
      ],
    });
  });

  it.runIf(process.platform !== "win32")(
    "rejects a symlinked observation instead of following it",
    () => {
      const input = fixture();
      const link = join(input.root, "linked-observation.json");
      symlinkSync(input.observation, link);
      const invocation = args(input);
      invocation[5] = link;
      const before = snapshot(input);
      const out = sink();

      expect(
        runNpmAssessment(invocation, out, sink(), {
          loadCandidate: () => ({ record: candidate(), archive: exactArchive(), findings: [] }),
        }),
      ).toBe(1);
      expect(JSON.parse(out.text)).toMatchObject({
        status: "rejected",
        findings: [
          expect.objectContaining({
            field: "observation.file",
            detail: expect.stringMatching(/symbolic link/i),
          }),
        ],
      });
      expect(snapshot(input)).toEqual(before);
    },
  );
});
