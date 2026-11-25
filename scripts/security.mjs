import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeJson } from "./json.mjs";
import { analyzer, doctorAnalyzers } from "./quality-tools.mjs";
import { rejectImplicitSemgrepPolicy, securityPolicies } from "./secret-policy.mjs";
import {
  gitleaksSourceArguments,
  osvSourceArguments,
  semgrepSourceArguments,
} from "./security-commands.mjs";
import { qualifySecurityControls } from "./security-qualification.mjs";

const SOURCE_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
/** @param {Buffer | string} value */
function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Copy only Git-selected source into a disposable scanner root, excluding private ignored caches.
 * @param {string} root @param {string} scratchParent
 */
export function createSecuritySnapshot(root, scratchParent) {
  const listed = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", timeout: 30_000 },
  );
  if (listed.status !== 0 || listed.error)
    throw new Error("Cannot enumerate security input snapshot");
  mkdirSync(scratchParent, { recursive: true });
  const snapshot = mkdtempSync(resolve(scratchParent, "security-source-"));
  /** @type {string[]} */
  const selected = [];
  try {
    for (const file of listed.stdout.split("\0").filter(Boolean).sort()) {
      const source = resolve(root, file);
      const target = resolve(snapshot, file);
      const delta = relative(snapshot, target);
      if (delta === ".." || delta.startsWith(`..${sep}`) || isAbsolute(delta))
        throw new Error("Security source path escapes snapshot");
      const stat = lstatSync(source, { throwIfNoEntry: false });
      if (stat === undefined) continue;
      const real = realpathSync(source);
      const fromRoot = relative(realpathSync(root), real);
      if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot))
        throw new Error(`Security source link escapes checkout: ${file}`);
      if (stat.isDirectory())
        throw new Error(`Nested repository needs explicit security scope: ${file}`);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
      selected.push(file);
    }
    if (!selected.length) throw new Error("Security source snapshot is empty");
    return {
      root: snapshot,
      selected,
      cleanup: () => rmSync(snapshot, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(snapshot, { recursive: true, force: true });
    throw error;
  }
}
/** @param {string} directory @returns {string[]} */
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("OSV database cache must not contain symlinks");
    return entry.isDirectory() ? files(path) : entry.isFile() ? [path] : [];
  });
}
/** Persist database identity even when download or matching fails; request time is not an upstream freshness claim.
 * @param {{directory: string, output: string, lockfile: string, startedAt: string, exitStatus: number | null, error?: string}} input
 */
export function recordOfflineEvidence(input) {
  const databases = existsSync(input.directory)
    ? files(input.directory).map((path) => {
        const stat = lstatSync(path);
        return {
          path: relative(input.directory, path).split(sep).join("/"),
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          sha256: digest(readFileSync(path)),
        };
      })
    : [];
  const report = {
    schemaVersion: 1,
    status: input.exitStatus === 0 && databases.length > 0 ? "passed" : "failed",
    downloadRequested: true,
    downloadRequestedAt: input.startedAt,
    checkedAt: new Date().toISOString(),
    exitStatus: input.exitStatus,
    error: input.error ?? null,
    lockfileDigest: digest(readFileSync(input.lockfile)),
    databases,
  };
  mkdirSync(dirname(input.output), { recursive: true });
  writeFileSync(input.output, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
/** @param {string} executable @param {string[]} args @param {string} cwd @param {NodeJS.ProcessEnv} env */
function execute(executable, args, cwd, env) {
  console.log(`> ${executable} ${args.join(" ")}`);
  return spawnSync(executable, args, { cwd, env, stdio: "inherit", timeout: 1_200_000 });
}
/** @param {ReturnType<typeof execute>} result @param {string} name */
function requirePass(result, name) {
  if (result.status !== 0 || result.error)
    throw new Error(
      `${name} failed (${result.status}): ${result.error?.message ?? "see redacted analyzer evidence"}`,
    );
}
/** Require every managed executable source file to be analyzed; declaration-only TypeScript has no runtime body.
 * @param {unknown} report @param {readonly string[]} selected
 */
export function requireSemgrepCoverage(report, selected) {
  if (
    !record(report) ||
    !record(report.paths) ||
    !Array.isArray(report.paths.scanned) ||
    !report.paths.scanned.every((value) => typeof value === "string") ||
    (Array.isArray(report.errors) && report.errors.length)
  )
    throw new Error("Semgrep source coverage is empty or incomplete");
  const scanned = new Set(report.paths.scanned.map((path) => path.replaceAll("\\", "/")));
  const expected = selected.filter(
    (path) =>
      /^(?:src|scripts|distribution-preparation)\//.test(path) &&
      /\.[cm]?[jt]sx?$/.test(path) &&
      !/\.d\.[cm]?ts$/.test(path),
  );
  const missing = expected.filter((path) => !scanned.has(path));
  if (!expected.length || missing.length)
    throw new Error(
      `Semgrep did not analyze the complete managed source scope: ${missing.join(", ")}`,
    );
}

/** Run local CE rules and pinned analyzers on an explicit Git input snapshot. @param {string} root */
export function security(root = SOURCE_ROOT) {
  doctorAnalyzers();
  const evidence = resolve(root, ".quality/evidence");
  mkdirSync(evidence, { recursive: true });
  /** @type {NodeJS.ProcessEnv} */
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !/^(?:PYTHON|SEMGREP_|GITLEAKS_|OSV_SCANNER_|GH_TOKEN$|GITHUB_TOKEN$)/i.test(key),
      ),
    ),
    SEMGREP_SEND_METRICS: "off",
    SEMGREP_ENABLE_VERSION_CHECK: "0",
    SEMGREP_SETTINGS_FILE: resolve(root, ".quality/config/semgrep.yml"),
    XDG_CACHE_HOME: resolve(root, ".quality/cache"),
    XDG_CONFIG_HOME: resolve(root, ".quality/config"),
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONNOUSERSITE: "1",
  };
  // CE/offline scans must not inherit personal service credentials or scanner policy overrides.
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"])
    if (env[key] === "") delete env[key];
  for (const key of [
    "SEMGREP_APP_TOKEN",
    "GITLEAKS_CONFIG",
    "GITLEAKS_CONFIG_TOML",
    "OSV_SCANNER_CONFIG",
  ])
    delete env[key];
  const snapshot = createSecuritySnapshot(root, resolve(root, ".quality/tmp"));
  /** @type {ReturnType<typeof securityPolicies> | undefined} */
  let policies;
  try {
    rejectImplicitSemgrepPolicy(snapshot.selected);
    policies = securityPolicies(snapshot.root, resolve(root, ".quality/tmp"), snapshot.selected);
    qualifySecurityControls({
      semgrep: analyzer("semgrep"),
      gitleaks: analyzer("gitleaks"),
      osv: analyzer("osv-scanner"),
      osvConfig: policies.osvConfig,
      rules: resolve(root, "quality/semgrep.yml"),
      gitleaksConfig: policies.gitleaksConfig,
      gitleaksIgnore: policies.gitleaksIgnore,
      scratchParent: resolve(root, ".quality/tmp"),
      output: resolve(evidence, "security-controls.json"),
      env,
      reviewedFixtures: policies.reviewedFixtures,
    });
    requirePass(
      execute(
        analyzer("semgrep"),
        [
          "--test",
          "--config",
          resolve(root, "quality/semgrep.yml"),
          resolve(root, "quality/semgrep-tests.js"),
          "--metrics",
          "off",
          "--disable-version-check",
        ],
        snapshot.root,
        env,
      ),
      "Semgrep rule fixtures",
    );
    const sastReport = resolve(evidence, "semgrep.json");
    requirePass(
      execute(
        analyzer("semgrep"),
        semgrepSourceArguments({
          rules: resolve(root, "quality/semgrep.yml"),
          output: sastReport,
          targets: ["src", "scripts", "distribution-preparation"],
        }),
        snapshot.root,
        env,
      ),
      "Semgrep source scan",
    );
    const scanned = decodeJson(readFileSync(sastReport, "utf8"));
    requireSemgrepCoverage(scanned, snapshot.selected);
    requirePass(execute(analyzer("actionlint"), [], root, env), "actionlint");
    requirePass(
      execute(analyzer("zizmor"), ["--offline", "--no-progress", ".github/workflows"], root, env),
      "zizmor",
    );
    requirePass(
      execute(
        analyzer("gitleaks"),
        gitleaksSourceArguments({
          config: policies.gitleaksConfig,
          ignore: policies.gitleaksIgnore,
          output: resolve(evidence, "gitleaks.json"),
        }),
        snapshot.root,
        env,
      ),
      "Gitleaks",
    );
    const dbDirectory = resolve(root, ".quality/cache/osv-databases");
    mkdirSync(dbDirectory, { recursive: true });
    const startedAt = new Date().toISOString();
    const result = execute(
      analyzer("osv-scanner"),
      osvSourceArguments({
        config: policies.osvConfig,
        database: dbDirectory,
        output: resolve(evidence, "osv.json"),
        downloadDatabase: true,
      }),
      snapshot.root,
      env,
    );
    const receipt = recordOfflineEvidence({
      directory: dbDirectory,
      output: resolve(evidence, "osv-databases.json"),
      lockfile: resolve(snapshot.root, "package-lock.json"),
      startedAt,
      exitStatus: result.status,
      ...(result.error ? { error: result.error.message } : {}),
    });
    requirePass(result, "OSV vulnerability scan");
    if (receipt.status !== "passed")
      throw new Error("OSV did not retain complete offline database identity");
  } finally {
    policies?.cleanup();
    snapshot.cleanup();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    security();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
