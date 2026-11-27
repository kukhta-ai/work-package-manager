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
import { assessInactiveDistribution } from "./readiness.js";

/** @typedef {Record<string, unknown>} JsonRecord */

/** A stable collection of independently invalid npm-assessment inputs. */
export class NpmAssessmentInputError extends TypeError {
  /** @param {Array<{field: "candidate" | "policy" | "observation", detail: string}>} issues */
  constructor(issues) {
    super(issues.map(({ field, detail }) => `${field}: ${detail}`).join("; "));
    this.name = "NpmAssessmentInputError";
    this.issues = issues;
  }
}

/**
 * @typedef NpmAssessmentFinding
 * @property {"policy" | "version" | "tag" | "authority"} object
 * @property {string} identity
 * @property {string} field
 * @property {string} detail
 * @property {string=} state
 * @property {unknown=} expected
 * @property {unknown=} observed
 */

const OBJECT_ORDER = { policy: 0, version: 1, tag: 2, authority: 3 };
const CONTROL_STATES = new Set(["controlled", "uncontrolled", "unknown"]);
const BOOTSTRAP_STATES = new Set(["available", "unavailable", "unknown"]);
const PROVENANCE_STATES = new Set(["present", "absent", "unknown"]);
const PROHIBITED_ACTIONS = Object.freeze([
  "automatic-dist-tag-repair",
  "overwrite",
  "republication",
  "unpublish-and-republish",
  "version-reuse",
]);

/** @param {NpmAssessmentFinding} left @param {NpmAssessmentFinding} right */
function compareFinding(left, right) {
  return (
    OBJECT_ORDER[left.object] - OBJECT_ORDER[right.object] ||
    compareText(left.identity, right.identity) ||
    compareText(left.field, right.field)
  );
}

/** @param {unknown} value @param {string} field */
function optionalText(value, field) {
  return value === undefined || value === null ? null : requiredText(value, field);
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
function normalizeObservedRepository(value, field) {
  if (value === undefined) {
    throw new TypeError(
      `${field} must explicitly report present, absent, or unknown repository state`,
    );
  }
  if (isRecord(value) && Object.hasOwn(value, "status")) {
    assertKnownFields(value, ["status"], field);
    if (value.status !== "unknown") throw new TypeError(`${field}.status must be unknown`);
    return { status: /** @type {const} */ ("unknown") };
  }
  return normalizeRepository(value, field);
}

/** @param {unknown} value @returns {value is {status: "unknown"}} */
function isUnknownRepository(value) {
  return isRecord(value) && value.status === "unknown";
}

/** @param {unknown} value @param {string} field */
function requiredDistTag(value, field) {
  const tag = requiredText(value, field);
  if (/\s/u.test(tag)) throw new TypeError(`${field} must not contain whitespace`);
  if (semver.validRange(tag) !== null) {
    throw new TypeError(`${field} must not be interpretable as a semantic-version range`);
  }
  return tag;
}

/** @param {unknown} value @param {string} field */
function optionalDistTag(value, field) {
  return value === undefined || value === null ? null : requiredDistTag(value, field);
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
    allowedAction: /** @type {"publish"} */ (allowedAction),
  };
}

/** @param {unknown} value @param {string} field */
function normalizeSha512SRI(value, field) {
  const integrity = requiredText(value, field);
  const match = /^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(integrity);
  if (match === null) throw new TypeError(`${field} must be a SHA-512 SRI string`);
  const encoded = match[1];
  if (encoded === undefined) throw new TypeError(`${field} must contain a SHA-512 value`);
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== 64 || bytes.toString("base64") !== encoded) {
    throw new TypeError(`${field} must contain one canonical 64-byte SHA-512 value`);
  }
  return `sha512-${encoded}`;
}

/** @param {string} digest */
function digestToSRI(digest) {
  return `sha512-${Buffer.from(digest.slice("sha512:".length), "hex").toString("base64")}`;
}

/**
 * Rebind npm-specific package metadata to the exact archive bytes re-read by the persisted-candidate loader.
 * The candidate record binds the same size and digests, while this projection supplies the immutable
 * `package.json` repository fact that is required for provenance-aware publication assessment.
 *
 * @param {unknown} value
 * @param {ReturnType<typeof normalizeExactCandidate>} candidate
 */
function normalizeExactArchive(value, candidate) {
  const archive = requiredRecord(value, "archive");
  assertKnownFields(archive, ["artifact", "package"], "archive");
  const artifact = requiredRecord(archive.artifact, "archive.artifact");
  assertKnownFields(artifact, ["size", "digests"], "archive.artifact");
  const size = artifact.size;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) {
    throw new TypeError("archive.artifact.size must be a positive safe integer");
  }
  const digests = requiredRecord(artifact.digests, "archive.artifact.digests");
  assertKnownFields(digests, ["sha256", "sha512"], "archive.artifact.digests");
  const sha256 = requiredText(digests.sha256, "archive.artifact.digests.sha256");
  const sha512 = requiredText(digests.sha512, "archive.artifact.digests.sha512");
  if (!isDigest(sha256, "sha256") || !isDigest(sha512, "sha512")) {
    throw new TypeError("archive artifact must retain canonical SHA-256 and SHA-512 digests");
  }
  if (
    size !== candidate.artifact.size ||
    sha256 !== candidate.artifact.digests.sha256 ||
    sha512 !== candidate.artifact.digests.sha512
  ) {
    throw new TypeError("archive package metadata is not bound to the exact candidate artifact");
  }

  const packageRecord = requiredRecord(archive.package, "archive.package");
  assertKnownFields(packageRecord, ["name", "version", "repository"], "archive.package");
  if (!Object.hasOwn(packageRecord, "repository")) {
    throw new TypeError(
      "archive.package.repository must explicitly report present or absent metadata",
    );
  }
  const name = requiredText(packageRecord.name, "archive.package.name");
  const version = requiredText(packageRecord.version, "archive.package.version");
  if (name !== candidate.package.name || version !== candidate.package.version) {
    throw new TypeError("archive package identity differs from the exact candidate binding");
  }
  return {
    name,
    version,
    repository: normalizeRepository(packageRecord.repository, "archive.package.repository"),
  };
}

/** @param {unknown} value */
function normalizePolicy(value) {
  const policy = requiredRecord(value, "policy");
  assertKnownFields(policy, ["schemaVersion", "activation", "publication"], "policy");
  if (policy.schemaVersion !== 1) throw new TypeError("policy.schemaVersion must be 1");
  const publication = requiredRecord(policy.publication, "policy.publication");
  assertKnownFields(
    publication,
    ["coordinate", "finalDistTag", "repository", "provenance", "authority"],
    "policy.publication",
  );
  let provenance = null;
  if (publication.provenance !== undefined && publication.provenance !== null) {
    const record = requiredRecord(publication.provenance, "policy.publication.provenance");
    assertKnownFields(record, ["required"], "policy.publication.provenance");
    provenance = {
      required: requiredBoolean(record.required, "policy.publication.provenance.required"),
    };
  }
  let authority = null;
  if (publication.authority !== undefined && publication.authority !== null) {
    const record = requiredRecord(publication.authority, "policy.publication.authority");
    assertKnownFields(record, ["bootstrap", "trustedPublisher"], "policy.publication.authority");
    let bootstrap = null;
    if (record.bootstrap !== undefined && record.bootstrap !== null) {
      const bootstrapRecord = requiredRecord(
        record.bootstrap,
        "policy.publication.authority.bootstrap",
      );
      assertKnownFields(bootstrapRecord, ["required"], "policy.publication.authority.bootstrap");
      bootstrap = {
        required: requiredBoolean(
          bootstrapRecord.required,
          "policy.publication.authority.bootstrap.required",
        ),
      };
    }
    authority = {
      bootstrap,
      trustedPublisher: normalizeTrustedPublisher(
        record.trustedPublisher,
        "policy.publication.authority.trustedPublisher",
      ),
    };
  }
  return {
    activation: normalizeActivation(policy.activation),
    publication: {
      coordinate: optionalText(publication.coordinate, "policy.publication.coordinate"),
      finalDistTag: optionalDistTag(publication.finalDistTag, "policy.publication.finalDistTag"),
      repository: normalizeRepository(publication.repository, "policy.publication.repository"),
      provenance,
      authority,
    },
  };
}

/** @param {unknown} value @param {string} field */
function normalizeProvenance(value, field) {
  const provenance = requiredRecord(value, field);
  assertKnownFields(provenance, ["status", "repository", "sourceRevision"], field);
  const status = requiredText(provenance.status, `${field}.status`);
  if (!PROVENANCE_STATES.has(status)) {
    throw new TypeError(`${field}.status is unsupported`);
  }
  if (status !== "present") {
    if (provenance.repository !== undefined || provenance.sourceRevision !== undefined) {
      throw new TypeError(`${field} may contain repository and sourceRevision only when present`);
    }
    return { status: /** @type {"absent" | "unknown"} */ (status) };
  }
  const repository = normalizeRepository(provenance.repository, `${field}.repository`);
  if (repository === null) throw new TypeError(`${field}.repository is required when present`);
  return {
    status: /** @type {"present"} */ (status),
    repository,
    sourceRevision: requiredRevision(provenance.sourceRevision, `${field}.sourceRevision`),
  };
}

/** @param {unknown} value */
function normalizeObservation(value) {
  const observation = requiredRecord(value, "observation");
  assertKnownFields(observation, ["schemaVersion", "package", "authority"], "observation");
  if (observation.schemaVersion !== 1) {
    throw new TypeError("observation.schemaVersion must be 1");
  }
  let packageObservation = null;
  if (observation.package !== null) {
    const packageRecord = requiredRecord(observation.package, "observation.package");
    assertKnownFields(
      packageRecord,
      ["coordinate", "versions", "distTags", "owners"],
      "observation.package",
    );
    if (!Array.isArray(packageRecord.versions)) {
      throw new TypeError("observation.package.versions must be an array");
    }
    if (!Array.isArray(packageRecord.distTags)) {
      throw new TypeError("observation.package.distTags must be an array");
    }
    if (!Array.isArray(packageRecord.owners)) {
      throw new TypeError("observation.package.owners must be an array");
    }
    const versions = packageRecord.versions.map((entry, index) => {
      const field = `observation.package.versions[${index}]`;
      const version = requiredRecord(entry, field);
      assertKnownFields(version, ["version", "integrity", "repository", "provenance"], field);
      return {
        version: requiredText(version.version, `${field}.version`),
        integrity:
          version.integrity === null
            ? null
            : normalizeSha512SRI(version.integrity, `${field}.integrity`),
        repository: normalizeObservedRepository(version.repository, `${field}.repository`),
        provenance: normalizeProvenance(version.provenance, `${field}.provenance`),
      };
    });
    const distTags = packageRecord.distTags.map((entry, index) => {
      const field = `observation.package.distTags[${index}]`;
      const tag = requiredRecord(entry, field);
      assertKnownFields(tag, ["name", "targetVersion"], field);
      return {
        name: requiredDistTag(tag.name, `${field}.name`),
        targetVersion: requiredText(tag.targetVersion, `${field}.targetVersion`),
      };
    });
    const owners = packageRecord.owners.map((owner, index) =>
      requiredText(owner, `observation.package.owners[${index}]`),
    );
    /** @param {string[]} values */
    const duplicate = (values) =>
      [...new Set(values.filter((entry, index) => values.indexOf(entry) !== index))].sort(
        compareText,
      )[0];
    const duplicateVersion = duplicate(versions.map(({ version }) => version));
    if (duplicateVersion !== undefined) {
      throw new TypeError(`observation.package.versions contains duplicate ${duplicateVersion}`);
    }
    const duplicateTag = duplicate(distTags.map(({ name }) => name));
    if (duplicateTag !== undefined) {
      throw new TypeError(`observation.package.distTags contains duplicate ${duplicateTag}`);
    }
    const duplicateOwner = duplicate(owners);
    if (duplicateOwner !== undefined) {
      throw new TypeError(`observation.package.owners contains duplicate ${duplicateOwner}`);
    }
    versions.sort((left, right) => compareText(left.version, right.version));
    distTags.sort((left, right) => compareText(left.name, right.name));
    owners.sort(compareText);
    packageObservation = {
      coordinate: requiredText(packageRecord.coordinate, "observation.package.coordinate"),
      versions,
      distTags,
      owners,
    };
  }
  const authorityRecord =
    observation.authority === undefined
      ? {}
      : requiredRecord(observation.authority, "observation.authority");
  assertKnownFields(
    authorityRecord,
    ["coordinate", "coordinateControl", "bootstrap", "credentials", "trustedPublisher"],
    "observation.authority",
  );
  const coordinateControl = authorityRecord.coordinateControl ?? "unknown";
  if (typeof coordinateControl !== "string" || !CONTROL_STATES.has(coordinateControl)) {
    throw new TypeError("observation.authority.coordinateControl is unsupported");
  }
  const bootstrap = authorityRecord.bootstrap ?? "unknown";
  if (typeof bootstrap !== "string" || !BOOTSTRAP_STATES.has(bootstrap)) {
    throw new TypeError("observation.authority.bootstrap is unsupported");
  }
  const credentials = authorityRecord.credentials ?? "not-observed";
  if (credentials !== "not-observed") {
    throw new TypeError("observation.authority.credentials must be not-observed");
  }
  return {
    package: packageObservation,
    authority: {
      coordinate: optionalText(authorityRecord.coordinate, "observation.authority.coordinate"),
      coordinateControl: /** @type {"controlled" | "uncontrolled" | "unknown"} */ (
        coordinateControl
      ),
      bootstrap: /** @type {"available" | "unavailable" | "unknown"} */ (bootstrap),
      credentials: /** @type {"not-observed"} */ (credentials),
      trustedPublisher: normalizeTrustedPublisher(
        authorityRecord.trustedPublisher,
        "observation.authority.trustedPublisher",
      ),
    },
  };
}

/**
 * Assess one exact inactive candidate against declarative npm policy and caller-supplied/read-only registry
 * and trust observations. The result is a deterministic report; no writer, registry client, credential, or
 * activation capability exists in this module.
 *
 * @param {unknown} input
 */
export function assessNpmPublication(input) {
  const request = requiredRecord(input, "input");
  assertKnownFields(request, ["candidate", "archive", "policy", "observation"], "input");
  /** @type {Array<{field: "candidate" | "policy" | "observation", detail: string}>} */
  const issues = [];
  /** @type {ReturnType<typeof normalizeExactCandidate> | undefined} */
  let candidate;
  /** @type {ReturnType<typeof normalizeExactArchive> | undefined} */
  let archive;
  /** @type {ReturnType<typeof normalizePolicy> | undefined} */
  let policy;
  /** @type {ReturnType<typeof normalizeObservation> | undefined} */
  let observation;
  /** @param {"candidate" | "policy" | "observation"} field @param {unknown} error */
  const recordIssue = (field, error) => {
    issues.push({ field, detail: error instanceof Error ? error.message : String(error) });
  };
  try {
    candidate = normalizeExactCandidate(request.candidate);
    archive = normalizeExactArchive(request.archive, candidate);
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
    throw new NpmAssessmentInputError(
      /** @type {ConstructorParameters<typeof NpmAssessmentInputError>[0]} */ (issues),
    );
  }
  if (
    candidate === undefined ||
    archive === undefined ||
    policy === undefined ||
    observation === undefined
  ) {
    throw new Error("npm assessment normalization completed without every required input");
  }

  const readiness = assessInactiveDistribution(
    /** @type {Parameters<typeof assessInactiveDistribution>[0]} */ (policy.activation),
  );
  const publication = policy.publication;
  const required = {
    coordinate: publication.coordinate,
    candidateCoordinate: candidate.package.name,
    candidateRepository: archive.repository,
    version: candidate.package.version,
    artifact: {
      ...candidate.artifact,
      integrity: digestToSRI(candidate.artifact.digests.sha512),
    },
    finalDistTag: publication.finalDistTag,
    repository: publication.repository,
    provenance:
      publication.provenance === null
        ? null
        : {
            required: publication.provenance.required,
            repository: publication.repository,
            sourceRevision: candidate.sourceRevision,
          },
    authority: publication.authority,
    evidence: candidate.evidence,
  };

  /** @type {NpmAssessmentFinding[]} */
  const matches = [];
  /** @type {NpmAssessmentFinding[]} */
  const missing = [];
  /** @type {NpmAssessmentFinding[]} */
  const unverified = [];
  /** @type {NpmAssessmentFinding[]} */
  const manualAuthority = [];
  /** @type {NpmAssessmentFinding[]} */
  const conflicts = [];

  /** @type {Array<[string, unknown, string]>} */
  const policyRequirements = [
    ["coordinate", required.coordinate, "public npm coordinate is unresolved"],
    ["finalDistTag", required.finalDistTag, "approved final dist-tag is unresolved"],
    ["repository", required.repository, "immutable repository identity is unresolved"],
    ["provenance", required.provenance, "provenance policy is unresolved"],
    ["authority", required.authority, "publication authority policy is unresolved"],
  ];
  for (const [field, value, detail] of policyRequirements) {
    if (value === null) {
      missing.push({ object: "policy", identity: "npm", field, detail });
    }
  }
  const activationCoordinate = policy.activation?.facts?.["public-npm-coordinate"]?.proposedValue;
  const activationCoordinateEvidence =
    policy.activation?.facts?.["public-npm-coordinate"]?.evidence?.kind;
  if (
    required.coordinate !== null &&
    activationCoordinate !== undefined &&
    activationCoordinate !== required.coordinate
  ) {
    conflicts.push({
      object: "policy",
      identity: "npm",
      field: "coordinate",
      detail: "publication coordinate differs from the activation-policy proposal",
      expected: required.coordinate,
      observed: activationCoordinate,
    });
  }
  if (
    required.coordinate !== null &&
    activationCoordinate === required.coordinate &&
    activationCoordinateEvidence === "occupied-incompatible"
  ) {
    conflicts.push({
      object: "authority",
      identity: required.coordinate,
      field: "coordinateAvailability",
      detail:
        "activation evidence reports the proposed npm coordinate as occupied and incompatible",
      expected: "available or controlled",
      observed: "occupied-incompatible",
    });
  }

  const coordinateMatchesCandidate =
    required.coordinate !== null && required.coordinate === candidate.package.name;
  if (required.coordinate !== null && !coordinateMatchesCandidate) {
    conflicts.push({
      object: "version",
      identity: `${required.coordinate}@${required.version}`,
      field: "coordinate",
      detail:
        "proposed npm coordinate differs from the package name embedded in the exact candidate",
      expected: candidate.package.name,
      observed: required.coordinate,
    });
  }

  let candidateMetadataCompatible =
    coordinateMatchesCandidate && required.repository !== null && required.provenance !== null;
  if (required.repository !== null && !isDeepStrictEqual(archive.repository, required.repository)) {
    conflicts.push({
      object: "version",
      identity: `${required.coordinate ?? candidate.package.name}@${required.version}`,
      field: "candidateRepository",
      detail: "repository metadata inside the exact candidate differs from publication policy",
      expected: required.repository,
      observed: archive.repository,
    });
    candidateMetadataCompatible = false;
  }

  const versionIdentity = `${required.coordinate ?? candidate.package.name}@${required.version}`;
  const tagIdentity = `${required.coordinate ?? candidate.package.name}@${required.finalDistTag ?? "<unresolved>"}`;
  let versionMatches = false;
  if (coordinateMatchesCandidate) {
    if (observation.package === null) {
      missing.push({
        object: "version",
        identity: versionIdentity,
        field: "presence",
        detail: "candidate version is absent",
      });
      if (required.finalDistTag !== null) {
        missing.push({
          object: "tag",
          identity: tagIdentity,
          field: "presence",
          detail: "approved final dist-tag is absent",
        });
      }
    } else if (observation.package.coordinate !== required.coordinate) {
      conflicts.push({
        object: "version",
        identity: versionIdentity,
        field: "coordinate",
        detail: "registry observation is for another package coordinate",
        expected: required.coordinate,
        observed: observation.package.coordinate,
      });
    } else {
      const observedVersion = observation.package.versions.find(
        ({ version }) => version === required.version,
      );
      if (observedVersion === undefined) {
        missing.push({
          object: "version",
          identity: versionIdentity,
          field: "presence",
          detail: "candidate version is absent",
        });
      } else {
        const conflictsBefore = conflicts.length;
        const unverifiedBefore = unverified.length;
        if (observedVersion.integrity === null) {
          unverified.push({
            object: "version",
            identity: versionIdentity,
            field: "integrity",
            detail: "registry observation does not contain SHA-512 integrity",
            expected: required.artifact.integrity,
            observed: null,
          });
        } else if (observedVersion.integrity !== required.artifact.integrity) {
          conflicts.push({
            object: "version",
            identity: versionIdentity,
            field: "integrity",
            detail: "immutable registry bytes differ from the exact candidate",
            expected: required.artifact.integrity,
            observed: observedVersion.integrity,
          });
        }
        if (required.repository !== null) {
          if (isUnknownRepository(observedVersion.repository)) {
            unverified.push({
              object: "version",
              identity: versionIdentity,
              field: "repository",
              detail: "repository metadata observation is unavailable",
              expected: required.repository,
              observed: "unknown",
            });
          } else if (!isDeepStrictEqual(observedVersion.repository, required.repository)) {
            conflicts.push({
              object: "version",
              identity: versionIdentity,
              field: "repository",
              detail: "immutable repository metadata differs from policy",
              expected: required.repository,
              observed: observedVersion.repository,
            });
          }
        }
        if (required.provenance?.required === true && required.provenance.repository !== null) {
          if (observedVersion.provenance.status === "unknown") {
            unverified.push({
              object: "version",
              identity: versionIdentity,
              field: "provenance",
              detail: "provenance observation is unavailable",
              expected: required.provenance,
              observed: "unknown",
            });
          } else if (
            observedVersion.provenance.status !== "present" ||
            !isDeepStrictEqual(
              observedVersion.provenance.repository,
              required.provenance.repository,
            ) ||
            observedVersion.provenance.sourceRevision !== required.provenance.sourceRevision
          ) {
            conflicts.push({
              object: "version",
              identity: versionIdentity,
              field: "provenance",
              detail: "immutable provenance evidence differs from policy and candidate source",
              expected: required.provenance,
              observed: observedVersion.provenance,
            });
          }
        }
        if (
          candidateMetadataCompatible &&
          conflicts.length === conflictsBefore &&
          unverified.length === unverifiedBefore
        ) {
          versionMatches = true;
          matches.push({
            object: "version",
            identity: versionIdentity,
            field: "immutable",
            detail: "immutable version bytes and metadata match the exact candidate",
            state: "matching",
          });
        }
      }

      if (required.finalDistTag !== null) {
        const observedTag = observation.package.distTags.find(
          ({ name }) => name === required.finalDistTag,
        );
        if (versionMatches && observedTag?.targetVersion === required.version) {
          matches.push({
            object: "tag",
            identity: tagIdentity,
            field: "targetVersion",
            detail: "approved final dist-tag matches the candidate version",
            state: "matching",
          });
        } else if (versionMatches) {
          manualAuthority.push({
            object: "tag",
            identity: tagIdentity,
            field: "targetVersion",
            detail:
              "matching immutable version requires later human-authorized dist-tag work; automatic repair is unsafe",
            expected: required.version,
            observed: observedTag?.targetVersion ?? null,
          });
        } else if (observedTag === undefined) {
          missing.push({
            object: "tag",
            identity: tagIdentity,
            field: "presence",
            detail: "approved final dist-tag is absent",
          });
        }
      }
    }
  }

  const authorityIdentity = required.coordinate ?? candidate.package.name;
  const authorityBound =
    required.coordinate !== null && observation.authority.coordinate === required.coordinate;
  if (required.coordinate === null || observation.authority.coordinate === null) {
    unverified.push({
      object: "authority",
      identity: authorityIdentity,
      field: "coordinate",
      detail: "authority observation is not bound to a resolved package coordinate",
      expected: required.coordinate ?? "resolved npm coordinate",
      observed: observation.authority.coordinate,
    });
  } else if (!authorityBound) {
    unverified.push({
      object: "authority",
      identity: authorityIdentity,
      field: "coordinate",
      detail: "authority observation for another coordinate cannot establish target authority",
      expected: required.coordinate,
      observed: observation.authority.coordinate,
    });
  }

  if (authorityBound && observation.authority.coordinateControl === "controlled") {
    matches.push({
      object: "authority",
      identity: authorityIdentity,
      field: "coordinateControl",
      detail: "caller-supplied observation reports controlled coordinate authority",
      state: "matching",
    });
  } else if (authorityBound && observation.authority.coordinateControl === "uncontrolled") {
    conflicts.push({
      object: "authority",
      identity: authorityIdentity,
      field: "coordinateControl",
      detail: "caller-supplied observation reports an uncontrolled coordinate",
      expected: "controlled",
      observed: "uncontrolled",
    });
  } else if (authorityBound) {
    unverified.push({
      object: "authority",
      identity: authorityIdentity,
      field: "coordinateControl",
      detail: "coordinate authority is unverified",
      expected: "controlled",
      observed: "unknown",
    });
  }

  if (authorityBound && required.authority?.bootstrap?.required === true) {
    if (observation.authority.bootstrap === "available") {
      matches.push({
        object: "authority",
        identity: authorityIdentity,
        field: "bootstrap",
        detail: "caller-supplied observation reports bootstrap authority available",
        state: "matching",
      });
    } else {
      unverified.push({
        object: "authority",
        identity: authorityIdentity,
        field: "bootstrap",
        detail: "first-publication bootstrap authority is not available",
        expected: "available",
        observed: observation.authority.bootstrap,
      });
    }
  }

  if (
    authorityBound &&
    required.authority?.trustedPublisher !== null &&
    required.authority !== null
  ) {
    if (observation.authority.trustedPublisher === null) {
      unverified.push({
        object: "authority",
        identity: authorityIdentity,
        field: "trustedPublisher",
        detail: "trusted-publisher observation is unavailable",
        expected: required.authority.trustedPublisher,
        observed: null,
      });
    } else if (
      !isDeepStrictEqual(
        observation.authority.trustedPublisher,
        required.authority.trustedPublisher,
      )
    ) {
      unverified.push({
        object: "authority",
        identity: authorityIdentity,
        field: "trustedPublisher",
        detail:
          "trusted-publisher identity differs from policy and requires later authority review",
        expected: required.authority.trustedPublisher,
        observed: observation.authority.trustedPublisher,
      });
    } else {
      matches.push({
        object: "authority",
        identity: authorityIdentity,
        field: "trustedPublisher",
        detail: "trusted-publisher identity matches policy",
        state: "matching",
      });
    }
  }

  matches.sort(compareFinding);
  missing.sort(compareFinding);
  unverified.sort(compareFinding);
  manualAuthority.sort(compareFinding);
  conflicts.sort(compareFinding);
  return {
    schemaVersion: 1,
    channel: "npm",
    activation: readiness.activation,
    releaseEligibility: readiness.releaseEligibility,
    publicationCapable: readiness.publicationCapable,
    candidate: {
      candidateId: candidate.candidateId,
      package: { ...candidate.package, repository: archive.repository },
      proposedTag: candidate.proposedTag,
      sourceRevision: candidate.sourceRevision,
    },
    required,
    observedAuthority: {
      ...observation.authority,
      owners: observation.package?.owners ?? [],
    },
    unresolvedPolicyFacts: readiness.unresolvedFacts,
    matches,
    missing,
    unverified,
    manualAuthority,
    conflicts,
    safeActions: [],
    prohibitedActions: PROHIBITED_ACTIONS,
  };
}
