import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCandidateIdentity } from "../../../distribution-preparation/candidate.js";
import { classifyConvergentState } from "../../../distribution-preparation/convergence-assessment.js";
import { assessGitHubStaging } from "../../../distribution-preparation/github-assessment.js";
import { assessNpmPublication } from "../../../distribution-preparation/npm-assessment.js";
import {
  ACTIVATION_FACT_KEYS,
  assessInactiveDistribution,
} from "../../../distribution-preparation/readiness.js";

const REVISION = "a".repeat(40);
const SHA256 = `sha256:${"1".repeat(64)}`;
const SHA512 = `sha512:${"2".repeat(128)}`;
const SRI = `sha512-${Buffer.from("2".repeat(128), "hex").toString("base64")}`;
const NOTES = "## Candidate\n\n- Exact local package.\n";
const NOTES_DIGEST = `sha256:${createHash("sha256").update(NOTES).digest("hex")}`;
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
const ALL_BOUNDARIES = [
  "github.tag",
  "github.release",
  "github.asset",
  "npm.version",
  "npm.final-dist-tag",
] as const;

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
    releaseNotes: { path: "release-notes.md", preview: NOTES, digest: NOTES_DIGEST },
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
  return {
    artifact: { size: 4096, digests: { sha256: SHA256, sha512: SHA512 } },
    package: { name: "wpm", version: "0.1.0", repository: REPOSITORY },
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

function matchingGitHubObservation() {
  return {
    schemaVersion: 1,
    tags: [{ name: "v0.1.0", targetRevision: REVISION }],
    releases: [
      {
        id: 21,
        tagName: "v0.1.0",
        name: "v0.1.0",
        body: NOTES,
        draft: true,
        prerelease: false,
        immutable: false,
        assets: [
          {
            id: 31,
            name: "wpm-0.1.0.tgz",
            state: "uploaded",
            size: 4096,
            digest: SHA256,
          },
        ],
      },
    ],
  };
}

function githubAssessment(
  state: "absent" | "matching" | "conflicting",
  activation = completeActivation(),
) {
  const observation =
    state === "absent" ? { schemaVersion: 1, tags: [], releases: [] } : matchingGitHubObservation();
  if (state === "conflicting")
    observation.tags[0] = { name: "v0.1.0", targetRevision: "f".repeat(40) };
  return assessGitHubStaging({
    candidate: candidate(),
    policy: {
      schemaVersion: 1,
      activation,
      release: { prerelease: false, requireImmutable: true },
    },
    observation,
  });
}

function matchingNpmObservation(withTag = true) {
  return {
    schemaVersion: 1,
    package: {
      coordinate: "wpm",
      versions: [
        {
          version: "0.1.0",
          integrity: SRI,
          repository: REPOSITORY,
          provenance: { status: "present", repository: REPOSITORY, sourceRevision: REVISION },
        },
      ],
      distTags: withTag ? [{ name: "latest", targetVersion: "0.1.0" }] : [],
      owners: ["maintainer"],
    },
    authority: {
      coordinate: "wpm",
      coordinateControl: "controlled",
      bootstrap: "available",
      credentials: "not-observed",
      trustedPublisher: TRUSTED_PUBLISHER,
    },
  };
}

function npmAssessment(
  state: "absent" | "matching" | "manual" | "conflicting",
  activation = completeActivation(),
) {
  const observation =
    state === "absent"
      ? {
          schemaVersion: 1,
          package: null,
          authority: {
            coordinate: "wpm",
            coordinateControl: "controlled",
            bootstrap: "available",
            credentials: "not-observed",
            trustedPublisher: TRUSTED_PUBLISHER,
          },
        }
      : matchingNpmObservation(state !== "manual");
  if (state === "conflicting" && observation.package !== null) {
    const version = observation.package.versions[0];
    if (version === undefined) throw new Error("npm fixture has no candidate version");
    observation.package.versions[0] = {
      ...version,
      integrity: `sha512-${Buffer.alloc(64, 0xff).toString("base64")}`,
    };
  }
  return assessNpmPublication({
    candidate: candidate(),
    archive: exactArchive(),
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
    observation,
  });
}

function policy(
  requiredBoundaries: readonly string[] = ALL_BOUNDARIES,
  activation = completeActivation(),
) {
  return { schemaVersion: 1, activation, requiredBoundaries };
}

function classify(
  github: unknown,
  npm: unknown,
  requiredBoundaries: readonly string[] = ALL_BOUNDARIES,
  activation = completeActivation(),
) {
  return classifyConvergentState({
    candidate: candidate(),
    policy: policy(requiredBoundaries, activation),
    github,
    npm,
  });
}

describe("convergent dual-channel state", () => {
  it.each([
    ["ready", "absent", "absent", ALL_BOUNDARIES],
    ["complete", "matching", "matching", ALL_BOUNDARIES],
    ["resumable", "matching", "absent", ALL_BOUNDARIES],
    ["matching", "absent", "manual", ["npm.final-dist-tag"]],
  ] as const)("classifies %s through the single precedence chain", (expected, github, npm, boundaries) => {
    const result = classify(githubAssessment(github), npmAssessment(npm), boundaries);

    expect(result.classification).toBe(expected);
    expect(result.activation).toBe("disabled");
    expect(result.releaseEligibility).toBe("ineligible");
    expect(result.publicationCapable).toBe(false);
    expect(result.conflicts).toEqual([]);
    expect(result.blockers).toEqual([]);
  });

  it("keeps a candidate-matching immutable npm version compatible while its final tag awaits authority", () => {
    const result = classify(githubAssessment("absent"), npmAssessment("manual"), [
      "npm.version",
      "npm.final-dist-tag",
    ]);

    expect(result.classification).toBe("resumable");
    expect(result.completedBoundaries).toEqual(["npm.version"]);
    expect(result.outstandingBoundaries).toEqual(["npm.final-dist-tag"]);
    expect(result.compatibleEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "npm", object: "version", state: "matching" }),
        expect.objectContaining({ channel: "npm", object: "tag", state: "manual-authority" }),
      ]),
    );
    expect(result.conflicts).toEqual([]);
  });

  it("blocks an explicitly empty boundary policy and never calls it ready or complete", () => {
    const result = classify(githubAssessment("absent"), npmAssessment("absent"), []);

    expect(result.classification).toBe("blocked");
    expect(result.requiredBoundaries).toEqual([]);
    expect(result.blockers).toEqual([
      expect.objectContaining({ kind: "missing-policy", field: "requiredBoundaries" }),
    ]);
  });

  it("reports every unresolved activation fact as a blocker", () => {
    const activation = { facts: {} };
    const result = classify(
      githubAssessment("absent", activation),
      npmAssessment("absent", activation),
      ALL_BOUNDARIES,
      activation,
    );

    expect(result.classification).toBe("blocked");
    expect(result.blockers.filter(({ kind }) => kind === "activation-fact")).toHaveLength(8);
    expect(result.blockers.filter(({ kind }) => kind === "assessment-policy")).toEqual([]);
  });

  it("gives hard conflicts precedence over blockers and retains every affected object", () => {
    const result = classify(githubAssessment("conflicting"), npmAssessment("conflicting"), []);

    expect(result.classification).toBe("conflicting");
    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "github", object: "tag", field: "targetRevision" }),
        expect.objectContaining({ channel: "npm", object: "version", field: "integrity" }),
      ]),
    );
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "missing-policy", field: "requiredBoundaries" }),
      ]),
    );
    expect(result.recovery.safeActions).toEqual([]);
    expect(result.recovery.prohibitedActions).toEqual([
      "overwrite",
      "republication",
      "retagging",
      "rollback",
      "unpublish-and-republish",
      "version-reuse",
    ]);
  });

  it("distinguishes an absent assessment binding from contradictory candidate identities", () => {
    const missing = structuredClone(githubAssessment("absent")) as Record<string, unknown>;
    missing.candidate = null;
    const blocked = classify(missing, npmAssessment("absent"));
    expect(blocked.classification).toBe("blocked");
    expect(blocked.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "github", kind: "missing-binding" }),
      ]),
    );

    const different = structuredClone(githubAssessment("matching")) as {
      candidate: { candidateId: string; package: { version: string } };
      required: { assets: Array<{ digests: { sha256: string } }> };
    };
    different.candidate.candidateId = `sha256:${"f".repeat(64)}`;
    different.candidate.package.version = "9.9.9";
    const firstAsset = different.required.assets[0];
    if (firstAsset === undefined) throw new Error("GitHub fixture has no candidate asset");
    firstAsset.digests.sha256 = `sha256:${"e".repeat(64)}`;
    const conflicting = classify(different, npmAssessment("matching"));

    expect(conflicting.classification).toBe("conflicting");
    expect(conflicting.assessmentBindings).toMatchObject({
      github: { candidateId: `sha256:${"f".repeat(64)}`, version: "9.9.9" },
      npm: { candidateId: candidate().candidateId, version: "0.1.0" },
    });
    expect(conflicting.conflicts.map(({ channel, field }) => `${channel}.${field}`)).toEqual(
      expect.arrayContaining([
        "github.candidateId",
        "github.package.version",
        "github.artifact.digests.sha256",
      ]),
    );
  });

  it("blocks an explicitly absent channel assessment without inventing external state", () => {
    const result = classifyConvergentState({
      candidate: candidate(),
      policy: policy(),
      github: null,
      npm: npmAssessment("absent"),
    });

    expect(result.classification).toBe("blocked");
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "github",
          kind: "missing-binding",
          field: "assessment",
        }),
      ]),
    );
  });

  it("reports every candidate and exact-artifact mismatch from both channel assessments", () => {
    type MutableAssessment = {
      candidate: {
        candidateId: string;
        package: { name: string; version: string };
        proposedTag: string;
        sourceRevision: string;
      };
      required: {
        assets?: Array<{
          name: string;
          size: number;
          digests: { sha256: string; sha512: string };
        }>;
        artifact?: {
          name: string;
          size: number;
          digests: { sha256: string; sha512: string };
        };
      };
    };
    const github = structuredClone(githubAssessment("matching")) as MutableAssessment;
    const npm = structuredClone(npmAssessment("matching")) as MutableAssessment;
    const mutateBinding = (
      assessment: MutableAssessment,
      artifact: NonNullable<MutableAssessment["required"]["artifact"]>,
    ) => {
      assessment.candidate.candidateId = `sha256:${"f".repeat(64)}`;
      assessment.candidate.package.name = "other-package";
      assessment.candidate.package.version = "9.9.9";
      assessment.candidate.proposedTag = "v9.9.9";
      assessment.candidate.sourceRevision = "f".repeat(40);
      artifact.name = "other-package-9.9.9.tgz";
      artifact.size = 8192;
      artifact.digests.sha256 = `sha256:${"e".repeat(64)}`;
      artifact.digests.sha512 = `sha512:${"d".repeat(128)}`;
    };
    const githubArtifact = github.required.assets?.[0];
    const npmArtifact = npm.required.artifact;
    if (githubArtifact === undefined || npmArtifact === undefined) {
      throw new Error("channel fixture has no exact candidate artifact");
    }
    mutateBinding(github, githubArtifact);
    mutateBinding(npm, npmArtifact);

    const result = classify(github, npm);
    const conflicts = result.conflicts.map(({ channel, field }) => `${channel}.${field}`);
    const mismatchedFields = [
      "candidateId",
      "package.name",
      "package.version",
      "proposedTag",
      "sourceRevision",
      "artifact.name",
      "artifact.size",
      "artifact.digests.sha256",
      "artifact.digests.sha512",
    ];

    expect(result.classification).toBe("conflicting");
    expect(result.conflicts).toHaveLength(mismatchedFields.length * 2 + 2);
    expect(conflicts).toEqual(
      expect.arrayContaining([
        "github.required.checksums.sha256",
        "github.required.checksums.sha512",
      ]),
    );
    for (const channel of ["github", "npm"] as const) {
      expect(conflicts).toEqual(
        expect.arrayContaining(mismatchedFields.map((field) => `${channel}.${field}`)),
      );
    }
  });

  it("blocks when a required observation is unverified instead of guessing compatibility", () => {
    const npm = structuredClone(npmAssessment("matching"));
    npm.matches = npm.matches.filter(({ object }) => object !== "version" && object !== "tag");
    npm.unverified.push({
      object: "version",
      identity: "wpm@0.1.0",
      field: "integrity",
      detail: "registry observation does not contain SHA-512 integrity",
      expected: SRI,
      observed: null,
    });
    const result = classify(githubAssessment("absent"), npm, ["npm.version"]);

    expect(result.classification).toBe("blocked");
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "npm", boundary: "npm.version", kind: "observation" }),
      ]),
    );
  });

  it("normalizes boundary order and produces identical evidence on repeated evaluation", () => {
    const input = {
      candidate: candidate(),
      policy: policy([...ALL_BOUNDARIES].reverse()),
      github: githubAssessment("matching"),
      npm: npmAssessment("absent"),
    };
    const before = structuredClone(input);

    const first = classifyConvergentState(input);
    const second = classifyConvergentState(structuredClone(input));

    expect(input).toEqual(before);
    expect(first).toEqual(second);
    expect(first.requiredBoundaries).toEqual(ALL_BOUNDARIES);
    expect(first.completedBoundaries).toEqual(["github.tag", "github.release", "github.asset"]);
    expect(first.outstandingBoundaries).toEqual(["npm.version", "npm.final-dist-tag"]);
  });

  it.each([
    [["github.tag", "github.tag"], /duplicate github\.tag/],
    [["github.tag", "docker.image"], /unsupported boundary docker\.image/],
  ])("rejects ambiguous required-boundary policy %j", (requiredBoundaries, expected) => {
    expect(() =>
      classifyConvergentState({
        candidate: candidate(),
        policy: policy(requiredBoundaries),
        github: githubAssessment("absent"),
        npm: npmAssessment("absent"),
      }),
    ).toThrow(expected);
  });

  it("rejects unsupported nested channel projections instead of silently trusting them", () => {
    const github = structuredClone(githubAssessment("absent")) as {
      required: Record<string, unknown>;
    };
    github.required.unsupported = true;

    expect(() => classify(github, npmAssessment("absent"))).toThrow(
      /github\.required\.unsupported is unsupported/,
    );
  });

  it("rejects contradictory completion and absence evidence for the same boundary", () => {
    const github = structuredClone(githubAssessment("matching")) as {
      missing: Array<{ object: string; identity: string; detail: string }>;
    };
    github.missing.push({
      object: "tag",
      identity: "v0.1.0",
      detail: "candidate tag is absent",
    });

    expect(() => classify(github, npmAssessment("absent"), ["github.tag"])).toThrow(
      /github\.tag.*contradictory/i,
    );
  });

  it("rejects manual tag authority that is not backed by a matching immutable npm version", () => {
    const npm = structuredClone(npmAssessment("manual"));
    npm.matches = npm.matches.filter(({ object }) => object !== "version");

    expect(() => classify(githubAssessment("absent"), npm, ["npm.final-dist-tag"])).toThrow(
      /manual-authority.*npm\.version/i,
    );
  });

  it("rejects completed npm tag evidence that is not backed by a matching immutable version", () => {
    const npm = structuredClone(npmAssessment("matching"));
    npm.matches = npm.matches.filter(({ object }) => object !== "version");

    expect(() => classify(githubAssessment("absent"), npm, ["npm.final-dist-tag"])).toThrow(
      /npm tag match evidence requires a matching npm\.version/i,
    );
  });

  it("rejects match evidence that an upstream channel assessment cannot emit", () => {
    const npm = structuredClone(npmAssessment("matching"));
    const versionMatch = npm.matches.find(({ object }) => object === "version");
    if (versionMatch === undefined) throw new Error("npm fixture has no version match");
    versionMatch.field = "arbitrary";

    expect(() => classify(githubAssessment("absent"), npm, ["npm.version"])).toThrow(
      /npm\.matches.*field is unsupported/i,
    );
  });

  it("rejects impossible version completion while publication identity is unresolved", () => {
    const npm = structuredClone(npmAssessment("matching"));
    npm.required.coordinate = null;
    npm.missing.push({
      object: "policy",
      identity: "npm",
      field: "coordinate",
      detail: "public npm coordinate is unresolved",
    });

    expect(() => classify(githubAssessment("absent"), npm, ["npm.version"])).toThrow(
      /npm version match evidence requires resolved coordinate, repository, and provenance/i,
    );
  });

  it("rejects omitted missing-policy evidence for an unresolved npm requirement", () => {
    const npm = structuredClone(npmAssessment("matching"));
    npm.required.authority = null;

    expect(() => classify(githubAssessment("absent"), npm, ["npm.version"])).toThrow(
      /missing-policy evidence is inconsistent for authority/i,
    );
  });

  it("rejects npm authority findings that contradict the retained observation", () => {
    const npm = structuredClone(npmAssessment("matching"));
    npm.observedAuthority.coordinateControl = "unknown";

    expect(() => classify(githubAssessment("absent"), npm, ["npm.version"])).toThrow(
      /authority coordinateControl evidence is inconsistent with observation/i,
    );
  });

  it("preserves the reviewed rejection of semver-like npm dist-tags", () => {
    const npm = structuredClone(npmAssessment("matching"));
    npm.required.finalDistTag = "1.2.3";

    expect(() => classify(githubAssessment("absent"), npm, ["npm.final-dist-tag"])).toThrow(
      /non-semver distribution tag/i,
    );
  });

  it("blocks lower-precedence states when a non-required candidate object is still unverified", () => {
    const npm = structuredClone(npmAssessment("matching"));
    npm.matches = npm.matches.filter(({ object }) => object !== "version" && object !== "tag");
    npm.unverified.push({
      object: "version",
      identity: "wpm@0.1.0",
      field: "integrity",
      detail: "registry observation does not contain SHA-512 integrity",
      expected: SRI,
      observed: null,
    });

    const result = classify(githubAssessment("absent"), npm, ["github.tag"]);

    expect(result.classification).toBe("blocked");
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "npm", boundary: "npm.version" }),
      ]),
    );
  });

  it("normalizes equivalent unresolved-fact order without inventing assessment-policy blockers", () => {
    const activation = { facts: {} };
    const github = githubAssessment("absent", activation);
    const npm = npmAssessment("absent", activation);
    github.unresolvedPolicyFacts = [...github.unresolvedPolicyFacts].reverse();
    npm.unresolvedPolicyFacts = [...npm.unresolvedPolicyFacts].reverse();

    const result = classify(github, npm, ALL_BOUNDARIES, activation);

    expect(result.classification).toBe("blocked");
    expect(result.blockers.filter(({ kind }) => kind === "assessment-policy")).toEqual([]);
  });

  it("normalizes equivalent channel finding order to identical combined evidence", () => {
    const github = githubAssessment("matching");
    const npm = npmAssessment("matching");
    const expected = classify(github, npm);
    github.matches = [...github.matches].reverse();
    npm.matches = [...npm.matches].reverse();

    expect(classify(github, npm)).toEqual(expected);
  });

  it("conflicts on channel-required candidate projections that differ from the persisted binding", () => {
    const github = structuredClone(githubAssessment("matching"));
    const npm = structuredClone(npmAssessment("matching"));
    github.required.tag.name = "v9.9.9";
    github.required.tag.targetRevision = "f".repeat(40);
    github.required.checksums.sha256 = `sha256:${"e".repeat(64)}`;
    github.required.evidence.candidateId = `sha256:${"d".repeat(64)}`;
    npm.required.candidateCoordinate = "other-package";
    npm.required.version = "9.9.9";
    npm.required.artifact.integrity = `sha512-${Buffer.alloc(64, 0xff).toString("base64")}`;
    npm.required.evidence.candidateId = `sha256:${"c".repeat(64)}`;

    const result = classify(github, npm);
    const fields = result.conflicts.map(({ channel, field }) => `${channel}.${field}`);

    expect(result.classification).toBe("conflicting");
    expect(fields).toEqual(
      expect.arrayContaining([
        "github.required.tag.name",
        "github.required.tag.targetRevision",
        "github.required.checksums.sha256",
        "github.required.evidence",
        "npm.required.candidateCoordinate",
        "npm.required.version",
        "npm.required.artifact.integrity",
        "npm.required.evidence",
      ]),
    );
  });
});
