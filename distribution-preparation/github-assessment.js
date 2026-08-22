import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createCandidateIdentity } from "./candidate.js";
import { ACTIVATION_FACT_KEYS, assessInactiveDistribution } from "./readiness.js";

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

/** @param {unknown} value @returns {value is JsonRecord} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is string} */
function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** @param {unknown} value @param {"sha256" | "sha512"} algorithm */
function isDigest(value, algorithm) {
  const length = algorithm === "sha256" ? 64 : 128;
  return typeof value === "string" && new RegExp(`^${algorithm}:[a-f0-9]{${length}}$`).test(value);
}

/** @param {string} value */
function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

/** @param {string} left @param {string} right */
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
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

/** @param {unknown} value @param {string} field */
function requiredRecord(value, field) {
  if (!isRecord(value)) throw new TypeError(`${field} must be a JSON object`);
  return value;
}

/** @param {unknown} value @param {string} field */
function requiredText(value, field) {
  if (!hasText(value)) throw new TypeError(`${field} must be a non-empty string`);
  return value;
}

/** @param {unknown} value @param {string} field */
function requiredBoolean(value, field) {
  if (typeof value !== "boolean") throw new TypeError(`${field} must be a boolean`);
  return value;
}

/** @param {unknown} value @param {string} field */
function requiredIdentity(value, field) {
  if (
    (typeof value === "number" && (!Number.isSafeInteger(value) || value <= 0)) ||
    (typeof value === "string" && value.trim().length === 0) ||
    (typeof value !== "string" && typeof value !== "number")
  ) {
    throw new TypeError(`${field} must be a string or number identity`);
  }
  return String(value);
}

/** @param {JsonRecord} value @param {readonly string[]} supported @param {string} field */
function assertKnownFields(value, supported, field) {
  const allowed = new Set(supported);
  for (const key of Object.keys(value).sort(compareText)) {
    if (!allowed.has(key)) throw new TypeError(`${field}.${key} is unsupported`);
  }
}

/** @param {unknown} value @param {string} field */
function requiredRevision(value, field) {
  const revision = requiredText(value, field);
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision)) {
    throw new TypeError(`${field} must be a resolved hexadecimal Git revision`);
  }
  return revision;
}

/** @param {unknown} value @param {string} field */
function requiredPortableFilename(value, field) {
  const filename = requiredText(value, field);
  if (
    filename === "." ||
    filename === ".." ||
    /[<>:"/\\|?*]/.test(filename) ||
    /[. ]$/.test(filename) ||
    [...filename].some((character) => (character.codePointAt(0) ?? 0) < 32)
  ) {
    throw new TypeError(`${field} must be a portable single-segment filename`);
  }
  return filename;
}

/** @param {unknown} value @param {string} field */
function observedNullableText(value, field) {
  if (value === null) return "";
  if (typeof value !== "string") throw new TypeError(`${field} must be a string or null`);
  return value;
}

/**
 * Validate and project only the exact Story 1.4 facts this channel assessment may consume. The caller-facing
 * command first performs the full persisted-candidate verification; this pure guard prevents accidental use
 * of a weaker or differently shaped record by other callers.
 *
 * @param {unknown} value
 */
function normalizeCandidate(value) {
  const candidate = requiredRecord(value, "candidate");
  assertKnownFields(
    candidate,
    ["schemaVersion", "status", "candidateId", "distribution", "binding"],
    "candidate",
  );
  if (candidate.schemaVersion !== 1 || candidate.status !== "prepared") {
    throw new TypeError("candidate must be a prepared schema-version 1 record");
  }
  const candidateId = requiredText(candidate.candidateId, "candidate.candidateId");
  if (!isDigest(candidateId, "sha256")) {
    throw new TypeError("candidate.candidateId must be a SHA-256 identity");
  }
  const distribution = requiredRecord(candidate.distribution, "candidate.distribution");
  if (!isDeepStrictEqual(distribution, assessInactiveDistribution(undefined))) {
    throw new TypeError("candidate must retain its complete inactive distribution state");
  }
  const binding = requiredRecord(candidate.binding, "candidate.binding");
  assertKnownFields(
    binding,
    [
      "schemaVersion",
      "package",
      "proposedTag",
      "sourceRevision",
      "artifact",
      "evidence",
      "releaseNotes",
    ],
    "candidate.binding",
  );
  if (binding.schemaVersion !== 1) {
    throw new TypeError("candidate.binding.schemaVersion must be 1");
  }
  const packageIdentity = requiredRecord(binding.package, "candidate.binding.package");
  assertKnownFields(packageIdentity, ["name", "version"], "candidate.binding.package");
  const artifact = requiredRecord(binding.artifact, "candidate.binding.artifact");
  assertKnownFields(
    artifact,
    ["path", "filename", "size", "digests"],
    "candidate.binding.artifact",
  );
  const digests = requiredRecord(artifact.digests, "candidate.binding.artifact.digests");
  assertKnownFields(digests, ["sha256", "sha512"], "candidate.binding.artifact.digests");
  const evidence = requiredRecord(binding.evidence, "candidate.binding.evidence");
  assertKnownFields(
    evidence,
    ["inspection", "quality", "packedInstall"],
    "candidate.binding.evidence",
  );
  const notes = requiredRecord(binding.releaseNotes, "candidate.binding.releaseNotes");
  assertKnownFields(notes, ["path", "preview", "digest"], "candidate.binding.releaseNotes");
  const normalizedEvidence = Object.fromEntries(
    ["inspection", "quality", "packedInstall"].map((name) => {
      const entry = requiredRecord(evidence[name], `candidate.binding.evidence.${name}`);
      assertKnownFields(
        entry,
        ["path", "status", "digest", "rawDigest"],
        `candidate.binding.evidence.${name}`,
      );
      if (entry.status !== "accepted") {
        throw new TypeError(`candidate.binding.evidence.${name}.status must be accepted`);
      }
      const expectedPath =
        name === "packedInstall" ? "evidence/packed-install.json" : `evidence/${name}.json`;
      if (entry.path !== expectedPath) {
        throw new TypeError(`candidate.binding.evidence.${name}.path must be ${expectedPath}`);
      }
      const digest = requiredText(entry.digest, `candidate.binding.evidence.${name}.digest`);
      const rawDigest = requiredText(
        entry.rawDigest,
        `candidate.binding.evidence.${name}.rawDigest`,
      );
      if (!isDigest(digest, "sha256") || !isDigest(rawDigest, "sha256")) {
        throw new TypeError(`candidate.binding.evidence.${name} must contain SHA-256 digests`);
      }
      return [name, { digest, rawDigest }];
    }),
  );
  const size = artifact.size;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) {
    throw new TypeError("candidate.binding.artifact.size must be a positive safe integer");
  }
  const artifactSha256 = requiredText(digests.sha256, "candidate.binding.artifact.digests.sha256");
  const artifactSha512 = requiredText(digests.sha512, "candidate.binding.artifact.digests.sha512");
  const notesDigest = requiredText(notes.digest, "candidate.binding.releaseNotes.digest");
  if (
    !isDigest(artifactSha256, "sha256") ||
    !isDigest(artifactSha512, "sha512") ||
    !isDigest(notesDigest, "sha256")
  ) {
    throw new TypeError("candidate artifact and notes must retain their required digests");
  }
  const artifactFilename = requiredPortableFilename(
    artifact.filename,
    "candidate.binding.artifact.filename",
  );
  if (artifact.path !== `artifact/${artifactFilename}`) {
    throw new TypeError("candidate.binding.artifact.path must name its canonical artifact file");
  }
  if (notes.path !== "release-notes.md") {
    throw new TypeError("candidate.binding.releaseNotes.path must be release-notes.md");
  }
  if (
    createCandidateIdentity(
      /** @type {Parameters<typeof createCandidateIdentity>[0]} */ (binding),
    ) !== candidateId
  ) {
    throw new TypeError("candidate identity differs from its exact recorded binding");
  }
  return {
    candidateId,
    package: {
      name: requiredText(packageIdentity.name, "candidate.binding.package.name"),
      version: requiredText(packageIdentity.version, "candidate.binding.package.version"),
    },
    proposedTag: requiredText(binding.proposedTag, "candidate.binding.proposedTag"),
    sourceRevision: requiredRevision(binding.sourceRevision, "candidate.binding.sourceRevision"),
    artifact: {
      name: artifactFilename,
      size,
      digests: { sha256: artifactSha256, sha512: artifactSha512 },
    },
    notes: {
      body: requiredText(notes.preview, "candidate.binding.releaseNotes.preview"),
      digest: notesDigest,
    },
    evidence: {
      candidateId,
      inspection: normalizedEvidence.inspection,
      quality: normalizedEvidence.quality,
      packedInstall: normalizedEvidence.packedInstall,
      releaseNotes: notesDigest,
    },
  };
}

const EVIDENCE_KINDS = new Set([
  "available",
  "controlled",
  "occupied-incompatible",
  "metadata-only",
]);

/** @param {unknown} value */
function normalizeActivation(value) {
  if (value === undefined) return undefined;
  const activation = requiredRecord(value, "policy.activation");
  assertKnownFields(activation, ["facts"], "policy.activation");
  if (activation.facts === undefined) return {};
  const facts = requiredRecord(activation.facts, "policy.activation.facts");
  assertKnownFields(facts, ACTIVATION_FACT_KEYS, "policy.activation.facts");
  /**
   * @type {Record<string, {proposedValue?: string, authorization?: {decision: "authorized", reference: string}, evidence?: {kind: "available" | "controlled" | "occupied-incompatible" | "metadata-only", reference: string}}>}
   */
  const normalizedFacts = {};
  for (const key of ACTIVATION_FACT_KEYS) {
    if (!Object.hasOwn(facts, key)) continue;
    const field = `policy.activation.facts.${key}`;
    const fact = requiredRecord(facts[key], field);
    assertKnownFields(fact, ["proposedValue", "authorization", "evidence"], field);
    /**
     * @type {{proposedValue?: string, authorization?: {decision: "authorized", reference: string}, evidence?: {kind: "available" | "controlled" | "occupied-incompatible" | "metadata-only", reference: string}}}
     */
    const normalized = {};
    if (fact.proposedValue !== undefined) {
      normalized.proposedValue = requiredText(fact.proposedValue, `${field}.proposedValue`);
    }
    if (fact.authorization !== undefined) {
      const authorization = requiredRecord(fact.authorization, `${field}.authorization`);
      assertKnownFields(authorization, ["decision", "reference"], `${field}.authorization`);
      if (authorization.decision !== "authorized") {
        throw new TypeError(`${field}.authorization.decision must be authorized`);
      }
      normalized.authorization = {
        decision: "authorized",
        reference: requiredText(authorization.reference, `${field}.authorization.reference`),
      };
    }
    if (fact.evidence !== undefined) {
      const evidence = requiredRecord(fact.evidence, `${field}.evidence`);
      assertKnownFields(evidence, ["kind", "reference"], `${field}.evidence`);
      const kind = requiredText(evidence.kind, `${field}.evidence.kind`);
      if (!EVIDENCE_KINDS.has(kind)) {
        throw new TypeError(`${field}.evidence.kind is unsupported`);
      }
      normalized.evidence = {
        kind: /** @type {"available" | "controlled" | "occupied-incompatible" | "metadata-only"} */ (
          kind
        ),
        reference: requiredText(evidence.reference, `${field}.evidence.reference`),
      };
    }
    normalizedFacts[key] = normalized;
  }
  return { facts: normalizedFacts };
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
  /** @type {ReturnType<typeof normalizeCandidate> | undefined} */
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
    candidate = normalizeCandidate(request.candidate);
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
