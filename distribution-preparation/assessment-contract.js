import { isDeepStrictEqual } from "node:util";
import { createCandidateIdentity } from "./candidate.js";
import { ACTIVATION_FACT_KEYS, assessInactiveDistribution } from "./readiness.js";

/** @typedef {Record<string, unknown>} JsonRecord */

/** @param {unknown} value @returns {value is JsonRecord} */
export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is string} */
export function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** @param {unknown} value @param {"sha256" | "sha512"} algorithm */
export function isDigest(value, algorithm) {
  const length = algorithm === "sha256" ? 64 : 128;
  return typeof value === "string" && new RegExp(`^${algorithm}:[a-f0-9]{${length}}$`).test(value);
}

/** @param {string} left @param {string} right */
export function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** @param {unknown} value @param {string} field */
export function requiredRecord(value, field) {
  if (!isRecord(value)) throw new TypeError(`${field} must be a JSON object`);
  return value;
}

/** @param {unknown} value @param {string} field */
export function requiredText(value, field) {
  if (!hasText(value)) throw new TypeError(`${field} must be a non-empty string`);
  return value;
}

/** @param {unknown} value @param {string} field */
export function requiredBoolean(value, field) {
  if (typeof value !== "boolean") throw new TypeError(`${field} must be a boolean`);
  return value;
}

/** @param {unknown} value @param {string} field */
export function requiredIdentity(value, field) {
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
export function assertKnownFields(value, supported, field) {
  const allowed = new Set(supported);
  for (const key of Object.keys(value).sort(compareText)) {
    if (!allowed.has(key)) throw new TypeError(`${field}.${key} is unsupported`);
  }
}

/** @param {unknown} value @param {string} field */
export function requiredRevision(value, field) {
  const revision = requiredText(value, field);
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision)) {
    throw new TypeError(`${field} must be a resolved hexadecimal Git revision`);
  }
  return revision;
}

/** @param {unknown} value @param {string} field */
export function requiredPortableFilename(value, field) {
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
export function observedNullableText(value, field) {
  if (value === null) return "";
  if (typeof value !== "string") throw new TypeError(`${field} must be a string or null`);
  return value;
}

/**
 * Validate and project only the exact Story 1.4 facts every channel assessment may consume. The local
 * commands first perform full persisted-candidate verification; this pure guard protects direct callers from
 * using a weaker, changed, or differently shaped record.
 *
 * @param {unknown} value
 */
export function normalizeExactCandidate(value) {
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

/** @param {unknown} value @param {string=} field */
export function normalizeActivation(value, field = "policy.activation") {
  if (value === undefined) return undefined;
  const activation = requiredRecord(value, field);
  assertKnownFields(activation, ["facts"], field);
  if (activation.facts === undefined) return {};
  const factsField = `${field}.facts`;
  const facts = requiredRecord(activation.facts, factsField);
  assertKnownFields(facts, ACTIVATION_FACT_KEYS, factsField);
  /**
   * @type {Record<string, {proposedValue?: string, authorization?: {decision: "authorized", reference: string}, evidence?: {kind: "available" | "controlled" | "occupied-incompatible" | "metadata-only", reference: string}}>}
   */
  const normalizedFacts = {};
  for (const key of ACTIVATION_FACT_KEYS) {
    if (!Object.hasOwn(facts, key)) continue;
    const factField = `${factsField}.${key}`;
    const fact = requiredRecord(facts[key], factField);
    assertKnownFields(fact, ["proposedValue", "authorization", "evidence"], factField);
    /**
     * @type {{proposedValue?: string, authorization?: {decision: "authorized", reference: string}, evidence?: {kind: "available" | "controlled" | "occupied-incompatible" | "metadata-only", reference: string}}}
     */
    const normalized = {};
    if (fact.proposedValue !== undefined) {
      normalized.proposedValue = requiredText(fact.proposedValue, `${factField}.proposedValue`);
    }
    if (fact.authorization !== undefined) {
      const authorization = requiredRecord(fact.authorization, `${factField}.authorization`);
      assertKnownFields(authorization, ["decision", "reference"], `${factField}.authorization`);
      if (authorization.decision !== "authorized") {
        throw new TypeError(`${factField}.authorization.decision must be authorized`);
      }
      normalized.authorization = {
        decision: "authorized",
        reference: requiredText(authorization.reference, `${factField}.authorization.reference`),
      };
    }
    if (fact.evidence !== undefined) {
      const evidence = requiredRecord(fact.evidence, `${factField}.evidence`);
      assertKnownFields(evidence, ["kind", "reference"], `${factField}.evidence`);
      const kind = requiredText(evidence.kind, `${factField}.evidence.kind`);
      if (!EVIDENCE_KINDS.has(kind)) {
        throw new TypeError(`${factField}.evidence.kind is unsupported`);
      }
      normalized.evidence = {
        kind: /** @type {"available" | "controlled" | "occupied-incompatible" | "metadata-only"} */ (
          kind
        ),
        reference: requiredText(evidence.reference, `${factField}.evidence.reference`),
      };
    }
    normalizedFacts[key] = normalized;
  }
  return { facts: normalizedFacts };
}
