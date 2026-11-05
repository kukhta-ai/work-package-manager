#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import gromaPackage from "groma.md/package.json" with { type: "json" };

export const GROMA_VERSION = "0.7.8";
export const TYPESCRIPT_SCANNER = "@groma/scanner-typescript@0.2.4";
// Reviewed scope policy: changing scanner configuration cannot silently shrink source coverage.
export const GROMA_SCAN_INCLUDE = Object.freeze([
  "**/*.ts",
  "**/*.tsx",
  "**/tsconfig*.json",
  "**/package.json",
  "**/*.html",
  "**/angular.json",
  "**/project.json",
  "**/nx.json",
]);
export const GROMA_SCANNER_EXCLUDE = Object.freeze([
  "*.test.ts",
  "*.test.tsx",
  "*.spec.ts",
  "*.spec.tsx",
  "/test/",
  "node_modules/",
  "dist/",
  "build/",
  "coverage/",
]);
export const GROMA_PRODUCT_EXCLUDE = Object.freeze([
  "/test/",
  "/scripts/",
  "/distribution-preparation/",
  "/quality/",
  "/.agents/",
  "/.claude/",
  "/.bmad/",
  "/research/",
  "/templates/",
  "/agent-skills/",
  "/backlog/",
  "/vitest.config.ts",
  "/vitest.mutation.config.ts",
]);
const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** @param {string} path @returns {Record<string, unknown>} */
function readObject(path) {
  const value = /** @type {unknown} */ (JSON.parse(readFileSync(path, "utf8")));
  if (!record(value)) throw new Error(`${path} must contain an object`);
  return value;
}
/** Reject moving pins, invisible updater behavior, and a vacuous scanner scope.
 * @param {unknown} value
 */
export function validateGromaConfig(value) {
  if (!record(value) || value.automaticUpdates !== false || value.useGitignore !== true) {
    throw new Error("Groma must disable automaticUpdates and honor Git ignores");
  }
  if (!Array.isArray(value.scanners) || value.scanners.length !== 1) {
    throw new Error("exactly the pinned TypeScript scanner must be configured");
  }
  const scanner = /** @type {unknown} */ (value.scanners[0]);
  if (!record(scanner) || scanner.id !== "typescript" || scanner.source !== TYPESCRIPT_SCANNER) {
    throw new Error(`Groma requires ${TYPESCRIPT_SCANNER}`);
  }
  for (const [actual, approved] of [
    [scanner.include, GROMA_SCAN_INCLUDE],
    [scanner.exclude, GROMA_SCANNER_EXCLUDE],
    [value.exclude, GROMA_PRODUCT_EXCLUDE],
  ]) {
    if (
      !Array.isArray(actual) ||
      !Array.isArray(approved) ||
      !actual.every((item) => typeof item === "string") ||
      actual.length !== approved.length ||
      new Set(actual).size !== actual.length ||
      actual.some((item) => !approved.includes(item))
    )
      throw new Error("Groma source scope differs from the reviewed include/exclude policy");
  }
}

/** Only execute the repository lockfile's wrapper; never resolve a global binary.
 * @param {string} root
 */
export function gromaInvocation(root) {
  if (gromaPackage.version !== GROMA_VERSION)
    throw new Error("resolved Groma package differs from the pin");
  const manifest = readObject(join(root, "package.json"));
  if (!record(manifest.devDependencies) || manifest.devDependencies["groma.md"] !== GROMA_VERSION) {
    throw new Error(`install exact development dependency groma.md@${GROMA_VERSION} with npm ci`);
  }
  const packageRoot = join(root, "node_modules", "groma.md");
  const installed = readObject(join(packageRoot, "package.json"));
  if (installed.version !== GROMA_VERSION)
    throw new Error("installed Groma version differs from pin");
  const entry = join(packageRoot, "cli.cjs");
  const delta = relative(realpathSync(packageRoot), realpathSync(entry));
  if (delta === ".." || delta.startsWith(`..${sep}`) || isAbsolute(delta)) {
    throw new Error("Groma executable escapes its local package");
  }
  return { executable: process.execPath, args: [entry] };
}

/** The upstream CLI can print `ok` while retaining stale scanner data after failure.
 * @param {string} output
 */
export function requireSuccessfulScan(output) {
  const summary = /created (\d+), refreshed (\d+), matched (\d+)/.exec(output);
  const count = summary ? Number(summary[1]) + Number(summary[2]) + Number(summary[3]) : 0;
  if (!/^ok\r?$/m.test(output) || !Number.isSafeInteger(count) || count <= 0) {
    throw new Error("Groma did not report a completed non-empty scan scope");
  }
  if (/saved scanner data kept|evidence conflicts [1-9]| · error · /i.test(output)) {
    throw new Error("Groma scanner failed or reported conflicting/error evidence");
  }
}

/** @param {string} root @param {readonly string[]} args */
function executeGroma(root, args) {
  const invocation = gromaInvocation(root);
  const result = spawnSync(invocation.executable, [...invocation.args, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 300_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0 || result.error) {
    throw new Error(
      `Groma ${args.join(" ")} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`,
    );
  }
  return result.stdout;
}

/** @param {string} root @returns {Map<string, string>} */
export function gromaSnapshot(root) {
  const base = join(root, "groma");
  /** @type {Map<string, string>} */
  const result = new Map();
  /** @param {string} directory */
  function walk(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (lstatSync(path).isSymbolicLink()) throw new Error("Groma records must not be symlinks");
      if (item.isDirectory()) walk(path);
      else if (item.isFile() && (item.name.endsWith(".md") || item.name === "config.json")) {
        result.set(
          relative(base, path).split(sep).join("/"),
          createHash("sha256").update(readFileSync(path)).digest("hex"),
        );
      }
    }
  }
  walk(base);
  if (![...result.keys()].some((path) => path.endsWith(".md")))
    throw new Error("Groma map is empty");
  return result;
}

/** @param {Map<string, string>} before @param {Map<string, string>} after */
export function changedGromaRecords(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((path) => before.get(path) !== after.get(path))
    .sort();
}

/** Check generated map output in a disposable working-tree snapshot, never mutate the shared checkout.
 * @param {string} root @param {"worktree" | "index"} mode @returns {{root: string, cleanup: () => void}}
 */
function scanSnapshot(root, mode) {
  const result = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", timeout: 30_000 },
  );
  if (result.status !== 0 || result.error)
    throw new Error("cannot enumerate the exact local Groma input snapshot");
  const scratch = mkdtempSync(join(tmpdir(), "wpm-groma-check-"));
  try {
    if (mode === "index") {
      const checkout = spawnSync("git", ["checkout-index", "--all", `--prefix=${scratch}${sep}`], {
        cwd: root,
        encoding: "utf8",
        timeout: 30_000,
      });
      if (checkout.status !== 0 || checkout.error)
        throw new Error(`cannot export staged Groma inputs: ${checkout.stderr}`);
    } else {
      for (const file of result.stdout.split("\0").filter(Boolean)) {
        const target = resolve(scratch, file);
        const delta = relative(scratch, target);
        if (delta === ".." || delta.startsWith(`..${sep}`) || isAbsolute(delta))
          throw new Error("Git snapshot input escapes its root");
        const source = join(root, file);
        const stat = lstatSync(source, { throwIfNoEntry: false });
        if (stat === undefined) continue; // A tracked deletion is absent from the worktree snapshot.
        mkdirSync(dirname(target), { recursive: true });
        cpSync(source, target, { dereference: false });
      }
    }
    symlinkSync(
      realpathSync(join(root, "node_modules")),
      join(scratch, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    for (const args of [
      ["init", "--quiet"],
      ["add", "--all"],
    ]) {
      const git = spawnSync("git", args, { cwd: scratch, encoding: "utf8", timeout: 30_000 });
      if (git.status !== 0 || git.error)
        throw new Error(`cannot prepare Groma input snapshot: ${git.stderr}`);
    }
    return { root: scratch, cleanup: () => rmSync(scratch, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(scratch, { recursive: true, force: true });
    throw error;
  }
}

/** @param {readonly string[]} args @param {string} root */
export function runGroma(args, root = SOURCE_ROOT) {
  const [command, ...rest] = args;
  if (command === "view") {
    validateGromaConfig(readObject(join(root, "groma", "config.json")));
    if (rest.length !== 1 || !rest[0]) throw new Error("usage: npm run groma:view -- <file-or-id>");
    return executeGroma(root, ["view", rest[0], "--plain"]);
  }
  if (command === "export") {
    validateGromaConfig(readObject(join(root, "groma", "config.json")));
    const [output, revision, from] = rest;
    if (!output || !revision || rest.length > 3) {
      throw new Error(
        "usage: npm run groma:export -- <private-output-directory> <revision> [from]",
      );
    }
    return executeGroma(root, [
      "export",
      resolve(output),
      "--revision",
      revision,
      ...(from ? ["--from", from] : []),
    ]);
  }
  if (command !== "scan" && command !== "check")
    throw new Error("expected scan, check, view or export");
  const mode =
    rest.length === 0
      ? "worktree"
      : rest.length === 2 && rest[0] === "--snapshot" && rest[1] === "index" && command === "check"
        ? "index"
        : undefined;
  if (!mode) throw new Error("usage: groma check [--snapshot index]; groma scan");
  const snapshot = command === "check" ? scanSnapshot(root, mode) : undefined;
  const scanRoot = snapshot?.root ?? root;
  try {
    validateGromaConfig(readObject(join(scanRoot, "groma", "config.json")));
    const before = gromaSnapshot(scanRoot);
    executeGroma(scanRoot, ["scanner", "check"]);
    const output = executeGroma(scanRoot, ["scan"]);
    requireSuccessfulScan(output);
    const after = gromaSnapshot(scanRoot);
    const changed = changedGromaRecords(before, after);
    if (command === "check" && changed.length) {
      throw new Error(`Groma map is stale; scan and curate these records: ${changed.join(", ")}`);
    }
    return `${output}\nGroma map checked (${after.size} records).\n`;
  } finally {
    snapshot?.cleanup();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(runGroma(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
