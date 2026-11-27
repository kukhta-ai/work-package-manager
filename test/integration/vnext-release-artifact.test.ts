import {
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createReleaseFiles,
  publishRelease,
  readReleaseArtifact,
} from "../../src/vnext/adapters/release-artifact.js";
import { withTempDir } from "../helpers/tmpdir.js";

const files = () =>
  createReleaseFiles([
    {
      path: "contract.json",
      bytes: Buffer.from('{"schemaVersion":1,"name":"sample","version":"1.0.0"}'),
    },
    { path: "payload/nested/hello", bytes: Buffer.from("authored content") },
  ]);

describe("release filesystem publication", () => {
  it("rejects hard-linked directory files and preserves the external inode", async () =>
    withTempDir((root) => {
      const path = join(root, "release");
      publishRelease(path, files(), "directory");
      const external = join(root, "external");
      writeFileSync(external, "private external data");
      linkSync(external, join(path, "payload/linked"));
      expect(() => readReleaseArtifact(path)).toThrow("hard link");
      expect(readFileSync(external, "utf8")).toBe("private external data");
    }));

  it("rejects an invalid manifest before creating publication state", async () =>
    withTempDir((root) => {
      const captured = files().map((file) =>
        file.path === "release-manifest.json" ? { ...file, bytes: Buffer.from("{}") } : file,
      );
      expect(() => publishRelease(join(root, "nested/result"), captured, "directory")).toThrow(
        "manifest",
      );
      expect(readdirSync(root)).toEqual([]);
    }));
  it("detects an earlier file edited while later content is being captured", async () =>
    withTempDir((root) => {
      const path = join(root, "result");
      publishRelease(path, files(), "directory");
      const nativeFs = createRequire(import.meta.url)("node:fs") as typeof import("node:fs");
      const original = nativeFs.openSync;
      let armed = true;
      const spy = vi
        .spyOn(nativeFs, "openSync")
        .mockImplementation((...args: Parameters<typeof original>) => {
          const fd = original(...args);
          if (armed && args[0] === join(path, "payload/nested/hello")) {
            armed = false;
            writeFileSync(join(path, "contract.json"), "changed after earlier capture");
          }
          return fd;
        });
      syncBuiltinESMExports();
      try {
        expect(() => readReleaseArtifact(path)).toThrow(/changed/);
      } finally {
        spy.mockRestore();
        syncBuiltinESMExports();
      }
      expect(armed).toBe(false);
    }));
  it("rejects a replacement foreign directory during an owned publication retry", async () =>
    withTempDir((root) => {
      const path = join(root, "result"),
        captured = files();
      const nativeFs = createRequire(import.meta.url)("node:fs") as typeof import("node:fs");
      const original = nativeFs.writeFileSync;
      let armed = true;
      const spy = vi
        .spyOn(nativeFs, "writeFileSync")
        .mockImplementation((...args: Parameters<typeof original>) => {
          original(...args);
          if (armed && args[0] === join(path, "contract.json")) {
            armed = false;
            throw new Error("injected interruption");
          }
        });
      syncBuiltinESMExports();
      try {
        expect(() => publishRelease(path, captured, "directory")).toThrow("injected interruption");
      } finally {
        spy.mockRestore();
        syncBuiltinESMExports();
      }
      expect(() => readReleaseArtifact(path)).toThrow("pending");
      nativeFs.renameSync(path, join(root, "old-owned-partial"));
      mkdirSync(path);
      expect(() => publishRelease(path, captured, "directory")).toThrow("identity");
      expect(readdirSync(path)).toEqual([]);
    }));

  it("shares verified content across TGZ, ZIP and directory representations", async () =>
    withTempDir((root) => {
      const captured = files();
      const results = (["tgz", "zip", "directory"] as const).map((format) => {
        const path = join(root, format);
        const built = publishRelease(path, captured, format);
        expect(publishRelease(path, captured, format)).toMatchObject({ reused: true });
        const read = readReleaseArtifact(path);
        expect(read.files).toEqual(captured);
        expect(read.contentDigest).toBe(built.contentDigest);
        expect(read.manifestPresent).toBe(true);
        return read;
      });
      expect(new Set(results.map((result) => result.contentDigest)).size).toBe(1);
      expect(results[0]?.artifactDigest).not.toBe(results[1]?.artifactDigest);
      expect(results[2]?.artifactDigest).toBeUndefined();
    }));
  it.each(["tgz", "zip", "directory"] as const)("dry-run %s creates nothing", async (format) =>
    withTempDir((root) => {
      expect(publishRelease(join(root, "nested/result"), files(), format, true)).toMatchObject({
        dryRun: true,
      });
      expect(readdirSync(root)).toEqual([]);
    }));
  it.each([
    "tgz",
    "zip",
    "directory",
  ] as const)("preserves conflicting %s destinations", async (format) =>
    withTempDir((root) => {
      const path = join(root, "output");
      if (format === "directory") {
        mkdirSync(path);
        writeFileSync(join(path, "foreign"), "user file");
      } else writeFileSync(path, "user file");
      expect(() => publishRelease(path, files(), format)).toThrow();
      expect(readFileSync(format === "directory" ? join(path, "foreign") : path, "utf8")).toBe(
        "user file",
      );
    }));
  it("preserves unrelated empty directories and rejects empty extras on read", async () =>
    withTempDir((root) => {
      const path = join(root, "output");
      mkdirSync(path);
      expect(() => publishRelease(path, files(), "directory")).toThrow("conflicts");
      const actual = join(root, "actual");
      publishRelease(actual, files(), "directory");
      mkdirSync(join(actual, "foreign"));
      expect(() => readReleaseArtifact(actual)).toThrow("empty");
    }));
  it("rejects file and ancestor links without following their bytes", async () =>
    withTempDir((root) => {
      const actual = join(root, "actual");
      publishRelease(actual, files(), "directory");
      symlinkSync(actual, join(root, "alias"), process.platform === "win32" ? "junction" : "dir");
      expect(() => readReleaseArtifact(join(root, "alias"))).toThrow("symbolic");
      expect(() => publishRelease(join(root, "alias/next"), files(), "directory")).toThrow(
        "symbolic",
      );
      symlinkSync(join(actual, "contract.json"), join(actual, "linked.json"));
      expect(() => readReleaseArtifact(actual)).toThrow("symbolic");
    }));
  it("rejects edited directory bytes rather than trusting the saved manifest", async () =>
    withTempDir((root) => {
      const path = join(root, "result");
      publishRelease(path, files(), "directory");
      writeFileSync(join(path, "payload/nested/hello"), "changed");
      expect(() => readReleaseArtifact(path)).toThrow("manifest");
    }));
  it("publishes review-like directory data with paths longer than the archive limit", async () =>
    withTempDir((root) => {
      const path = `subject/${"x".repeat(100)}`;
      publishRelease(join(root, "review"), [{ path, bytes: Buffer.from("data") }], "directory");
      expect(readFileSync(join(root, "review", path), "utf8")).toBe("data");
    }));
  it.each([
    false,
    true,
  ])("retries interrupted owned directory output; foreign edit=%s", async (foreign) =>
    withTempDir((root) => {
      const path = join(root, "result"),
        captured = files();
      const nativeFs = createRequire(import.meta.url)("node:fs") as typeof import("node:fs");
      const original = nativeFs.writeFileSync;
      let armed = true;
      const spy = vi
        .spyOn(nativeFs, "writeFileSync")
        .mockImplementation((...args: Parameters<typeof original>) => {
          original(...args);
          if (armed && args[0] === join(path, "contract.json")) {
            armed = false;
            throw new Error("injected interruption");
          }
        });
      syncBuiltinESMExports();
      try {
        expect(() => publishRelease(path, captured, "directory")).toThrow("injected interruption");
      } finally {
        spy.mockRestore();
        syncBuiltinESMExports();
      }
      expect(armed).toBe(false);
      if (foreign) {
        writeFileSync(join(path, "contract.json"), "foreign bytes");
        expect(() => publishRelease(path, captured, "directory")).toThrow("foreign");
        expect(readFileSync(join(path, "contract.json"), "utf8")).toBe("foreign bytes");
      } else {
        publishRelease(path, captured, "directory");
        expect(readReleaseArtifact(path).files).toEqual(captured);
        expect(existsSync(join(root, ".result.wpm-journal.json"))).toBe(false);
      }
    }));
  it("preserves an unowned staging path", async () =>
    withTempDir((root) => {
      const stage = join(root, ".result.wpm-stage");
      writeFileSync(stage, "foreign");
      expect(() => publishRelease(join(root, "result"), files(), "zip")).toThrow("unowned");
      expect(readFileSync(stage, "utf8")).toBe("foreign");
    }));
});
