import { createHash } from "node:crypto";
import {
  assertKnownFields,
  compareText,
  isDigest,
  normalizeActivation,
  normalizeExactCandidate,
  observedNullableText,
  requiredBoolean,
  requiredIdentity,
  requiredRecord,
  requiredRevision,
  requiredText,
} from "./assessment-contract.js";
import { assessInactiveDistribution } from "./readiness.js";

/** @typedef {Record<string, unknown>} JsonRecord */

/**
 * A stable collection of independently invalid assessment inputs. The CLI maps these issues to structured
 * exit-1 findings without collapsing a valid conflict assessment into a command failure.
 */
export class GitHubAssessmentInputError extends TypeError {
  /** @param {Array<{field: "candidate" | "policy" | "observation", detail: string}>} issues */
  constructor(issues) {
    super(issues.map(({ field, detail }) => `${field}: ${detail}`).join("; "));
    this.name = "GitHubAssessmentInputError";
    this.issues = issues;
  }
}

/**
 * @typedef GitHubAssessmentFinding
 * @property {"tag" | "release" | "asset"} object
 * @property {string} identity
 * @property {string} field
 * @property {string} detail
 * @property {unknown=} expected
 * @property {unknown=} observed
 */

/** @param {string} value */
function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

const OBJECT_ORDER = { tag: 0, release: 1, asset: 2 };

/**
 * @param {{object: "tag" | "release" | "asset", identity: string, field?: string}} left
 * @param {{object: "tag" | "release" | "asset", identity: string, field?: string}} right
 */
function compareObservation(left, right) {
  return (
    OBJECT_ORDER[left.object] - OBJECT_ORDER[right.object] ||
    compareText(left.identity, right.identity) ||
    compareText(left.field ?? "", right.field ?? "")
  );
}

/** @param {readonly string[]} identities */
function firstDuplicateIdentity(identities) {
  const counts = new Map();
  for (const identity of identities) counts.set(identity, (counts.get(identity) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([identity]) => identity)
    .sort(compareText)[0];
}

/** @param {unknown} value */
function normalizePolicy(value) {
  const policy = requiredRecord(value, "policy");
  assertKnownFields(policy, ["schemaVersion", "activation", "release"], "policy");
  if (policy.schemaVersion !== 1) throw new TypeError("policy.schemaVersion must be 1");
  const activation = normalizeActivation(policy.activation);
  const release =
    policy.release === undefined ? {} : requiredRecord(policy.release, "policy.release");
  assertKnownFields(release, ["prerelease", "requireImmutable"], "policy.release");
  if (release.prerelease !== undefined && typeof release.prerelease !== "boolean") {
    throw new TypeError("policy.release.prerelease must be a boolean when supplied");
  }
  if (release.requireImmutable !== undefined && typeof release.requireImmutable !== "boolean") {
    throw new TypeError("policy.release.requireImmutable must be a boolean when supplied");
  }
  return {
    activation,
    release: {
      prerelease: release.prerelease,
      requireImmutable: release.requireImmutable,
    },
  };
}

/** @param {unknown} value */
function normalizeObservation(value) {
  const observation = requiredRecord(value, "observation");
  assertKnownFields(observation, ["schemaVersion", "tags", "releases"], "observation");
  if (observation.schemaVersion !== 1) {
    throw new TypeError("observation.schemaVersion must be 1");
  }
  if (!Array.isArray(observation.tags)) throw new TypeError("observation.tags must be an array");
  if (!Array.isArray(observation.releases)) {
    throw new TypeError("observation.releases must be an array");
  }
  const tags = observation.tags.map((value, index) => {
    const tag = requiredRecord(value, `observation.tags[${index}]`);
    assertKnownFields(tag, ["name", "targetRevision"], `observation.tags[${index}]`);
    return {
      name: requiredText(tag.name, `observation.tags[${index}].name`),
      targetRevision: requiredRevision(
        tag.targetRevision,
        `observation.tags[${index}].targetRevision`,
      ),
    };
  });
  const releases = observation.releases.map((value, releaseIndex) => {
    const release = requiredRecord(value, `observation.releases[${releaseIndex}]`);
    assertKnownFields(
      release,
      ["id", "tagName", "name", "body", "draft", "prerelease", "immutable", "assets"],
      `observation.releases[${releaseIndex}]`,
    );
    if (!Array.isArray(release.assets)) {
      throw new TypeError(`observation.releases[${releaseIndex}].assets must be an array`);
    }
    const assets = release.assets.map((value, assetIndex) => {
      const asset = requiredRecord(
        value,
        `observation.releases[${releaseIndex}].assets[${assetIndex}]`,
      );
      assertKnownFields(
        asset,
        ["id", "name", "state", "size", "digest"],
        `observation.releases[${releaseIndex}].assets[${assetIndex}]`,
      );
      const size = asset.size;
      if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) {
        throw new TypeError(
          `observation.releases[${releaseIndex}].assets[${assetIndex}].size must be a non-negative safe integer`,
        );
      }
      if (asset.digest !== undefined && asset.digest !== null && typeof asset.digest !== "string") {
        throw new TypeError(
          `observation.releases[${releaseIndex}].assets[${assetIndex}].digest must be a string or null`,
        );
      }
      if (
        asset.digest !== undefined &&
        asset.digest !== null &&
        !isDigest(asset.digest, "sha256")
      ) {
        throw new TypeError(
          `observation.releases[${releaseIndex}].assets[${assetIndex}].digest must be a SHA-256 digest or null`,
        );
      }
      return {
        id: requiredIdentity(
          asset.id,
          `observation.releases[${releaseIndex}].assets[${assetIndex}].id`,
        ),
        name: requiredText(
          asset.name,
          `observation.releases[${releaseIndex}].assets[${assetIndex}].name`,
        ),
        state: requiredText(
          asset.state,
          `observation.releases[${releaseIndex}].assets[${assetIndex}].state`,
        ),
        size,
        digest: asset.digest ?? null,
      };
    });
    return {
      id: requiredIdentity(release.id, `observation.releases[${releaseIndex}].id`),
      tagName: requiredText(release.tagName, `observation.releases[${releaseIndex}].tagName`),
      name: observedNullableText(release.name, `observation.releases[${releaseIndex}].name`),
      body: observedNullableText(release.body, `observation.releases[${releaseIndex}].body`),
      draft: requiredBoolean(release.draft, `observation.releases[${releaseIndex}].draft`),
      prerelease: requiredBoolean(
        release.prerelease,
        `observation.releases[${releaseIndex}].prerelease`,
      ),
      immutable: requiredBoolean(
        release.immutable,
        `observation.releases[${releaseIndex}].immutable`,
      ),
      assets,
    };
  });
  const duplicateReleaseId = firstDuplicateIdentity(releases.map(({ id }) => id));
  if (duplicateReleaseId !== undefined) {
    throw new TypeError(
      `observation.releases contains duplicate locator identity ${duplicateReleaseId}`,
    );
  }
  const duplicateAsset = releases
    .flatMap((release) => {
      const id = firstDuplicateIdentity(release.assets.map((asset) => asset.id));
      return id === undefined ? [] : [{ release: `${release.tagName}:${release.id}`, id }];
    })
    .sort(
      (left, right) => compareText(left.release, right.release) || compareText(left.id, right.id),
    )[0];
  if (duplicateAsset !== undefined) {
    throw new TypeError(
      `observation assets contain duplicate locator identity ${duplicateAsset.id}`,
    );
  }
  tags.sort((left, right) => compareText(left.name, right.name));
  releases.sort(
    (left, right) => compareText(left.tagName, right.tagName) || compareText(left.id, right.id),
  );
  for (const release of releases) {
    release.assets.sort(
      (left, right) => compareText(left.name, right.name) || compareText(left.id, right.id),
    );
  }
  return { tags, releases };
}

/**
 * Assess one exact inactive candidate against declarative GitHub policy and read-only observation data. The
 * result is a deterministic report only: it exposes no mutation, credential, network, Git, or activation
 * capability and never recommends replacing compatible external work.
 *
 * @param {unknown} input
 */
export function assessGitHubStaging(input) {
  const request = requiredRecord(input, "input");
  assertKnownFields(request, ["candidate", "policy", "observation"], "input");
  /** @type {Array<{field: "candidate" | "policy" | "observation", detail: string}>} */
  const issues = [];
  /** @type {ReturnType<typeof normalizeExactCandidate> | undefined} */
  let candidate;
  /** @type {ReturnType<typeof normalizePolicy> | undefined} */
  let policy;
  /** @type {ReturnType<typeof normalizeObservation> | undefined} */
  let observation;
  /** @param {"candidate" | "policy" | "observation"} field @param {unknown} error */
  const recordIssue = (field, error) => {
    issues.push({
      field,
      detail: error instanceof Error ? error.message : String(error),
    });
  };
  try {
    candidate = normalizeExactCandidate(request.candidate);
  } catch (error) {
    recordIssue("candidate", error);
  }
  try {
    policy = normalizePolicy(request.policy);
  } catch (error) {
    recordIssue("policy", error);
  }
  try {
    observation = normalizeObservation(request.observation);
  } catch (error) {
    recordIssue("observation", error);
  }
  if (issues.length > 0) {
    throw new GitHubAssessmentInputError(
      /** @type {ConstructorParameters<typeof GitHubAssessmentInputError>[0]} */ (issues),
    );
  }
  if (candidate === undefined || policy === undefined || observation === undefined) {
    throw new Error("assessment input normalization completed without every required input");
  }
  const readiness = assessInactiveDistribution(
    /** @type {Parameters<typeof assessInactiveDistribution>[0]} */ (policy.activation),
  );
  const required = {
    tag: { name: candidate.proposedTag, targetRevision: candidate.sourceRevision },
    release: {
      tagName: candidate.proposedTag,
      name: candidate.proposedTag,
      body: candidate.notes.body,
      bodyDigest: candidate.notes.digest,
      draft: true,
      prerelease: policy.release.prerelease ?? null,
      requireImmutable: policy.release.requireImmutable ?? null,
    },
    assets: [candidate.artifact],
    checksums: candidate.artifact.digests,
    evidence: candidate.evidence,
  };

  /** @type {Array<{object: "tag" | "release" | "asset", identity: string, state: string}>} */
  const matches = [];
  /** @type {Array<{object: "tag" | "release" | "asset", identity: string, detail: string}>} */
  const missing = [];
  /** @type {GitHubAssessmentFinding[]} */
  const unverified = [];
  /** @type {GitHubAssessmentFinding[]} */
  const conflicts = [];

  const relevantTags = observation.tags.filter(({ name }) => name === required.tag.name);
  if (relevantTags.length === 0) {
    missing.push({ object: "tag", identity: required.tag.name, detail: "candidate tag is absent" });
  } else if (relevantTags.length > 1) {
    conflicts.push({
      object: "tag",
      identity: required.tag.name,
      field: "identity",
      detail: "observation contains multiple entries for the candidate tag",
      expected: 1,
      observed: relevantTags.length,
    });
  } else {
    const observedTag = relevantTags[0];
    if (observedTag === undefined) throw new Error("candidate tag observation disappeared");
    if (observedTag.targetRevision !== required.tag.targetRevision) {
      conflicts.push({
        object: "tag",
        identity: required.tag.name,
        field: "targetRevision",
        detail: "candidate tag targets a different revision",
        expected: required.tag.targetRevision,
        observed: observedTag.targetRevision,
      });
    } else {
      matches.push({ object: "tag", identity: required.tag.name, state: "matching" });
    }
  }

  const relevantReleases = observation.releases.filter(
    ({ tagName }) => tagName === required.release.tagName,
  );
  if (relevantReleases.length === 0) {
    missing.push({
      object: "release",
      identity: required.release.tagName,
      detail: "candidate draft or release is absent",
    });
    for (const asset of required.assets) {
      missing.push({ object: "asset", identity: asset.name, detail: "candidate asset is absent" });
    }
  } else if (relevantReleases.length > 1) {
    conflicts.push({
      object: "release",
      identity: required.release.tagName,
      field: "identity",
      detail: "observation contains multiple releases for the candidate tag",
      expected: 1,
      observed: relevantReleases.length,
    });
  } else {
    const release = relevantReleases[0];
    if (release === undefined) throw new Error("candidate release observation disappeared");
    const releaseConflictsBefore = conflicts.length;
    if (sha256(release.body) !== required.release.bodyDigest) {
      conflicts.push({
        object: "release",
        identity: release.id,
        field: "bodyDigest",
        detail: "release notes differ from the candidate notes",
        expected: required.release.bodyDigest,
        observed: sha256(release.body),
      });
    }
    if (release.name !== required.release.name) {
      conflicts.push({
        object: "release",
        identity: release.id,
        field: "name",
        detail: "release name differs from the candidate requirement",
        expected: required.release.name,
        observed: release.name,
      });
    }
    if (
      required.release.prerelease !== null &&
      release.prerelease !== required.release.prerelease
    ) {
      conflicts.push({
        object: "release",
        identity: release.id,
        field: "prerelease",
        detail: "release class differs from the supplied policy projection",
        expected: required.release.prerelease,
        observed: release.prerelease,
      });
    }
    if (!release.draft && required.release.requireImmutable === true && !release.immutable) {
      conflicts.push({
        object: "release",
        identity: release.id,
        field: "immutable",
        detail: "published release does not satisfy the supplied immutable-release requirement",
        expected: true,
        observed: release.immutable,
      });
    }
    if (conflicts.length === releaseConflictsBefore) {
      matches.push({
        object: "release",
        identity: release.id,
        state: release.draft ? "matching-draft" : "matching-published",
      });
    }

    for (const asset of required.assets) {
      const observedAssets = release.assets.filter(({ name }) => name === asset.name);
      if (observedAssets.length === 0) {
        missing.push({
          object: "asset",
          identity: asset.name,
          detail: "candidate asset is absent",
        });
        continue;
      }
      if (observedAssets.length > 1) {
        conflicts.push({
          object: "asset",
          identity: asset.name,
          field: "identity",
          detail: "release contains multiple assets with the candidate asset name",
          expected: 1,
          observed: observedAssets.length,
        });
        continue;
      }
      const observedAsset = observedAssets[0];
      if (observedAsset === undefined) {
        throw new Error("candidate asset observation disappeared");
      }
      const assetConflictsBefore = conflicts.length;
      const assetUnverifiedBefore = unverified.length;
      if (observedAsset.digest === null) {
        unverified.push({
          object: "asset",
          identity: asset.name,
          field: "digest",
          detail: "asset observation does not contain a SHA-256 digest",
          expected: asset.digests.sha256,
          observed: null,
        });
      } else if (observedAsset.digest !== asset.digests.sha256) {
        conflicts.push({
          object: "asset",
          identity: asset.name,
          field: "digest",
          detail: "asset SHA-256 differs from the candidate artifact",
          expected: asset.digests.sha256,
          observed: observedAsset.digest,
        });
      }
      if (observedAsset.size !== asset.size) {
        conflicts.push({
          object: "asset",
          identity: asset.name,
          field: "size",
          detail: "asset size differs from the candidate artifact",
          expected: asset.size,
          observed: observedAsset.size,
        });
      }
      if (observedAsset.state !== "uploaded") {
        conflicts.push({
          object: "asset",
          identity: asset.name,
          field: "state",
          detail: "asset is not in GitHub's uploaded state",
          expected: "uploaded",
          observed: observedAsset.state,
        });
      }
      if (
        conflicts.length === assetConflictsBefore &&
        unverified.length === assetUnverifiedBefore
      ) {
        matches.push({ object: "asset", identity: asset.name, state: "matching" });
      }
    }
  }

  matches.sort(compareObservation);
  missing.sort(compareObservation);
  unverified.sort(compareObservation);
  conflicts.sort(compareObservation);
  return {
    schemaVersion: 1,
    channel: "github",
    activation: readiness.activation,
    releaseEligibility: readiness.releaseEligibility,
    publicationCapable: readiness.publicationCapable,
    candidate: {
      candidateId: candidate.candidateId,
      package: candidate.package,
      proposedTag: candidate.proposedTag,
      sourceRevision: candidate.sourceRevision,
    },
    required,
    unresolvedPolicyFacts: readiness.unresolvedFacts,
    matches,
    missing,
    unverified,
    conflicts,
  };
}
