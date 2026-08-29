/**
 * @typedef {"public-npm-coordinate" | "public-executable-alias-policy" | "channel-roles-and-precedence" | "stable-prerelease-mapping" | "github-immutability-policy" | "npm-public-github-pending-recovery-policy" | "github-authority-trust-evidence" | "npm-authority-trust-evidence"} ActivationFactKey
 */

/** @typedef {"available" | "controlled" | "occupied-incompatible" | "metadata-only"} EvidenceKind */

/**
 * @typedef ActivationFact
 * @property {string=} proposedValue
 * @property {{decision: "authorized", reference: string}=} authorization
 * @property {{kind: EvidenceKind, reference: string}=} evidence
 */

/**
 * @typedef ActivationRecord
 * @property {Partial<Record<ActivationFactKey, ActivationFact>>=} facts
 */

/**
 * @typedef FactDefinition
 * @property {ActivationFactKey} key
 * @property {string} label
 * @property {boolean} proposalRequired
 * @property {boolean} authorizationRequired
 * @property {readonly EvidenceKind[]} acceptedEvidence
 */

/**
 * @typedef UnresolvedFact
 * @property {ActivationFactKey} key
 * @property {string} label
 * @property {readonly string[]} reasons
 * @property {string=} proposedValue
 * @property {"authorized"=} authorization
 * @property {EvidenceKind=} evidence
 */

/**
 * @typedef InactiveReadinessResult
 * @property {"inactive"} status
 * @property {"disabled"} activation
 * @property {"ineligible"} releaseEligibility
 * @property {false} publicationCapable
 * @property {readonly UnresolvedFact[]} unresolvedFacts
 */

/**
 * The complete, closed activation-fact inventory for inactive distribution preparation. The definitions
 * describe which independent inputs resolve each fact without assigning any public coordinate or policy value.
 * Inventory order is part of the maintainer-facing contract and therefore remains deterministic.
 *
 * @type {FactDefinition[]}
 */
const activationFactDefinitions = [
  {
    key: "public-npm-coordinate",
    label: "Public npm coordinate",
    proposalRequired: true,
    authorizationRequired: true,
    acceptedEvidence: Object.freeze(["available", "controlled"]),
  },
  {
    key: "public-executable-alias-policy",
    label: "Public executable-name and alias policy",
    proposalRequired: true,
    authorizationRequired: true,
    acceptedEvidence: Object.freeze([]),
  },
  {
    key: "channel-roles-and-precedence",
    label: "GitHub and npm channel roles and precedence",
    proposalRequired: true,
    authorizationRequired: true,
    acceptedEvidence: Object.freeze([]),
  },
  {
    key: "stable-prerelease-mapping",
    label: "Stable-versus-prerelease mapping",
    proposalRequired: true,
    authorizationRequired: true,
    acceptedEvidence: Object.freeze([]),
  },
  {
    key: "github-immutability-policy",
    label: "GitHub immutability policy",
    proposalRequired: true,
    authorizationRequired: true,
    acceptedEvidence: Object.freeze([]),
  },
  {
    key: "npm-public-github-pending-recovery-policy",
    label: "Bounded npm-public and GitHub-pending recovery policy",
    proposalRequired: true,
    authorizationRequired: true,
    acceptedEvidence: Object.freeze([]),
  },
  {
    key: "github-authority-trust-evidence",
    label: "GitHub authority and trust evidence",
    proposalRequired: false,
    authorizationRequired: true,
    acceptedEvidence: Object.freeze(["controlled"]),
  },
  {
    key: "npm-authority-trust-evidence",
    label: "npm authority and trust evidence",
    proposalRequired: false,
    authorizationRequired: true,
    acceptedEvidence: Object.freeze(["controlled"]),
  },
];

/** Stable, immutable public view of the closed activation-fact inventory. */
export const ACTIVATION_FACT_INVENTORY = Object.freeze(
  activationFactDefinitions.map((definition) => Object.freeze(definition)),
);

/** Stable machine-readable keys for callers that need to compare or present the bounded inventory. */
export const ACTIVATION_FACT_KEYS = Object.freeze(
  ACTIVATION_FACT_INVENTORY.map((definition) => definition.key),
);

/** @param {string | undefined} value */
function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** @param {ActivationFact | undefined} fact */
function isAuthorized(fact) {
  return fact?.authorization?.decision === "authorized" && hasText(fact.authorization.reference);
}

/**
 * @param {FactDefinition} definition
 * @param {ActivationFact | undefined} fact
 * @returns {UnresolvedFact | undefined}
 */
function unresolvedFact(definition, fact) {
  const reasons = [];
  if (definition.proposalRequired && !hasText(fact?.proposedValue)) {
    reasons.push("missing-proposal");
  }
  if (definition.authorizationRequired && !isAuthorized(fact)) {
    reasons.push("missing-authorization");
  }
  if (definition.acceptedEvidence.length > 0) {
    const evidenceKind = fact?.evidence?.kind;
    if (evidenceKind === undefined || !hasText(fact?.evidence?.reference)) {
      reasons.push("missing-evidence");
    } else if (evidenceKind === "occupied-incompatible") {
      reasons.push("occupied-incompatible");
    } else if (evidenceKind === "metadata-only") {
      reasons.push("metadata-is-not-control-evidence");
    } else if (!definition.acceptedEvidence.includes(evidenceKind)) {
      reasons.push("unsupported-evidence");
    }
  }

  if (reasons.length === 0) return undefined;

  return {
    key: definition.key,
    label: definition.label,
    reasons,
    ...(hasText(fact?.proposedValue) ? { proposedValue: fact?.proposedValue } : {}),
    ...(isAuthorized(fact) ? { authorization: "authorized" } : {}),
    ...(fact?.evidence?.kind === undefined ? {} : { evidence: fact.evidence.kind }),
  };
}

/**
 * Assess caller-supplied activation facts against the closed Story 1.1 inventory. This increment has no
 * positive activation path: even synthetically complete input remains inactive, release-ineligible, and unable
 * to publish. The function performs no I/O and consumes no credentials or remote capability.
 *
 * @param {ActivationRecord | undefined} record
 * @returns {InactiveReadinessResult}
 */
export function assessInactiveDistribution(record) {
  const unresolvedFacts = ACTIVATION_FACT_INVENTORY.flatMap((definition) => {
    const issue = unresolvedFact(definition, record?.facts?.[definition.key]);
    return issue === undefined ? [] : [issue];
  });

  return {
    status: "inactive",
    activation: "disabled",
    releaseEligibility: "ineligible",
    publicationCapable: false,
    unresolvedFacts,
  };
}
