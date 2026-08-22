import { isDeepStrictEqual } from "node:util";
import semver from "semver";
import {
  assertKnownFields,
  compareText,
  isDigest,
  isRecord,
  normalizeActivation,
  normalizeExactCandidate,
  requiredBoolean,
  requiredRecord,
  requiredRevision,
  requiredText,
} from "./assessment-contract.js";
import { ACTIVATION_FACT_KEYS, assessInactiveDistribution } from "./readiness.js";

/** @typedef {Record<string, unknown>} JsonRecord */

/** Stable release boundaries that a caller may explicitly require for combined classification. */
export const CONVERGENCE_BOUNDARIES = Object.freeze([
  "github.tag",
  "github.release",
  "github.asset",
  "npm.version",
  "npm.final-dist-tag",
]);

const BOUNDARY_ORDER = new Map(CONVERGENCE_BOUNDARIES.map((boundary, index) => [boundary, index]));
const CHANNEL_ORDER = { combined: 0, github: 1, npm: 2 };
const RECOVERY_PROHIBITIONS = Object.freeze([
  "overwrite",
  "republication",
  "retagging",
  "rollback",
  "unpublish-and-republish",
  "version-reuse",
]);
const NPM_PROHIBITED_ACTIONS = Object.freeze([
  "automatic-dist-tag-repair",
  "overwrite",
  "republication",
  "unpublish-and-republish",
  "version-reuse",
]);
/** @type {ReadonlyMap<string, number>} */
const ACTIVATION_FACT_ORDER = new Map(ACTIVATION_FACT_KEYS.map((key, index) => [key, index]));

/** A stable collection of independently invalid combined-assessment inputs. */
export class ConvergenceAssessmentInputError extends TypeError {
  /** @param {Array<{field: "candidate" | "policy" | "github" | "npm", detail: string}>} issues */
  constructor(issues) {
    super(issues.map(({ field, detail }) => `${field}: ${detail}`).join("; "));
    this.name = "ConvergenceAssessmentInputError";
    this.issues = issues;
  }
}

/** @param {string} left @param {string} right */
function compareBoundary(left, right) {
  return (
    (BOUNDARY_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (BOUNDARY_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER) || compareText(left, right)
  );
}

/**
 * @param {{channel: "combined" | "github" | "npm", kind?: string, boundary?: string, object?: string, identity?: string, field: string, detail?: string, expected?: unknown, observed?: unknown}} left
 * @param {{channel: "combined" | "github" | "npm", kind?: string, boundary?: string, object?: string, identity?: string, field: string, detail?: string, expected?: unknown, observed?: unknown}} right
 */
function compareFinding(left, right) {
  return (
    CHANNEL_ORDER[left.channel] - CHANNEL_ORDER[right.channel] ||
    compareText(left.kind ?? "", right.kind ?? "") ||
    compareText(left.boundary ?? "", right.boundary ?? "") ||
    compareText(left.object ?? "", right.object ?? "") ||
    compareText(left.identity ?? "", right.identity ?? "") ||
    compareText(left.field, right.field) ||
    compareText(left.detail ?? "", right.detail ?? "") ||
    compareText(JSON.stringify(left.expected ?? null), JSON.stringify(right.expected ?? null)) ||
    compareText(JSON.stringify(left.observed ?? null), JSON.stringify(right.observed ?? null))
  );
}

/** @param {unknown} value @param {string} field @returns {unknown} */
function canonicalJson(value, field) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalJson(entry, `${field}[${index}]`));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareText)
        .map((key) => [key, canonicalJson(value[key], `${field}.${key}`)]),
    );
  }
  throw new TypeError(`${field} must contain only JSON values`);
}

/** @param {unknown[]} values @param {string} field */
function orderedJsonValues(values, field) {
  return values
    .map((value) => ({ value, key: JSON.stringify(canonicalJson(value, field)) }))
    .sort((left, right) => compareText(left.key, right.key))
    .map(({ value }) => value);
}

/** @param {unknown} value @param {string} field */
function nullableBoolean(value, field) {
  return value === undefined || value === null ? null : requiredBoolean(value, field);
}

/** @param {unknown} value @param {string} field */
function optionalText(value, field) {
  return value === undefined || value === null ? null : requiredText(value, field);
}

/** @param {unknown} value @param {string} field */
function optionalDistTag(value, field) {
  if (value === undefined || value === null) return null;
  const tag = requiredText(value, field);
  if (/\s/u.test(tag) || semver.validRange(tag) !== null) {
    throw new TypeError(`${field} must be a non-semver distribution tag without whitespace`);
  }
  return tag;
}

/** @param {unknown} value @param {string} field @param {"sha256" | "sha512"} algorithm */
function optionalDigest(value, field, algorithm) {
  if (value === undefined || value === null) return null;
  const digest = requiredText(value, field);
  if (!isDigest(digest, algorithm)) throw new TypeError(`${field} must be a ${algorithm} digest`);
  return digest;
}

/** @param {unknown} value @param {string} field @param {"sha256" | "sha512"} algorithm */
function requiredDigest(value, field, algorithm) {
  const digest = requiredText(value, field);
  if (!isDigest(digest, algorithm)) throw new TypeError(`${field} must be a ${algorithm} digest`);
  return digest;
}

/** @param {unknown} value @param {string} field */
function requiredSha512SRI(value, field) {
  const integrity = requiredText(value, field);
  const match = /^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(integrity);
  const encoded = match?.[1];
  if (encoded === undefined) throw new TypeError(`${field} must be a SHA-512 SRI string`);
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== 64 || bytes.toString("base64") !== encoded) {
    throw new TypeError(`${field} must contain one canonical 64-byte SHA-512 value`);
  }
  return integrity;
}

/** @param {string} digest */
function digestToSRI(digest) {
  return `sha512-${Buffer.from(digest.slice("sha512:".length), "hex").toString("base64")}`;
}

/** @param {unknown} value @param {string} field */
function requiredSize(value, field) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive safe integer`);
  }
  return value;
}

/** @param {unknown} value */
function normalizePolicy(value) {
  const policy = requiredRecord(value, "policy");
  assertKnownFields(policy, ["schemaVersion", "activation", "requiredBoundaries"], "policy");
  if (policy.schemaVersion !== 1) throw new TypeError("policy.schemaVersion must be 1");
  if (!Array.isArray(policy.requiredBoundaries)) {
    throw new TypeError("policy.requiredBoundaries must be an array");
  }
  const requiredBoundaries = policy.requiredBoundaries.map((value, index) =>
    requiredText(value, `policy.requiredBoundaries[${index}]`),
  );
  const unsupported = [
    ...new Set(requiredBoundaries.filter((boundary) => !BOUNDARY_ORDER.has(boundary))),
  ].sort(compareText);
  if (unsupported[0] !== undefined) {
    throw new TypeError(`policy contains unsupported boundary ${unsupported[0]}`);
  }
  const duplicates = [
    ...new Set(
      requiredBoundaries.filter(
        (boundary, index) => requiredBoundaries.indexOf(boundary) !== index,
      ),
    ),
  ].sort(compareBoundary);
  if (duplicates[0] !== undefined) {
    throw new TypeError(`policy contains duplicate ${duplicates[0]}`);
  }
  requiredBoundaries.sort(compareBoundary);
  return { activation: normalizeActivation(policy.activation), requiredBoundaries };
}

/** @param {unknown} value @param {string} field */
function normalizeRepository(value, field) {
  if (value === undefined || value === null) return null;
  const repository = requiredRecord(value, field);
  assertKnownFields(repository, ["type", "url", "directory"], field);
  return {
    type: requiredText(repository.type, `${field}.type`),
    url: requiredText(repository.url, `${field}.url`),
    directory: optionalText(repository.directory, `${field}.directory`),
  };
}

/** @param {unknown} value @param {string} field */
function normalizeTrustedPublisher(value, field) {
  if (value === undefined || value === null) return null;
  const publisher = requiredRecord(value, field);
  assertKnownFields(
    publisher,
    ["provider", "repository", "workflow", "environment", "allowedAction"],
    field,
  );
  const allowedAction = requiredText(publisher.allowedAction, `${field}.allowedAction`);
  if (allowedAction !== "publish") {
    throw new TypeError(`${field}.allowedAction must be publish`);
  }
  return {
    provider: requiredText(publisher.provider, `${field}.provider`),
    repository: requiredText(publisher.repository, `${field}.repository`),
    workflow: requiredText(publisher.workflow, `${field}.workflow`),
    environment: optionalText(publisher.environment, `${field}.environment`),
    allowedAction,
  };
}

/** @param {unknown} value @param {string} field */
function normalizeNpmAuthority(value, field) {
  if (value === undefined || value === null) return null;
  const authority = requiredRecord(value, field);
  assertKnownFields(authority, ["bootstrap", "trustedPublisher"], field);
  let bootstrap = null;
  if (authority.bootstrap !== undefined && authority.bootstrap !== null) {
    const value = requiredRecord(authority.bootstrap, `${field}.bootstrap`);
    assertKnownFields(value, ["required"], `${field}.bootstrap`);
    bootstrap = { required: requiredBoolean(value.required, `${field}.bootstrap.required`) };
  }
  return {
    bootstrap,
    trustedPublisher: normalizeTrustedPublisher(
      authority.trustedPublisher,
      `${field}.trustedPublisher`,
    ),
  };
}

/** @param {unknown} value */
function normalizeObservedAuthority(value) {
  const authority = requiredRecord(value, "npm.observedAuthority");
  assertKnownFields(
    authority,
    ["coordinate", "coordinateControl", "bootstrap", "credentials", "trustedPublisher", "owners"],
    "npm.observedAuthority",
  );
  if (!Array.isArray(authority.owners)) {
    throw new TypeError("npm.observedAuthority.owners must be an array");
  }
  const owners = authority.owners
    .map((owner, index) => requiredText(owner, `npm.observedAuthority.owners[${index}]`))
    .sort(compareText);
  if (new Set(owners).size !== owners.length) {
    throw new TypeError("npm.observedAuthority.owners must not contain duplicates");
  }
  const coordinateControl = requiredText(
    authority.coordinateControl,
    "npm.observedAuthority.coordinateControl",
  );
  if (!["controlled", "uncontrolled", "unknown"].includes(coordinateControl)) {
    throw new TypeError("npm.observedAuthority.coordinateControl is unsupported");
  }
  const bootstrap = requiredText(authority.bootstrap, "npm.observedAuthority.bootstrap");
  if (!["available", "unavailable", "unknown"].includes(bootstrap)) {
    throw new TypeError("npm.observedAuthority.bootstrap is unsupported");
  }
  if (authority.credentials !== "not-observed") {
    throw new TypeError("npm.observedAuthority.credentials must be not-observed");
  }
  return {
    coordinate: optionalText(authority.coordinate, "npm.observedAuthority.coordinate"),
    coordinateControl,
    bootstrap,
    credentials: "not-observed",
    trustedPublisher: normalizeTrustedPublisher(
      authority.trustedPublisher,
      "npm.observedAuthority.trustedPublisher",
    ),
    owners,
  };
}

/** @param {unknown} value @param {string} field */
function normalizeEvidenceBinding(value, field) {
  const evidence = requiredRecord(value, field);
  assertKnownFields(
    evidence,
    ["candidateId", "inspection", "quality", "packedInstall", "releaseNotes"],
    field,
  );
  const candidateId = requiredDigest(evidence.candidateId, `${field}.candidateId`, "sha256");
  const entries = Object.fromEntries(
    ["inspection", "quality", "packedInstall"].map((name) => {
      const entry = requiredRecord(evidence[name], `${field}.${name}`);
      assertKnownFields(entry, ["digest", "rawDigest"], `${field}.${name}`);
      return [
        name,
        {
          digest: requiredDigest(entry.digest, `${field}.${name}.digest`, "sha256"),
          rawDigest: requiredDigest(entry.rawDigest, `${field}.${name}.rawDigest`, "sha256"),
        },
      ];
    }),
  );
  return {
    candidateId,
    inspection: entries.inspection,
    quality: entries.quality,
    packedInstall: entries.packedInstall,
    releaseNotes: requiredDigest(evidence.releaseNotes, `${field}.releaseNotes`, "sha256"),
  };
}

/** @param {unknown} value @param {string} field */
function normalizeUnresolvedPolicyFacts(value, field) {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  const facts = orderedJsonValues(value, field).map((value, index) => {
    const factField = `${field}[${index}]`;
    const fact = requiredRecord(value, factField);
    assertKnownFields(
      fact,
      ["key", "label", "reasons", "proposedValue", "authorization", "evidence"],
      factField,
    );
    const key = requiredText(fact.key, `${factField}.key`);
    if (!ACTIVATION_FACT_ORDER.has(key)) {
      throw new TypeError(`${factField}.key is unsupported`);
    }
    if (!Array.isArray(fact.reasons)) {
      throw new TypeError(`${factField}.reasons must be an array`);
    }
    const reasons = fact.reasons
      .map((reason, reasonIndex) => requiredText(reason, `${factField}.reasons[${reasonIndex}]`))
      .sort(compareText);
    if (new Set(reasons).size !== reasons.length) {
      throw new TypeError(`${factField}.reasons must not contain duplicates`);
    }
    const authorization = optionalText(fact.authorization, `${factField}.authorization`);
    if (authorization !== null && authorization !== "authorized") {
      throw new TypeError(`${factField}.authorization must be authorized when supplied`);
    }
    return {
      key,
      label: requiredText(fact.label, `${factField}.label`),
      reasons,
      ...(fact.proposedValue === undefined
        ? {}
        : { proposedValue: requiredText(fact.proposedValue, `${factField}.proposedValue`) }),
      ...(authorization === null ? {} : { authorization }),
      ...(fact.evidence === undefined
        ? {}
        : { evidence: requiredText(fact.evidence, `${factField}.evidence`) }),
    };
  });
  const duplicateKey = facts
    .map(({ key }) => key)
    .filter((key, index, keys) => keys.indexOf(key) !== index)
    .sort(
      (left, right) =>
        (ACTIVATION_FACT_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (ACTIVATION_FACT_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER) || compareText(left, right),
    )[0];
  if (duplicateKey !== undefined) {
    throw new TypeError(`${field} contains duplicate ${duplicateKey}`);
  }
  return facts.sort(
    (left, right) =>
      (ACTIVATION_FACT_ORDER.get(left.key) ?? Number.MAX_SAFE_INTEGER) -
        (ACTIVATION_FACT_ORDER.get(right.key) ?? Number.MAX_SAFE_INTEGER) ||
      compareText(left.key, right.key),
  );
}

/** @param {unknown} value @param {string} field */
function normalizeDigests(value, field) {
  const digests = requiredRecord(value, field);
  assertKnownFields(digests, ["sha256", "sha512"], field);
  return {
    sha256: requiredDigest(digests.sha256, `${field}.sha256`, "sha256"),
    sha512: requiredDigest(digests.sha512, `${field}.sha512`, "sha512"),
  };
}

/** @param {unknown} value @param {"github" | "npm"} channel */
function normalizeAssessmentBinding(value, channel) {
  if (value === undefined || value === null) return null;
  const binding = requiredRecord(value, `${channel}.candidate`);
  assertKnownFields(
    binding,
    ["candidateId", "package", "proposedTag", "sourceRevision"],
    `${channel}.candidate`,
  );
  const packageRecord =
    binding.package === undefined || binding.package === null
      ? null
      : requiredRecord(binding.package, `${channel}.candidate.package`);
  if (packageRecord !== null) {
    assertKnownFields(
      packageRecord,
      channel === "npm" ? ["name", "version", "repository"] : ["name", "version"],
      `${channel}.candidate.package`,
    );
  }
  return {
    candidateId: optionalDigest(binding.candidateId, `${channel}.candidate.candidateId`, "sha256"),
    name: optionalText(packageRecord?.name, `${channel}.candidate.package.name`),
    version: optionalText(packageRecord?.version, `${channel}.candidate.package.version`),
    repository:
      channel === "npm"
        ? normalizeRepository(packageRecord?.repository, `${channel}.candidate.package.repository`)
        : null,
    proposedTag: optionalText(binding.proposedTag, `${channel}.candidate.proposedTag`),
    sourceRevision:
      binding.sourceRevision === undefined || binding.sourceRevision === null
        ? null
        : requiredRevision(binding.sourceRevision, `${channel}.candidate.sourceRevision`),
  };
}

/** @param {unknown} value @param {string} field @param {boolean=} withIntegrity */
function normalizeArtifact(value, field, withIntegrity = false) {
  const artifact = requiredRecord(value, field);
  assertKnownFields(
    artifact,
    withIntegrity ? ["name", "size", "digests", "integrity"] : ["name", "size", "digests"],
    field,
  );
  return {
    name: requiredText(artifact.name, `${field}.name`),
    size: requiredSize(artifact.size, `${field}.size`),
    digests: normalizeDigests(artifact.digests, `${field}.digests`),
    ...(withIntegrity
      ? { integrity: requiredSha512SRI(artifact.integrity, `${field}.integrity`) }
      : {}),
  };
}

/** @param {unknown} value @param {"github" | "npm"} channel */
function normalizeChannelRequired(value, channel) {
  const required = requiredRecord(value, `${channel}.required`);
  if (channel === "github") {
    assertKnownFields(
      required,
      ["tag", "release", "assets", "checksums", "evidence"],
      "github.required",
    );
    const tag = requiredRecord(required.tag, "github.required.tag");
    assertKnownFields(tag, ["name", "targetRevision"], "github.required.tag");
    const release = requiredRecord(required.release, "github.required.release");
    assertKnownFields(
      release,
      ["tagName", "name", "body", "bodyDigest", "draft", "prerelease", "requireImmutable"],
      "github.required.release",
    );
    if (!Array.isArray(required.assets)) {
      throw new TypeError("github.required.assets must be an array");
    }
    if (required.assets.length !== 1) {
      throw new TypeError("github.required.assets must contain one exact candidate asset");
    }
    return {
      tag: {
        name: requiredText(tag.name, "github.required.tag.name"),
        targetRevision: requiredRevision(tag.targetRevision, "github.required.tag.targetRevision"),
      },
      release: {
        tagName: requiredText(release.tagName, "github.required.release.tagName"),
        name: requiredText(release.name, "github.required.release.name"),
        body: requiredText(release.body, "github.required.release.body"),
        bodyDigest: requiredDigest(
          release.bodyDigest,
          "github.required.release.bodyDigest",
          "sha256",
        ),
        draft: requiredBoolean(release.draft, "github.required.release.draft"),
        prerelease: nullableBoolean(release.prerelease, "github.required.release.prerelease"),
        requireImmutable: nullableBoolean(
          release.requireImmutable,
          "github.required.release.requireImmutable",
        ),
      },
      artifact: normalizeArtifact(required.assets[0], "github.required.assets[0]"),
      checksums: normalizeDigests(required.checksums, "github.required.checksums"),
      evidence: normalizeEvidenceBinding(required.evidence, "github.required.evidence"),
    };
  }

  assertKnownFields(
    required,
    [
      "coordinate",
      "candidateCoordinate",
      "candidateRepository",
      "version",
      "artifact",
      "finalDistTag",
      "repository",
      "provenance",
      "authority",
      "evidence",
    ],
    "npm.required",
  );
  let provenance = null;
  if (required.provenance !== undefined && required.provenance !== null) {
    const value = requiredRecord(required.provenance, "npm.required.provenance");
    assertKnownFields(
      value,
      ["required", "repository", "sourceRevision"],
      "npm.required.provenance",
    );
    provenance = {
      required: requiredBoolean(value.required, "npm.required.provenance.required"),
      repository: normalizeRepository(value.repository, "npm.required.provenance.repository"),
      sourceRevision: requiredRevision(
        value.sourceRevision,
        "npm.required.provenance.sourceRevision",
      ),
    };
  }
  return {
    coordinate: optionalText(required.coordinate, "npm.required.coordinate"),
    candidateCoordinate: requiredText(
      required.candidateCoordinate,
      "npm.required.candidateCoordinate",
    ),
    candidateRepository: normalizeRepository(
      required.candidateRepository,
      "npm.required.candidateRepository",
    ),
    version: requiredText(required.version, "npm.required.version"),
    artifact: normalizeArtifact(required.artifact, "npm.required.artifact", true),
    finalDistTag: optionalDistTag(required.finalDistTag, "npm.required.finalDistTag"),
    repository: normalizeRepository(required.repository, "npm.required.repository"),
    provenance,
    authority: normalizeNpmAuthority(required.authority, "npm.required.authority"),
    evidence: normalizeEvidenceBinding(required.evidence, "npm.required.evidence"),
  };
}

/** @param {"github" | "npm"} channel @param {"matches" | "missing" | "unverified" | "manualAuthority" | "conflicts"} category */
function supportedFindingObjects(channel, category) {
  if (channel === "github") {
    return category === "unverified" ? new Set(["asset"]) : new Set(["tag", "release", "asset"]);
  }
  if (category === "matches") return new Set(["version", "tag", "authority"]);
  if (category === "missing") return new Set(["policy", "version", "tag"]);
  if (category === "unverified") return new Set(["version", "authority"]);
  if (category === "manualAuthority") return new Set(["tag"]);
  return new Set(["policy", "version", "authority"]);
}

/**
 * @param {"github" | "npm"} channel
 * @param {"matches" | "missing" | "unverified" | "manualAuthority" | "conflicts"} category
 * @param {string} object
 * @returns {Set<string | null>}
 */
function supportedFindingFields(channel, category, object) {
  if (channel === "github") {
    if (category === "matches" || category === "missing") return new Set([null]);
    if (category === "unverified") return new Set(["digest"]);
    if (object === "tag") return new Set(["identity", "targetRevision"]);
    if (object === "release") {
      return new Set(["identity", "bodyDigest", "name", "prerelease", "immutable"]);
    }
    return new Set(["identity", "digest", "size", "state"]);
  }
  if (category === "matches") {
    if (object === "version") return new Set(["immutable"]);
    if (object === "tag") return new Set(["targetVersion"]);
    return new Set(["coordinateControl", "bootstrap", "trustedPublisher"]);
  }
  if (category === "missing") {
    return object === "policy"
      ? new Set(["coordinate", "finalDistTag", "repository", "provenance", "authority"])
      : new Set(["presence"]);
  }
  if (category === "unverified") {
    return object === "version"
      ? new Set(["integrity", "repository", "provenance"])
      : new Set(["coordinate", "coordinateControl", "bootstrap", "trustedPublisher"]);
  }
  if (category === "manualAuthority") return new Set(["targetVersion"]);
  if (object === "policy") return new Set(["coordinate"]);
  if (object === "version") {
    return new Set(["coordinate", "candidateRepository", "integrity", "repository", "provenance"]);
  }
  return new Set(["coordinateAvailability", "coordinateControl"]);
}

/** @param {unknown} value @param {string} field @param {"github" | "npm"} channel @param {"matches" | "missing" | "unverified" | "manualAuthority" | "conflicts"} category */
function normalizeFindings(value, field, channel, category) {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  const supportedObjects = supportedFindingObjects(channel, category);
  const findings = orderedJsonValues(value, field)
    .map((value, index) => {
      const findingField = `${field}[${index}]`;
      const finding = requiredRecord(value, findingField);
      assertKnownFields(
        finding,
        ["object", "identity", "field", "detail", "state", "expected", "observed"],
        findingField,
      );
      const object = requiredText(finding.object, `${findingField}.object`);
      if (!supportedObjects.has(object)) {
        throw new TypeError(`${findingField}.object is unsupported for ${field}`);
      }
      const normalizedField = optionalText(finding.field, `${findingField}.field`);
      if (!supportedFindingFields(channel, category, object).has(normalizedField)) {
        throw new TypeError(`${findingField}.field is unsupported for ${field}`);
      }
      const state = optionalText(finding.state, `${findingField}.state`);
      if (category === "matches") {
        const allowedStates =
          channel === "github" && object === "release"
            ? ["matching-draft", "matching-published"]
            : ["matching"];
        if (state === null || !allowedStates.includes(state)) {
          throw new TypeError(`${findingField}.state is unsupported for ${object} match evidence`);
        }
      } else if (state !== null) {
        throw new TypeError(`${findingField}.state is unsupported for ${field}`);
      }
      const detail = optionalText(finding.detail, `${findingField}.detail`);
      if (channel === "github" && category === "matches") {
        if (detail !== null)
          throw new TypeError(`${findingField}.detail is unsupported for ${field}`);
      } else if (detail === null) {
        throw new TypeError(`${findingField}.detail is required for ${field}`);
      }
      const hasExpected = Object.hasOwn(finding, "expected");
      const hasObserved = Object.hasOwn(finding, "observed");
      if (category === "matches" || category === "missing") {
        if (hasExpected || hasObserved) {
          throw new TypeError(`${findingField} must not contain expected or observed evidence`);
        }
      } else if (!hasExpected || !hasObserved) {
        throw new TypeError(`${findingField} must contain expected and observed evidence`);
      }
      return {
        object,
        identity: requiredText(finding.identity, `${findingField}.identity`),
        field: normalizedField,
        detail,
        state,
        ...(hasExpected
          ? { expected: canonicalJson(finding.expected, `${findingField}.expected`) }
          : {}),
        ...(hasObserved
          ? { observed: canonicalJson(finding.observed, `${findingField}.observed`) }
          : {}),
      };
    })
    .sort(
      (left, right) =>
        compareText(left.object, right.object) ||
        compareText(left.identity, right.identity) ||
        compareText(left.field ?? "", right.field ?? "") ||
        compareText(left.detail ?? "", right.detail ?? "") ||
        compareText(
          JSON.stringify(left.expected ?? null),
          JSON.stringify(right.expected ?? null),
        ) ||
        compareText(JSON.stringify(left.observed ?? null), JSON.stringify(right.observed ?? null)),
    );
  for (let index = 1; index < findings.length; index += 1) {
    const left = findings[index - 1];
    const right = findings[index];
    if (left === undefined || right === undefined) continue;
    if (
      left.object === right.object &&
      left.identity === right.identity &&
      left.field === right.field
    ) {
      throw new TypeError(
        `${field} contains duplicate ${right.object}/${right.identity}/${right.field ?? "state"}`,
      );
    }
  }
  return findings;
}

/**
 * @param {"github" | "npm"} channel
 * @param {{name: string, version: string, proposedTag: string, artifact: {name: string}}} candidate
 * @param {ReturnType<typeof normalizeChannelRequired>} required
 * @param {ReturnType<typeof normalizeFindings>[number]} finding
 * @param {"matches" | "missing" | "unverified" | "manualAuthority"} category
 */
function expectedFindingIdentity(channel, candidate, required, finding, category) {
  if (channel === "github") {
    if (finding.object === "tag") return candidate.proposedTag;
    if (finding.object === "asset") return candidate.artifact.name;
    if (finding.object === "release" && category === "missing") return candidate.proposedTag;
    return null;
  }
  if (finding.object === "policy") return "npm";
  if (finding.object === "version") return `${candidate.name}@${candidate.version}`;
  if (finding.object === "tag") {
    return `${candidate.name}@${required.finalDistTag ?? "<unresolved>"}`;
  }
  if (finding.object === "authority") return candidate.name;
  return null;
}

/** @param {"github" | "npm"} channel @param {{required: ReturnType<typeof normalizeChannelRequired>, matches: ReturnType<typeof normalizeFindings>, missing: ReturnType<typeof normalizeFindings>, unverified: ReturnType<typeof normalizeFindings>, manualAuthority: ReturnType<typeof normalizeFindings>, conflicts: ReturnType<typeof normalizeFindings>, observedAuthority: ReturnType<typeof normalizeObservedAuthority> | null}} assessment */
function validateChannelEvidence(channel, assessment) {
  const categoriesByBoundary = new Map();
  for (const category of /** @type {const} */ ([
    "matches",
    "missing",
    "unverified",
    "manualAuthority",
  ])) {
    for (const finding of assessment[category]) {
      const boundary = boundaryFor(channel, finding.object);
      if (boundary === null) continue;
      const categories = categoriesByBoundary.get(boundary) ?? new Set();
      categories.add(category);
      categoriesByBoundary.set(boundary, categories);
    }
  }
  for (const [boundary, categories] of categoriesByBoundary) {
    if (categories.has("matches") && categories.size > 1) {
      throw new TypeError(`${boundary} contains contradictory completion evidence`);
    }
    if (categories.has("missing") && categories.has("manualAuthority")) {
      throw new TypeError(
        `${boundary} contains contradictory absence and manual-authority evidence`,
      );
    }
  }
  const versionMatches = assessment.matches.some(({ object }) => object === "version");
  const tagMatches = assessment.matches.some(({ object }) => object === "tag");
  if (channel === "npm" && "candidateCoordinate" in assessment.required) {
    const missingPolicyFields = new Set(
      assessment.missing.filter(({ object }) => object === "policy").map(({ field }) => field),
    );
    for (const field of /** @type {const} */ ([
      "coordinate",
      "finalDistTag",
      "repository",
      "provenance",
      "authority",
    ])) {
      if ((assessment.required[field] === null) !== missingPolicyFields.has(field)) {
        throw new TypeError(`npm missing-policy evidence is inconsistent for ${field}`);
      }
    }
    if (
      versionMatches &&
      (assessment.required.coordinate === null ||
        assessment.required.repository === null ||
        assessment.required.provenance === null)
    ) {
      throw new TypeError(
        "npm version match evidence requires resolved coordinate, repository, and provenance",
      );
    }
    if (tagMatches && !versionMatches) {
      throw new TypeError("npm tag match evidence requires a matching npm.version");
    }
    if (
      (tagMatches || assessment.manualAuthority.some(({ object }) => object === "tag")) &&
      assessment.required.finalDistTag === null
    ) {
      throw new TypeError("npm tag evidence requires one resolved approved final dist-tag");
    }

    if (assessment.observedAuthority === null) {
      throw new Error("normalized npm assessment omitted observed authority");
    }
    /** @param {string} field @returns {Array<"matches" | "unverified" | "conflicts">} */
    const authorityCategories = (field) =>
      /** @type {const} */ (["matches", "unverified", "conflicts"]).filter((category) =>
        assessment[category].some(
          (finding) => finding.object === "authority" && finding.field === field,
        ),
      );
    /** @param {string} field @param {"matches" | "unverified" | "conflicts" | null} expected */
    const requireAuthorityCategory = (field, expected) => {
      const observed = authorityCategories(field);
      if (
        (expected === null && observed.length > 0) ||
        (expected !== null && (observed.length !== 1 || observed[0] !== expected))
      ) {
        throw new TypeError(`npm authority ${field} evidence is inconsistent with observation`);
      }
    };
    const authorityBound =
      assessment.required.coordinate !== null &&
      assessment.observedAuthority.coordinate === assessment.required.coordinate;
    requireAuthorityCategory("coordinate", authorityBound ? null : "unverified");
    requireAuthorityCategory(
      "coordinateControl",
      !authorityBound
        ? null
        : assessment.observedAuthority.coordinateControl === "controlled"
          ? "matches"
          : assessment.observedAuthority.coordinateControl === "uncontrolled"
            ? "conflicts"
            : "unverified",
    );
    requireAuthorityCategory(
      "bootstrap",
      !authorityBound || assessment.required.authority?.bootstrap?.required !== true
        ? null
        : assessment.observedAuthority.bootstrap === "available"
          ? "matches"
          : "unverified",
    );
    requireAuthorityCategory(
      "trustedPublisher",
      !authorityBound || assessment.required.authority?.trustedPublisher === null
        ? null
        : isDeepStrictEqual(
              assessment.observedAuthority.trustedPublisher,
              assessment.required.authority?.trustedPublisher,
            )
          ? "matches"
          : "unverified",
    );
  }
  if (
    channel === "npm" &&
    assessment.manualAuthority.some(({ object }) => object === "tag") &&
    !assessment.matches.some(({ object }) => object === "version")
  ) {
    throw new TypeError("npm manual-authority tag evidence requires a matching npm.version");
  }
}

/** @param {unknown} value @param {"github" | "npm"} channel */
function normalizeChannelAssessment(value, channel) {
  if (value === undefined || value === null) return null;
  const assessment = requiredRecord(value, channel);
  const sharedFields = [
    "schemaVersion",
    "channel",
    "activation",
    "releaseEligibility",
    "publicationCapable",
    "candidate",
    "required",
    "unresolvedPolicyFacts",
    "matches",
    "missing",
    "unverified",
    "conflicts",
  ];
  assertKnownFields(
    assessment,
    channel === "npm"
      ? [
          ...sharedFields,
          "observedAuthority",
          "manualAuthority",
          "safeActions",
          "prohibitedActions",
        ]
      : sharedFields,
    channel,
  );
  if (
    assessment.schemaVersion !== 1 ||
    assessment.channel !== channel ||
    assessment.activation !== "disabled" ||
    assessment.releaseEligibility !== "ineligible" ||
    assessment.publicationCapable !== false
  ) {
    throw new TypeError(`${channel} must be an inactive schema-version 1 ${channel} assessment`);
  }
  const required = normalizeChannelRequired(assessment.required, channel);
  const matches = normalizeFindings(assessment.matches, `${channel}.matches`, channel, "matches");
  const missing = normalizeFindings(assessment.missing, `${channel}.missing`, channel, "missing");
  const unverified = normalizeFindings(
    assessment.unverified,
    `${channel}.unverified`,
    channel,
    "unverified",
  );
  const manualAuthority =
    channel === "npm"
      ? normalizeFindings(
          assessment.manualAuthority,
          "npm.manualAuthority",
          channel,
          "manualAuthority",
        )
      : [];
  const conflicts = normalizeFindings(
    assessment.conflicts,
    `${channel}.conflicts`,
    channel,
    "conflicts",
  );
  let observedAuthority = null;
  if (channel === "npm") {
    if (!Array.isArray(assessment.safeActions) || assessment.safeActions.length !== 0) {
      throw new TypeError("npm.safeActions must remain empty");
    }
    if (!Array.isArray(assessment.prohibitedActions)) {
      throw new TypeError("npm.prohibitedActions must be an array");
    }
    const prohibitedActions = assessment.prohibitedActions
      .map((action, index) => requiredText(action, `npm.prohibitedActions[${index}]`))
      .sort(compareText);
    if (new Set(prohibitedActions).size !== prohibitedActions.length) {
      throw new TypeError("npm.prohibitedActions must not contain duplicates");
    }
    if (!isDeepStrictEqual(prohibitedActions, [...NPM_PROHIBITED_ACTIONS].sort(compareText))) {
      throw new TypeError("npm.prohibitedActions must retain the fixed inactive-action guard");
    }
    observedAuthority = normalizeObservedAuthority(assessment.observedAuthority);
  }
  const normalized = {
    binding: normalizeAssessmentBinding(assessment.candidate, channel),
    required,
    artifact: required?.artifact ?? null,
    unresolvedPolicyFacts: normalizeUnresolvedPolicyFacts(
      assessment.unresolvedPolicyFacts,
      `${channel}.unresolvedPolicyFacts`,
    ),
    matches,
    missing,
    unverified,
    manualAuthority,
    conflicts,
    observedAuthority,
  };
  validateChannelEvidence(channel, normalized);
  return normalized;
}

/** @param {"github" | "npm"} channel @param {string} object */
function boundaryFor(channel, object) {
  if (channel === "github" && ["tag", "release", "asset"].includes(object)) {
    return `github.${object}`;
  }
  if (channel === "npm" && object === "version") return "npm.version";
  if (channel === "npm" && object === "tag") return "npm.final-dist-tag";
  return null;
}

/**
 * Combine one exact inactive candidate with reviewed GitHub/npm assessment results. This function performs
 * no observation or effect: it binds existing evidence to the candidate and applies one deterministic
 * precedence chain.
 *
 * @param {unknown} input
 */
export function classifyConvergentState(input) {
  const request = requiredRecord(input, "input");
  assertKnownFields(request, ["candidate", "policy", "github", "npm"], "input");
  /** @type {Array<{field: "candidate" | "policy" | "github" | "npm", detail: string}>} */
  const issues = [];
  /** @type {ReturnType<typeof normalizeExactCandidate> | undefined} */
  let candidate;
  /** @type {ReturnType<typeof normalizePolicy> | undefined} */
  let policy;
  /** @type {ReturnType<typeof normalizeChannelAssessment> | undefined} */
  let github;
  /** @type {ReturnType<typeof normalizeChannelAssessment> | undefined} */
  let npm;
  /** @param {"candidate" | "policy" | "github" | "npm"} field @param {unknown} error */
  const recordIssue = (field, error) => {
    issues.push({ field, detail: error instanceof Error ? error.message : String(error) });
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
    github = normalizeChannelAssessment(request.github, "github");
  } catch (error) {
    recordIssue("github", error);
  }
  try {
    npm = normalizeChannelAssessment(request.npm, "npm");
  } catch (error) {
    recordIssue("npm", error);
  }
  if (issues.length > 0) throw new ConvergenceAssessmentInputError(issues);
  if (
    candidate === undefined ||
    policy === undefined ||
    github === undefined ||
    npm === undefined
  ) {
    throw new Error("convergence normalization completed without every required input");
  }

  const readiness = assessInactiveDistribution(
    /** @type {Parameters<typeof assessInactiveDistribution>[0]} */ (policy.activation),
  );
  const expectedUnresolvedPolicyFacts = normalizeUnresolvedPolicyFacts(
    readiness.unresolvedFacts,
    "policy.unresolvedFacts",
  );
  /** @type {Array<{kind: string, channel: "combined" | "github" | "npm", object?: string, identity?: string, field: string, detail: string, expected?: unknown, observed?: unknown}>} */
  const conflicts = [];
  /** @type {Array<{kind: string, channel: "combined" | "github" | "npm", boundary?: string, object?: string, identity?: string, field: string, detail: string, expected?: unknown, observed?: unknown}>} */
  const blockers = [];
  /** @type {Array<{channel: "github" | "npm", object: string, identity: string, state: string, boundary: string}>} */
  const compatibleEvidence = [];
  const candidateIncompatibleFindings = new Set();

  if (policy.requiredBoundaries.length === 0) {
    blockers.push({
      kind: "missing-policy",
      channel: "combined",
      field: "requiredBoundaries",
      detail: "required-boundary policy is explicitly empty",
    });
  }
  for (const fact of readiness.unresolvedFacts) {
    blockers.push({
      kind: "activation-fact",
      channel: "combined",
      field: fact.key,
      detail: `bounded activation fact is unresolved: ${fact.reasons.join(", ")}`,
      observed: fact,
    });
  }

  const persistedBinding = {
    candidateId: candidate.candidateId,
    name: candidate.package.name,
    version: candidate.package.version,
    proposedTag: candidate.proposedTag,
    sourceRevision: candidate.sourceRevision,
    artifact: candidate.artifact,
  };
  /** @type {Array<["github" | "npm", ReturnType<typeof normalizeChannelAssessment>]>} */
  const assessments = [
    ["github", github],
    ["npm", npm],
  ];
  for (const [channelValue, assessment] of assessments) {
    const channel = /** @type {"github" | "npm"} */ (channelValue);
    if (assessment === null) {
      blockers.push({
        kind: "missing-binding",
        channel,
        field: "assessment",
        detail: `${channel} assessment is absent`,
      });
      continue;
    }
    if (assessment.binding === null) {
      blockers.push({
        kind: "missing-binding",
        channel,
        field: "candidate",
        detail: `${channel} assessment candidate binding is absent`,
      });
    } else {
      /** @type {Array<[string, string, string | null]>} */
      const comparisons = [
        ["candidateId", persistedBinding.candidateId, assessment.binding.candidateId],
        ["package.name", persistedBinding.name, assessment.binding.name],
        ["package.version", persistedBinding.version, assessment.binding.version],
        ["proposedTag", persistedBinding.proposedTag, assessment.binding.proposedTag],
        ["sourceRevision", persistedBinding.sourceRevision, assessment.binding.sourceRevision],
      ];
      for (const [field, expected, observed] of comparisons) {
        if (observed === null) {
          blockers.push({
            kind: "missing-binding",
            channel,
            field,
            detail: `${channel} assessment binding omits ${field}`,
            expected,
            observed,
          });
        } else if (observed !== expected) {
          conflicts.push({
            kind: "identity-mismatch",
            channel,
            object: "candidate",
            identity: assessment.binding.candidateId ?? channel,
            field,
            detail: `${channel} assessment binds different candidate ${field}`,
            expected,
            observed,
          });
        }
      }
    }
    if (assessment.artifact === null) {
      blockers.push({
        kind: "missing-binding",
        channel,
        field: "artifact",
        detail: `${channel} assessment exact artifact binding is absent`,
      });
    } else {
      /** @type {Array<[string, string | number, string | number | null]>} */
      const artifactComparisons = [
        ["artifact.name", persistedBinding.artifact.name, assessment.artifact.name],
        ["artifact.size", persistedBinding.artifact.size, assessment.artifact.size],
        [
          "artifact.digests.sha256",
          persistedBinding.artifact.digests.sha256,
          assessment.artifact.digests.sha256,
        ],
        [
          "artifact.digests.sha512",
          persistedBinding.artifact.digests.sha512,
          assessment.artifact.digests.sha512,
        ],
      ];
      for (const [field, expected, observed] of artifactComparisons) {
        if (observed === null) {
          blockers.push({
            kind: "missing-binding",
            channel,
            field,
            detail: `${channel} assessment artifact binding omits ${field}`,
            expected,
            observed,
          });
        } else if (observed !== expected) {
          conflicts.push({
            kind: "identity-mismatch",
            channel,
            object: "artifact",
            identity: assessment.artifact.name ?? channel,
            field,
            detail: `${channel} assessment binds different exact artifact ${field}`,
            expected,
            observed,
          });
        }
      }
    }

    /** @param {string} field @param {unknown} expected @param {unknown} observed */
    const recordRequiredMismatch = (field, expected, observed) => {
      if (isDeepStrictEqual(expected, observed)) return;
      conflicts.push({
        kind: "identity-mismatch",
        channel,
        object: "required",
        identity: candidate.candidateId,
        field,
        detail: `${channel} required projection differs from the exact candidate`,
        expected,
        observed,
      });
    };
    if ("tag" in assessment.required) {
      const { tag, release, checksums } = assessment.required;
      if (tag === undefined || release === undefined || checksums === undefined) {
        throw new Error("normalized GitHub required projection is incomplete");
      }
      recordRequiredMismatch("required.tag.name", candidate.proposedTag, tag.name);
      recordRequiredMismatch(
        "required.tag.targetRevision",
        candidate.sourceRevision,
        tag.targetRevision,
      );
      recordRequiredMismatch("required.release.tagName", candidate.proposedTag, release.tagName);
      recordRequiredMismatch("required.release.name", candidate.proposedTag, release.name);
      recordRequiredMismatch("required.release.body", candidate.notes.body, release.body);
      recordRequiredMismatch(
        "required.release.bodyDigest",
        candidate.notes.digest,
        release.bodyDigest,
      );
      recordRequiredMismatch("required.release.draft", true, release.draft);
      recordRequiredMismatch(
        "required.checksums.sha256",
        candidate.artifact.digests.sha256,
        checksums.sha256,
      );
      recordRequiredMismatch(
        "required.checksums.sha512",
        candidate.artifact.digests.sha512,
        checksums.sha512,
      );
      recordRequiredMismatch("required.evidence", candidate.evidence, assessment.required.evidence);
    } else {
      recordRequiredMismatch(
        "required.candidateCoordinate",
        candidate.package.name,
        assessment.required.candidateCoordinate,
      );
      recordRequiredMismatch(
        "required.version",
        candidate.package.version,
        assessment.required.version,
      );
      if (assessment.required.coordinate !== null) {
        recordRequiredMismatch(
          "required.coordinate",
          candidate.package.name,
          assessment.required.coordinate,
        );
      }
      recordRequiredMismatch(
        "required.artifact.integrity",
        digestToSRI(candidate.artifact.digests.sha512),
        assessment.required.artifact.integrity,
      );
      recordRequiredMismatch("required.evidence", candidate.evidence, assessment.required.evidence);
      recordRequiredMismatch(
        "required.candidateRepository",
        assessment.binding?.repository ?? null,
        assessment.required.candidateRepository,
      );
      if (assessment.required.repository !== null) {
        recordRequiredMismatch(
          "required.repository",
          assessment.binding?.repository ?? null,
          assessment.required.repository,
        );
      }
      if (assessment.required.provenance !== null) {
        recordRequiredMismatch(
          "required.provenance.repository",
          assessment.required.repository,
          assessment.required.provenance.repository,
        );
        recordRequiredMismatch(
          "required.provenance.sourceRevision",
          candidate.sourceRevision,
          assessment.required.provenance.sourceRevision,
        );
      }
    }

    if (!isDeepStrictEqual(assessment.unresolvedPolicyFacts, expectedUnresolvedPolicyFacts)) {
      blockers.push({
        kind: "assessment-policy",
        channel,
        field: "unresolvedPolicyFacts",
        detail: `${channel} assessment was not derived from the supplied activation facts`,
        expected: expectedUnresolvedPolicyFacts,
        observed: assessment.unresolvedPolicyFacts,
      });
    }

    for (const category of /** @type {const} */ ([
      "matches",
      "missing",
      "unverified",
      "manualAuthority",
    ])) {
      for (const finding of assessment[category]) {
        const expected = expectedFindingIdentity(
          channel,
          {
            name: candidate.package.name,
            version: candidate.package.version,
            proposedTag: candidate.proposedTag,
            artifact: candidate.artifact,
          },
          assessment.required,
          finding,
          category,
        );
        if (expected === null || finding.identity === expected) continue;
        candidateIncompatibleFindings.add(finding);
        conflicts.push({
          kind: "identity-mismatch",
          channel,
          object: finding.object,
          identity: finding.identity,
          field: "identity",
          detail: `${channel} ${category} evidence identifies another candidate object`,
          expected,
          observed: finding.identity,
        });
      }
    }
    for (const finding of assessment.conflicts) {
      conflicts.push({
        kind: "channel-conflict",
        channel,
        object: finding.object,
        identity: finding.identity,
        field: finding.field ?? "conflict",
        detail: finding.detail ?? `${channel} reports a hard conflict`,
        ...(Object.hasOwn(finding, "expected") ? { expected: finding.expected } : {}),
        ...(Object.hasOwn(finding, "observed") ? { observed: finding.observed } : {}),
      });
    }
    for (const finding of assessment.matches) {
      if (candidateIncompatibleFindings.has(finding)) continue;
      const boundary = boundaryFor(channel, finding.object);
      if (boundary === null) continue;
      compatibleEvidence.push({
        channel,
        object: finding.object,
        identity: finding.identity,
        state: finding.state ?? "matching",
        boundary,
      });
    }
    for (const finding of assessment.manualAuthority) {
      if (candidateIncompatibleFindings.has(finding)) continue;
      const boundary = boundaryFor(channel, finding.object);
      if (boundary === null) continue;
      compatibleEvidence.push({
        channel,
        object: finding.object,
        identity: finding.identity,
        state: "manual-authority",
        boundary,
      });
    }
  }

  const completed = new Set(
    compatibleEvidence
      .filter(({ state }) => state !== "manual-authority")
      .map(({ boundary }) => boundary),
  );
  const outstanding = new Set();
  for (const boundary of policy.requiredBoundaries) {
    if (completed.has(boundary)) continue;
    const [channelValue] = boundary.split(".");
    const channel = /** @type {"github" | "npm"} */ (channelValue);
    const assessment = channel === "github" ? github : npm;
    if (assessment === null) continue;
    const unverified = assessment.unverified.filter(
      (finding) =>
        !candidateIncompatibleFindings.has(finding) &&
        boundaryFor(channel, finding.object) === boundary,
    );
    if (unverified.length > 0) {
      for (const finding of unverified) {
        blockers.push({
          kind: "observation",
          channel,
          boundary,
          object: finding.object,
          identity: finding.identity,
          field: finding.field ?? "observation",
          detail: finding.detail ?? `required ${boundary} observation is unverified`,
          ...(Object.hasOwn(finding, "expected") ? { expected: finding.expected } : {}),
          ...(Object.hasOwn(finding, "observed") ? { observed: finding.observed } : {}),
        });
      }
      continue;
    }
    const knownMissing = assessment.missing.some(
      (finding) =>
        !candidateIncompatibleFindings.has(finding) &&
        boundaryFor(channel, finding.object) === boundary,
    );
    const manualAuthority = assessment.manualAuthority.some(
      (finding) =>
        !candidateIncompatibleFindings.has(finding) &&
        boundaryFor(channel, finding.object) === boundary,
    );
    if (knownMissing || manualAuthority) {
      outstanding.add(boundary);
      continue;
    }
    blockers.push({
      kind: "observation",
      channel,
      boundary,
      field: "state",
      detail: `required ${boundary} observation establishes neither completion nor known absence`,
    });
  }

  const allRequiredBoundariesComplete =
    policy.requiredBoundaries.length > 0 &&
    policy.requiredBoundaries.every((boundary) => completed.has(boundary));
  if (!allRequiredBoundariesComplete) {
    for (const [channelValue, assessment] of assessments) {
      const channel = /** @type {"github" | "npm"} */ (channelValue);
      if (assessment === null) continue;
      for (const finding of assessment.unverified) {
        if (candidateIncompatibleFindings.has(finding)) continue;
        const boundary = boundaryFor(channel, finding.object);
        if (boundary === null || policy.requiredBoundaries.includes(boundary)) continue;
        blockers.push({
          kind: "observation",
          channel,
          boundary,
          object: finding.object,
          identity: finding.identity,
          field: finding.field ?? "observation",
          detail:
            finding.detail ?? `${boundary} is candidate-bound but its observation is unverified`,
          ...(Object.hasOwn(finding, "expected") ? { expected: finding.expected } : {}),
          ...(Object.hasOwn(finding, "observed") ? { observed: finding.observed } : {}),
        });
      }
    }
  }

  for (const [channelValue, assessment] of assessments) {
    const channel = /** @type {"github" | "npm"} */ (channelValue);
    if (
      assessment === null ||
      !policy.requiredBoundaries.some((boundary) => boundary.startsWith(`${channel}.`))
    ) {
      continue;
    }
    for (const finding of [...assessment.missing, ...assessment.unverified]) {
      if (candidateIncompatibleFindings.has(finding)) continue;
      if (finding.object !== "policy" && finding.object !== "authority") continue;
      blockers.push({
        kind: "observation",
        channel,
        object: finding.object,
        identity: finding.identity,
        field: finding.field ?? "state",
        detail: finding.detail ?? `${channel} required policy or authority evidence is unavailable`,
        ...(Object.hasOwn(finding, "expected") ? { expected: finding.expected } : {}),
        ...(Object.hasOwn(finding, "observed") ? { observed: finding.observed } : {}),
      });
    }
  }

  conflicts.sort(compareFinding);
  blockers.sort(compareFinding);
  compatibleEvidence.sort(
    (left, right) =>
      compareBoundary(left.boundary, right.boundary) ||
      compareText(left.object, right.object) ||
      compareText(left.identity, right.identity) ||
      compareText(left.state, right.state),
  );
  const requiredBoundaries = [...policy.requiredBoundaries];
  const completedBoundaries = requiredBoundaries.filter((boundary) => completed.has(boundary));
  const outstandingBoundaries = requiredBoundaries.filter((boundary) => outstanding.has(boundary));
  const classification =
    conflicts.length > 0
      ? "conflicting"
      : blockers.length > 0
        ? "blocked"
        : completedBoundaries.length === requiredBoundaries.length
          ? "complete"
          : completedBoundaries.length > 0
            ? "resumable"
            : compatibleEvidence.length > 0
              ? "matching"
              : "ready";

  return {
    schemaVersion: 1,
    classification,
    activation: readiness.activation,
    releaseEligibility: readiness.releaseEligibility,
    publicationCapable: readiness.publicationCapable,
    candidate: persistedBinding,
    assessmentBindings: {
      github:
        github?.binding === null || github === null
          ? null
          : {
              candidateId: github.binding.candidateId,
              name: github.binding.name,
              version: github.binding.version,
              sourceRevision: github.binding.sourceRevision,
              artifact: github.artifact,
            },
      npm:
        npm?.binding === null || npm === null
          ? null
          : {
              candidateId: npm.binding.candidateId,
              name: npm.binding.name,
              version: npm.binding.version,
              sourceRevision: npm.binding.sourceRevision,
              artifact: npm.artifact,
            },
    },
    requiredBoundaries,
    completedBoundaries,
    outstandingBoundaries,
    compatibleEvidence,
    blockers,
    conflicts,
    recovery: {
      safeActions: [],
      guidance: classification === "conflicting" ? ["stop-and-resolve-conflicting-evidence"] : [],
      prohibitedActions: RECOVERY_PROHIBITIONS,
    },
  };
}
