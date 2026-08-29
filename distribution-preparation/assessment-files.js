import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";
import { TextDecoder } from "node:util";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

/** @param {import("node:fs").Stats} left @param {import("node:fs").Stats} right */
function sameFile(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

/**
 * Read one caller-owned assessment input as a stable ordinary file. Links and path swaps are rejected so the
 * bytes assessed cannot silently differ from the named input.
 *
 * @param {string} path
 * @param {string} field
 */
function readOrdinaryFile(path, field) {
  const pathStat = lstatSync(path);
  if (pathStat.isSymbolicLink()) throw new Error(`${field} input must not be a symbolic link`);
  if (!pathStat.isFile()) throw new Error(`${field} input must be an ordinary file`);
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || !sameFile(pathStat, before)) {
      throw new Error(`${field} input changed while it was opened`);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (!sameFile(before, after)) throw new Error(`${field} input changed while it was read`);
    const namedAfter = lstatSync(path);
    if (namedAfter.isSymbolicLink() || !namedAfter.isFile() || !sameFile(after, namedAfter)) {
      throw new Error(`${field} input path changed while it was read`);
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Decode and parse one stable caller-owned JSON object, adding an invalid finding rather than hiding other
 * independently readable input failures.
 *
 * @param {string} path
 * @param {string} field
 * @param {Array<{kind: string, field: string, detail: string}>} findings
 */
export function readAssessmentJson(path, field, findings) {
  try {
    const decoded = UTF8_DECODER.decode(readOrdinaryFile(path, field));
    const value = JSON.parse(decoded);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError(`${field} must contain a JSON object`);
    }
    return value;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    findings.push({
      kind: "invalid",
      field: `${field}.file`,
      detail: `could not read ${field} input: ${reason}`,
    });
    return undefined;
  }
}
