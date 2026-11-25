import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  assertArchiveSizes,
  contentDigest,
  hash,
  readPackageArchive,
} from "../../../src/vnext/adapters/package-archive.js";
import { createDeterministicTarball } from "../../../src/vnext/adapters/workspace.js";

describe("portable package archive boundary", () => {
  it("bounds generated and imported archive sizes consistently", () => {
    const maximum = 64 * 1024 * 1024;
    expect(() => assertArchiveSizes([maximum - 1536])).not.toThrow();
    expect(() => assertArchiveSizes([maximum - 1535])).toThrow("64 MiB");
    for (const size of [-1, NaN, Infinity, 1.5])
      expect(() => assertArchiveSizes([size])).toThrow("invalid archive file size");
  });
  it("captures regular bytes and rejects corruption without extracting", () => {
    const files = [
      { path: "payload/a.txt", bytes: Buffer.from("a") },
      { path: "payload/b.txt", bytes: Buffer.from("b") },
    ];
    const archive = createDeterministicTarball(files);
    expect(readPackageArchive(archive)).toEqual(files);
    expect(contentDigest(files)).toBe(contentDigest([...files].reverse()));
    expect(contentDigest(files)).not.toBe(hash("different"));
    const tar = gunzipSync(archive);
    tar[0] = 120;
    expect(() => readPackageArchive(gzipSync(tar))).toThrow("header");
    expect(() => readPackageArchive(gzipSync(Buffer.alloc(512)))).toThrow("terminator");
    expect(() => readPackageArchive(gzipSync(Buffer.alloc(10)))).toThrow("terminator");
  });
});
