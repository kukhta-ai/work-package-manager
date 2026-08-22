import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { runCandidatePreparation } from "../../../distribution-preparation/prepare-candidate.js";

const BLOCK_SIZE = 512;
const REVISION = "a".repeat(40);

function writeString(target: Buffer, offset: number, length: number, value: string): void {
  target.write(value, offset, Math.min(length, Buffer.byteLength(value)), "utf8");
}

function tarEntry(path: string, body: string): Buffer {
  const header = Buffer.alloc(BLOCK_SIZE);
  writeString(header, 0, 100, path);
  writeString(header, 100, 8, "0000644\0");
  writeString(header, 108, 8, "0000000\0");
  writeString(header, 116, 8, "0000000\0");
  writeString(header, 124, 12, `${Buffer.byteLength(body).toString(8).padStart(11, "0")}\0`);
  writeString(header, 136, 12, "00000000000\0");
  header.fill(0x20, 148, 156);
  writeString(header, 156, 1, "0");
  writeString(header, 257, 6, "ustar\0");
  writeString(header, 263, 2, "00");
  const checksum = header.reduce((total, byte) => total + byte, 0);
  writeString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  const content = Buffer.from(body);
  return Buffer.concat([
    header,
    content,
    Buffer.alloc((BLOCK_SIZE - (content.length % BLOCK_SIZE)) % BLOCK_SIZE),
  ]);
}

function tarball(manifest: Record<string, unknown>): Buffer {
  return gzipSync(
    Buffer.concat([
      tarEntry("package/package.json", JSON.stringify(manifest)),
      tarEntry("package/dist/cli.js", "#!/usr/bin/env node\n"),
      Buffer.alloc(BLOCK_SIZE * 2),
    ]),
  );
}

function sink() {
  return {
    text: "",
    write(chunk: string) {
      this.text += chunk;
    },
  };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "wpm-candidate-unit-"));
  const artifactPath = join(root, "wpm-0.1.0.tgz");
  const frozenPath = join(root, "frozen-wpm-0.1.0.tgz");
  const inspectionPath = join(root, "inspection.json");
  const installPath = join(root, "install.json");
  const qualityPath = join(root, "quality.json");
  const notesPath = join(root, "notes.md");
  const outputPath = join(root, "candidate output");
  const packageIdentity = {
    name: "wpm",
    version: "0.1.0",
    executableTargets: { installer: "./dist/cli.js", wpm: "./dist/cli.js" },
  };
  const artifact = tarball({
    name: "wpm",
    version: "0.1.0",
    bin: packageIdentity.executableTargets,
  });
  writeFileSync(artifactPath, artifact);
  writeFileSync(frozenPath, artifact);
  writeFileSync(
    inspectionPath,
    `${JSON.stringify({
      status: "accepted",
      violations: [],
      sourceRevision: REVISION,
      sourceBinding: { requestedRevision: "HEAD", checkoutRevision: REVISION, clean: true },
      package: packageIdentity,
      artifact: { path: artifactPath, size: artifact.length },
      expectedPaths: ["dist/cli.js", "package.json"],
      actualPaths: ["dist/cli.js", "package.json"],
    })}\n`,
  );
  writeFileSync(
    installPath,
    `${JSON.stringify({
      status: "accepted",
      sourceRevision: REVISION,
      sourceBinding: { requestedRevision: "HEAD", checkoutRevision: REVISION, clean: true },
      package: packageIdentity,
      artifact: { inspectedPath: artifactPath, frozenPath, size: artifact.length },
      installation: { status: "installed", npmVersion: "10.9.4" },
      executables: Object.entries(packageIdentity.executableTargets).map(([name, target]) => ({
        name,
        target,
        shimPath: join(root, "bin", name),
        version: "0.1.0",
      })),
      resources: {
        status: "accepted",
        resolvedPaths: ["dist/cli.js", "package.json"],
        missingPaths: [],
        probe: { status: "accepted", command: "wpm template show minimal", output: "minimal" },
      },
      configuration: {
        status: "unchanged",
        surfaces: [
          { path: join(root, "home", ".agents"), unchanged: true },
          { path: join(root, "home", ".claude"), unchanged: true },
          { path: join(root, "workspace", ".agents"), unchanged: true },
          { path: join(root, "workspace", ".claude"), unchanged: true },
          { path: join(root, "workspace", "AGENTS.md"), unchanged: true },
          { path: join(root, "workspace", "CLAUDE.md"), unchanged: true },
        ],
      },
    })}\n`,
  );
  writeFileSync(
    qualityPath,
    `${JSON.stringify({
      status: "accepted",
      sourceRevision: REVISION,
      checks: [
        { name: "build", status: "passed" },
        { name: "lint", status: "passed" },
        { name: "tests", status: "passed" },
        { name: "typecheck", status: "passed" },
      ],
    })}\n`,
  );
  writeFileSync(notesPath, "## Candidate\n\n- Inactive local candidate.\n");
  return { root, artifactPath, inspectionPath, installPath, qualityPath, notesPath, outputPath };
}

function args(input: ReturnType<typeof fixture>, tag = "v0.1.0"): string[] {
  return [
    "--inspection",
    input.inspectionPath,
    "--install",
    input.installPath,
    "--quality",
    input.qualityPath,
    "--tag",
    tag,
    "--notes",
    input.notesPath,
    "--output",
    input.outputPath,
  ];
}

describe("local inactive candidate preparation", () => {
  it("persists exact bytes and evidence once, then reuses the same identity unchanged", () => {
    const input = fixture();
    const firstOut = sink();
    const firstErr = sink();

    expect(runCandidatePreparation(args(input), firstOut, firstErr)).toBe(0);
    expect(firstErr.text).toBe("");
    const first = JSON.parse(firstOut.text);
    expect(first).toMatchObject({ status: "prepared", outcome: "created" });
    expect(first.distribution).toMatchObject({
      status: "inactive",
      activation: "disabled",
      releaseEligibility: "ineligible",
      publicationCapable: false,
    });
    const record = JSON.parse(readFileSync(join(input.outputPath, "candidate.json"), "utf8"));
    expect(record.candidateId).toBe(first.candidateId);
    expect(readFileSync(join(input.outputPath, record.binding.artifact.path))).toEqual(
      readFileSync(input.artifactPath),
    );
    expect(record.binding.artifact.digests).toEqual(first.binding.artifact.digests);
    expect(record.binding.releaseNotes.preview).toContain("Inactive local candidate");

    const secondOut = sink();
    expect(runCandidatePreparation(args(input), secondOut, sink())).toBe(0);
    const second = JSON.parse(secondOut.text);
    expect(second).toMatchObject({
      status: "prepared",
      outcome: "reused",
      candidateId: first.candidateId,
    });
    expect(readdirSync(input.root).filter((name) => name.startsWith(".candidate output"))).toEqual(
      [],
    );
  });

  it("preserves the prior candidate and reports a changed binding before reuse", () => {
    const input = fixture();
    const created = sink();
    expect(runCandidatePreparation(args(input), created, sink())).toBe(0);
    const before = readFileSync(join(input.outputPath, "candidate.json"));

    const changed = sink();
    expect(runCandidatePreparation(args(input, "v0.1.1"), changed, sink())).toBe(1);
    expect(JSON.parse(changed.text)).toMatchObject({
      status: "rejected",
      releaseEligibility: "ineligible",
      findings: [expect.objectContaining({ kind: "changed", field: "proposedTag" })],
    });
    expect(readFileSync(join(input.outputPath, "candidate.json"))).toEqual(before);
  });

  it("does not reuse a candidate when exact evidence bytes change without changing their accepted meaning", () => {
    const input = fixture();
    expect(runCandidatePreparation(args(input), sink(), sink())).toBe(0);
    const before = readFileSync(join(input.outputPath, "candidate.json"));
    const quality = readFileSync(input.qualityPath, "utf8");
    writeFileSync(input.qualityPath, quality.replace("\n", "\n\n"));

    const out = sink();
    expect(runCandidatePreparation(args(input), out, sink())).toBe(1);
    expect(JSON.parse(out.text)).toMatchObject({
      status: "rejected",
      findings: [expect.objectContaining({ kind: "changed", field: "evidence.quality.rawDigest" })],
    });
    expect(readFileSync(join(input.outputPath, "candidate.json"))).toEqual(before);
  });

  it("rejects coordinated corruption of inactive facts and non-canonical candidate-owned paths", () => {
    const input = fixture();
    expect(runCandidatePreparation(args(input), sink(), sink())).toBe(0);
    const recordPath = join(input.outputPath, "candidate.json");
    const record = JSON.parse(readFileSync(recordPath, "utf8"));
    record.distribution.unresolvedFacts.pop();
    record.binding.releaseNotes.path = "evidence/../release-notes.md";
    writeFileSync(recordPath, `${JSON.stringify(record, undefined, 2)}\n`);

    const out = sink();
    expect(runCandidatePreparation(args(input), out, sink())).toBe(1);
    expect(JSON.parse(out.text).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "candidate.distribution" }),
        expect.objectContaining({ field: "releaseNotes.file" }),
      ]),
    );
  });

  it("rejects unsupported record fields and altered non-identity binding metadata", () => {
    const input = fixture();
    expect(runCandidatePreparation(args(input), sink(), sink())).toBe(0);
    const recordPath = join(input.outputPath, "candidate.json");
    const record = JSON.parse(readFileSync(recordPath, "utf8"));
    record.unexpectedEligibility = "active";
    record.binding.evidence.quality.status = "rejected";
    writeFileSync(recordPath, `${JSON.stringify(record, undefined, 2)}\n`);

    const out = sink();
    expect(runCandidatePreparation(args(input), out, sink())).toBe(1);
    expect(JSON.parse(out.text).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "candidate.binding" }),
        expect.objectContaining({ field: "candidate.record.unexpectedEligibility" }),
      ]),
    );
  });

  it("preserves an existing empty destination instead of treating it as a replaceable rename target", () => {
    const input = fixture();
    mkdirSync(input.outputPath);
    const marker = join(input.outputPath, "owned-by-another-process");
    writeFileSync(marker, "preserve");

    const out = sink();
    expect(runCandidatePreparation(args(input), out, sink())).toBe(1);
    expect(JSON.parse(out.text)).toMatchObject({
      status: "rejected",
      findings: expect.arrayContaining([expect.objectContaining({ field: "candidate.record" })]),
    });
    expect(readFileSync(marker, "utf8")).toBe("preserve");
    expect(existsSync(join(input.outputPath, "candidate.json"))).toBe(false);
  });

  it.skipIf(process.platform === "win32")(
    "rejects a persisted candidate file replaced by a symlink even when its target has matching bytes",
    () => {
      const input = fixture();
      expect(runCandidatePreparation(args(input), sink(), sink())).toBe(0);
      const persistedNotes = join(input.outputPath, "release-notes.md");
      const externalNotes = join(input.root, "external-notes.md");
      writeFileSync(externalNotes, readFileSync(persistedNotes));
      unlinkSync(persistedNotes);
      symlinkSync(externalNotes, persistedNotes);

      const out = sink();
      expect(runCandidatePreparation(args(input), out, sink())).toBe(1);
      expect(JSON.parse(out.text)).toMatchObject({
        status: "rejected",
        findings: expect.arrayContaining([expect.objectContaining({ field: "releaseNotes.file" })]),
      });
      expect(readFileSync(externalNotes)).toEqual(readFileSync(input.notesPath));
    },
  );

  it("aggregates independent quality, install, notes, and frozen-artifact discrepancies", () => {
    const input = fixture();
    const install = JSON.parse(readFileSync(input.installPath, "utf8"));
    install.sourceRevision = "b".repeat(40);
    install.sourceBinding.checkoutRevision = install.sourceRevision;
    install.configuration.status = "changed";
    writeFileSync(input.installPath, JSON.stringify(install));
    const quality = JSON.parse(readFileSync(input.qualityPath, "utf8"));
    quality.sourceRevision = "c".repeat(40);
    quality.checks[1].status = "failed";
    writeFileSync(input.qualityPath, JSON.stringify(quality));
    writeFileSync(input.notesPath, "");
    writeFileSync(join(input.root, "frozen-wpm-0.1.0.tgz"), "different bytes");

    const out = sink();
    expect(runCandidatePreparation(args(input), out, sink())).toBe(1);
    const fields = JSON.parse(out.text).findings.map(({ field }: { field: string }) => field);
    expect(fields).toEqual(
      expect.arrayContaining([
        "packedInstall.sourceRevision",
        "packedInstall.configuration.status",
        "packedInstall.frozenArtifact.size",
        "quality.sourceRevision",
        "quality.checks.lint",
        "releaseNotes.preview",
      ]),
    );
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("rejects evidence and release notes that are not exact UTF-8 text", () => {
    const input = fixture();
    const quality = readFileSync(input.qualityPath);
    const checkName = quality.indexOf("build");
    if (checkName === -1) throw new Error("quality fixture does not contain build check");
    quality[checkName] = 0xff;
    writeFileSync(input.qualityPath, quality);
    writeFileSync(input.notesPath, Buffer.from([0x23, 0x20, 0xff, 0x0a]));

    const out = sink();
    expect(runCandidatePreparation(args(input), out, sink())).toBe(1);
    expect(JSON.parse(out.text).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "quality.file" }),
        expect.objectContaining({ field: "releaseNotes.preview" }),
      ]),
    );
  });

  it("recomputes semantic evidence instead of trusting a coordinated raw-digest edit", () => {
    const input = fixture();
    expect(runCandidatePreparation(args(input), sink(), sink())).toBe(0);
    const persistedQualityPath = join(input.outputPath, "evidence", "quality.json");
    const persistedQuality = JSON.parse(readFileSync(persistedQualityPath, "utf8"));
    persistedQuality.checks.push({ name: "unreviewed-extra", status: "passed" });
    const changedBytes = Buffer.from(`${JSON.stringify(persistedQuality)}\n`);
    writeFileSync(persistedQualityPath, changedBytes);
    const recordPath = join(input.outputPath, "candidate.json");
    const record = JSON.parse(readFileSync(recordPath, "utf8"));
    record.binding.evidence.quality.rawDigest = `sha256:${createHash("sha256")
      .update(changedBytes)
      .digest("hex")}`;
    writeFileSync(recordPath, `${JSON.stringify(record, undefined, 2)}\n`);

    const out = sink();
    expect(runCandidatePreparation(args(input), out, sink())).toBe(1);
    expect(JSON.parse(out.text)).toMatchObject({
      status: "rejected",
      findings: expect.arrayContaining([
        expect.objectContaining({ field: "evidence.quality.digest" }),
      ]),
    });
  });
});
