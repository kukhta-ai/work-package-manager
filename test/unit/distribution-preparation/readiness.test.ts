import { describe, expect, it } from "vitest";
import {
  ACTIVATION_FACT_INVENTORY,
  ACTIVATION_FACT_KEYS,
  assessInactiveDistribution,
} from "../../../distribution-preparation/readiness.js";

const approval = (reference = "WPM decision record") => ({
  decision: "authorized" as const,
  reference,
});

const controlled = (reference = "read-only control observation") => ({
  kind: "controlled" as const,
  reference,
});

type ActivationRecord = NonNullable<Parameters<typeof assessInactiveDistribution>[0]>;
type CompleteActivationRecord = ActivationRecord & {
  facts: NonNullable<ActivationRecord["facts"]>;
};

const EXPECTED_FACT_INVENTORY = [
  {
    key: "public-npm-coordinate",
    label: "Public npm coordinate",
    proposalRequired: true,
    authorizationRequired: true,
    acceptedEvidence: ["available", "controlled"],
  },
  {
    key: "public-executable-alias-policy",
    label: "Public executable-name and alias policy",
    proposalRequired: true,
    authorizationRequired: true,
    acceptedEvidence: [],
  },
  {
    key: "channel-roles-and-precedence",
    label: "GitHub and npm channel roles and precedence",
    proposalRequired: true,
    authorizationRequired: true,
    acceptedEvidence: [],
  },
  {
    key: "stable-prerelease-mapping",
    label: "Stable-versus-prerelease mapping",
    proposalRequired: true,
    authorizationRequired: true,
    acceptedEvidence: [],
  },
  {
    key: "github-immutability-policy",
    label: "GitHub immutability policy",
    proposalRequired: true,
    authorizationRequired: true,
    acceptedEvidence: [],
  },
  {
    key: "npm-public-github-pending-recovery-policy",
    label: "Bounded npm-public and GitHub-pending recovery policy",
    proposalRequired: true,
    authorizationRequired: true,
    acceptedEvidence: [],
  },
  {
    key: "github-authority-trust-evidence",
    label: "GitHub authority and trust evidence",
    proposalRequired: false,
    authorizationRequired: true,
    acceptedEvidence: ["controlled"],
  },
  {
    key: "npm-authority-trust-evidence",
    label: "npm authority and trust evidence",
    proposalRequired: false,
    authorizationRequired: true,
    acceptedEvidence: ["controlled"],
  },
] as const;

const EXPECTED_FACT_KEYS = EXPECTED_FACT_INVENTORY.map(({ key }) => key);

function completeInventory(): CompleteActivationRecord {
  return {
    facts: {
      "public-npm-coordinate": {
        proposedValue: "synthetic-coordinate",
        authorization: approval(),
        evidence: { kind: "available" as const, reference: "supplied registry observation" },
      },
      "public-executable-alias-policy": {
        proposedValue: "synthetic alias policy",
        authorization: approval(),
      },
      "channel-roles-and-precedence": {
        proposedValue: "synthetic channel precedence",
        authorization: approval(),
      },
      "stable-prerelease-mapping": {
        proposedValue: "synthetic stability mapping",
        authorization: approval(),
      },
      "github-immutability-policy": {
        proposedValue: "synthetic immutability policy",
        authorization: approval(),
      },
      "npm-public-github-pending-recovery-policy": {
        proposedValue: "synthetic recovery decision",
        authorization: approval(),
      },
      "github-authority-trust-evidence": {
        authorization: approval("WPM GitHub authority decision"),
        evidence: controlled("read-only GitHub control observation"),
      },
      "npm-authority-trust-evidence": {
        authorization: approval("WPM npm authority decision"),
        evidence: controlled("read-only npm control observation"),
      },
    },
  };
}

describe("inactive distribution readiness contract", () => {
  it("publishes an immutable closed inventory so callers cannot change later assessments", () => {
    expect(Object.isFrozen(ACTIVATION_FACT_INVENTORY)).toBe(true);
    expect(Object.isFrozen(ACTIVATION_FACT_KEYS)).toBe(true);
    for (const definition of ACTIVATION_FACT_INVENTORY) {
      expect(Object.isFrozen(definition), definition.key).toBe(true);
      expect(Object.isFrozen(definition.acceptedEvidence), definition.key).toBe(true);
    }

    expect(
      ACTIVATION_FACT_INVENTORY.map(
        ({ key, label, proposalRequired, authorizationRequired, acceptedEvidence }) => ({
          key,
          label,
          proposalRequired,
          authorizationRequired,
          acceptedEvidence,
        }),
      ),
    ).toEqual(EXPECTED_FACT_INVENTORY);
    expect(ACTIVATION_FACT_KEYS).toEqual(EXPECTED_FACT_KEYS);
  });

  it("reports the whole bounded inventory once, in stable order, when no activation record exists", () => {
    const result = assessInactiveDistribution(undefined);

    expect(result).toMatchObject({
      status: "inactive",
      activation: "disabled",
      releaseEligibility: "ineligible",
      publicationCapable: false,
    });
    expect(result.unresolvedFacts.map((fact) => fact.key)).toEqual(EXPECTED_FACT_KEYS);
    expect(new Set(result.unresolvedFacts.map((fact) => fact.key)).size).toBe(
      EXPECTED_FACT_KEYS.length,
    );
    expect(result.unresolvedFacts.map(({ key, reasons }) => ({ key, reasons }))).toEqual(
      EXPECTED_FACT_INVENTORY.map(
        ({ key, proposalRequired, authorizationRequired, acceptedEvidence }) => ({
          key,
          reasons: [
            ...(proposalRequired ? ["missing-proposal"] : []),
            ...(authorizationRequired ? ["missing-authorization"] : []),
            ...(acceptedEvidence.length > 0 ? ["missing-evidence"] : []),
          ],
        }),
      ),
    );
  });

  it("aggregates a partial inventory and keeps each channel's missing authority evidence independent", () => {
    const partial = completeInventory();
    for (const key of EXPECTED_FACT_KEYS.slice(2)) delete partial.facts[key];

    const result = assessInactiveDistribution(partial);

    expect(result.unresolvedFacts.map((fact) => fact.key)).toEqual(EXPECTED_FACT_KEYS.slice(2));
    expect(result.unresolvedFacts.slice(-2).map((fact) => fact.key)).toEqual([
      "github-authority-trust-evidence",
      "npm-authority-trust-evidence",
    ]);
  });

  it("keeps every fact unresolved when required values are proposed but none is authorized", () => {
    const unauthorized = completeInventory();
    for (const key of EXPECTED_FACT_KEYS) delete unauthorized.facts[key]?.authorization;

    const result = assessInactiveDistribution(unauthorized);

    expect(result.unresolvedFacts.map((fact) => fact.key)).toEqual(EXPECTED_FACT_KEYS);
    for (const fact of result.unresolvedFacts) {
      expect(fact.reasons, fact.key).toEqual(["missing-authorization"]);
    }
  });

  it.each([
    {
      name: "unresolved",
      coordinate: {},
      reasons: ["missing-proposal", "missing-authorization", "missing-evidence"],
    },
    {
      name: "proposed but unauthorized",
      coordinate: { proposedValue: "candidate" },
      reasons: ["missing-authorization", "missing-evidence"],
    },
    {
      name: "occupied by incompatible state",
      coordinate: {
        proposedValue: "candidate",
        authorization: approval(),
        evidence: { kind: "occupied-incompatible" as const, reference: "supplied observation" },
      },
      reasons: ["occupied-incompatible"],
    },
    {
      name: "authorization only",
      coordinate: { proposedValue: "candidate", authorization: approval() },
      reasons: ["missing-evidence"],
    },
    {
      name: "evidence only",
      coordinate: {
        proposedValue: "candidate",
        evidence: { kind: "available" as const, reference: "supplied observation" },
      },
      reasons: ["missing-authorization"],
    },
    {
      name: "package metadata only",
      coordinate: {
        proposedValue: "candidate",
        evidence: { kind: "metadata-only" as const, reference: "package.json name" },
      },
      reasons: ["missing-authorization", "metadata-is-not-control-evidence"],
    },
    {
      name: "blank authorization reference",
      coordinate: {
        proposedValue: "candidate",
        authorization: approval("   "),
        evidence: { kind: "available" as const, reference: "supplied observation" },
      },
      reasons: ["missing-authorization"],
    },
    {
      name: "blank evidence reference",
      coordinate: {
        proposedValue: "candidate",
        authorization: approval(),
        evidence: { kind: "available" as const, reference: "   " },
      },
      reasons: ["missing-evidence"],
    },
  ])("keeps a $name coordinate release-ineligible", ({ coordinate, reasons }) => {
    const inventory = completeInventory();
    inventory.facts["public-npm-coordinate"] = coordinate;

    const result = assessInactiveDistribution(inventory);

    expect(result.releaseEligibility).toBe("ineligible");
    expect(result.unresolvedFacts).toEqual([
      expect.objectContaining({ key: "public-npm-coordinate", reasons }),
    ]);
  });

  it("keeps authorization, proposed values, and read-only evidence as independent requirements", () => {
    const result = assessInactiveDistribution({
      facts: {
        "public-npm-coordinate": {
          proposedValue: "candidate",
          authorization: approval(),
          evidence: { kind: "metadata-only", reference: "package.json name" },
        },
      },
    });

    expect(result.unresolvedFacts[0]).toMatchObject({
      key: "public-npm-coordinate",
      proposedValue: "candidate",
      authorization: "authorized",
      evidence: "metadata-only",
      reasons: ["metadata-is-not-control-evidence"],
    });
  });

  it("accepts supplied control evidence for the coordinate without making the release eligible", () => {
    const inventory = completeInventory();
    inventory.facts["public-npm-coordinate"] = {
      proposedValue: "candidate",
      authorization: approval(),
      evidence: controlled("supplied WPM control observation"),
    };

    const result = assessInactiveDistribution(inventory);

    expect(result.unresolvedFacts).toEqual([]);
    expect(result.releaseEligibility).toBe("ineligible");
    expect(result.publicationCapable).toBe(false);
  });

  it("rejects availability evidence where channel authority requires control evidence", () => {
    const inventory = completeInventory();
    inventory.facts["github-authority-trust-evidence"] = {
      authorization: approval(),
      evidence: { kind: "available", reference: "supplied availability observation" },
    };

    const result = assessInactiveDistribution(inventory);

    expect(result.unresolvedFacts).toEqual([
      expect.objectContaining({
        key: "github-authority-trust-evidence",
        reasons: ["unsupported-evidence"],
      }),
    ]);
    expect(result.releaseEligibility).toBe("ineligible");
  });

  it("stops at the complete-input boundary without introducing Story 1.7's positive states", () => {
    const result = assessInactiveDistribution(completeInventory());

    expect(result.unresolvedFacts).toEqual([]);
    expect(result).toMatchObject({
      status: "inactive",
      activation: "disabled",
      releaseEligibility: "ineligible",
      publicationCapable: false,
    });
    expect(JSON.stringify(result)).not.toMatch(/ready|complete|publishable/);
  });

  it("is deterministic for repeated identical input, including issue ordering and evidence", () => {
    const input = completeInventory();
    input.facts["public-npm-coordinate"] = {
      proposedValue: "candidate",
      evidence: { kind: "available", reference: "same supplied observation" },
    };

    expect(assessInactiveDistribution(input)).toEqual(assessInactiveDistribution(input));
  });

  it("ignores unknown input keys without expanding or resolving the closed inventory", () => {
    const input = { facts: { "future-unapproved-fact": { proposedValue: "not in contract" } } };

    const result = assessInactiveDistribution(
      input as unknown as Parameters<typeof assessInactiveDistribution>[0],
    );

    expect(result.unresolvedFacts.map((fact) => fact.key)).toEqual(EXPECTED_FACT_KEYS);
    expect(JSON.stringify(result)).not.toContain("future-unapproved-fact");
  });
});
