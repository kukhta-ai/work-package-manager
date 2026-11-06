import { createHash } from "node:crypto";
import { parseYaml } from "../../util/yaml.js";

/**
 * The `integrity` service (doc 13 §4; doc 08 §"Pinning and integrity for vendored third-party content"):
 * content-hashes the third-party artifacts an author vendors in (discipline skills, Ralph loop runners) and
 * emits/checks the `wpm.lock` that pins them. PURE over the file content the operation supplies — the
 * operation reads the vendored files (and the existing lock) via the FileSystem port and passes them in; this
 * service computes hashes, builds/verifies the lockfile, and serializes it.
 *
 * Tamper-evidence is structural here, not optional: the thing the format distributes is instructions an agent
 * executes, so a silently-modified vendored skill must not ride into a package unnoticed. `wpm build`
 * recomputes the hashes and fails on drift (the `--frozen-lockfile` discipline); `wpm project validate`
 * surfaces the same check (doc 08).
 *
 * `node:crypto` is a pure computation (no I/O) and is NOT on the core import-boundary forbidden list (which
 * forbids only `node:fs`/`node:os`/`node:child_process` and the CLI/subprocess libraries), so it is permitted
 * here. The yaml leaf (`stringifyYaml`/`parseYaml`) is likewise pure.
 */

/** Magic prefix on the digest, so a hash is self-describing about its algorithm. */
const HASH_PREFIX = "sha256:";

/** The current `wpm.lock` format version. */
const LOCKFILE_VERSION = 1 as const;

/** Fingerprint one exact UTF-8 text value without persisting its potentially sensitive bytes. */
export function hashTextContent(content: string): string {
  return `${HASH_PREFIX}${createHash("sha256").update(content).digest("hex")}`;
}

/** One file of a vendored artifact, as data: a relative path and its content. */
export interface VendoredFile {
  /** The file's path relative to the artifact root. */
  readonly path: string;
  /** The file's content. */
  readonly content: string;
}

/**
 * A vendored third-party artifact (a folder of files): its name, its `source` (a provenance string — a
 * marketplace plugin id, a `git URL + ref`, or a release, e.g. `"snarktank/ralph@v1.2"`), its resolved
 * `version`, and its file tree. The operation supplies the `files` (read via the FileSystem port).
 */
export interface VendoredArtifact {
  /** The artifact's name (the key in the lockfile). */
  readonly name: string;
  /** Where the artifact came from — a provenance string rich enough to locate it later. */
  readonly source: string;
  /** The resolved version. */
  readonly version: string;
  /** The artifact's file tree. */
  readonly files: readonly VendoredFile[];
}

/** A pinned lock entry: where the artifact came from, which version, and its content fingerprint. */
export interface LockEntry {
  /** The provenance string. */
  readonly source: string;
  /** The resolved version. */
  readonly version: string;
  /** The content fingerprint (e.g. `sha256:…`). */
  readonly hash: string;
}

/** The `wpm.lock` contents: a format version plus the map of artifact name → its pinned {@link LockEntry}. */
export interface Lockfile {
  /** The lockfile format version. */
  readonly version: typeof LOCKFILE_VERSION;
  /** The pinned artifacts, keyed by name. */
  readonly artifacts: Record<string, LockEntry>;
}

/**
 * The result of verifying current vendored content against a lockfile. `ok` is `true` exactly when nothing
 * drifted, nothing is missing, and nothing is extra. Each list names the offending artifacts. These are data
 * (the operation maps a non-`ok` result to the Constraint/Integrity domain error at task-23); only a
 * genuinely malformed lockfile throws.
 */
export interface VerifyResult {
  /** Whether verification passed (no drift / missing / extra). */
  readonly ok: boolean;
  /** Artifacts present in both lock and current whose content fingerprint no longer matches. */
  readonly drifted: string[];
  /** Artifacts pinned in the lock but not present in the current content. */
  readonly missing: string[];
  /** Artifacts present in the current content but not pinned in the lock. */
  readonly extra: string[];
}

/**
 * Compute the content fingerprint of a vendored artifact's file tree: a deterministic, order-independent
 * SHA-256 (doc 08). The files are sorted by path, then each contributes a length-prefixed encoding of its
 * path and content to the hash, so the same tree always yields the same digest regardless of input order, and
 * both a content change and a rename alter the fingerprint. Length prefixes make the encoding unambiguous (no
 * two distinct trees can produce the same byte stream).
 *
 * @param files - The artifact's file tree.
 * @returns The fingerprint as `sha256:<hex>`.
 */
export function hashArtifactFiles(files: readonly VendoredFile[]): string {
  // Default string sorting specifies code-unit order without a custom comparator. Keep duplicate
  // entries in their original order so existing fingerprints retain their exact byte contract.
  const byPath = new Map<string, VendoredFile[]>();
  for (const file of files) {
    const group = byPath.get(file.path);
    if (group) group.push(file);
    else byPath.set(file.path, [file]);
  }
  const sorted = [...byPath.keys()].sort().flatMap((path) => byPath.get(path) as VendoredFile[]);
  const hash = createHash("sha256");
  for (const file of sorted) {
    const pathBytes = Buffer.byteLength(file.path);
    const contentBytes = Buffer.byteLength(file.content);
    // Length-prefixed fields keep the stream injective: `{path:"a",content:"bc"}` can't collide with
    // `{path:"ab",content:"c"}`.
    hash.update(`${pathBytes}:`);
    hash.update(file.path);
    hash.update(`${contentBytes}:`);
    hash.update(file.content);
  }
  return `${HASH_PREFIX}${hash.digest("hex")}`;
}

/**
 * Verify current vendored content against a lockfile (doc 08, the `--frozen-lockfile` check). For each
 * artifact present in both, the recomputed fingerprint must match the pinned one or it is reported as
 * **drifted**; artifacts pinned but not present are **missing**, and artifacts present but not pinned are
 * **extra**. Pure; returns a {@link VerifyResult} (never throws for a normal mismatch).
 *
 * @param lock - The lockfile to verify against.
 * @param current - The current vendored artifacts (their files read by the operation).
 * @returns The verification result.
 */
export function verifyLockfile(lock: Lockfile, current: readonly VendoredArtifact[]): VerifyResult {
  const currentByName = new Map(current.map((a) => [a.name, a]));
  const drifted: string[] = [];
  const missing: string[] = [];

  for (const [name, entry] of Object.entries(lock.artifacts)) {
    const artifact = currentByName.get(name);
    if (artifact === undefined) {
      missing.push(name);
    } else if (hashArtifactFiles(artifact.files) !== entry.hash) {
      drifted.push(name);
    }
  }

  const extra: string[] = [];
  for (const artifact of current) {
    if (!(artifact.name in lock.artifacts)) {
      extra.push(artifact.name);
    }
  }

  return {
    ok: drifted.length === 0 && missing.length === 0 && extra.length === 0,
    drifted,
    missing,
    extra,
  };
}

/** Whether a value is a plain object (used for structural validation of a parsed lockfile). */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse `wpm.lock` text back into a {@link Lockfile}, with minimal structural validation. A genuinely
 * malformed lockfile (not an object, missing/invalid `version` or `artifacts`, or a bad entry) throws a
 * descriptive `Error` — a malformed or tampered lockfile is a real defect, not data. Round-trips losslessly
 * with {@link serializeLockfile}, so the pins are fully recoverable (doc 08).
 *
 * @param text - The `wpm.lock` text.
 * @returns The parsed lockfile.
 * @throws If the text is not a well-formed lockfile.
 */
export function parseLockfile(text: string): Lockfile {
  const data = parseYaml(text);
  if (!isObject(data)) {
    throw new Error("wpm.lock: must be a mapping");
  }
  if (data.version !== LOCKFILE_VERSION) {
    throw new Error(
      `wpm.lock: unsupported "version" (expected ${LOCKFILE_VERSION}, got ${JSON.stringify(data.version)})`,
    );
  }
  if (!isObject(data.artifacts)) {
    throw new Error('wpm.lock: "artifacts" is required and must be a mapping');
  }
  const artifacts: Record<string, LockEntry> = {};
  for (const [name, raw] of Object.entries(data.artifacts)) {
    if (!isObject(raw)) {
      throw new Error(`wpm.lock: artifact "${name}" must be a mapping`);
    }
    const { source, version, hash } = raw;
    if (typeof source !== "string" || typeof version !== "string" || typeof hash !== "string") {
      throw new Error(
        `wpm.lock: artifact "${name}" must have string "source", "version", and "hash"`,
      );
    }
    artifacts[name] = { source, version, hash };
  }
  return { version: LOCKFILE_VERSION, artifacts };
}
