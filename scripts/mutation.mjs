#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeJson } from "./json.mjs";

const CRITICAL_GLOBS = ["src/vnext/core/**/*.ts", "src/core/services/integrity.ts"];
const STATUSES = [
  "Killed",
  "Timeout",
  "Survived",
  "NoCoverage",
  "CompileError",
  "RuntimeError",
  "Ignored",
];
const KNOWN_DEPENDENCIES = new Set(["@stryker-mutator/core", "ajv", "yaml"]);

/** @typedef {Record<string, unknown>} JsonRecord */
/** @typedef {{line: number, column: number}} Position */
/** @typedef {{start: Position, end: Position}} Location */
/** @typedef {{file: string, sourceSha256: string, mutatorName: string, location: Location, original: string, replacement: string, status: string}} Subject */

/** @param {unknown} value @returns {value is JsonRecord} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** @param {unknown} value @returns {JsonRecord} */
function record(value) {
  if (!isRecord(value)) throw new Error("Mutation evidence requires a JSON object");
  return value;
}
/** @param {unknown} value @returns {unknown[]} */
function array(value) {
  if (!Array.isArray(value)) throw new Error("Mutation evidence requires an array");
  return value;
}
/** @param {unknown} value */
function text(value) {
  if (typeof value !== "string" || value.length === 0)
    throw new Error("Mutation evidence requires text");
  return value;
}
/** @param {string} value */
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
/** @param {unknown} value @returns {unknown} */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
/** @param {unknown} value */
function fingerprint(value) {
  return sha256(JSON.stringify(canonical(value)));
}
/** @param {JsonRecord} value @param {string[]} keys */
function exactKeys(value, keys) {
  if (Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0"))
    throw new Error("Unexpected or missing mutation review fields");
}
/** @param {unknown} value @returns {Position} */
function position(value) {
  const point = record(value);
  exactKeys(point, ["line", "column"]);
  if (
    typeof point.line !== "number" ||
    typeof point.column !== "number" ||
    !Number.isSafeInteger(point.line) ||
    !Number.isSafeInteger(point.column) ||
    point.line < 1 ||
    point.column < 1
  )
    throw new Error("Invalid mutation source position");
  return { line: point.line, column: point.column };
}
/** @param {unknown} value @returns {Location} */
function location(value) {
  const range = record(value);
  exactKeys(range, ["start", "end"]);
  return { start: position(range.start), end: position(range.end) };
}
/** Stryker report positions use one-based UTF-16 columns. @param {string} source @param {Location} range */
function snippet(source, range) {
  const lines = source.split("\n");
  /** @param {Position} point */
  const offset = (point) => {
    const line = lines[point.line - 1];
    if (line === undefined || point.column > line.length + 1)
      throw new Error("Mutation range is outside the exact source");
    return (
      lines.slice(0, point.line - 1).reduce((sum, value) => sum + value.length + 1, 0) +
      point.column -
      1
    );
  };
  const start = offset(range.start);
  const end = offset(range.end);
  if (end <= start) throw new Error("Mutation range is empty or reversed");
  return source.slice(start, end);
}
/** @param {string} path */
function regularFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`Expected regular mutation evidence: ${path}`);
  return path;
}
/** @param {string} root */
function criticalFiles(root) {
  /** @param {string} directory @returns {string[]} */
  const walk = (directory) => {
    const absolute = join(root, directory);
    const stat = lstatSync(absolute);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Critical mutation scope is not a real directory");
    return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isSymbolicLink()) throw new Error("Symlink in critical mutation scope");
      const child = `${directory}/${entry.name}`;
      return entry.isDirectory()
        ? walk(child)
        : entry.isFile() && child.endsWith(".ts")
          ? [child]
          : [];
    });
  };
  const files = [...walk("src/vnext/core"), "src/core/services/integrity.ts"].sort();
  for (const file of files) regularFile(join(root, file));
  if (files.length < 2) throw new Error("Critical mutation scope is empty");
  return files;
}
/** @param {string} root @param {string} name */
function dependencyVersion(root, name) {
  if (!KNOWN_DEPENDENCIES.has(name)) throw new Error(`Unsupported reviewed dependency: ${name}`);
  const manifest = record(decodeJson(readFileSync(join(root, "package.json"), "utf8")));
  const expected =
    record(manifest.dependencies ?? {})[name] ?? record(manifest.devDependencies ?? {})[name];
  const version = text(expected);
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error(`Mutation dependency must have an exact pin: ${name}`);
  const installed = record(
    decodeJson(readFileSync(regularFile(join(root, "node_modules", name, "package.json")), "utf8")),
  );
  if (installed.version !== version)
    throw new Error(`Mutation dependency differs from exact pin: ${name}`);
  return version;
}
/** @param {string} root @param {unknown} input */
function reviewRecords(root, input) {
  const document = record(input);
  exactKeys(document, ["schemaVersion", "waivers"]);
  if (document.schemaVersion !== 1) throw new Error("Unsupported mutation waiver schema");
  return array(document.waivers).map((entry) => {
    const waiver = record(entry);
    exactKeys(waiver, [
      "file",
      "sourceSha256",
      "mutatorName",
      "location",
      "original",
      "replacement",
      "status",
      "versions",
      "review",
      "fingerprint",
    ]);
    const review = record(waiver.review);
    exactKeys(review, ["reviewedBy", "disposition", "rationale"]);
    if (review.disposition !== "equivalent" || text(review.rationale).length < 60)
      throw new Error("Mutation waiver lacks a bounded equivalence rationale");
    text(review.reviewedBy);
    const versions = record(waiver.versions);
    if (!Object.hasOwn(versions, "@stryker-mutator/core"))
      throw new Error("Mutation waiver does not bind Stryker");
    const file = text(waiver.file);
    if (
      (file === "src/vnext/core/model.ts" && !Object.hasOwn(versions, "ajv")) ||
      (file === "src/vnext/core/source-text.ts" && !Object.hasOwn(versions, "yaml"))
    )
      throw new Error("Mutation waiver omits its reviewed validator/parser version");
    for (const [name, version] of Object.entries(versions))
      if (version !== dependencyVersion(root, name))
        throw new Error(`Reviewed dependency version changed: ${name}`);
    if (waiver.status !== "Survived" && waiver.status !== "NoCoverage")
      throw new Error("Mutation waiver must name its reviewed status");
    const sourceSha256 = text(waiver.sourceSha256);
    if (!/^[a-f0-9]{64}$/.test(sourceSha256)) throw new Error("Invalid mutation source digest");
    /** @type {Subject} */
    const subject = {
      file,
      sourceSha256,
      mutatorName: text(waiver.mutatorName),
      location: location(waiver.location),
      original: text(waiver.original),
      replacement: text(waiver.replacement),
      status: waiver.status,
    };
    const payload = { ...subject, versions, review };
    if (fingerprint(payload) !== waiver.fingerprint)
      throw new Error("Mutation waiver fingerprint does not match reviewed content");
    return { subject, fingerprint: text(waiver.fingerprint) };
  });
}

/** Validate an already-produced report. Release qualification calls runMutationGate for a fresh run.
 * @param {string} root @param {unknown} reportInput @param {unknown} waiverInput
 */
export function reviewMutationReport(root, reportInput, waiverInput) {
  const report = record(reportInput);
  const framework = record(report.framework);
  const stryker = dependencyVersion(root, "@stryker-mutator/core");
  if (
    report.schemaVersion !== "1.0" ||
    framework.name !== "StrykerJS" ||
    framework.version !== stryker
  )
    throw new Error("Unsupported or unpinned mutation report producer");
  const config = record(report.config);
  if (
    fingerprint(array(config.mutate).map(text).sort()) !== fingerprint([...CRITICAL_GLOBS].sort())
  )
    throw new Error("Declared critical mutation patterns changed");
  if (isRecord(config.mutator) && array(config.mutator.excludedMutations ?? []).length > 0)
    throw new Error("Critical mutation operators were excluded");
  const tests = record(report.testFiles);
  if (
    !Object.values(tests).some(
      (entry) => isRecord(entry) && Array.isArray(entry.tests) && entry.tests.length > 0,
    )
  )
    throw new Error("Mutation test scope is empty");
  const files = record(report.files);
  const expected = criticalFiles(root);
  if (fingerprint(Object.keys(files).sort()) !== fingerprint(expected))
    throw new Error("Critical mutation file scope is empty, missing or unexpected");
  const waivers = reviewRecords(root, waiverInput);
  const pending = new Map(waivers.map((waiver) => [fingerprint(waiver.subject), waiver]));
  if (
    pending.size !== waivers.length ||
    new Set(waivers.map((waiver) => waiver.fingerprint)).size !== waivers.length
  )
    throw new Error("Duplicate mutation waiver");
  const seen = new Set();
  /** @type {Record<string, number>} */
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  /** @type {Record<string, string>} */
  const sourceFiles = {};
  /** @type {string[]} */
  const accepted = [];
  for (const file of expected) {
    const detail = record(files[file]);
    const source = text(detail.source);
    if (readFileSync(regularFile(join(root, file)), "utf8") !== source)
      throw new Error(`Mutation report source differs from current source: ${file}`);
    const sourceSha256 = sha256(source);
    sourceFiles[file] = sourceSha256;
    const mutants = array(detail.mutants);
    if (!mutants.length) throw new Error(`Critical file has no mutation scope: ${file}`);
    for (const input of mutants) {
      const mutant = record(input);
      const status = text(mutant.status);
      if (!STATUSES.includes(status) || status === "Ignored")
        throw new Error(`Unknown or ignored critical mutation status: ${status}`);
      /** @type {Subject} */
      const subject = {
        file,
        sourceSha256,
        mutatorName: text(mutant.mutatorName),
        location: location(mutant.location),
        original: "",
        replacement: text(mutant.replacement),
        status,
      };
      subject.original = snippet(source, subject.location);
      const identity = fingerprint({ ...subject, status: undefined });
      if (seen.has(identity)) throw new Error("Duplicate mutation report identity");
      seen.add(identity);
      counts[status] = (counts[status] ?? 0) + 1;
      if (
        status === "RuntimeError" &&
        (mutant.static !== true ||
          typeof mutant.statusReason !== "string" ||
          !mutant.statusReason.includes("schema is invalid"))
      )
        throw new Error("Unclassified mutation runtime failure");
      if (status !== "Survived" && status !== "NoCoverage") continue;
      const key = fingerprint(subject);
      const waiver = pending.get(key);
      if (!waiver)
        throw new Error(
          `Unreviewed ${status}: ${file} ${subject.mutatorName} at ${subject.location.start.line}:${subject.location.start.column}`,
        );
      accepted.push(waiver.fingerprint);
      pending.delete(key);
    }
  }
  if (pending.size > 0) throw new Error("Stale or unconsumed mutation waiver");
  const detected = (counts.Killed ?? 0) + (counts.Timeout ?? 0);
  const scored = detected + (counts.Survived ?? 0) + (counts.NoCoverage ?? 0);
  if (!scored) throw new Error("No scored critical mutations");
  return {
    schemaVersion: 1,
    status: "accepted",
    counts,
    rawMutationScore: (100 * detected) / scored,
    reviewed: accepted.sort(),
    unreviewed: 0,
    sourceFiles,
    reportSemanticSha256: fingerprint(report),
    toolchain: { node: process.version, v8: process.versions.v8, stryker },
    unscoredInitializationErrors: counts.RuntimeError ?? 0,
  };
}

/** Run exact local Stryker with a fresh report; raw break zero in config only permits collection.
 * @param {string} root
 * @param {(args: string[], cwd: string) => void} execute
 */
export function runMutationGate(root, execute = executeStryker) {
  const directory = join(root, ".quality/mutation");
  const reportPath = join(directory, "report.json");
  const receiptPath = join(directory, "review.json");
  mkdirSync(directory, { recursive: true });
  rmSync(reportPath, { force: true });
  rmSync(receiptPath, { force: true });
  criticalFiles(root);
  dependencyVersion(root, "@stryker-mutator/core");
  const cli = regularFile(join(root, "node_modules/@stryker-mutator/core/bin/stryker.js"));
  execute([cli, "run", join(root, "stryker.config.mjs")], root);
  const raw = readFileSync(regularFile(reportPath), "utf8");
  const waivers = decodeJson(
    readFileSync(regularFile(join(root, "quality/mutation-waivers.json")), "utf8"),
  );
  const result = {
    ...reviewMutationReport(root, decodeJson(raw), waivers),
    reportFileSha256: sha256(raw),
  };
  writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

/** @param {string[]} args @param {string} cwd */
function executeStryker(args, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: "inherit", timeout: 3_600_000 });
  if (result.error || result.status !== 0)
    throw new Error(
      `Stryker collection failed (${result.status}): ${result.error?.message ?? "see runner output"}`,
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2)
      throw new Error(
        "mutation.mjs accepts no flags; release qualification always runs fresh Stryker",
      );
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    console.log(JSON.stringify(runMutationGate(root), null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
