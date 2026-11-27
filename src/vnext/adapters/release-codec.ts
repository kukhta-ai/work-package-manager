import { inflateRawSync } from "node:zlib";
import { assertPortablePath } from "../core/model.js";
import { assertArchiveSizes, type PackageFile } from "./package-archive.js";
import { assertPortableTree } from "./portable-tree.js";

const maximum = 64 * 1024 * 1024;
function crc(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
/** Produce a deterministic, regular-file ZIP32 container with stored entries. */
export function createReleaseZip(files: readonly PackageFile[]): Buffer {
  assertArchiveSizes(files.map((file) => file.bytes.length));
  assertPortableTree(files.map((file) => ({ path: file.path, kind: "file" })));
  if (files.length > 65534) throw new Error("ZIP entry count exceeds ZIP32");
  const local: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const name = Buffer.from(file.path);
    if (name.length > 100) throw new Error("release path exceeds 100-byte portable limit");
    const checksum = crc(file.bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(file.bytes.length, 18);
    header.writeUInt32LE(file.bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(0x314, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8);
    record.writeUInt16LE(0x21, 14);
    record.writeUInt32LE(checksum, 16);
    record.writeUInt32LE(file.bytes.length, 20);
    record.writeUInt32LE(file.bytes.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    record.writeUInt32LE(offset, 42);
    local.push(header, name, file.bytes);
    central.push(record, name);
    offset += header.length + name.length + file.bytes.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
/** Read a bounded regular-file ZIP32 subset, validating both directory and local records. */
export function readReleaseZip(bytes: Buffer): PackageFile[] {
  if (bytes.length < 22 || bytes.length > maximum * 2) throw new Error("invalid ZIP size");
  // WPM accepts an uncommented archive only: neither prefixes nor trailing bytes are ignored.
  const end = bytes.length - 22;
  if (
    bytes.readUInt32LE(end) !== 0x06054b50 ||
    bytes.readUInt16LE(end + 4) ||
    bytes.readUInt16LE(end + 6) ||
    bytes.readUInt16LE(end + 20)
  )
    throw new Error("unsupported ZIP end record");
  const count = bytes.readUInt16LE(end + 8),
    size = bytes.readUInt32LE(end + 12),
    start = bytes.readUInt32LE(end + 16);
  if (count !== bytes.readUInt16LE(end + 10) || count === 65535 || start + size !== end)
    throw new Error("invalid ZIP directory");
  const files: PackageFile[] = [];
  let cursor = start,
    localEnd = 0,
    total = 0;
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error("truncated ZIP directory");
    const needed = bytes.readUInt16LE(cursor + 6);
    const flags = bytes.readUInt16LE(cursor + 8),
      method = bytes.readUInt16LE(cursor + 10);
    const checksum = bytes.readUInt32LE(cursor + 16),
      compressed = bytes.readUInt32LE(cursor + 20),
      uncompressed = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28),
      extraLength = bytes.readUInt16LE(cursor + 30),
      commentLength = bytes.readUInt16LE(cursor + 32);
    const offset = bytes.readUInt32LE(cursor + 42),
      attributes = bytes.readUInt32LE(cursor + 38);
    if (
      (needed !== 10 && needed !== 20) ||
      (flags !== 0 && flags !== 0x800) ||
      ![0, 8].includes(method) ||
      extraLength ||
      commentLength ||
      bytes.readUInt16LE(cursor + 34) ||
      bytes.readUInt16LE(cursor + 36) ||
      (((attributes >>> 16) & 0o170000) !== 0 && ((attributes >>> 16) & 0o170000) !== 0o100000) ||
      attributes & 0x10
    )
      throw new Error("unsupported ZIP entry");
    if (cursor + 46 + nameLength > end || !nameLength || offset !== localEnd || offset + 30 > start)
      throw new Error("invalid ZIP entry bounds");
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength),
      path = utf8.decode(nameBytes);
    if (assertPortablePath(path) !== path || nameLength > 100 || path.endsWith("/"))
      throw new Error("invalid ZIP path");
    if (
      bytes.readUInt32LE(offset) !== 0x04034b50 ||
      bytes.readUInt16LE(offset + 4) !== needed ||
      bytes.readUInt16LE(offset + 6) !== flags ||
      bytes.readUInt16LE(offset + 8) !== method ||
      bytes.readUInt32LE(offset + 14) !== checksum ||
      bytes.readUInt32LE(offset + 18) !== compressed ||
      bytes.readUInt32LE(offset + 22) !== uncompressed ||
      bytes.readUInt16LE(offset + 26) !== nameLength ||
      bytes.readUInt16LE(offset + 28)
    )
      throw new Error("ZIP local and central records differ");
    const dataStart = offset + 30 + nameLength,
      dataEnd = dataStart + compressed;
    if (
      !bytes.subarray(offset + 30, dataStart).equals(nameBytes) ||
      dataEnd > start ||
      total + uncompressed > maximum
    )
      throw new Error("invalid ZIP payload bounds");
    const data = bytes.subarray(dataStart, dataEnd);
    let file: Buffer;
    if (method === 0) file = Buffer.from(data);
    else {
      // Node returns the documented info object; @types/node types this overload as Buffer.
      const result = inflateRawSync(data, {
        maxOutputLength: Math.max(1, uncompressed),
        info: true,
      }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
      if (result.engine.bytesWritten !== compressed)
        throw new Error("trailing compressed ZIP data");
      file = result.buffer;
    }
    if (file.length !== uncompressed || crc(file) !== checksum)
      throw new Error("ZIP payload integrity mismatch");
    files.push({ path, bytes: file });
    total += file.length;
    localEnd = dataEnd;
    cursor += 46 + nameLength;
  }
  if (cursor !== end || localEnd !== start) throw new Error("unexpected ZIP bytes");
  assertPortableTree(files.map((file) => ({ path: file.path, kind: "file" })));
  assertArchiveSizes(files.map((file) => file.bytes.length));
  return files;
}
