import { describe, expect, it } from "vitest";
import {
  buildLockfile,
  hashArtifactFiles,
  type Lockfile,
  parseLockfile,
  serializeLockfile,
  type VendoredArtifact,
  type VendoredFile,
  verifyLockfile,
} from "../../../src/core/services/integrity.js";

/** A vendored artifact fixture. */
function artifact(
  name: string,
  files: VendoredFile[],
  source = `${name}@v1.0`,
  version = "1.0.0",
): VendoredArtifact {
  return { name, source, version, files };
}

describe("hashArtifactFiles — deterministic, order-independent fingerprint (AC#1)", () => {
  const files: VendoredFile[] = [
    { path: "SKILL.md", content: "# do the thing" },
    { path: "references/journaling.md", content: "the recipe" },
  ];

  it("yields the same hash for the same tree", () => {
    expect(hashArtifactFiles(files)).toBe(hashArtifactFiles(files));
  });

  it("is order-independent: reordering files yields the same hash", () => {
    const reordered = [...files].reverse();
    expect(hashArtifactFiles(reordered)).toBe(hashArtifactFiles(files));
  });

  it("changes when a file's content changes", () => {
    const changed = [
      { path: "SKILL.md", content: "# do something ELSE" },
      files[1] as VendoredFile,
    ];
    expect(hashArtifactFiles(changed)).not.toBe(hashArtifactFiles(files));
  });

  it("changes when a file is renamed (same content, different path)", () => {
    const renamed = [{ path: "SKILL2.md", content: "# do the thing" }, files[1] as VendoredFile];
    expect(hashArtifactFiles(renamed)).not.toBe(hashArtifactFiles(files));
  });

  it("is injective across the path/content boundary (no length-collision)", () => {
    // {path:"a", content:"bc"} must NOT hash the same as {path:"ab", content:"c"}.
    expect(hashArtifactFiles([{ path: "a", content: "bc" }])).not.toBe(
      hashArtifactFiles([{ path: "ab", content: "c" }]),
    );
  });

  it("an empty tree has a stable hash; adding a file changes it", () => {
    const empty = hashArtifactFiles([]);
    expect(empty).toBe(hashArtifactFiles([]));
    expect(empty).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hashArtifactFiles([{ path: "x", content: "" }])).not.toBe(empty);
  });
});

describe("buildLockfile — pins source + version + hash (AC#1)", () => {
  it("pins each artifact's source, version, and content hash", () => {
    const a = artifact(
      "superpowers",
      [{ path: "SKILL.md", content: "tdd" }],
      "obra/superpowers@v2",
      "2.0.0",
    );
    const b = artifact(
      "ralph",
      [{ path: "ralph.sh", content: "loop" }],
      "snarktank/ralph@v1.2",
      "1.2.0",
    );
    const lock = buildLockfile([a, b]);

    expect(lock.version).toBe(1);
    expect(lock.artifacts.superpowers).toEqual({
      source: "obra/superpowers@v2",
      version: "2.0.0",
      hash: hashArtifactFiles(a.files),
    });
    expect(lock.artifacts.ralph?.source).toBe("snarktank/ralph@v1.2");
    expect(lock.artifacts.ralph?.hash).toBe(hashArtifactFiles(b.files));
  });

  it("is deterministic (same artifacts → deep-equal lockfile)", () => {
    const arts = [artifact("a", [{ path: "f", content: "1" }])];
    expect(buildLockfile(arts)).toEqual(buildLockfile(arts));
  });
});

describe("verifyLockfile — passes on match, fails on drift (AC#2)", () => {
  const arts = [
    artifact("superpowers", [{ path: "SKILL.md", content: "tdd" }]),
    artifact("ralph", [{ path: "ralph.sh", content: "loop" }]),
  ];
  const lock = buildLockfile(arts);

  it("passes when current content matches the pins", () => {
    expect(verifyLockfile(lock, arts)).toEqual({ ok: true, drifted: [], missing: [], extra: [] });
  });

  it("fails naming the drifted artifact when a file changed", () => {
    const tampered = [
      artifact("superpowers", [{ path: "SKILL.md", content: "TAMPERED" }]),
      arts[1] as VendoredArtifact,
    ];
    const result = verifyLockfile(lock, tampered);
    expect(result.ok).toBe(false);
    expect(result.drifted).toEqual(["superpowers"]);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
  });

  it("reports a missing artifact (pinned but not present)", () => {
    const result = verifyLockfile(lock, [arts[0] as VendoredArtifact]); // ralph absent
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["ralph"]);
    expect(result.drifted).toEqual([]);
  });

  it("reports an extra artifact (present but not pinned)", () => {
    const withExtra = [...arts, artifact("new-thing", [{ path: "x", content: "y" }])];
    const result = verifyLockfile(lock, withExtra);
    expect(result.ok).toBe(false);
    expect(result.extra).toEqual(["new-thing"]);
    expect(result.drifted).toEqual([]);
  });

  it("reports a mix of drift + missing + extra", () => {
    const messy = [
      artifact("superpowers", [{ path: "SKILL.md", content: "DRIFTED" }]), // drift
      // ralph missing
      artifact("extra-one", [{ path: "z", content: "z" }]), // extra
    ];
    const result = verifyLockfile(lock, messy);
    expect(result.ok).toBe(false);
    expect(result.drifted).toEqual(["superpowers"]);
    expect(result.missing).toEqual(["ralph"]);
    expect(result.extra).toEqual(["extra-one"]);
  });
});

describe("serialize/parse the wpm.lock — lossless round-trip (AC#3)", () => {
  const lock: Lockfile = buildLockfile([
    artifact("superpowers", [{ path: "SKILL.md", content: "tdd" }], "obra/superpowers@v2", "2.0.0"),
    artifact(
      "ralph",
      [{ path: "ralph.sh", content: "loop" }],
      "git+https://example/ralph#abc123",
      "1.2.0",
    ),
  ]);

  it("parse(serialize(lock)) deep-equals lock — all pins recoverable", () => {
    const text = serializeLockfile(lock);
    expect(parseLockfile(text)).toEqual(lock);
  });

  it("the serialized lock records, for each artifact, its source/version/hash (AC#3)", () => {
    const text = serializeLockfile(lock);
    expect(text).toContain("obra/superpowers@v2");
    expect(text).toContain("git+https://example/ralph#abc123");
    expect(text).toContain("sha256:");
  });

  it("throws on a malformed lockfile", () => {
    expect(() => parseLockfile("- not a mapping")).toThrow();
    expect(() => parseLockfile("version: 99\nartifacts: {}\n")).toThrow(/version/);
    expect(() => parseLockfile("version: 1\n")).toThrow(/artifacts/);
    expect(() => parseLockfile("version: 1\nartifacts:\n  x:\n    source: s\n")).toThrow(/x/);
  });
});
