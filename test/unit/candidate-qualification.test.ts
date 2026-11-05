import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertCandidateOutput,
  assertPeerQualificationAffinity,
  assertUnchangedSource,
  digest,
  runCandidate,
  validateQualification,
} from "../../scripts/candidate.mjs";

const expected = {
  candidateId: "candidate-id",
  candidateDigest: digest("candidate record"),
  sourceRevision: "a".repeat(40),
};
const binding = () => ({
  schemaVersion: 1,
  ...expected,
  distribution: "inactive",
  qualityCommand: "npm run quality:release",
  toolchain: {
    node: "24.16.0",
    npm: "11.0.0",
    platform: "linux",
    arch: "x64",
    lockfileDigest: digest("lock"),
  },
});
const envelope = (value: object) => ({
  binding: value,
  qualificationId: digest(JSON.stringify(value)),
});
const peer = {
  name: "backlog.md",
  version: "1.45.2",
  integrity: `sha512-${Buffer.alloc(64, 1).toString("base64")}`,
};
const peerReport = (selected = peer) => ({
  installation: {
    status: "installed",
    explicitPeers: {
      lockfileDigest: digest("lock"),
      packages: [{ ...selected, observedVersion: selected.version, packageRoot: "/old/prefix" }],
    },
  },
});
describe("inactive candidate qualification", () => {
  it("reuses the same qualified peer identity independently of its new input path", () => {
    expect(() =>
      assertPeerQualificationAffinity(
        [{ ...peer, path: "/new/verified-peer.tgz" }],
        peerReport(),
        digest("lock"),
      ),
    ).not.toThrow();
  });
  it("rejects changed, omitted or newly selected qualification peers on reuse", () => {
    for (const requested of [
      [{ ...peer, version: "1.55.3" }],
      [{ ...peer, integrity: `sha512-${Buffer.alloc(64, 2).toString("base64")}` }],
      [],
    ])
      expect(() =>
        assertPeerQualificationAffinity(requested, peerReport(), digest("lock")),
      ).toThrow(/differs/);
    expect(() =>
      assertPeerQualificationAffinity(
        [peer],
        { installation: { status: "installed" } },
        digest("lock"),
      ),
    ).toThrow(/differs/);
    expect(() =>
      assertPeerQualificationAffinity(
        [],
        { installation: { status: "installed" } },
        digest("lock"),
      ),
    ).not.toThrow();
    expect(() =>
      assertPeerQualificationAffinity([peer], peerReport(), digest("other lock")),
    ).toThrow(/different lockfile/);
  });
  it("rejects a missing requested peer archive before considering an existing output", () => {
    const directory = mkdtempSync(join(tmpdir(), "wpm-candidate-missing-peer-"));
    const root = join(directory, "source");
    const output = join(directory, "candidate");
    mkdirSync(root);
    mkdirSync(output);
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr);
    };
    try {
      writeFileSync(join(root, "package-lock.json"), "{}\n");
      const notes = join(root, "notes.md");
      writeFileSync(notes, "Fixture release notes\n");
      git(["init", "--quiet"]);
      git(["add", "--all"]);
      git([
        "-c",
        "user.name=WPM fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "fixture",
      ]);
      expect(() =>
        runCandidate(
          [
            "prepare",
            "--output",
            output,
            "--notes",
            notes,
            "--peer-archive",
            join(directory, "missing-peer.tgz"),
          ],
          root,
        ),
      ).toThrow(/missing-peer.tgz/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("rejects an outside path whose existing ancestor aliases the source checkout", () => {
    const directory = mkdtempSync(join(tmpdir(), "wpm-candidate-path-"));
    const root = join(directory, "source");
    mkdirSync(root);
    try {
      symlinkSync(
        root,
        join(directory, "alias"),
        process.platform === "win32" ? "junction" : "dir",
      );
      expect(() => assertCandidateOutput(root, join(directory, "alias/new/candidate"))).toThrow(
        /outside the source/,
      );
      expect(() =>
        assertCandidateOutput(root, join(directory, "outside/new/candidate")),
      ).not.toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("rejects a late source or lock change before recording qualification", () => {
    const root = mkdtempSync(join(tmpdir(), "wpm-candidate-source-"));
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    try {
      writeFileSync(join(root, "package-lock.json"), "{}\n");
      git(["init", "--quiet"]);
      git(["add", "package-lock.json"]);
      git([
        "-c",
        "user.name=WPM fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "fixture",
      ]);
      const revision = git(["rev-parse", "HEAD"]);
      const lock = digest("{}\n");
      expect(() => assertUnchangedSource(root, revision, lock)).not.toThrow();
      writeFileSync(join(root, "late-source.ts"), "export const late = true;\n");
      expect(() => assertUnchangedSource(root, revision, lock)).toThrow(/source changed/);
      rmSync(join(root, "late-source.ts"));
      writeFileSync(join(root, "package-lock.json"), '{"changed":true}\n');
      expect(() => assertUnchangedSource(root, revision, lock)).toThrow(/source changed/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("binds source, record bytes, toolchain and mandatory release command", () => {
    expect(validateQualification(envelope(binding()), expected)).toEqual(binding());
  });
  it("rejects record substitution and source substitution", () => {
    expect(() =>
      validateQualification(envelope(binding()), {
        ...expected,
        candidateDigest: digest("different record"),
      }),
    ).toThrow();
    expect(() =>
      validateQualification(envelope(binding()), { ...expected, sourceRevision: "b".repeat(40) }),
    ).toThrow();
  });
  it("rejects corrupt receipts and incomplete or relaxed qualification", () => {
    expect(() =>
      validateQualification(
        { ...envelope(binding()), qualificationId: digest("tampered") },
        expected,
      ),
    ).toThrow();
    for (const value of [
      { ...binding(), toolchain: {} },
      { ...binding(), distribution: "active" },
      { ...binding(), qualityCommand: "npm test" },
    ]) {
      expect(() => validateQualification(envelope(value), expected)).toThrow();
    }
  });
});
