import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNpmInvocation } from "../distribution-preparation/prepare-package.js";
import { decodeJson } from "./json.mjs";
import { doctorAnalyzers } from "./quality-tools.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const evidence = resolve(root, ".quality/evidence");
/** @typedef {{bin?: string | Record<string,string>, version: string}} Package */
/** Invoke exact installed tools; never npx, downloads or PATH fallback. @param {string} name @param {string[]} args */
function local(name, args) {
  const manifestPath = resolve(root, "node_modules", name, "package.json");
  if (!existsSync(manifestPath)) throw new Error(`Missing ${name}; run npm ci`);
  const manifest = /** @type {Package} */ (decodeJson(readFileSync(manifestPath, "utf8")));
  const bin =
    typeof manifest.bin === "string" ? manifest.bin : Object.values(manifest.bin ?? {})[0];
  if (!bin) throw new Error(`${name} has no executable`);
  run(process.execPath, [resolve(root, "node_modules", name, bin), ...args]);
}
/** @param {string} executable @param {string[]} args @param {NodeJS.ProcessEnv} env */
function run(executable, args, env = process.env) {
  console.log(`> ${executable} ${args.join(" ")}`);
  const result = spawnSync(executable, args, {
    cwd: root,
    env,
    stdio: "inherit",
    timeout: 3_600_000,
  });
  if (result.status !== 0 || result.error)
    throw new Error(
      `Check failed (${result.status}): ${executable} ${args.join(" ")}${result.error ? `: ${result.error.message}` : ""}`,
    );
}
/** @param {string} name @param {string[]} args */
function script(name, args = []) {
  run(process.execPath, [resolve(root, "scripts", name), ...args]);
}

/** Verify both lock intent and installed local versions before running any checks. */
export function doctor() {
  const manifest =
    /** @type {{dependencies: Record<string,string>, devDependencies: Record<string,string>}} */ (
      decodeJson(readFileSync(resolve(root, "package.json"), "utf8"))
    );
  for (const name of [
    "@biomejs/biome",
    "backlog.md",
    "typescript",
    "typescript-eslint",
    "eslint",
    "dependency-cruiser",
    "knip",
    "fast-check",
    "@stryker-mutator/core",
    "@stryker-mutator/vitest-runner",
    "groma.md",
    "publint",
    "vitest",
  ]) {
    const expected = manifest.devDependencies[name] ?? manifest.dependencies[name];
    if (!expected || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(expected))
      throw new Error(`Missing exact pin: ${name}`);
    const installed = /** @type {Package} */ (
      decodeJson(readFileSync(resolve(root, "node_modules", name, "package.json"), "utf8"))
    );
    if (installed.version !== expected) throw new Error(`${name} differs from its pin`);
  }
  doctorAnalyzers();
  script("agents.mjs", ["doctor"]);
}
/** Local feedback does not require network or the security analyzer toolchain. */
function fast() {
  local("typescript", ["--pretty", "false"]);
  local("@biomejs/biome", ["ci", "."]);
  local("eslint", [".", "--max-warnings", "0"]);
  script("architecture.mjs");
  script("agents.mjs", ["check"]);
  script("check-process-artifacts.mjs");
}
/** Security analyzers own their explicit source snapshot and retained offline database evidence. */
function security() {
  script("security.mjs");
}

/** Run the declared band. Unknown/empty modes and missing analyzers fail closed. @param {string} mode @param {string[]} args */
export function quality(mode, args = []) {
  if (!["doctor", "fast", "ci", "release"].includes(mode))
    throw new Error(`Unknown quality mode: ${mode}`);
  if (args.some((arg) => arg !== "--policy-only")) throw new Error("Unknown quality option");
  if (mode !== "ci" && args.length > 0)
    throw new Error(
      "Only CI may select the policy-only band; release qualification requires all checks",
    );
  if (mode === "doctor") {
    doctor();
    return;
  }
  if (mode === "fast") {
    fast();
    return;
  }
  doctor();
  mkdirSync(evidence, { recursive: true });
  fast();
  local("knip", []);
  local("knip", ["--production"]);
  security();
  script("groma.mjs", ["check"]);
  script("mutation.mjs");
  if (!args.includes("--policy-only")) {
    // Binary acceptance tests must never rely on a developer's warm dist directory. This is a test
    // prerequisite; candidate preparation subsequently packs its one archive from a clean revision.
    const npm = resolveNpmInvocation();
    run(npm.executable, [...npm.argumentPrefix, "run", "build"]);
    local("vitest", [
      "run",
      ...(process.env.WPM_TEST_REPORTER === "verbose" ? ["--reporter=verbose"] : []),
    ]);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    quality(process.argv[2] ?? "", process.argv.slice(3));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
