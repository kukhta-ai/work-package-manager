import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import { stableJson } from "../core/model.js";
import { assertPortableTree } from "./portable-tree.js";

type Entry = { path: string; kind: "directory" } | { path: string; kind: "file"; sha256: string };
interface StageJournal {
  schemaVersion: 1;
  source: string;
  originalSha256: string;
  phase: "writing" | "ready";
  before: Entry[];
  after: Entry[];
}
interface Snapshot {
  originalSha256: string;
  entries: Entry[];
  files: Map<string, Buffer>;
}

function digest(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}
function below(root: string, path: string): string {
  const rest = relative(root, path);
  if (isAbsolute(rest) || rest === ".." || rest.startsWith(`..${sep}`))
    throw new Error("APM local dependency escapes the selected authored root");
  return rest.split(sep).join("/");
}
function regular(path: string, kind: "file" | "directory" | "optional"): void {
  const absolute = resolve(path);
  const parents: string[] = [];
  let current = absolute;
  for (;;) {
    parents.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  for (const parent of parents.reverse()) {
    const stat = lstatSync(parent, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink())
      throw new Error(`APM source staging forbids symbolic paths: ${parent}`);
    if (stat && parent !== absolute && !stat.isDirectory())
      throw new Error("APM source staging parent is not a directory");
  }
  const stat = lstatSync(absolute, { throwIfNoEntry: false });
  if (stat && !stat.isDirectory() && !stat.isFile())
    throw new Error("APM source staging requires regular files and directories");
  if (
    kind !== "optional" &&
    (!stat || (kind === "directory" ? !stat.isDirectory() : !stat.isFile()))
  )
    throw new Error(`missing APM staging ${kind}: ${path}`);
}
function native(path: string): boolean {
  return (
    path === "apm.lock.yaml" ||
    path === ".gitignore" ||
    path === "apm_modules" ||
    path.startsWith("apm_modules/") ||
    path === ".apm-local" ||
    path.startsWith(".apm-local/")
  );
}
function tree(root: string): Entry[] {
  const entries: Entry[] = [];
  if (!existsSync(root)) return entries;
  regular(root, "directory");
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name);
      regular(absolute, "optional");
      const path = below(root, absolute);
      const stat = lstatSync(absolute);
      if (stat.isDirectory()) {
        entries.push({ path, kind: "directory" });
        walk(absolute);
      } else entries.push({ path, kind: "file", sha256: digest(readFileSync(absolute)) });
    }
  };
  walk(root);
  assertPortableTree(entries);
  return entries;
}
function localPath(reference: string): boolean {
  return /^(?:\.{1,2}[\\/]|[\\/]|~[\\/]|[A-Za-z]:)/.test(reference);
}
function rewriteManifest(bytes: Buffer, manifest: string, root: string, staged: string): Buffer {
  const document = parseDocument(bytes.toString("utf8"));
  if (document.errors.length) throw new Error("invalid APM manifest while staging source");
  // WPM owns MCP projection. Native --only apm still validates MCP lock records
  // on frozen replay, so keep service declarations out of this private native manifest.
  const dependencyMap = document.get("dependencies", true);
  let changed = isMap(dependencyMap) && dependencyMap.delete("mcp");
  const dependencies = document.getIn(["dependencies", "apm"]);
  if (dependencies === undefined || dependencies === null)
    return changed ? Buffer.from(document.toString()) : bytes;
  if (!isSeq(dependencies)) throw new Error("APM dependencies.apm must be a sequence");
  for (const dependency of dependencies.items) {
    const field =
      isMap(dependency) && !dependency.has("git") ? dependency.get("path", true) : dependency;
    if (!isScalar(field) || typeof field.value !== "string") continue;
    const reference = field.value.trim();
    if (!localPath(reference)) continue;
    if (reference.startsWith("~") || (sep === "/" && /[\\]|^[A-Za-z]:/.test(reference)))
      throw new Error("APM local dependency must use an unambiguous path within the authored root");
    const dependencyRoot = resolve(dirname(manifest), reference);
    const path = below(root, dependencyRoot);
    if (path.split("/").some((part) => [".git", "apm_modules", ".apm-local"].includes(part)))
      throw new Error("APM local dependency cannot reference native/private metadata");
    regular(dependencyRoot, "directory");
    field.value = resolve(staged, path);
    changed = true;
  }
  return changed ? Buffer.from(document.toString()) : bytes;
}
function snapshot(source: string, staged: string): Snapshot {
  const original = tree(source).filter(
    (entry) => !entry.path.split("/").includes(".git") && !native(entry.path),
  );
  const files = new Map<string, Buffer>();
  const entries = original.map((entry): Entry => {
    if (entry.kind === "directory") return entry;
    const path = join(source, entry.path);
    const bytes = readFileSync(path);
    if (digest(bytes) !== entry.sha256)
      throw new Error("APM authored source changed during staging capture");
    const transformed =
      entry.path.split("/").at(-1) === "apm.yml"
        ? rewriteManifest(bytes, path, source, staged)
        : bytes;
    files.set(entry.path, transformed);
    return { ...entry, sha256: digest(transformed) };
  });
  return { originalSha256: digest(stableJson(original)), entries, files };
}
function journalEntries(value: unknown): Entry[] {
  if (!Array.isArray(value)) throw new Error("invalid APM staging journal inventory");
  const result: Entry[] = value.map((entry: unknown) => {
    if (
      entry === null ||
      typeof entry !== "object" ||
      !("path" in entry) ||
      typeof entry.path !== "string" ||
      !("kind" in entry)
    )
      throw new Error("invalid APM staging journal entry");
    if (entry.kind === "directory") return { path: entry.path, kind: "directory" };
    if (
      entry.kind === "file" &&
      "sha256" in entry &&
      typeof entry.sha256 === "string" &&
      /^[a-f0-9]{64}$/.test(entry.sha256)
    )
      return { path: entry.path, kind: "file", sha256: entry.sha256 };
    throw new Error("invalid APM staging journal entry");
  });
  assertPortableTree(result);
  if (result.some((entry) => native(entry.path)))
    throw new Error("APM staging journal claims native-owned paths");
  return result;
}
function readJournal(path: string, source: string): StageJournal {
  regular(path, "file");
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (
    value === null ||
    typeof value !== "object" ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1 ||
    !("source" in value) ||
    value.source !== source ||
    !("originalSha256" in value) ||
    typeof value.originalSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.originalSha256) ||
    !("phase" in value) ||
    (value.phase !== "writing" && value.phase !== "ready") ||
    !("before" in value) ||
    !("after" in value)
  )
    throw new Error("invalid or foreign APM source staging journal");
  return {
    schemaVersion: 1,
    source,
    originalSha256: value.originalSha256,
    phase: value.phase,
    before: journalEntries(value.before),
    after: journalEntries(value.after),
  };
}
function writeJournal(path: string, value: StageJournal): void {
  const next = `${path}.next`;
  regular(next, "optional");
  const contents = stableJson(value);
  if (existsSync(next)) {
    regular(next, "file");
    if (readFileSync(next, "utf8") !== contents)
      throw new Error("foreign APM staging journal temporary file");
  } else writeFileSync(next, contents, { flag: "wx" });
  renameSync(next, path);
}
function validateStage(staged: string, journal: StageJournal): void {
  const actual = tree(staged).filter((entry) => !native(entry.path));
  if (journal.phase === "ready") {
    if (!existsSync(staged) || stableJson(actual) !== stableJson(journal.after))
      throw new Error("APM staged authored files changed; preserve and inspect the owned stage");
    return;
  }
  for (const entry of actual)
    if (
      ![...journal.before, ...journal.after].some(
        (expected) => stableJson(expected) === stableJson(entry),
      )
    )
      throw new Error("APM interrupted stage has foreign or changed authored files");
}

/** Copy immutable authored APM inputs to a journal-owned stable native root.
 * All local edges are anchored inside that copy, so native phases never edit author files.
 * Replays preserve native cache/lock metadata and reject unrecorded authored changes.
 */
export function stageApmSource(authoredSource: string, state: string): string {
  const source = resolve(authoredSource);
  const privateState = resolve(state);
  const staged = join(privateState, "native-source");
  const sourceRelationship = relative(privateState, source).split(sep).join("/");
  if (isAbsolute(sourceRelationship))
    throw new Error("APM staged source and state must share a filesystem root");
  regular(source, "directory");
  regular(join(source, "apm.yml"), "file");
  regular(privateState, "optional");
  if (
    staged === source ||
    (relative(source, staged).split(sep)[0] !== ".." && !isAbsolute(relative(source, staged)))
  )
    throw new Error("APM native stage must be outside the authored source");
  const captured = snapshot(source, staged);
  const journalPath = join(privateState, "source-stage.json");
  regular(journalPath, "optional");
  let journal: StageJournal | undefined;
  if (existsSync(journalPath)) {
    journal = readJournal(journalPath, sourceRelationship);
    validateStage(staged, journal);
    if (journal.phase === "writing" && journal.originalSha256 !== captured.originalSha256)
      throw new Error("APM authored source changed during an interrupted staging request");
    if (
      journal.phase === "ready" &&
      journal.originalSha256 === captured.originalSha256 &&
      stableJson(journal.after) === stableJson(captured.entries)
    )
      return staged;
  } else if (existsSync(staged))
    throw new Error("APM native source directory has no ownership journal");
  if (!journal || journal.phase === "ready") {
    journal = {
      schemaVersion: 1,
      source: sourceRelationship,
      originalSha256: captured.originalSha256,
      phase: "writing",
      before: journal?.after ?? [],
      after: captured.entries,
    };
    mkdirSync(privateState, { recursive: true });
    writeJournal(journalPath, journal);
  } else if (stableJson(journal.after) !== stableJson(captured.entries))
    throw new Error("APM interrupted staging afterimage does not match the requested source");
  mkdirSync(staged, { recursive: true });
  for (const entry of journal.before.filter((entry) => entry.kind === "file"))
    if (
      !journal.after.some((after) => after.path === entry.path && after.kind === "file") &&
      existsSync(join(staged, entry.path))
    )
      unlinkSync(join(staged, entry.path));
  for (const entry of [...journal.before].reverse().filter((entry) => entry.kind === "directory"))
    if (
      !journal.after.some((after) => after.path === entry.path && after.kind === "directory") &&
      existsSync(join(staged, entry.path))
    )
      rmdirSync(join(staged, entry.path));
  for (const entry of journal.after) {
    const path = join(staged, entry.path);
    regular(path, "optional");
    if (entry.kind === "directory") mkdirSync(path, { recursive: true });
    else {
      const bytes = captured.files.get(entry.path);
      if (!bytes) throw new Error("missing APM staged source bytes");
      if (existsSync(path) && digest(readFileSync(path)) === entry.sha256) continue;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes, { flag: existsSync(path) ? "w" : "wx" });
    }
  }
  const ready = { ...journal, phase: "ready" as const, before: [] };
  validateStage(staged, ready);
  if (snapshot(source, staged).originalSha256 !== captured.originalSha256)
    throw new Error("APM authored source changed while its private stage was written");
  writeJournal(journalPath, ready);
  return staged;
}
