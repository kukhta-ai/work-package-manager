import { describe, expect, it } from "vitest";
import {
  compareCandidateBindings,
  createCandidateIdentity,
  evaluateCandidateBinding,
} from "../../../distribution-preparation/candidate.js";

const REVISION = "a".repeat(40);
const OTHER_REVISION = "b".repeat(40);
const SHA256 = `sha256:${"1".repeat(64)}`;
const SHA512 = `sha512:${"2".repeat(128)}`;

function acceptedInput() {
  const packageIdentity = {
    name: "wpm",
    version: "0.1.0",
    executableTargets: { installer: "./dist/cli.js", wpm: "./dist/cli.js" },
  };
  return {
    proposedTag: "v0.1.0",
    artifact: {
      filename: "wpm-0.1.0.tgz",
      size: 42,
      digests: { sha256: SHA256, sha512: SHA512 },
    },
    inspection: {
      rawDigest: `sha256:${"3".repeat(64)}`,
      report: {
        status: "accepted",
        violations: [],
        sourceRevision: REVISION,
        sourceBinding: { requestedRevision: "HEAD", checkoutRevision: REVISION, clean: true },
        package: packageIdentity,
        artifact: { path: "/source/wpm-0.1.0.tgz", size: 42 },
        expectedPaths: ["dist/cli.js", "package.json"],
        actualPaths: ["dist/cli.js", "package.json"],
      },
    },
    packedInstall: {
      rawDigest: `sha256:${"4".repeat(64)}`,
      frozenArtifact: { size: 42, digests: { sha256: SHA256, sha512: SHA512 } },
      report: {
        status: "accepted",
        sourceRevision: REVISION,
        sourceBinding: { requestedRevision: "HEAD", checkoutRevision: REVISION, clean: true },
        package: packageIdentity,
        artifact: {
          inspectedPath: "/source/wpm-0.1.0.tgz",
          frozenPath: "/consumer/wpm-0.1.0.tgz",
          size: 42,
        },
        installation: { status: "installed", npmVersion: "10.9.4" },
        executables: [
          {
            name: "installer",
            target: "./dist/cli.js",
            shimPath: "/consumer/bin/installer",
            version: "0.1.0",
          },
          {
            name: "wpm",
            target: "./dist/cli.js",
            shimPath: "/consumer/bin/wpm",
            version: "0.1.0",
          },
        ],
        resources: {
          status: "accepted",
          resolvedPaths: ["dist/cli.js", "package.json"],
          missingPaths: [],
          probe: { status: "accepted", command: "wpm template show minimal", output: "minimal" },
        },
        configuration: {
          status: "unchanged",
          surfaces: [
            { path: "/consumer/home/.agents", unchanged: true },
            { path: "/consumer/home/.claude", unchanged: true },
            { path: "/consumer/workspace/.agents", unchanged: true },
            { path: "/consumer/workspace/.claude", unchanged: true },
            { path: "/consumer/workspace/AGENTS.md", unchanged: true },
            { path: "/consumer/workspace/CLAUDE.md", unchanged: true },
          ],
        },
      },
    },
    quality: {
      rawDigest: `sha256:${"5".repeat(64)}`,
      report: {
        status: "accepted",
        sourceRevision: REVISION,
        checks: [
          { name: "build", status: "passed" },
          { name: "lint", status: "passed" },
          { name: "tests", status: "passed" },
          { name: "typecheck", status: "passed" },
        ],
      },
    },
    releaseNotes: {
      preview: "## Candidate\n\n- Prepare inactive distribution.\n",
      digest: `sha256:${"6".repeat(64)}`,
    },
  };
}

describe("inactive candidate binding", () => {
  it("accepts one coherent package, revision, artifact, quality, install, and notes binding", () => {
    const result = evaluateCandidateBinding(acceptedInput());

    expect(result.findings).toEqual([]);
    expect(result.binding).toMatchObject({
      schemaVersion: 1,
      package: { name: "wpm", version: "0.1.0" },
      proposedTag: "v0.1.0",
      sourceRevision: REVISION,
      artifact: {
        filename: "wpm-0.1.0.tgz",
        size: 42,
        digests: { sha256: SHA256, sha512: SHA512 },
      },
      releaseNotes: { preview: "## Candidate\n\n- Prepare inactive distribution.\n" },
    });
    expect(result.binding?.evidence).toMatchObject({
      inspection: { status: "accepted" },
      quality: { status: "accepted" },
      packedInstall: { status: "accepted" },
    });
  });

  it("reports all independently observable missing and inconsistent evidence", () => {
    const input = acceptedInput();
    input.artifact.size = 43;
    input.packedInstall.report.package = {
      ...input.packedInstall.report.package,
      version: "0.2.0",
    };
    input.packedInstall.report.sourceRevision = OTHER_REVISION;
    input.packedInstall.report.sourceBinding.checkoutRevision = OTHER_REVISION;
    input.packedInstall.report.configuration.status = "changed";
    input.quality.report.sourceRevision = OTHER_REVISION;
    input.quality.report.checks[1] = { name: "lint", status: "failed" };
    input.releaseNotes.preview = "";

    const result = evaluateCandidateBinding(input);

    expect(result.binding).toBeUndefined();
    expect(result.findings.map(({ field }) => field)).toEqual(
      expect.arrayContaining([
        "artifact.size",
        "packedInstall.sourceRevision",
        "packedInstall.configuration.status",
        "packedInstall.package",
        "quality.sourceRevision",
        "quality.checks.lint",
        "releaseNotes.preview",
      ]),
    );
    expect(new Set(result.findings.map(({ field }) => field)).size).toBe(result.findings.length);
  });

  it("derives one stable identity from canonical semantic evidence rather than paths or object order", () => {
    const first = evaluateCandidateBinding(acceptedInput()).binding;
    const reordered = acceptedInput();
    reordered.inspection.report.artifact.path = "/different/input/wpm-0.1.0.tgz";
    reordered.packedInstall.report.artifact.inspectedPath = "/different/input/wpm-0.1.0.tgz";
    reordered.packedInstall.report.artifact.frozenPath = "/different/consumer/wpm-0.1.0.tgz";
    reordered.packedInstall.report.executables.reverse();
    reordered.quality.report.checks.reverse();
    const second = evaluateCandidateBinding(reordered).binding;

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) throw new Error("expected accepted bindings");
    expect(createCandidateIdentity(first)).toBe(createCandidateIdentity(second));
  });

  it("binds exact evidence bytes even when their accepted semantic summary is unchanged", () => {
    const original = evaluateCandidateBinding(acceptedInput()).binding;
    const changedInput = acceptedInput();
    changedInput.quality.rawDigest = `sha256:${"7".repeat(64)}`;
    const changed = evaluateCandidateBinding(changedInput).binding;

    if (original === undefined || changed === undefined)
      throw new Error("expected accepted bindings");

    expect(createCandidateIdentity(changed)).not.toBe(createCandidateIdentity(original));
    expect(compareCandidateBindings(original, changed)).toEqual([
      expect.objectContaining({ kind: "changed", field: "evidence.quality.rawDigest" }),
    ]);
  });

  it("rejects packed-install summaries that do not prove the declared executables, resources, and configuration observations", () => {
    const input = acceptedInput();
    input.packedInstall.report.executables = [
      { name: "wpm", target: "./wrong.js", shimPath: "/consumer/bin/wpm", version: "9.9.9" },
    ];
    input.packedInstall.report.sourceBinding.requestedRevision = "";
    input.packedInstall.report.artifact.inspectedPath = "";
    input.packedInstall.report.installation.npmVersion = "";
    input.packedInstall.report.resources.resolvedPaths = ["package.json"];
    input.packedInstall.report.resources.probe.status = "rejected";
    input.packedInstall.report.configuration.surfaces = [];

    const result = evaluateCandidateBinding(input);

    expect(result.binding).toBeUndefined();
    expect(result.findings.map(({ field }) => field)).toEqual(
      expect.arrayContaining([
        "packedInstall.configuration.surfaces",
        "packedInstall.artifact.inspectedPath",
        "packedInstall.executables.installer",
        "packedInstall.executables.wpm",
        "packedInstall.installation.npmVersion",
        "packedInstall.resources.probe.status",
        "packedInstall.resources.resolvedPaths",
        "packedInstall.sourceBinding.requestedRevision",
      ]),
    );
  });

  it("reports each changed required binding dimension and never treats it as the prior candidate", () => {
    const original = evaluateCandidateBinding(acceptedInput()).binding;
    const changedInput = acceptedInput();
    changedInput.proposedTag = "v0.1.1";
    changedInput.artifact.digests.sha256 = `sha256:${"7".repeat(64)}`;
    changedInput.artifact.digests.sha512 = `sha512:${"8".repeat(128)}`;
    changedInput.packedInstall.frozenArtifact.digests.sha256 = `sha256:${"7".repeat(64)}`;
    changedInput.packedInstall.frozenArtifact.digests.sha512 = `sha512:${"8".repeat(128)}`;
    changedInput.inspection.report.sourceRevision = OTHER_REVISION;
    changedInput.inspection.report.sourceBinding.checkoutRevision = OTHER_REVISION;
    changedInput.packedInstall.report.sourceRevision = OTHER_REVISION;
    changedInput.packedInstall.report.sourceBinding.checkoutRevision = OTHER_REVISION;
    changedInput.quality.report.sourceRevision = OTHER_REVISION;
    changedInput.quality.report.checks.push({ name: "package", status: "passed" });
    changedInput.inspection.rawDigest = `sha256:${"9".repeat(64)}`;
    changedInput.packedInstall.rawDigest = `sha256:${"a".repeat(64)}`;
    changedInput.quality.rawDigest = `sha256:${"b".repeat(64)}`;
    const changed = evaluateCandidateBinding(changedInput).binding;

    if (original === undefined || changed === undefined)
      throw new Error("expected accepted bindings");

    const findings = compareCandidateBindings(original, changed);

    expect(findings.map(({ field }) => field)).toEqual([
      "artifact.digests.sha256",
      "artifact.digests.sha512",
      "evidence.inspection.digest",
      "evidence.inspection.rawDigest",
      "evidence.packedInstall.digest",
      "evidence.packedInstall.rawDigest",
      "evidence.quality.digest",
      "evidence.quality.rawDigest",
      "proposedTag",
      "sourceRevision",
    ]);
  });
});
