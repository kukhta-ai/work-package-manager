import { spawnSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { createIsolatedEnvironment } from "../distribution-preparation/verify-packed-install.js";
import { decodeJson } from "./json.mjs";
import { analyzer, doctorAnalyzers } from "./quality-tools.mjs";
import { gitleaksSourceArguments } from "./security-commands.mjs";

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** @param {Record<string, unknown>} value @param {readonly string[]} fields */
function closed(value, fields) {
  return Object.keys(value).every((key) => fields.includes(key));
}
/** @param {string} root @param {string} target */
function within(root, target) {
  const delta = relative(root, target);
  return delta === "" || (delta !== ".." && !delta.startsWith(`..${sep}`) && !isAbsolute(delta));
}

/** Resolve a new private destination without allowing checkout aliases or replacing user content.
 * @param {string} root @param {string} output
 */
export function privateExportDestination(root, output) {
  const logical = resolve(root, output);
  if (within(resolve(root), logical))
    throw new Error("Groma exports must stay outside the checkout");
  if (lstatSync(logical, { throwIfNoEntry: false }))
    throw new Error("Choose a new private export destination");
  const parent = realpathSync(dirname(logical));
  const destination = join(parent, basename(logical));
  if (within(realpathSync(root), destination))
    throw new Error("Export destination aliases the checkout");
  return destination;
}

/** @typedef {{revision: string, files: {path: string, content: string}[]}} SourceSnapshot */
/** Validate captured data before allowing it to create scanner input paths.
 * @param {unknown} value @param {readonly string[]} expected @returns {SourceSnapshot[]}
 */
export function inspectCapturedSources(value, expected) {
  if (
    !record(value) ||
    !closed(value, ["schemaVersion", "snapshots"]) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.snapshots)
  )
    throw new Error("Invalid captured source manifest");
  if (value.snapshots.length !== expected.length || new Set(expected).size !== expected.length)
    throw new Error("Source manifest does not cover the selected revisions");
  const revisions = new Set();
  /** @type {SourceSnapshot[]} */
  const snapshots = [];
  for (const snapshot of value.snapshots) {
    if (
      !record(snapshot) ||
      !closed(snapshot, ["revision", "files"]) ||
      typeof snapshot.revision !== "string" ||
      !expected.includes(snapshot.revision) ||
      revisions.has(snapshot.revision) ||
      !Array.isArray(snapshot.files)
    )
      throw new Error("Invalid or missing source revision");
    revisions.add(snapshot.revision);
    const paths = new Set();
    /** @type {{path: string, content: string}[]} */
    const files = [];
    for (const file of snapshot.files) {
      if (
        !record(file) ||
        !closed(file, ["path", "content"]) ||
        typeof file.path !== "string" ||
        typeof file.content !== "string"
      )
        throw new Error("Invalid captured source entry");
      const parts = file.path.split("/");
      if (
        !file.path ||
        isAbsolute(file.path) ||
        win32.isAbsolute(file.path) ||
        /[\\:]/.test(file.path) ||
        [...file.path].some((character) => character.charCodeAt(0) < 32) ||
        parts.some(
          (part) =>
            !part ||
            part === "." ||
            part === ".." ||
            /[. ]$/.test(part) ||
            /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
        )
      )
        throw new Error("Captured source path is unsafe");
      const key = file.path.normalize("NFC").toLowerCase();
      if (paths.has(key)) throw new Error("Captured source paths collide");
      paths.add(key);
      files.push({ path: file.path, content: file.content });
    }
    snapshots.push({ revision: snapshot.revision, files });
  }
  return snapshots;
}

/** The same pinned native detector/mandatory arguments used by repository security checks.
 * @param {string} directory @param {string} privateRoot @param {string} sourceRoot
 */
export function scanPrivateExport(directory, privateRoot, sourceRoot) {
  doctorAnalyzers();
  const config = join(privateRoot, "gitleaks.toml");
  const ignore = join(privateRoot, "gitleaks.ignore");
  const userConfig = join(privateRoot, "empty.npmrc");
  writeFileSync(config, "[extend]\nuseDefault = true\n", { flag: "wx", mode: 0o600 });
  for (const file of [ignore, userConfig]) writeFileSync(file, "", { flag: "wx", mode: 0o600 });
  const home = join(privateRoot, "home");
  mkdirSync(home, { mode: 0o700 });
  /** @type {NodeJS.ProcessEnv} */
  const env = createIsolatedEnvironment({
    home,
    workspace: directory,
    cache: join(privateRoot, "cache"),
    prefix: privateRoot,
    userConfig,
    sourceRoot,
  });
  for (const key of Object.keys(env))
    if (/^(?:GITLEAKS_|SEMGREP_|OSV_SCANNER_)/i.test(key)) delete env[key];
  const result = spawnSync(
    analyzer("gitleaks"),
    gitleaksSourceArguments({
      config,
      ignore,
      output: join(privateRoot, "redacted-findings.json"),
    }),
    { cwd: directory, env, encoding: "utf8", timeout: 300_000 },
  );
  if (result.status !== 0 || result.error)
    throw new Error(
      "Private source export failed secret inspection; no final export was delivered",
    );
}

/** @param {string} root @param {string} revision */
function resolveRevision(root, revision) {
  const result = spawnSync(
    "git",
    ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`],
    { cwd: root, encoding: "utf8", timeout: 30_000 },
  );
  const value = result.stdout?.trim();
  if (result.status !== 0 || result.error || !value || !/^[a-f0-9]{40,64}$/.test(value))
    throw new Error("Cannot resolve the selected export revision");
  return value;
}

/** Keep full source functionality behind private staging and native secret inspection.
 * @param {string} root @param {{output: string, revision: string, from?: string, ackSourceExport?: boolean}} options
 * @param {(args: readonly string[]) => string} invoke
 * @param {{scan?: typeof scanPrivateExport}} dependencies
 */
export function exportPrivateGroma(root, options, invoke, dependencies = {}) {
  if (options.ackSourceExport !== true)
    throw new Error("Full-source export requires explicit --ack-source-export");
  const destination = privateExportDestination(root, options.output);
  const revision = resolveRevision(root, options.revision);
  const from = options.from === undefined ? undefined : resolveRevision(root, options.from);
  if (from === revision) throw new Error("Choose two different export revisions");
  const stage = mkdtempSync(join(dirname(destination), ".wpm-groma-private-"));
  try {
    const scanRoot = join(stage, "content");
    const site = join(scanRoot, "site");
    mkdirSync(scanRoot, { mode: 0o700 });
    const manifest = join(stage, "source-manifest.json");
    const output = invoke([
      "export",
      site,
      "--ack-source-export",
      "--source-manifest",
      manifest,
      "--revision",
      revision,
      ...(from ? ["--from", from] : []),
    ]);
    const stat = lstatSync(manifest);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
      throw new Error("Source manifest must be an owned ordinary file");
    const sources = inspectCapturedSources(
      decodeJson(readFileSync(manifest, "utf8")),
      from ? [from, revision] : [revision],
    );
    for (const snapshot of sources)
      for (const [index, file] of snapshot.files.entries()) {
        // Repository paths can match detector vendor/lock filters. Scan captured text under neutral names.
        const target = join(scanRoot, "captured", snapshot.revision, `${index}.txt`);
        mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
        writeFileSync(target, file.content, { flag: "wx", mode: 0o600 });
      }
    (dependencies.scan ?? scanPrivateExport)(scanRoot, stage, root);
    const entries = lstatSync(site);
    if (!entries.isDirectory() || entries.isSymbolicLink())
      throw new Error("Export site must be an owned directory");
    if (lstatSync(destination, { throwIfNoEntry: false }))
      throw new Error("Export destination changed during inspection");
    chmodSync(site, 0o700);
    renameSync(site, destination);
    return `${output}\nPrivate source export inspected and delivered to ${destination}\n`;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
