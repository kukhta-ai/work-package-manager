#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { analyzer, doctorAnalyzers } from "./quality-tools.mjs";
import { rejectImplicitGitleaksPolicy, rejectImplicitSemgrepPolicy } from "./secret-policy.mjs";
import {
  gitleaksSourceArguments,
  osvSourceArguments,
  semgrepSourceArguments,
} from "./security-commands.mjs";

/** @typedef {{semgrep:string, gitleaks:string, osv:string, rules:string, gitleaksConfig:string, gitleaksIgnore:string, osvConfig:string, scratchParent?:string, output?:string, env?:NodeJS.ProcessEnv, reviewedFixtures?:{path:string, content:string}[]}} Options */
/** @typedef {(executable:string,args:string[],options:{cwd:string,env:NodeJS.ProcessEnv,timeout:number})=>{status:number|null,error?:Error}} Execute */
/** @type {Execute} */
const executePinned = (executable, args, options) =>
  spawnSync(executable, args, {
    ...options,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 8 * 1024 * 1024,
  });

/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** @param {unknown} value @returns {value is unknown[]} */
function array(value) {
  return Array.isArray(value);
}
/** @param {string} file @returns {unknown} */
function json(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
/** @param {string} file */
function regular(file) {
  if (!isAbsolute(file))
    throw new Error("Security qualification needs explicit absolute tool and policy paths");
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`Security qualification input is not a regular file: ${file}`);
}
/** @param {string} root @param {string} path */
function fixturePath(root, path) {
  const absolute = resolve(root, path);
  const delta = relative(root, absolute);
  if (!delta || delta === ".." || delta.startsWith(`..${sep}`) || isAbsolute(delta))
    throw new Error("Qualification fixture path escaped its owned root");
  return absolute;
}
/** @param {string} file @param {string} contents */
function write(file, contents) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

/**
 * Prove real scanners reject violations despite untrusted source policy and inline suppressions.
 * Fixtures contain only a generated fake token and non-executed shell syntax. No network or credentials.
 * @param {Options} options @param {Execute} execute
 */
export function qualifySecurityControls(options, execute = executePinned) {
  for (const file of [
    options.semgrep,
    options.gitleaks,
    options.osv,
    options.rules,
    options.gitleaksConfig,
    options.gitleaksIgnore,
    options.osvConfig,
  ])
    regular(file);
  const parent = options.scratchParent ?? tmpdir();
  mkdirSync(parent, { recursive: true });
  const owned = mkdtempSync(join(parent, "security-controls-"));
  const source = join(owned, "source");
  const reports = join(owned, "reports");
  mkdirSync(join(source, "src"), { recursive: true });
  mkdirSync(reports);
  /** @type {{name:string,analyzer:string,status:string,findings:number}[]} */
  const checks = [];
  /** @type {NodeJS.ProcessEnv} */
  const env = {
    ...Object.fromEntries(
      Object.entries(options.env ?? process.env).filter(
        ([key]) => !/^(?:PYTHON|SEMGREP_|GITLEAKS_|GH_TOKEN$|GITHUB_TOKEN$)/i.test(key),
      ),
    ),
    SEMGREP_SEND_METRICS: "off",
    SEMGREP_ENABLE_VERSION_CHECK: "0",
    SEMGREP_SETTINGS_FILE: join(owned, "settings.yml"),
    XDG_CACHE_HOME: join(owned, "cache"),
    XDG_CONFIG_HOME: join(owned, "config"),
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONNOUSERSITE: "1",
  };
  /** @param {string} executable @param {string[]} args @param {number} expected @param {string} name */
  const invoke = (executable, args, expected, name) => {
    const result = execute(executable, args, { cwd: source, env, timeout: 120_000 });
    if (result.error || result.status !== expected)
      throw new Error(
        `${name}: scanner exit ${result.status}, expected ${expected}${result.error ? ` (${result.error.message})` : ""}`,
      );
  };
  const fakeToken = `ghp_${createHash("sha256").update("WPM qualification fixture; never a real credential").digest("hex").slice(0, 36)}`;
  const genericSecret = createHash("sha256")
    .update("WPM generic-api-key fixture; never a real credential")
    .digest("base64url");
  const credential = join(source, "src/credential.ts");
  /** @param {string} name @param {boolean} expectFinding @param {string | undefined} requiredPath @param {string | undefined} requiredRule */
  const gitleaks = (name, expectFinding, requiredPath = undefined, requiredRule = undefined) => {
    rejectImplicitGitleaksPolicy(source);
    const output = join(reports, `gitleaks-${name}.json`);
    invoke(
      options.gitleaks,
      gitleaksSourceArguments({
        config: options.gitleaksConfig,
        ignore: options.gitleaksIgnore,
        output,
      }),
      expectFinding ? 1 : 0,
      `Gitleaks ${name}`,
    );
    const contents = readFileSync(output, "utf8");
    const findings = json(output);
    if (
      !array(findings) ||
      (expectFinding ? findings.length === 0 : findings.length !== 0) ||
      contents.includes(fakeToken) ||
      contents.includes(genericSecret)
    )
      throw new Error(`Gitleaks ${name}: malformed, unredacted or unexpected findings`);
    if (
      requiredPath &&
      !findings.some(
        (finding) =>
          record(finding) &&
          typeof finding.File === "string" &&
          finding.File.replaceAll("\\", "/").endsWith(requiredPath),
      )
    )
      throw new Error(`Gitleaks ${name}: reviewed-path credential was silently exempted`);
    if (
      requiredRule &&
      !findings.some(
        (finding) =>
          record(finding) &&
          finding.RuleID === requiredRule &&
          (!requiredPath ||
            (typeof finding.File === "string" &&
              finding.File.replaceAll("\\", "/").endsWith(requiredPath))),
      )
    )
      throw new Error(`Gitleaks ${name}: required ${requiredRule} finding was silently exempted`);
    checks.push({ name, analyzer: "gitleaks", status: "passed", findings: findings.length });
    return findings;
  };
  /** Explicit rejection is the gate outcome; native v8.30 still merges source ignore files despite -i. @param {string} name */
  const rejectSourceIgnore = (name) => {
    let rejection;
    try {
      rejectImplicitGitleaksPolicy(source);
    } catch (error) {
      rejection = error;
    }
    if (!(rejection instanceof Error) || !rejection.message.includes(".gitleaksignore"))
      throw new Error(`${name}: implicit ignore policy was not explicitly rejected`);
    checks.push({ name, analyzer: "gitleaks-policy", status: "passed", findings: 0 });
  };
  /** @param {string} name @param {boolean} expectFinding */
  const semgrep = (name, expectFinding) => {
    rejectImplicitSemgrepPolicy(
      existsSync(join(source, ".semgrepignore")) ? [".semgrepignore"] : [],
    );
    const output = join(reports, `semgrep-${name}.json`);
    invoke(
      options.semgrep,
      semgrepSourceArguments({ rules: options.rules, output, targets: ["src"] }),
      expectFinding ? 1 : 0,
      `Semgrep ${name}`,
    );
    const result = json(output);
    if (
      !record(result) ||
      !Array.isArray(result.results) ||
      !Array.isArray(result.errors) ||
      result.errors.length ||
      !record(result.paths) ||
      !Array.isArray(result.paths.scanned) ||
      result.paths.scanned.length === 0 ||
      (expectFinding ? result.results.length === 0 : result.results.length !== 0)
    )
      throw new Error(`Semgrep ${name}: empty scope, hidden findings or scanner errors`);
    if (
      expectFinding &&
      !result.results.some(
        (finding) =>
          record(finding) &&
          typeof finding.check_id === "string" &&
          finding.check_id.endsWith("no-shell-interpolation"),
      )
    )
      throw new Error(`Semgrep ${name}: expected shell rule did not fire`);
    checks.push({ name, analyzer: "semgrep", status: "passed", findings: result.results.length });
  };
  try {
    write(credential, "export const harmless = true;\n");
    gitleaks("clean", false);
    semgrep("clean", false);
    write(credential, `export const api_key = "${genericSecret}";\n`);
    gitleaks("generic-rule-baseline", true, "src/credential.ts", "generic-api-key");
    write(credential, `export const GITHUB_TOKEN = "${fakeToken}";\n`);
    const baseline = gitleaks("baseline", true);
    const fingerprints = baseline.map((finding) => {
      if (!record(finding) || typeof finding.Fingerprint !== "string" || !finding.Fingerprint)
        throw new Error("Gitleaks baseline omitted exact finding fingerprints");
      return finding.Fingerprint;
    });
    const ignoredConfig = join(source, ".gitleaks.toml");
    const ignoredFindings = join(source, ".gitleaksignore");
    write(
      ignoredConfig,
      'title = "untrusted source fixture"\n[extend]\nuseDefault = true\n[allowlist]\ndescription = "attempted blanket suppression"\npaths = [".*"]\n',
    );
    gitleaks("untrusted-config", true);
    rmSync(ignoredConfig);
    write(ignoredFindings, `${fingerprints.join("\n")}\n`);
    rejectSourceIgnore("untrusted-ignore-rejected");
    rmSync(ignoredFindings);
    write(credential, `export const GITHUB_TOKEN = "${fakeToken}"; // gitleaks:allow\n`);
    gitleaks("inline-allow", true);
    write(
      ignoredConfig,
      'title = "untrusted source fixture"\n[extend]\nuseDefault = true\n[allowlist]\npaths = [".*"]\n',
    );
    write(ignoredFindings, `${fingerprints.join("\n")}\n`);
    rejectSourceIgnore("combined-ignore-policy-rejected");
    rmSync(ignoredConfig);
    rmSync(ignoredFindings);
    write(credential, "export const harmless = true;\n");
    for (const [index, fixture] of (options.reviewedFixtures ?? []).entries()) {
      const path = fixturePath(source, fixture.path);
      const relativePath = fixture.path.replaceAll("\\", "/");
      write(path, fixture.content);
      gitleaks(`reviewed-fixture-${index + 1}-clean`, false);
      write(path, `${fixture.content}\nexport const GITHUB_TOKEN = "${fakeToken}";\n`);
      gitleaks(`reviewed-fixture-${index + 1}-github-credential`, true, relativePath, "github-pat");
      write(path, `${fixture.content}\nexport const api_key = "${genericSecret}";\n`);
      gitleaks(
        `reviewed-fixture-${index + 1}-generic-credential`,
        true,
        relativePath,
        "generic-api-key",
      );
      rmSync(path);
    }
    const shell = join(source, "src/shell.ts");
    write(shell, 'import { exec } from "node:child_process";\nexec("echo forbidden fixture");\n');
    semgrep("baseline", true);
    write(
      shell,
      'import { exec } from "node:child_process";\nexec("echo forbidden fixture"); // nosemgrep\n',
    );
    semgrep("inline-nosemgrep", true);
    write(join(source, ".gitignore"), "src/\n");
    semgrep("untrusted-git-ignore", true);
    write(join(source, ".semgrepignore"), "src/**\n");
    let semgrepRejection;
    try {
      rejectImplicitSemgrepPolicy([".semgrepignore"]);
    } catch (error) {
      semgrepRejection = error;
    }
    if (!(semgrepRejection instanceof Error) || !semgrepRejection.message.includes("ignore"))
      throw new Error("Semgrep source ignore policy was not explicitly rejected");
    checks.push({
      name: "untrusted-semgrep-ignore-rejected",
      analyzer: "semgrep-policy",
      status: "passed",
      findings: 0,
    });
    // Pin a tiny official OSV fixture; it proves matching/policy behavior, never substitutes for the full audit database.
    const database = join(owned, "osv-db");
    const zip = join(database, "osv-scalibr/npm/all.zip");
    mkdirSync(dirname(zip), { recursive: true });
    const vulnerability = fileURLToPath(
      new URL("../quality/fixtures/osv-npm-known-vulnerability.json", import.meta.url),
    );
    regular(vulnerability);
    const python = join(dirname(options.semgrep), "python");
    invoke(
      python,
      [
        "-I",
        "-B",
        "-c",
        "import pathlib,sys,zipfile; z=zipfile.ZipFile(sys.argv[1],'w',compression=zipfile.ZIP_STORED); z.writestr('GHSA-whgm-jr23-g3j9.json',pathlib.Path(sys.argv[2]).read_bytes()); z.close()",
        zip,
        vulnerability,
      ],
      0,
      "OSV fixture archive",
    );
    regular(zip);
    /** @param {string} version */
    const lock = (version) =>
      JSON.stringify({
        name: "qualification",
        version: "1.0.0",
        lockfileVersion: 3,
        packages: {
          "": { name: "qualification", version: "1.0.0", dependencies: { "ansi-html": version } },
          "node_modules/ansi-html": {
            version,
            resolved: `https://registry.npmjs.org/ansi-html/-/ansi-html-${version}.tgz`,
          },
        },
      });
    /** @param {string} name @param {string} version @param {boolean} expectFinding */
    const osv = (name, version, expectFinding) => {
      write(join(source, "package-lock.json"), lock(version));
      const output = join(reports, `osv-${name}.json`);
      invoke(
        options.osv,
        osvSourceArguments({
          config: options.osvConfig,
          database,
          output,
          downloadDatabase: false,
        }),
        expectFinding ? 1 : 0,
        `OSV ${name}`,
      );
      const result = json(output);
      if (!record(result) || !array(result.results) || !result.results.length)
        throw new Error(`OSV ${name}: source scope is empty`);
      const packages = result.results.flatMap((group) =>
        record(group) && array(group.packages) ? group.packages : [],
      );
      const selected = packages.find(
        (entry) =>
          record(entry) &&
          record(entry.package) &&
          entry.package.name === "ansi-html" &&
          entry.package.version === version &&
          entry.package.ecosystem === "npm",
      );
      if (!record(selected)) throw new Error(`OSV ${name}: exact fixture package was not scanned`);
      const vulnerabilities = array(selected.vulnerabilities) ? selected.vulnerabilities : [];
      const found = vulnerabilities.some(
        (item) => record(item) && item.id === "GHSA-whgm-jr23-g3j9",
      );
      if (expectFinding !== found || (!expectFinding && vulnerabilities.length))
        throw new Error(
          `OSV ${name}: known vulnerability was hidden or fixed boundary was not respected`,
        );
      checks.push({
        name,
        analyzer: "osv-scanner",
        status: "passed",
        findings: vulnerabilities.length,
      });
    };
    osv("known-vulnerable-package", "0.0.1", true);
    write(
      join(source, "osv-scanner.toml"),
      '[[IgnoredVulns]]\nid = "GHSA-whgm-jr23-g3j9"\nreason = "untrusted fixture exclusion"\n',
    );
    osv("untrusted-ignored-vulnerability", "0.0.1", true);
    osv("known-fixed-package", "0.0.8", false);
    const receipt = {
      schemaVersion: 1,
      status: "passed",
      checks,
      reviewedFixturePaths: (options.reviewedFixtures ?? []).map((fixture) => fixture.path),
      networkUsed: false,
      realCredentialsUsed: false,
    };
    if (options.output) write(options.output, `${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
  } catch (error) {
    if (options.output)
      write(
        options.output,
        `${JSON.stringify({ schemaVersion: 1, status: "failed", checks, error: error instanceof Error ? error.message : String(error), networkUsed: false, realCredentialsUsed: false }, null, 2)}\n`,
      );
    throw error;
  } finally {
    rmSync(owned, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        "gitleaks-config": { type: "string" },
        "gitleaks-ignore": { type: "string" },
        "osv-config": { type: "string" },
        output: { type: "string", default: join(root, ".quality/evidence/security-controls.json") },
      },
      strict: true,
    });
    if (!values["gitleaks-config"] || !values["gitleaks-ignore"] || !values["osv-config"])
      throw new Error(
        "Provide explicit reviewed --gitleaks-config, --gitleaks-ignore and --osv-config paths",
      );
    doctorAnalyzers();
    const result = qualifySecurityControls({
      semgrep: analyzer("semgrep"),
      gitleaks: analyzer("gitleaks"),
      osv: analyzer("osv-scanner"),
      rules: join(root, "quality/semgrep.yml"),
      gitleaksConfig: resolve(values["gitleaks-config"]),
      gitleaksIgnore: resolve(values["gitleaks-ignore"]),
      osvConfig: resolve(values["osv-config"]),
      output: values.output,
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
