import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { assertPortablePath, stableJson } from "../core/model.js";
import { assertPortableTree } from "./portable-tree.js";

const maximumArchiveSize = 64 * 1024 * 1024;
/** Bound decompression and graph generation to the same supported USTAR size. */
export function assertArchiveSizes(sizes: number[]): void {
  const bytes = sizes.reduce((sum, size) => {
    if (!Number.isSafeInteger(size) || size < 0) throw new Error("invalid archive file size");
    return sum + 512 + Math.ceil(size / 512) * 512;
  }, 1024);
  if (bytes > maximumArchiveSize)
    throw new Error("WPM graph archive exceeds 64 MiB uncompressed limit");
}
export interface PackageFile {
  path: string;
  bytes: Buffer;
}
/** Content identity is independent of host timestamps and traversal order. */
export function contentDigest(files: PackageFile[]): string {
  return hash(
    Buffer.from(
      stableJson(
        files
          .map((f) => ({ path: f.path, sha256: hash(f.bytes) }))
          .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
      ),
    ),
  );
}
/** SHA-256 identity for exact captured bytes. */
export function hash(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}
/** Read our regular-file USTAR subset without extracting or executing package content. */
export function readPackageArchive(bytes: Buffer): PackageFile[] {
  const tar = gunzipSync(bytes, { maxOutputLength: maximumArchiveSize });
  const files: PackageFile[] = [];
  let offset = 0;
  const number = (header: Buffer, start: number, length: number): number => {
    const text = header
      .subarray(start, start + length)
      .toString("ascii")
      .replace(/\0.*$/, "")
      .trim();
    if (!/^[0-7]+$/.test(text)) throw new Error("invalid archive number");
    return Number.parseInt(text, 8);
  };
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) {
      if (tar.length - offset < 1024 || !tar.subarray(offset).every((b) => b === 0))
        throw new Error("invalid archive terminator");
      assertPortableTree(files.map((f) => ({ path: f.path, kind: "file" })));
      return files;
    }
    const expected = number(header, 148, 8);
    const checksum = header.reduce(
      (sum, b, index) => sum + (index >= 148 && index < 156 ? 32 : b),
      0,
    );
    if (
      expected !== checksum ||
      header.toString("ascii", 257, 263) !== "ustar\0" ||
      header[156] !== 48 ||
      !header.subarray(345, 500).every((b) => b === 0)
    )
      throw new Error("unsupported or corrupt WPM archive header");
    const path = new TextDecoder("utf-8", { fatal: true })
      .decode(header.subarray(0, 100))
      .replace(/\0.*$/, "");
    if (assertPortablePath(path) !== path) throw new Error("noncanonical archive path");
    const size = number(header, 124, 12);
    offset += 512;
    if (offset + size > tar.length) throw new Error("truncated package archive");
    files.push({ path, bytes: Buffer.from(tar.subarray(offset, offset + size)) });
    offset += Math.ceil(size / 512) * 512;
  }
  throw new Error("missing package archive terminator");
}
