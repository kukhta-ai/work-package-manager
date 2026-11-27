import {
  closeSync,
  existsSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
  rmSync,
  type Stats,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { assertPortablePath, stableJson } from "../core/model.js";
import {
  assertArchiveSizes,
  contentDigest,
  hash,
  type PackageFile,
  readPackageArchive,
} from "./package-archive.js";
import { assertPortableTree } from "./portable-tree.js";
import { createReleaseZip, readReleaseZip } from "./release-codec.js";
import { createDeterministicTarball } from "./workspace.js";

export type ReleaseFormat = "tgz" | "zip" | "directory";
export interface ReleaseArtifact {
  files: PackageFile[];
  format: ReleaseFormat;
  contentDigest: string;
  artifactDigest?: string;
  manifestPresent: boolean;
  identity: { name: string; version: string };
}
const manifestName = "release-manifest.json";
const maximum = 64 * 1024 * 1024;
function ordered(files: readonly PackageFile[]): PackageFile[] {
  assertPortableTree(files.map((file) => ({ path: file.path, kind: "file" })));
  return [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function identity(files: readonly PackageFile[]): ReleaseArtifact["identity"] {
  const contract = files.find((file) => file.path === "contract.json");
  if (!contract) throw new Error("release has no contract.json");
  const value: unknown = JSON.parse(contract.bytes.toString("utf8"));
  if (!record(value)) throw new Error("invalid release contract");
  let root = value;
  if (
    value.schemaVersion === 2 &&
    record(value.graph) &&
    typeof value.graph.root === "string" &&
    record(value.graph.nodes)
  ) {
    const node = value.graph.nodes[value.graph.root];
    if (!record(node) || !record(node.record)) throw new Error("invalid release root");
    root = node.record;
  }
  if (typeof root.name !== "string" || typeof root.version !== "string")
    throw new Error("invalid release identity");
  return { name: root.name, version: root.version };
}
function manifest(files: PackageFile[]) {
  return {
    schemaVersion: 1,
    root: identity(files),
    inventory: ordered(files).map((file) => ({ path: file.path, sha256: hash(file.bytes) })),
    contentDigest: contentDigest(files),
  };
}
/** Add a complete canonical release envelope without changing any captured payload bytes. */
export function createReleaseFiles(files: PackageFile[]): PackageFile[] {
  if (files.some((file) => file.path === manifestName))
    throw new Error("release manifest is reserved");
  const result = ordered([
    ...files,
    { path: manifestName, bytes: Buffer.from(stableJson(manifest(files))) },
  ]);
  validateReleaseEnvelope(result);
  return result;
}
/** Validate new envelopes, or identify legacy payloads without inventing integrity evidence. */
export function validateReleaseEnvelope(
  files: PackageFile[],
): Omit<ReleaseArtifact, "format" | "artifactDigest"> {
  const sorted = ordered(files);
  for (const file of sorted)
    if (Buffer.byteLength(file.path) > 100)
      throw new Error("release path exceeds 100-byte portable limit");
  assertArchiveSizes(sorted.map((file) => file.bytes.length));
  const envelope = sorted.find((file) => file.path === manifestName);
  const payload = sorted.filter((file) => file.path !== manifestName);
  const expected = manifest(payload);
  if (envelope && !envelope.bytes.equals(Buffer.from(stableJson(expected))))
    throw new Error("release manifest or file inventory differs from canonical content");
  return {
    files: payload,
    manifestPresent: envelope !== undefined,
    contentDigest: expected.contentDigest,
    identity: expected.root,
  };
}
function safePath(path: string): string {
  const absolute = resolve(path);
  let current = absolute;
  for (;;) {
    if (
      existsSync(current) ||
      (() => {
        try {
          lstatSync(current);
          return true;
        } catch {
          return false;
        }
      })()
    ) {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error("release path contains a symbolic link");
      if (current !== absolute && !stat.isDirectory())
        throw new Error("release ancestor is not a directory");
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return absolute;
}
function capture(path: string, bound = maximum * 2): Buffer {
  safePath(path);
  const before = lstatSync(path);
  if (!before.isFile() || before.size > bound)
    throw new Error("release input must be a bounded regular file");
  const fd = openSync(path, "r");
  try {
    const opened = fstatSync(fd);
    if (
      !opened.isFile() ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size > bound
    )
      throw new Error("release input identity changed");
    const bytes = Buffer.alloc(before.size);
    let received = 0;
    while (received < bytes.length) {
      const amount = readSync(fd, bytes, received, bytes.length - received, received);
      if (amount === 0) throw new Error("release input shrank during capture");
      received += amount;
    }
    if (readSync(fd, Buffer.alloc(1), 0, 1, received) !== 0)
      throw new Error("release input grew during capture");
    const after = fstatSync(fd),
      final = lstatSync(safePath(path));
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      final.dev !== before.dev ||
      final.ino !== before.ino ||
      final.mtimeMs !== before.mtimeMs ||
      final.ctimeMs !== before.ctimeMs ||
      bytes.length !== before.size ||
      realpathSync.native(path) !== realpathSync.native(safePath(path))
    )
      throw new Error("release input changed during capture");
    return bytes;
  } finally {
    closeSync(fd);
  }
}
function readTree(root: string, allowedEmpty = new Set<string>()): PackageFile[] {
  const files: PackageFile[] = [],
    directories: string[] = [];
  const identities: { path: string; stat: Stats }[] = [];
  let total = 0,
    entries = 0;
  const walk = (directory: string, prefix: string): void => {
    const before = lstatSync(safePath(directory));
    if (!before.isDirectory()) throw new Error("release root must be a directory");
    identities.push({ path: directory, stat: before });
    const names = readdirSync(directory).sort();
    for (const name of names) {
      if (++entries > 65534) throw new Error("release tree has too many entries");
      const path = prefix + name;
      assertPortablePath(path);
      const selected = join(directory, name),
        stat = lstatSync(safePath(selected));
      if (stat.isDirectory()) {
        directories.push(path);
        walk(selected, `${path}/`);
      } else {
        if (stat.nlink !== 1) throw new Error("release directory contains a hard link");
        identities.push({ path: selected, stat });
        const bytes = capture(selected, maximum * 2 - total);
        total += bytes.length;
        files.push({ path, bytes });
      }
    }
    const after = lstatSync(safePath(directory));
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      stableJson(names) !== stableJson(readdirSync(directory).sort())
    )
      throw new Error("release directory changed during capture");
  };
  walk(root, "");
  for (const file of files)
    if (!capture(join(root, file.path)).equals(file.bytes))
      throw new Error("release file changed after capture");
  for (const { path, stat: before } of identities) {
    const after = lstatSync(safePath(path));
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    )
      throw new Error("release tree identity changed during capture");
  }
  assertPortableTree([
    ...files.map((file) => ({ path: file.path, kind: "file" as const })),
    ...directories.map((path) => ({ path, kind: "directory" as const })),
  ]);
  const implied = new Set<string>();
  for (const file of files) {
    const parts = file.path.split("/");
    for (let i = 1; i < parts.length; i++) implied.add(parts.slice(0, i).join("/"));
  }
  if (directories.some((path) => !implied.has(path) && !allowedEmpty.has(path)))
    throw new Error("unrecorded empty release directory");
  return ordered(files);
}
/** Capture TGZ, ZIP or directory content without extraction, source access or subprocesses. */
export function readReleaseArtifact(path: string): ReleaseArtifact {
  const selected = safePath(path);
  const journal = safePath(join(dirname(selected), `.${basename(selected)}.wpm-journal.json`));
  if (existsSync(journal))
    throw new Error("release publication is pending; resume its owned request first");
  const stat = lstatSync(selected);
  if (stat.isDirectory()) {
    const files = readTree(selected),
      checked = validateReleaseEnvelope(files);
    return { ...checked, files, format: "directory" };
  }
  const bytes = capture(selected);
  const format = bytes[0] === 0x50 && bytes[1] === 0x4b ? "zip" : "tgz";
  const files = format === "zip" ? readReleaseZip(bytes) : readPackageArchive(bytes);
  const checked = validateReleaseEnvelope(files);
  return { ...checked, files: ordered(files), format, artifactDigest: hash(bytes) };
}
function encoding(files: PackageFile[], format: ReleaseFormat): Buffer {
  assertArchiveSizes(files.map((file) => file.bytes.length));
  return format === "zip" ? createReleaseZip(files) : createDeterministicTarball(files);
}
function snapshot(path: string, directory: boolean, partial?: PackageFile[]): PackageFile[] {
  const allowed = new Set<string>();
  for (const file of partial ?? []) {
    const parts = file.path.split("/");
    for (let i = 1; i < parts.length; i++) allowed.add(parts.slice(0, i).join("/"));
  }
  return directory ? readTree(path, allowed) : [{ path: "artifact", bytes: capture(path) }];
}
function same(files: PackageFile[], expected: PackageFile[]): boolean {
  return (
    stableJson(ordered(files).map((file) => ({ path: file.path, sha256: hash(file.bytes) }))) ===
    stableJson(ordered(expected).map((file) => ({ path: file.path, sha256: hash(file.bytes) })))
  );
}
function writeTree(root: string, files: PackageFile[]): void {
  for (const file of files) {
    const target = safePath(join(root, file.path));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.bytes, { flag: "wx" });
  }
}
interface PublicationIdentity {
  dev: number;
  ino: number;
  birthtimeMs: number;
}
function publicationIdentity(path: string): PublicationIdentity {
  const stat = lstatSync(safePath(path));
  return { dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs };
}
function validIdentity(value: unknown): value is PublicationIdentity {
  return (
    record(value) &&
    Object.keys(value).sort().join() === "birthtimeMs,dev,ino" &&
    [value.dev, value.ino, value.birthtimeMs].every(
      (entry) => typeof entry === "number" && Number.isFinite(entry) && entry >= 0,
    )
  );
}
/** Publish exact files with owned-stage recovery; conflicting destinations are never replaced. */
export function publishRelease(
  destination: string,
  files: PackageFile[],
  format: ReleaseFormat,
  dryRun = false,
) {
  if (!["tgz", "zip", "directory"].includes(format)) throw new Error("unsupported release format");
  const sorted = ordered(files),
    directory = format === "directory";
  const finalDigest = sorted.some((file) => file.path === manifestName)
    ? validateReleaseEnvelope(sorted).contentDigest
    : contentDigest(sorted);
  const bytes = directory ? undefined : encoding(sorted, format);
  const expected = directory ? sorted : [{ path: "artifact", bytes: bytes ?? Buffer.alloc(0) }];
  const path = safePath(destination),
    parent = dirname(path),
    name = basename(path);
  const stage = safePath(join(parent, `.${name}.wpm-stage`)),
    journal = safePath(join(parent, `.${name}.wpm-journal.json`));
  const request = {
    schemaVersion: 1,
    destination: path,
    format,
    inventory: expected.map((file) => ({ path: file.path, sha256: hash(file.bytes) })),
  };
  let state:
    | {
        phase: "prepared" | "directory-owned";
        stageIdentity: PublicationIdentity;
        targetIdentity?: PublicationIdentity;
      }
    | undefined;
  if (existsSync(journal)) {
    const parsed: unknown = JSON.parse(capture(journal, 16 * 1024 * 1024).toString("utf8"));
    if (
      !record(parsed) ||
      stableJson(parsed.request) !== stableJson(request) ||
      !["prepared", "directory-owned"].includes(String(parsed.phase)) ||
      !validIdentity(parsed.stageIdentity) ||
      (parsed.phase === "directory-owned"
        ? !validIdentity(parsed.targetIdentity) ||
          Object.keys(parsed).sort().join() !== "phase,request,stageIdentity,targetIdentity"
        : Object.keys(parsed).sort().join() !== "phase,request,stageIdentity")
    )
      throw new Error("release publication journal conflicts with request");
    state = {
      phase: parsed.phase as "prepared" | "directory-owned",
      stageIdentity: parsed.stageIdentity,
      ...(parsed.phase === "directory-owned"
        ? { targetIdentity: parsed.targetIdentity as PublicationIdentity }
        : {}),
    };
  }
  const destinationExists = existsSync(path);
  if (state && destinationExists) {
    const expectedIdentity = directory ? state.targetIdentity : state.stageIdentity;
    if (!expectedIdentity || stableJson(publicationIdentity(path)) !== stableJson(expectedIdentity))
      throw new Error("owned release destination identity changed or is ambiguous");
  }
  if (state && !destinationExists && state.phase === "directory-owned")
    throw new Error("owned release destination disappeared");
  if (
    state &&
    existsSync(stage) &&
    stableJson(publicationIdentity(stage)) !== stableJson(state.stageIdentity)
  )
    throw new Error("owned release stage identity changed");
  const complete =
    destinationExists &&
    same(
      snapshot(path, directory, state?.phase === "directory-owned" ? expected : undefined),
      expected,
    );
  if (complete) {
    if (!dryRun && state) {
      if (existsSync(stage)) {
        if (!same(snapshot(stage, directory), expected))
          throw new Error("owned release stage changed");
        rmSync(stage, { recursive: directory });
      }
      rmSync(journal);
    }
    return {
      path,
      format,
      contentDigest: finalDigest,
      ...(bytes ? { artifactDigest: hash(bytes) } : {}),
      reused: true,
      dryRun,
      files: sorted.map((file) => file.path),
    };
  }
  if (destinationExists && (!directory || state?.phase !== "directory-owned"))
    throw new Error("release destination conflicts with existing content");
  if (existsSync(stage) && !state) throw new Error("unowned release stage exists");
  if (state && (!existsSync(stage) || !same(snapshot(stage, directory), expected)))
    throw new Error("owned release stage missing or changed");
  if (destinationExists) {
    const actual = snapshot(path, true, expected);
    if (
      actual.some(
        (file) =>
          !expected.some((entry) => entry.path === file.path && entry.bytes.equals(file.bytes)),
      )
    )
      throw new Error("partial release contains foreign changes");
  }
  if (dryRun)
    return {
      path,
      format,
      contentDigest: finalDigest,
      ...(bytes ? { artifactDigest: hash(bytes) } : {}),
      reused: false,
      dryRun,
      files: sorted.map((file) => file.path),
    };
  mkdirSync(safePath(parent), { recursive: true });
  if (!state) {
    if (directory) {
      mkdirSync(stage);
      writeTree(stage, sorted);
    } else writeFileSync(stage, bytes ?? Buffer.alloc(0), { flag: "wx" });
    state = { phase: "prepared", stageIdentity: publicationIdentity(stage) };
    writeFileSync(journal, stableJson({ request, ...state }), { flag: "wx" });
  }
  if (directory) {
    if (!existsSync(path)) {
      mkdirSync(path);
      state = { ...state, phase: "directory-owned", targetIdentity: publicationIdentity(path) };
      writeFileSync(journal, stableJson({ request, ...state }));
    } else if (state.phase !== "directory-owned")
      throw new Error("ambiguous partial directory publication");
    const present = snapshot(path, true, expected);
    for (const file of sorted)
      if (!present.some((entry) => entry.path === file.path)) {
        const target = safePath(join(path, file.path));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, file.bytes, { flag: "wx" });
      }
  } else linkSync(stage, path);
  if (!same(snapshot(path, directory), expected))
    throw new Error("release publication changed during verification");
  if (
    !same(snapshot(stage, directory), expected) ||
    stableJson(publicationIdentity(stage)) !== stableJson(state.stageIdentity)
  )
    throw new Error("owned release stage changed before cleanup");
  rmSync(stage, { recursive: directory });
  rmSync(journal);
  return {
    path,
    format,
    contentDigest: finalDigest,
    ...(bytes ? { artifactDigest: hash(bytes) } : {}),
    reused: false,
    dryRun,
    files: sorted.map((file) => file.path),
  };
}
