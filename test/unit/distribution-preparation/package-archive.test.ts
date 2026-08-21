import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { inspectPackageArchiveBytes } from "../../../distribution-preparation/package-archive.js";

const BLOCK_SIZE = 512;

function writeString(target: Buffer, offset: number, length: number, value: string): void {
  target.write(value, offset, Math.min(length, Buffer.byteLength(value)), "utf8");
}

function tarEntry(
  path: string,
  body: string,
  type: "0" | "1" | "2" | "7" = "0",
  linkTarget = "",
): Buffer {
  const header = Buffer.alloc(BLOCK_SIZE);
  writeString(header, 0, 100, path);
  writeString(header, 100, 8, "0000644\0");
  writeString(header, 108, 8, "0000000\0");
  writeString(header, 116, 8, "0000000\0");
  writeString(header, 124, 12, `${Buffer.byteLength(body).toString(8).padStart(11, "0")}\0`);
  writeString(header, 136, 12, "00000000000\0");
  header.fill(0x20, 148, 156);
  writeString(header, 156, 1, type);
  writeString(header, 157, 100, linkTarget);
  writeString(header, 257, 6, "ustar\0");
  writeString(header, 263, 2, "00");
  const checksum = header.reduce((total, byte) => total + byte, 0);
  writeString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  const content = Buffer.from(body);
  const padding = Buffer.alloc((BLOCK_SIZE - (content.length % BLOCK_SIZE)) % BLOCK_SIZE);
  return Buffer.concat([header, content, padding]);
}

function tarball(...entries: Buffer[]): Buffer {
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(BLOCK_SIZE * 2)]));
}

describe("package archive inspection", () => {
  it("reads manifest bytes, ordinary paths, and links from the actual gzip archive", () => {
    const manifest = { name: "fixture", version: "1.2.3", bin: { fixture: "dist/cli.js" } };
    const bytes = tarball(
      tarEntry("package/package.json", JSON.stringify(manifest)),
      tarEntry("package/dist/cli.js", "#!/usr/bin/env node\n"),
      tarEntry("package/docs/current", "", "2", "guide.md"),
    );

    expect(inspectPackageArchiveBytes(bytes)).toEqual({
      archiveSize: bytes.length,
      entries: [
        { path: "package.json", type: "file" },
        { path: "dist/cli.js", type: "file" },
        { path: "docs/current", type: "symlink", linkTarget: "guide.md" },
      ],
      packedManifest: manifest,
    });
  });

  it("preserves hard-link semantics and its package-root-relative target", () => {
    const manifest = { name: "fixture", version: "1.2.3" };
    const bytes = tarball(
      tarEntry("package/package.json", JSON.stringify(manifest)),
      tarEntry("package/dist/cli.js", "#!/usr/bin/env node\n"),
      tarEntry("package/dist/alias.js", "", "1", "package/dist/cli.js"),
    );

    expect(inspectPackageArchiveBytes(bytes).entries[2]).toEqual({
      path: "dist/alias.js",
      type: "hardlink",
      linkTarget: "dist/cli.js",
    });
  });

  it("preserves a traversal path for the boundary evaluator to reject", () => {
    const manifest = { name: "fixture", version: "1.2.3" };
    const bytes = tarball(
      tarEntry("package/package.json", JSON.stringify(manifest)),
      tarEntry("package/../escape", "bad"),
    );

    expect(inspectPackageArchiveBytes(bytes).entries[1]).toEqual({
      path: "../escape",
      type: "file",
    });
  });

  it("rejects a truncated archive rather than reporting partial evidence", () => {
    const manifest = { name: "fixture", version: "1.2.3" };
    const uncompressed = Buffer.concat([
      tarEntry("package/package.json", JSON.stringify(manifest)),
      tarEntry("package/dist/cli.js", "content"),
    ]);
    const truncated = gzipSync(uncompressed.subarray(0, uncompressed.length - 600));

    expect(() => inspectPackageArchiveBytes(truncated)).toThrow(/truncated/i);
  });

  it("rejects a corrupt header checksum", () => {
    const manifestEntry = tarEntry(
      "package/package.json",
      JSON.stringify({ name: "fixture", version: "1.2.3" }),
    );
    manifestEntry[0] = (manifestEntry[0] ?? 0) ^ 1;

    expect(() => inspectPackageArchiveBytes(tarball(manifestEntry))).toThrow(/checksum/i);
  });

  it("requires two terminal zero blocks and rejects hidden trailing entries", () => {
    const manifestEntry = tarEntry(
      "package/package.json",
      JSON.stringify({ name: "fixture", version: "1.2.3" }),
    );
    const oneEndMarker = gzipSync(Buffer.concat([manifestEntry, Buffer.alloc(BLOCK_SIZE)]));
    const hiddenEntry = gzipSync(
      Buffer.concat([
        manifestEntry,
        Buffer.alloc(BLOCK_SIZE * 2),
        tarEntry("package/hidden", "bad"),
      ]),
    );

    expect(() => inspectPackageArchiveBytes(oneEndMarker)).toThrow(/second end marker/i);
    expect(() => inspectPackageArchiveBytes(hiddenEntry)).toThrow(/follows the end marker/i);
  });

  it("rejects archive entry types outside the inspected package contract", () => {
    const bytes = tarball(
      tarEntry("package/package.json", JSON.stringify({ name: "fixture", version: "1.2.3" })),
      tarEntry("package/unsupported", "", "7"),
    );

    expect(() => inspectPackageArchiveBytes(bytes)).toThrow(/unsupported tar entry type/i);
  });
});
