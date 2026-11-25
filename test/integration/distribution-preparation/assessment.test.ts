import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  ACTIVATION_FACT_INVENTORY,
  ACTIVATION_FACT_KEYS,
} from "../../../distribution-preparation/readiness.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const ENTRY = join(REPO_ROOT, "distribution-preparation", "assess-readiness.js");
const tempDirs: string[] = [];

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "wpm-distribution-readiness-"));
  tempDirs.push(directory);
  return directory;
}

function run(args: readonly string[] = []) {
  return spawnSync(process.execPath, [ENTRY, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
}

function completeFacts(): Record<string, unknown> {
  return Object.fromEntries(
    ACTIVATION_FACT_INVENTORY.map((definition) => [
      definition.key,
      {
        ...(definition.proposalRequired ? { proposedValue: "synthetic proposal" } : {}),
        authorization: { decision: "authorized", reference: "synthetic decision" },
        ...(definition.acceptedEvidence.length > 0
          ? {
              evidence: {
                kind: definition.acceptedEvidence[0],
                reference: "synthetic read-only observation",
              },
            }
          : {}),
      },
    ]),
  );
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("unshipped maintainer distribution-readiness assessment", () => {
  it("reports a wholly missing record as inactive, aggregating the bounded inventory", () => {
    const result = run();

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout) as {
      readonly status: string;
      readonly releaseEligibility: string;
      readonly unresolvedFacts: ReadonlyArray<{ readonly key: string }>;
    };
    expect(report.status).toBe("inactive");
    expect(report.releaseEligibility).toBe("ineligible");
    expect(report.unresolvedFacts.map((fact) => fact.key)).toEqual(ACTIVATION_FACT_KEYS);
  });

  it("accepts a caller-supplied local JSON record and remains fail-closed", () => {
    const directory = tempDir();
    const record = join(directory, "activation.json");
    writeFileSync(record, JSON.stringify({ facts: {} }), "utf8");

    const first = run([record]);
    const second = run([record]);

    expect(first.status).toBe(1);
    expect(first.stdout).toBe(second.stdout);
    expect(JSON.parse(first.stdout)).toMatchObject({
      status: "inactive",
      activation: "disabled",
      releaseEligibility: "ineligible",
      publicationCapable: false,
    });
  });

  it("keeps a synthetically complete JSON record inactive across the executable boundary", () => {
    const directory = tempDir();
    const record = join(directory, "complete-activation.json");
    writeFileSync(record, JSON.stringify({ facts: completeFacts() }), "utf8");

    const result = run([record]);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "inactive",
      activation: "disabled",
      releaseEligibility: "ineligible",
      publicationCapable: false,
      unresolvedFacts: [],
    });
  });

  it("keeps package metadata from authorizing a coordinate across the executable boundary", () => {
    const directory = tempDir();
    const record = join(directory, "metadata-only-coordinate.json");
    const facts = completeFacts();
    facts["public-npm-coordinate"] = {
      proposedValue: "candidate-coordinate",
      authorization: { decision: "authorized", reference: "synthetic decision" },
      evidence: { kind: "metadata-only", reference: "package.json name" },
    };
    writeFileSync(record, JSON.stringify({ facts }), "utf8");

    const result = run([record]);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "inactive",
      activation: "disabled",
      releaseEligibility: "ineligible",
      publicationCapable: false,
      unresolvedFacts: [
        {
          key: "public-npm-coordinate",
          label: "Public npm coordinate",
          reasons: ["metadata-is-not-control-evidence"],
          proposedValue: "candidate-coordinate",
          authorization: "authorized",
          evidence: "metadata-only",
        },
      ],
    });
  });

  it("retains the 0/2/1 executable contract without adding a positive activation exit", () => {
    const usage = run(["one.json", "two.json"]);
    expect(usage.status).toBe(2);
    expect(usage.stderr).toContain("usage:");

    const directory = tempDir();
    const malformed = join(directory, "malformed.json");
    writeFileSync(malformed, "not JSON", "utf8");
    const failure = run([malformed]);
    expect(failure.status).toBe(1);
    expect(failure.stderr).toContain("could not assess inactive distribution readiness");

    for (const [name, value, diagnostic] of [
      ["null", null, "JSON object"],
      ["array", [], "JSON object"],
      ["array-facts", { facts: [] }, '"facts" must be a JSON object'],
      [
        "primitive-fact",
        { facts: { "public-npm-coordinate": "candidate" } },
        "must be a JSON object",
      ],
      [
        "numeric-proposal",
        { facts: { "public-npm-coordinate": { proposedValue: 42 } } },
        "proposedValue must be a string",
      ],
      [
        "primitive-authorization",
        { facts: { "public-npm-coordinate": { authorization: "approved" } } },
        "authorization must be a JSON object",
      ],
      [
        "invalid-authorization",
        {
          facts: {
            "public-npm-coordinate": {
              authorization: { decision: "authorized", reference: 42 },
            },
          },
        },
        'decision "authorized" and a string reference',
      ],
      [
        "primitive-evidence",
        { facts: { "public-npm-coordinate": { evidence: "available" } } },
        "evidence must be a JSON object",
      ],
      [
        "invalid-evidence-kind",
        {
          facts: {
            "public-npm-coordinate": { evidence: { kind: 42, reference: "observation" } },
          },
        },
        "evidence must contain a supported kind and a string reference",
      ],
      [
        "unsupported-evidence-kind",
        {
          facts: {
            "public-npm-coordinate": {
              evidence: { kind: "registry-result", reference: "observation" },
            },
          },
        },
        "evidence must contain a supported kind and a string reference",
      ],
      [
        "invalid-evidence-reference",
        {
          facts: {
            "public-npm-coordinate": { evidence: { kind: "available", reference: 42 } },
          },
        },
        "evidence must contain a supported kind and a string reference",
      ],
    ] as const) {
      const invalid = join(directory, `${name}.json`);
      writeFileSync(invalid, JSON.stringify(value), "utf8");
      const invalidResult = run([invalid]);
      expect(invalidResult.status, name).toBe(1);
      expect(invalidResult.stdout, name).toBe("");
      expect(invalidResult.stderr, name).toContain(
        "could not assess inactive distribution readiness",
      );
      expect(invalidResult.stderr, name).toContain(diagnostic);
    }
  });

  it("has a read-only local boundary with no credential, network, subprocess, or remote-mutation capability", () => {
    const readinessSource = readFileSync(
      join(REPO_ROOT, "distribution-preparation", "readiness.js"),
      "utf8",
    );
    const entrySource = readFileSync(ENTRY, "utf8");
    const source = `${readinessSource}\n${entrySource}`;

    expect(readinessSource.match(/^import .*$/gm) ?? []).toEqual([]);
    expect(entrySource.match(/^import .*$/gm)).toEqual([
      'import { readFileSync } from "node:fs";',
      'import { resolve } from "node:path";',
      'import { pathToFileURL } from "node:url";',
      'import { assessInactiveDistribution } from "./readiness.js";',
    ]);
    expect(source).not.toMatch(/\b(?:import\s*\(|require\s*\()/);

    for (const forbidden of [
      "node:child_process",
      "node:net",
      "node:dns",
      "node:tls",
      "node:dgram",
      "execa",
      "undici",
      "fetch(",
      "WebSocket",
      "node:http",
      "node:https",
      "node:http2",
      "process.env",
      "npm publish",
      "npm dist-tag",
      "gh release",
      "git push",
    ]) {
      expect(source, `distribution preparation must not expose ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });
});
