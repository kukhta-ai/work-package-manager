import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkProcessArtifacts,
  normalizeRepositoryPath,
  parseArtifactPolicy,
  validateArchiveMetadata,
  validateSchemaDefinition,
  validateSchemaValue,
  validateStateDocument,
  validateTrackedWorkingMemory,
} from "../../../scripts/check-process-artifacts.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

describe("process-artifact policy primitives", () => {
  it("normalizes portable paths and rejects paths with outside authority", () => {
    expect(normalizeRepositoryPath("./_bmad-output\\story.md")).toBe("_bmad-output/story.md");
    expect(normalizeRepositoryPath("../outside.md")).toBeUndefined();
    expect(normalizeRepositoryPath("/outside.md")).toBeUndefined();
    expect(normalizeRepositoryPath("C:\\outside.md")).toBeUndefined();
  });

  it("reports every tracked path under every configured working-memory root", () => {
    const violations = validateTrackedWorkingMemory(
      [
        "src/index.ts",
        "_bmad-output/story.md",
        "Skills-Results/run/result.md",
        ".bmad/local/session.json",
      ],
      ["_bmad-output", "Skills-Results", ".bmad/local"],
    );

    expect(violations.map(({ path }) => path)).toEqual([
      ".bmad/local/session.json",
      "Skills-Results/run/result.md",
      "_bmad-output/story.md",
    ]);
    expect(violations.every(({ code }) => code === "tracked-working-memory")).toBe(true);
  });

  it("rejects oversized or history-shaped live state with actionable keys", () => {
    const text = [
      "schemaVersion: 1",
      "phase: 7",
      "phaseName: Handoff",
      "branch: feature/example",
      "epic: example",
      "activeStory: null",
      "reviewCycle: 0",
      "specialists: {}",
      "gatesPending: []",
      "waivers: []",
      "completedStories: [task-1]",
      'lastUpdated: "2026-08-26T00:00:00Z"',
    ].join("\n");
    const violations = validateStateDocument(".bmad/sdlc-state.yaml", text, {
      path: ".bmad/sdlc-state.yaml",
      maxBytes: 64,
      maxLines: 20,
      requiredKeys: [
        "schemaVersion",
        "phase",
        "phaseName",
        "branch",
        "epic",
        "activeStory",
        "reviewCycle",
        "specialists",
        "gatesPending",
        "waivers",
        "lastUpdated",
      ],
      allowedKeys: [
        "schemaVersion",
        "phase",
        "phaseName",
        "branch",
        "epic",
        "activeStory",
        "reviewCycle",
        "specialists",
        "gatesPending",
        "waivers",
        "lastUpdated",
      ],
    });

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "state-too-large" }),
        expect.objectContaining({
          code: "unknown-state-key",
          detail: "completedStories is not allowed",
        }),
      ]),
    );
  });

  it("names the malformed gate field when a durable verdict is invalid", () => {
    const schema = JSON.parse(
      readFileSync(
        join(REPOSITORY_ROOT, "research/evolution/schemas/gate-receipt.schema.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const value = {
      schemaVersion: 1,
      id: "candidate-one",
      episodeId: "episode-one",
      candidate: {
        revision: null,
        baselineRevision: "a".repeat(40),
        branch: "feature/example",
        pullRequest: "https://example.invalid/pull/1",
      },
      verdict: "ready-ish",
      checks: [{ name: "tests", status: "passed", evidence: [] }],
      waivers: [],
      residualRisks: [],
      preCleanupRevision: "a".repeat(40),
      updatedAt: "2026-08-26T00:00:00Z",
    };

    expect(validateSchemaValue(value, schema)).toContain(
      "$.verdict: must be one of pending, pass, concerns, fail, waived",
    );
  });

  it("rejects unsafe or incomplete external archive metadata without requiring an archive", () => {
    expect(
      validateArchiveMetadata(
        "research/evolution/records/example.yaml",
        {
          archive: {
            status: "not-configured",
            rawEvidenceDisposition: "local-ignored-until-cleanup",
          },
        },
        {
          allowedSchemes: ["https", "s3"],
          checksumPattern: "^sha256:[a-f0-9]{64}$",
          privacyClasses: ["internal"],
        },
      ),
    ).toEqual([]);

    const violations = validateArchiveMetadata(
      "research/evolution/records/example.yaml",
      {
        archive: {
          status: "external",
          rawEvidenceDisposition: "local-ignored-until-cleanup",
          pointer: {
            uri: "https://user:secret@example.invalid/evidence?token=secret#fragment",
            checksum: "not-a-digest",
            expiresOn: "2026-02-31",
            privacyClass: "unknown",
          },
        },
      },
      {
        allowedSchemes: ["https", "s3"],
        checksumPattern: "^sha256:[a-f0-9]{64}$",
        privacyClasses: ["internal"],
      },
    );

    expect(violations.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "invalid-archive-disposition",
        "unsafe-archive-pointer",
        "invalid-archive-checksum",
        "invalid-archive-expiry",
        "invalid-archive-privacy",
        "missing-archive-approval",
      ]),
    );
  });

  it("rejects policy omissions and malformed regular expressions before using them", () => {
    const result = parseArtifactPolicy({
      schemaVersion: 1,
      workingMemory: { roots: [] },
      governanceDocument: "PROCESS-ARTIFACTS.md",
      state: {
        path: ".bmad/sdlc-state.yaml",
        maxBytes: 10,
        maxLines: 10,
        requiredKeys: [],
        allowedKeys: [],
      },
      durableEvidence: {
        evolutionRecords: {
          root: "research/evolution/records",
          extension: ".yaml",
          schema: "research/evolution/schemas/evolution-record.schema.json",
          minCount: 1,
          maxBytes: 10,
        },
        gateReceipts: {
          root: "research/evolution/gates",
          extension: ".json",
          schema: "research/evolution/schemas/gate-receipt.schema.json",
          minCount: 1,
          maxBytes: 10,
        },
      },
      archivePointers: {
        allowedSchemes: ["https"],
        checksumPattern: "[",
        privacyClasses: ["internal"],
      },
    });

    expect(result.policy).toBeUndefined();
    expect(result.problems).toEqual(
      expect.arrayContaining([
        "workingMemory.roots must include _bmad-output",
        "workingMemory.roots must include Skills-Results",
        expect.stringContaining("checksumPattern is invalid"),
      ]),
    );
  });

  it("rejects unsupported schema keywords and impossible date-times", () => {
    expect(
      validateSchemaDefinition({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "string",
        maximum: 2,
      }),
    ).toContain("$.maximum: unsupported schema keyword");
    expect(
      validateSchemaValue("2026-02-31T12:00:00Z", {
        type: "string",
        format: "date-time",
      }),
    ).toContain("$: must be an ISO date-time with timezone");
  });

  it("validates the committed state and pilot records independently of the migration index step", () => {
    const result = checkProcessArtifacts({ repositoryRoot: REPOSITORY_ROOT, trackedPaths: [] });
    expect(result.violations).toEqual([]);
    expect(result.evolutionRecordCount).toBe(1);
    expect(result.gateReceiptCount).toBe(2);
  });
});
