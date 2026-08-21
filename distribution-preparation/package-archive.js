import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const BLOCK_SIZE = 512;

/**
 * @typedef ArchiveEntry
 * @property {string} path
 * @property {"file" | "symlink" | "hardlink"} type
 * @property {string=} linkTarget
 */

/**
 * @typedef ArchiveInspection
 * @property {number} archiveSize
 * @property {ArchiveEntry[]} entries
 * @property {Record<string, unknown>} packedManifest
 */

/** @param {Buffer} block @param {number} offset @param {number} length */
function readString(block, offset, length) {
  const end = block.indexOf(0, offset);
  const boundedEnd = end === -1 || end > offset + length ? offset + length : end;
  return block.subarray(offset, boundedEnd).toString("utf8");
}

/** @param {Buffer} block @param {number} offset @param {number} length */
function readOctal(block, offset, length) {
  const field = block.subarray(offset, offset + length);
  if ((field[0] ?? 0) & 0x80) throw new Error("unsupported base-256 tar number");
  const text = field.toString("ascii").replaceAll("\0", "").trim();
  if (text === "") return 0;
  if (!/^[0-7]+$/.test(text)) throw new Error(`invalid tar size field: ${JSON.stringify(text)}`);
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("tar entry size is out of range");
  return value;
}

/** @param {Buffer} block */
function isZeroBlock(block) {
  return block.every((byte) => byte === 0);
}

/** @param {Buffer} header */
function assertValidHeaderChecksum(header) {
  const recorded = readOctal(header, 148, 8);
  let calculated = 0;
  for (let index = 0; index < header.length; index += 1) {
    calculated += index >= 148 && index < 156 ? 0x20 : (header[index] ?? 0);
  }
  if (recorded !== calculated) throw new Error("tar header checksum mismatch");
}

/** @param {Buffer} body */
function parsePax(body) {
  /** @type {Record<string, string>} */
  const values = {};
  let offset = 0;
  while (offset < body.length) {
    const space = body.indexOf(0x20, offset);
    if (space === -1) throw new Error("invalid PAX record length");
    const lengthText = body.subarray(offset, space).toString("ascii");
    if (!/^\d+$/.test(lengthText)) throw new Error("invalid PAX record length");
    const length = Number.parseInt(lengthText, 10);
    const end = offset + length;
    if (length <= space - offset + 2 || end > body.length || body[end - 1] !== 0x0a) {
      throw new Error("truncated PAX record");
    }
    const record = body.subarray(space + 1, end - 1).toString("utf8");
    const equals = record.indexOf("=");
    if (equals === -1) throw new Error("invalid PAX record");
    values[record.slice(0, equals)] = record.slice(equals + 1);
    offset = end;
  }
  return values;
}

/** @param {string} archivePath */
function packageRelativePath(archivePath) {
  if (archivePath.startsWith("package/")) return archivePath.slice("package/".length);
  return archivePath.startsWith("/") ? archivePath : `/${archivePath}`;
}

/**
 * Inspect an npm package archive directly from its compressed bytes. This small reader implements the tar
 * entry types npm emits, including PAX and GNU long-name extensions, without relying on an ambient system
 * `tar` command or an undeclared transitive package.
 *
 * @param {Buffer} archiveBytes
 * @returns {ArchiveInspection}
 */
export function inspectPackageArchiveBytes(archiveBytes) {
  const tar = gunzipSync(archiveBytes);
  if (tar.length % BLOCK_SIZE !== 0) {
    throw new Error("truncated tar archive: length is not block aligned");
  }
  /** @type {ArchiveEntry[]} */
  const entries = [];
  /** @type {Record<string, string>} */
  let globalPax = {};
  /** @type {Record<string, string>} */
  let localPax = {};
  let longPath;
  let longLink;
  /** @type {Record<string, unknown> | undefined} */
  let packedManifest;
  let offset = 0;
  let terminated = false;

  while (offset < tar.length) {
    if (offset + BLOCK_SIZE > tar.length) throw new Error("truncated tar header");
    const header = tar.subarray(offset, offset + BLOCK_SIZE);
    offset += BLOCK_SIZE;
    if (isZeroBlock(header)) {
      if (
        offset + BLOCK_SIZE > tar.length ||
        !isZeroBlock(tar.subarray(offset, offset + BLOCK_SIZE))
      ) {
        throw new Error("truncated tar archive: second end marker is absent");
      }
      offset += BLOCK_SIZE;
      if (!isZeroBlock(tar.subarray(offset))) {
        throw new Error("invalid tar archive: non-zero data follows the end marker");
      }
      if (Object.keys(localPax).length > 0 || longPath !== undefined || longLink !== undefined) {
        throw new Error("invalid tar archive: dangling extended header");
      }
      terminated = true;
      break;
    }

    assertValidHeaderChecksum(header);

    const size = readOctal(header, 124, 12);
    const paddedSize = Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
    if (offset + paddedSize > tar.length) throw new Error("truncated tar entry body");
    const body = tar.subarray(offset, offset + size);
    offset += paddedSize;

    const type = readString(header, 156, 1) || "0";
    const headerName = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const rawPath = prefix === "" ? headerName : `${prefix}/${headerName}`;
    const rawLink = readString(header, 157, 100);

    if (type === "g") {
      globalPax = { ...globalPax, ...parsePax(body) };
      continue;
    }
    if (type === "x") {
      localPax = parsePax(body);
      continue;
    }
    if (type === "L") {
      longPath = body.toString("utf8").replace(/[\0\n]+$/, "");
      continue;
    }
    if (type === "K") {
      longLink = body.toString("utf8").replace(/[\0\n]+$/, "");
      continue;
    }

    const attributes = { ...globalPax, ...localPax };
    const archivePath = attributes.path ?? longPath ?? rawPath;
    const linkTarget = attributes.linkpath ?? longLink ?? rawLink;
    localPax = {};
    longPath = undefined;
    longLink = undefined;

    if (type === "5") continue;
    if (!["0", "1", "2"].includes(type)) {
      throw new Error(`unsupported tar entry type: ${JSON.stringify(type)}`);
    }
    const path = packageRelativePath(archivePath);
    const entry =
      type === "1"
        ? {
            path,
            type: /** @type {const} */ ("hardlink"),
            linkTarget: packageRelativePath(linkTarget),
          }
        : type === "2"
          ? { path, type: /** @type {const} */ ("symlink"), linkTarget }
          : { path, type: /** @type {const} */ ("file") };
    entries.push(entry);

    if (path === "package.json" && entry.type === "file") {
      const parsed = JSON.parse(body.toString("utf8"));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("packed package.json must contain an object");
      }
      packedManifest = parsed;
    }
  }

  if (!terminated) throw new Error("truncated tar archive: end marker is absent");
  if (packedManifest === undefined) throw new Error("packed archive does not contain package.json");
  return { archiveSize: archiveBytes.length, entries, packedManifest };
}

/**
 * @param {string} archivePath
 * @returns {ArchiveInspection}
 */
export function inspectPackageArchive(archivePath) {
  return inspectPackageArchiveBytes(readFileSync(archivePath));
}
