import { describe, expect, it } from "vitest";
import { createCandidateIdentity } from "../../../distribution-preparation/candidate.js";
import { assessNpmPublication } from "../../../distribution-preparation/npm-assessment.js";
import {
  ACTIVATION_FACT_KEYS,
  assessInactiveDistribution,
} from "../../../distribution-preparation/readiness.js";

const REVISION = "a".repeat(40);
const SHA256 = `sha256:${"1".repeat(64)}`;
const SHA512 = `sha512:${"2".repeat(128)}`;
const SRI = `sha512-${Buffer.from("2".repeat(128), "hex").toString("base64")}`;
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
      preview: "## Candidate\n",
      digest: `sha256:${"3".repeat(64)}`,
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

function exactArchive(repository: typeof REPOSITORY | null = REPOSITORY) {
  const artifact = candidate().binding.artifact;
  return {
    artifact: { size: artifact.size, digests: artifact.digests },
    package: { name: "wpm", version: "0.1.0", repository },
  };
}

const policy = {
  schemaVersion: 1,
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
};

function matchingVersion() {
  return {
    version: "0.1.0",
    integrity: SRI,
    repository: REPOSITORY,
    provenance: {
      status: "present",
      repository: REPOSITORY,
      sourceRevision: REVISION,
    },
  };
}

function matchingObservation() {
  return {
    schemaVersion: 1,
    package: {
      coordinate: "wpm",
      versions: [matchingVersion()],
      distTags: [{ name: "latest", targetVersion: "0.1.0" }],
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

describe("read-only npm publication assessment", () => {
  it("reports exact publication requirements and unresolved activation facts from absent state", () => {
    const result = assessNpmPublication({
      candidate: candidate(),
      archive: exactArchive(),
      policy,
      observation: {
        schemaVersion: 1,
        package: null,
        authority: {
          coordinate: "wpm",
          coordinateControl: "unknown",
          bootstrap: "unknown",
          credentials: "not-observed",
          trustedPublisher: null,
        },
      },
    });

    expect(result).toMatchObject({
      schemaVersion: 1,
      channel: "npm",
      activation: "disabled",
      releaseEligibility: "ineligible",
      publicationCapable: false,
      candidate: {
        package: { name: "wpm", version: "0.1.0", repository: REPOSITORY },
      },
      required: {
        coordinate: "wpm",
        candidateCoordinate: "wpm",
        candidateRepository: REPOSITORY,
        version: "0.1.0",
        artifact: {
          name: "wpm-0.1.0.tgz",
          size: 4096,
          digests: { sha256: SHA256, sha512: SHA512 },
          integrity: SRI,
        },
        finalDistTag: "latest",
        repository: REPOSITORY,
        provenance: { required: true, repository: REPOSITORY, sourceRevision: REVISION },
      },
      safeActions: [],
    });
    expect(result.required.authority).toEqual(policy.publication.authority);
    expect(result.unresolvedPolicyFacts).toHaveLength(8);
    expect(result.missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ object: "version", identity: "wpm@0.1.0" }),
        expect.objectContaining({ object: "tag", identity: "wpm@latest" }),
      ]),
    );
    expect(result.prohibitedActions).toEqual([
      "automatic-dist-tag-repair",
      "overwrite",
      "republication",
      "unpublish-and-republish",
      "version-reuse",
    ]);
  });

  it("recognizes matching immutable bytes, metadata, provenance, authority, and final tag", () => {
    const result = assessNpmPublication({
      candidate: candidate(),
      archive: exactArchive(),
      policy,
      observation: matchingObservation(),
    });

    expect(result.matches.map(({ object }) => object)).toEqual([
      "version",
      "tag",
      "authority",
      "authority",
      "authority",
    ]);
    expect(result.missing).toEqual([]);
    expect(result.unverified).toEqual([]);
    expect(result.manualAuthority).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.safeActions).toEqual([]);
  });

  it("does not claim immutable metadata matches while repository or provenance policy is unresolved", () => {
    const result = assessNpmPublication({
      candidate: candidate(),
      archive: exactArchive(),
      policy: {
        ...policy,
        publication: {
          ...policy.publication,
          repository: null,
          provenance: null,
        },
      },
      observation: matchingObservation(),
    });

    expect(result.missing.map(({ object, field }) => `${object}.${field}`)).toEqual(
      expect.arrayContaining(["policy.provenance", "policy.repository"]),
    );
    expect(result.matches.some(({ object }) => object === "version")).toBe(false);
    expect(result.matches.some(({ object }) => object === "tag")).toBe(false);
  });

  it("binds immutable repository expectations to metadata inside the exact archive", () => {
    const result = assessNpmPublication({
      candidate: candidate(),
      archive: exactArchive(null),
      policy,
      observation: matchingObservation(),
    });

    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          object: "version",
          field: "candidateRepository",
          expected: REPOSITORY,
          observed: null,
        }),
      ]),
    );
    expect(result.matches.some(({ object }) => object === "version")).toBe(false);
  });

  it.each([
    [
      "different artifact digest",
      () => {
        const archive = exactArchive();
        archive.artifact.digests = {
          ...archive.artifact.digests,
          sha512: `sha512:${"f".repeat(128)}`,
        };
        return archive;
      },
      /not bound to the exact candidate artifact/,
    ],
    [
      "unsupported package metadata field",
      () => ({ ...exactArchive(), package: { ...exactArchive().package, writePlan: [] } }),
      /archive\.package\.writePlan is unsupported/,
    ],
  ])("rejects an archive projection with %s", (_name, makeArchive, expected) => {
    expect(() =>
      assessNpmPublication({
        candidate: candidate(),
        archive: makeArchive(),
        policy,
        observation: matchingObservation(),
      }),
    ).toThrow(expected);
  });

  it.each([
    ["absent", []],
    ["different", [{ name: "latest", targetVersion: "0.0.9" }]],
  ])("keeps matching immutable version compatible when final tag is %s", (_name, distTags) => {
    const observation = matchingObservation();
    observation.package.distTags = distTags;

    const result = assessNpmPublication({
      candidate: candidate(),
      archive: exactArchive(),
      policy,
      observation,
    });

    expect(result.matches).toEqual(
      expect.arrayContaining([expect.objectContaining({ object: "version", state: "matching" })]),
    );
    expect(result.conflicts).toEqual([]);
    expect(result.manualAuthority).toEqual([
      expect.objectContaining({
        object: "tag",
        identity: "wpm@latest",
        expected: "0.1.0",
      }),
    ]);
    expect(result.safeActions).toEqual([]);
  });

  it("aggregates immutable artifact, repository, and provenance conflicts", () => {
    const observation = matchingObservation();
    observation.package.versions[0] = {
      ...matchingVersion(),
      integrity: `sha512-${Buffer.from("f".repeat(128), "hex").toString("base64")}`,
      repository: { ...REPOSITORY, url: "https://github.com/other/project.git" },
      provenance: { status: "absent" } as never,
    };

    const result = assessNpmPublication({
      candidate: candidate(),
      archive: exactArchive(),
      policy,
      observation,
    });

    expect(result.conflicts.map(({ object, field }) => `${object}.${field}`)).toEqual([
      "version.integrity",
      "version.provenance",
      "version.repository",
    ]);
    expect(result.matches.some(({ object }) => object === "version")).toBe(false);
    expect(result.safeActions).toEqual([]);
  });

  it("reports authority mismatches without recasting matching immutable bytes as republishable", () => {
    const observation = matchingObservation();
    observation.authority.coordinateControl = "uncontrolled";
    observation.authority.bootstrap = "unavailable";
    observation.authority.trustedPublisher = {
      ...TRUSTED_PUBLISHER,
      workflow: "other.yml",
    };

    const result = assessNpmPublication({
      candidate: candidate(),
      archive: exactArchive(),
      policy,
      observation,
    });

    expect(result.matches).toEqual(
      expect.arrayContaining([expect.objectContaining({ object: "version", state: "matching" })]),
    );
    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ object: "authority", field: "coordinateControl" }),
      ]),
    );
    expect(result.unverified).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ object: "authority", field: "bootstrap" }),
        expect.objectContaining({ object: "authority", field: "trustedPublisher" }),
      ]),
    );
    expect(result.safeActions).toEqual([]);
  });

  it("keeps unavailable provenance unverified instead of declaring an immutable mismatch", () => {
    const observation = matchingObservation();
    observation.package.versions[0] = {
      ...matchingVersion(),
      provenance: { status: "unknown" } as never,
    };

    const result = assessNpmPublication({
      candidate: candidate(),
      archive: exactArchive(),
      policy,
      observation,
    });

    expect(result.unverified).toEqual([
      expect.objectContaining({
        object: "version",
        field: "provenance",
        observed: "unknown",
      }),
    ]);
    expect(result.conflicts).toEqual([]);
    expect(result.matches.some(({ object }) => object === "version")).toBe(false);
    expect(result.safeActions).toEqual([]);
  });

  it("does not reuse authority evidence observed for another package coordinate", () => {
    const observation = matchingObservation();
    observation.authority.coordinate = "@other/wpm";

    const result = assessNpmPublication({
      candidate: candidate(),
      archive: exactArchive(),
      policy,
      observation,
    });

    expect(result.unverified).toEqual([
      expect.objectContaining({
        object: "authority",
        field: "coordinate",
        expected: "wpm",
        observed: "@other/wpm",
      }),
    ]);
    expect(result.conflicts).toEqual([]);
    expect(result.matches.filter(({ object }) => object === "authority")).toEqual([]);
    expect(result.safeActions).toEqual([]);
  });

  it("keeps a different trusted-publisher observation unresolved rather than making immutable state conflicting", () => {
    const observation = matchingObservation();
    observation.authority.trustedPublisher = {
      ...TRUSTED_PUBLISHER,
      workflow: "other.yml",
    };

    const result = assessNpmPublication({
      candidate: candidate(),
      archive: exactArchive(),
      policy,
      observation,
    });

    expect(result.unverified).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ object: "authority", field: "trustedPublisher" }),
      ]),
    );
    expect(result.conflicts).toEqual([]);
    expect(result.matches.some(({ object }) => object === "version")).toBe(true);
  });

  it("keeps explicitly unknown repository observation unresolved rather than declaring a mismatch", () => {
    const observation = matchingObservation();
    observation.package.versions[0] = {
      ...matchingVersion(),
      repository: { status: "unknown" },
    } as never;

    const result = assessNpmPublication({
      candidate: candidate(),
      archive: exactArchive(),
      policy,
      observation,
    });

    expect(result.unverified).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ object: "version", field: "repository", observed: "unknown" }),
      ]),
    );
    expect(result.conflicts).toEqual([]);
    expect(result.matches.some(({ object }) => object === "version")).toBe(false);
  });

  it("rejects a final dist-tag that npm would parse as a semantic-version range", () => {
    expect(() =>
      assessNpmPublication({
        candidate: candidate(),
        archive: exactArchive(),
        policy: {
          ...policy,
          publication: { ...policy.publication, finalDistTag: "v1.4" },
        },
        observation: matchingObservation(),
      }),
    ).toThrow(/finalDistTag.*semantic-version range/i);
  });

  it("rejects a proposed coordinate that differs from the name embedded in the exact candidate", () => {
    const result = assessNpmPublication({
      candidate: candidate(),
      archive: exactArchive(),
      policy: {
        ...policy,
        publication: { ...policy.publication, coordinate: "@example/wpm" },
      },
      observation: matchingObservation(),
    });

    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          object: "version",
          field: "coordinate",
          expected: "wpm",
          observed: "@example/wpm",
        }),
      ]),
    );
    expect(result.matches.some(({ object }) => object === "version")).toBe(false);
    expect(result.matches).toEqual([]);
    expect(result.safeActions).toEqual([]);
  });

  it("reports inconsistent coordinate declarations across publication and activation policy", () => {
    const result = assessNpmPublication({
      candidate: candidate(),
      archive: exactArchive(),
      policy: {
        ...policy,
        activation: {
          facts: {
            "public-npm-coordinate": { proposedValue: "@other/wpm" },
          },
        },
      },
      observation: matchingObservation(),
    });

    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          object: "policy",
          field: "coordinate",
          expected: "wpm",
          observed: "@other/wpm",
        }),
      ]),
    );
    expect(result.safeActions).toEqual([]);
  });

  it("treats coordinate-bound occupied activation evidence as an authority conflict", () => {
    const result = assessNpmPublication({
      candidate: candidate(),
      archive: exactArchive(),
      policy: {
        ...policy,
        activation: {
          facts: {
            "public-npm-coordinate": {
              proposedValue: "wpm",
              evidence: { kind: "occupied-incompatible", reference: "registry observation" },
            },
          },
        },
      },
      observation: matchingObservation(),
    });

    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          object: "authority",
          field: "coordinateAvailability",
          observed: "occupied-incompatible",
        }),
      ]),
    );
    expect(result.unresolvedPolicyFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "public-npm-coordinate",
          reasons: expect.arrayContaining(["missing-authorization", "occupied-incompatible"]),
        }),
      ]),
    );
  });

  it("remains inactive with complete activation input and stable under unordered owner input", () => {
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
    const left = matchingObservation();
    left.package.owners = ["zeta", "alpha"];
    const right = matchingObservation();
    right.package.owners = ["alpha", "zeta"];

    const first = assessNpmPublication({
      candidate: candidate(),
      archive: exactArchive(),
      policy: { ...policy, activation },
      observation: left,
    });
    const second = assessNpmPublication({
      candidate: candidate(),
      archive: exactArchive(),
      policy: { ...policy, activation },
      observation: right,
    });

    expect(first).toEqual(second);
    expect(first.unresolvedPolicyFacts).toEqual([]);
    expect(first).toMatchObject({ activation: "disabled", publicationCapable: false });
  });

  it("aggregates independently invalid candidate, policy, and observation schemas", () => {
    expect(() =>
      assessNpmPublication({
        candidate: { ...candidate(), candidateId: "bad" },
        archive: exactArchive(),
        policy: { schemaVersion: 2, publication: {} },
        observation: { schemaVersion: 2, package: [] },
      }),
    ).toThrow(/candidate:.*policy:.*observation:/);
  });

  it.each([
    [
      "duplicate immutable versions",
      () => {
        const observation = matchingObservation();
        observation.package.versions.push(matchingVersion());
        return observation;
      },
      /versions contains duplicate 0\.1\.0/,
    ],
    [
      "duplicate dist-tags",
      () => {
        const observation = matchingObservation();
        observation.package.distTags.push({ name: "latest", targetVersion: "0.0.9" });
        return observation;
      },
      /distTags contains duplicate latest/,
    ],
    [
      "duplicate owners",
      () => {
        const observation = matchingObservation();
        observation.package.owners.push("maintainer");
        return observation;
      },
      /owners contains duplicate maintainer/,
    ],
    [
      "non-canonical integrity",
      () => {
        const observation = matchingObservation();
        observation.package.versions[0] = { ...matchingVersion(), integrity: "sha512-Zm9v" };
        return observation;
      },
      /canonical 64-byte SHA-512 value/,
    ],
    [
      "unsupported nested registry field",
      () => {
        const observation = matchingObservation();
        return { ...observation, package: { ...observation.package, writePlan: [] } };
      },
      /observation\.package\.writePlan is unsupported/,
    ],
    [
      "semver-like observed dist-tag",
      () => {
        const observation = matchingObservation();
        observation.package.distTags[0] = { name: "v1.4", targetVersion: "0.1.0" };
        return observation;
      },
      /distTags\[0\]\.name.*semantic-version range/,
    ],
  ])("rejects ambiguous or open registry input: %s", (_name, makeObservation, expected) => {
    expect(() =>
      assessNpmPublication({
        candidate: candidate(),
        archive: exactArchive(),
        policy,
        observation: makeObservation(),
      }),
    ).toThrow(expected);
  });
});
