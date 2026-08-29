import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCandidateIdentity } from "../../../distribution-preparation/candidate.js";
import { assessGitHubStaging } from "../../../distribution-preparation/github-assessment.js";
import {
  ACTIVATION_FACT_KEYS,
  assessInactiveDistribution,
} from "../../../distribution-preparation/readiness.js";

const REVISION = "a".repeat(40);
const SHA256 = `sha256:${"1".repeat(64)}`;
const SHA512 = `sha512:${"2".repeat(128)}`;
const NOTES = "## Candidate\n\n- Exact local package.\n";
const NOTES_DIGEST = `sha256:${createHash("sha256").update(NOTES).digest("hex")}`;

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
      digest: NOTES_DIGEST,
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

const policy = {
  schemaVersion: 1,
  release: { prerelease: false, requireImmutable: true },
};

function matchingAsset() {
  return {
    id: 31,
    name: "wpm-0.1.0.tgz",
    state: "uploaded",
    size: 4096,
    digest: SHA256,
  };
}

function matchingRelease(draft = true) {
  return {
    id: 21,
    tagName: "v0.1.0",
    name: "v0.1.0",
    body: NOTES,
    draft,
    prerelease: false,
    immutable: !draft,
    assets: [matchingAsset()],
  };
}

function matchingObservation(draft = true) {
  return {
    schemaVersion: 1,
    tags: [{ name: "v0.1.0", targetRevision: REVISION }],
    releases: [matchingRelease(draft)],
  };
}

describe("read-only GitHub staging assessment", () => {
  it("reports the exact candidate requirements and every unresolved policy fact when state is absent", () => {
    const result = assessGitHubStaging({
      candidate: candidate(),
      policy,
      observation: { schemaVersion: 1, tags: [], releases: [] },
    });

    expect(result).toMatchObject({
      schemaVersion: 1,
      channel: "github",
      activation: "disabled",
      releaseEligibility: "ineligible",
      publicationCapable: false,
      candidate: {
        candidateId: candidate().candidateId,
        package: { name: "wpm", version: "0.1.0" },
        proposedTag: "v0.1.0",
        sourceRevision: REVISION,
      },
      required: {
        tag: { name: "v0.1.0", targetRevision: REVISION },
        release: {
          tagName: "v0.1.0",
          name: "v0.1.0",
          body: NOTES,
          bodyDigest: NOTES_DIGEST,
          draft: true,
          prerelease: false,
          requireImmutable: true,
        },
        assets: [
          {
            name: "wpm-0.1.0.tgz",
            size: 4096,
            digests: { sha256: SHA256, sha512: SHA512 },
          },
        ],
        checksums: { sha256: SHA256, sha512: SHA512 },
      },
    });
    expect(result.required.evidence).toEqual(
      expect.objectContaining({
        candidateId: candidate().candidateId,
        releaseNotes: NOTES_DIGEST,
        inspection: expect.objectContaining({ rawDigest: `sha256:${"5".repeat(64)}` }),
        quality: expect.objectContaining({ rawDigest: `sha256:${"7".repeat(64)}` }),
        packedInstall: expect.objectContaining({ rawDigest: `sha256:${"9".repeat(64)}` }),
      }),
    );
    expect(result.unresolvedPolicyFacts).toHaveLength(8);
    expect(result.missing.map(({ object }) => object)).toEqual(["tag", "release", "asset"]);
    expect(result.matches).toEqual([]);
    expect(result.unverified).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it("remains explicitly inactive when every activation-policy fact is synthetically complete", () => {
    const activation = {
      facts: Object.fromEntries(
        ACTIVATION_FACT_KEYS.map((key) => [
          key,
          {
            proposedValue: `proposal:${key}`,
            authorization: { decision: "authorized", reference: `authorization:${key}` },
            evidence: { kind: "controlled", reference: `evidence:${key}` },
          },
        ]),
      ),
    };

    const result = assessGitHubStaging({
      candidate: candidate(),
      policy: { ...policy, activation },
      observation: matchingObservation(),
    });

    expect(result.unresolvedPolicyFacts).toEqual([]);
    expect(result).toMatchObject({
      activation: "disabled",
      releaseEligibility: "ineligible",
      publicationCapable: false,
    });
  });

  it.each([
    ["draft", true],
    ["published release", false],
  ])("recognizes a matching %s without proposing duplicate work", (_name, draft) => {
    const result = assessGitHubStaging({
      candidate: candidate(),
      policy,
      observation: matchingObservation(draft),
    });

    expect(result.matches.map(({ object }) => object)).toEqual(["tag", "release", "asset"]);
    expect(result.matches.find(({ object }) => object === "release")).toMatchObject({
      state: draft ? "matching-draft" : "matching-published",
      identity: "21",
    });
    expect(result.missing).toEqual([]);
    expect(result.unverified).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it("recognizes partial compatible state and reports only the genuinely absent asset", () => {
    const observation = matchingObservation();
    const release = observation.releases[0];
    if (release === undefined) throw new Error("matching release fixture is missing");
    release.assets = [];

    const result = assessGitHubStaging({ candidate: candidate(), policy, observation });

    expect(result.matches.map(({ object }) => object)).toEqual(["tag", "release"]);
    expect(result.missing).toEqual([
      expect.objectContaining({ object: "asset", identity: "wpm-0.1.0.tgz" }),
    ]);
    expect(result.conflicts).toEqual([]);
  });

  it("aggregates tag, release, and exact-asset hard conflicts in stable field order", () => {
    const observation = matchingObservation(false);
    const tag = observation.tags[0];
    const release = observation.releases[0];
    if (tag === undefined || release === undefined) throw new Error("matching fixture is missing");
    tag.targetRevision = "b".repeat(40);
    release.name = "another release";
    release.body = "different notes";
    release.prerelease = true;
    release.immutable = false;
    release.assets[0] = {
      ...matchingAsset(),
      state: "starter",
      size: 1,
      digest: `sha256:${"f".repeat(64)}`,
    };

    const result = assessGitHubStaging({ candidate: candidate(), policy, observation });

    expect(result.conflicts.map(({ object, field }) => `${object}.${field}`)).toEqual([
      "tag.targetRevision",
      "release.bodyDigest",
      "release.immutable",
      "release.name",
      "release.prerelease",
      "asset.digest",
      "asset.size",
      "asset.state",
    ]);
    expect(result.missing).toEqual([]);
    expect(result.matches).toEqual([]);
  });

  it("reports missing asset proof as unverified rather than fabricating a match or incompatibility", () => {
    const observation = matchingObservation();
    const asset = observation.releases[0]?.assets[0];
    if (asset === undefined) throw new Error("matching asset fixture is missing");
    asset.digest = null as unknown as string;

    const result = assessGitHubStaging({ candidate: candidate(), policy, observation });

    expect(result.unverified).toEqual([
      expect.objectContaining({ object: "asset", field: "digest", identity: "wpm-0.1.0.tgz" }),
    ]);
    expect(result.matches.map(({ object }) => object)).toEqual(["tag", "release"]);
    expect(result.missing).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it("rejects a non-exact candidate identity, inactive result, or accepted-evidence status", () => {
    const wrongIdentity = candidate();
    wrongIdentity.candidateId = `sha256:${"c".repeat(64)}`;
    expect(() =>
      assessGitHubStaging({ candidate: wrongIdentity, policy, observation: matchingObservation() }),
    ).toThrow(/candidate.*identity/i);

    const incompleteReadiness = candidate();
    incompleteReadiness.distribution = {
      ...incompleteReadiness.distribution,
      unresolvedFacts: [],
    };
    expect(() =>
      assessGitHubStaging({
        candidate: incompleteReadiness,
        policy,
        observation: matchingObservation(),
      }),
    ).toThrow(/complete inactive distribution/i);

    const rejectedEvidence = candidate();
    (rejectedEvidence.binding.evidence.quality as { status: string }).status = "rejected";
    rejectedEvidence.candidateId = createCandidateIdentity(
      rejectedEvidence.binding as unknown as Parameters<typeof createCandidateIdentity>[0],
    );
    expect(() =>
      assessGitHubStaging({
        candidate: rejectedEvidence,
        policy,
        observation: matchingObservation(),
      }),
    ).toThrow(/quality.*accepted/i);

    const traversalFilename = candidate();
    traversalFilename.binding.artifact.filename = "../wpm-0.1.0.tgz";
    traversalFilename.binding.artifact.path = "artifact/../wpm-0.1.0.tgz";
    traversalFilename.candidateId = createCandidateIdentity(traversalFilename.binding);
    expect(() =>
      assessGitHubStaging({
        candidate: traversalFilename,
        policy,
        observation: matchingObservation(),
      }),
    ).toThrow(/portable single-segment filename/i);
  });

  it("rejects unknown policy or observation fields and malformed observed digests", () => {
    expect(() =>
      assessGitHubStaging({
        candidate: candidate(),
        policy: { ...policy, releaze: {} },
        observation: matchingObservation(),
      }),
    ).toThrow(/policy\.releaze.*unsupported/i);

    expect(() =>
      assessGitHubStaging({
        candidate: candidate(),
        policy: {
          ...policy,
          activation: { facts: { "unknown-activation-fact": {} } },
        },
        observation: matchingObservation(),
      }),
    ).toThrow(/unknown-activation-fact.*unsupported/i);

    const unknownObservation = matchingObservation();
    Object.assign(unknownObservation.releases[0] ?? {}, { body_html: "rendered" });
    expect(() =>
      assessGitHubStaging({ candidate: candidate(), policy, observation: unknownObservation }),
    ).toThrow(/body_html.*unsupported/i);

    const malformedDigest = matchingObservation();
    const asset = malformedDigest.releases[0]?.assets[0];
    if (asset === undefined) throw new Error("matching asset fixture is missing");
    asset.digest = "sha256:not-a-digest";
    expect(() =>
      assessGitHubStaging({ candidate: candidate(), policy, observation: malformedDigest }),
    ).toThrow(/digest.*SHA-256/i);

    const malformedRevision = matchingObservation();
    const tag = malformedRevision.tags[0];
    if (tag === undefined) throw new Error("matching tag fixture is missing");
    tag.targetRevision = "b".repeat(41);
    expect(() =>
      assessGitHubStaging({ candidate: candidate(), policy, observation: malformedRevision }),
    ).toThrow(/resolved hexadecimal Git revision/i);
  });

  it("treats GitHub's nullable release metadata as observed conflict data", () => {
    const observation = matchingObservation();
    const release = observation.releases[0];
    if (release === undefined) throw new Error("matching release fixture is missing");
    release.name = null as unknown as string;
    release.body = null as unknown as string;

    const result = assessGitHubStaging({ candidate: candidate(), policy, observation });

    expect(result.conflicts.map(({ object, field }) => `${object}.${field}`)).toEqual([
      "release.bodyDigest",
      "release.name",
    ]);
  });

  it("rejects duplicate observation locator identities without hiding relevant conflicts", () => {
    const observation = matchingObservation();
    observation.releases.push(
      { ...matchingRelease(), id: 30, tagName: "other-a" },
      { ...matchingRelease(), id: 30, tagName: "other-b" },
      { ...matchingRelease(), id: 21, tagName: "unrelated" },
    );
    const reversed = structuredClone(observation);
    reversed.releases.reverse();

    expect(() => assessGitHubStaging({ candidate: candidate(), policy, observation })).toThrow(
      /releases.*duplicate.*21/i,
    );
    expect(() =>
      assessGitHubStaging({ candidate: candidate(), policy, observation: reversed }),
    ).toThrow(/releases.*duplicate.*21/i);
  });

  it("identifies ambiguous duplicate tag, release, and same-name asset observations", () => {
    const duplicateTag = matchingObservation();
    const firstTag = duplicateTag.tags[0];
    if (firstTag === undefined) throw new Error("matching tag fixture is missing");
    duplicateTag.tags.push({ ...firstTag });
    expect(
      assessGitHubStaging({ candidate: candidate(), policy, observation: duplicateTag }).conflicts,
    ).toContainEqual(expect.objectContaining({ object: "tag", field: "identity" }));

    const duplicateRelease = matchingObservation();
    const firstRelease = duplicateRelease.releases[0];
    if (firstRelease === undefined) throw new Error("matching release fixture is missing");
    duplicateRelease.releases.push({ ...firstRelease, id: 22 });
    expect(
      assessGitHubStaging({ candidate: candidate(), policy, observation: duplicateRelease })
        .conflicts,
    ).toContainEqual(expect.objectContaining({ object: "release", field: "identity" }));

    const duplicateAsset = matchingObservation();
    duplicateAsset.releases[0]?.assets.push({ ...matchingAsset(), id: 32 });
    expect(
      assessGitHubStaging({ candidate: candidate(), policy, observation: duplicateAsset })
        .conflicts,
    ).toContainEqual(expect.objectContaining({ object: "asset", field: "identity" }));
  });

  it("is stable across caller object and unrelated observation order", () => {
    const first = assessGitHubStaging({
      candidate: candidate(),
      policy,
      observation: {
        schemaVersion: 1,
        tags: [
          { name: "unrelated", targetRevision: "d".repeat(40) },
          { name: "v0.1.0", targetRevision: REVISION },
        ],
        releases: [
          { ...matchingRelease(), assets: [{ ...matchingAsset() }] },
          { ...matchingRelease(), id: 99, tagName: "other", assets: [] },
        ],
      },
    });
    const second = assessGitHubStaging({
      observation: {
        releases: [
          { ...matchingRelease(), tagName: "other", id: 99, assets: [] },
          { ...matchingRelease(), assets: [{ ...matchingAsset() }] },
        ],
        tags: [
          { targetRevision: REVISION, name: "v0.1.0" },
          { targetRevision: "d".repeat(40), name: "unrelated" },
        ],
        schemaVersion: 1,
      },
      policy: { release: { requireImmutable: true, prerelease: false }, schemaVersion: 1 },
      candidate: candidate(),
    });

    expect(second).toEqual(first);
  });
});
