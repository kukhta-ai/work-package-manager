#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inspectPackageArchiveBytes } from "./package-archive.js";
import {
  assertInstalledExecutableObservation,
  assertInstallPrerequisites,
  assertNodePrerequisite,
  evaluateInstalledPaths,
  PackedInstallPrerequisiteError,
  resolveGlobalInstallLayout,
  resolveInstalledExecutableInvocation,
  validateInspectedPackageReport,
} from "./packed-install.js";
import { resolveNpmInvocation } from "./prepare-package.js";

const SOURCE_ROOT = realpathSync(fileURLToPath(new URL("..", import.meta.url)));

/**
 * @typedef OutputSink
 * @property {(chunk: string) => unknown} write
 */

class UsageError extends Error {}

/**
 * @param {readonly string[]} args
 * @returns {{reportPath: string, outputDirectory: string | undefined}}
 */
function parseArguments(args) {
  let reportPath;
  let outputDirectory;
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];
    if (option === "--report" && reportPath === undefined && value !== undefined && value !== "") {
      reportPath = value;
      index += 1;
    } else if (
      option === "--output" &&
      outputDirectory === undefined &&
      value !== undefined &&
      value !== ""
    ) {
      outputDirectory = value;
      index += 1;
    } else {
      throw new UsageError(
        "usage: node distribution-preparation/verify-packed-install.js --report <accepted-report.json> [--output <consumer-directory>]",
      );
    }
  }
  if (reportPath === undefined) {
    throw new UsageError(
      "usage: node distribution-preparation/verify-packed-install.js --report <accepted-report.json> [--output <consumer-directory>]",
    );
  }
  return { reportPath, outputDirectory };
}

/** @param {string} path @param {string} recovery */
function readRequiredFile(path, recovery) {
  try {
    return readFileSync(path);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${recovery}: ${path} (${reason})`);
  }
}

/** @param {string} root @param {string} candidate */
function isPathWithin(root, candidate) {
  const difference = relative(resolve(root), resolve(candidate));
  return (
    difference === "" ||
    (difference !== ".." && !difference.startsWith(`..${sep}`) && !isAbsolute(difference))
  );
}

/**
 * Build the child environment used by npm and the installed commands. Besides isolating npm state, remove
 * npm-run context and Node injection/search variables, and remove source-checkout entries from PATH so an
 * installed executable cannot silently load or launch repository-side code.
 *
 * @param {{home: string, workspace: string, cache: string, prefix: string, userConfig: string, sourceRoot: string}} input
 * @param {NodeJS.ProcessEnv=} ambient
 */
export function createIsolatedEnvironment(input, ambient = process.env) {
  const excluded = new Set([
    "home",
    "userprofile",
    "path",
    "pwd",
    "init_cwd",
    "node_options",
    "node_path",
    "npm_execpath",
    "npm_node_execpath",
    "npm_command",
  ]);
  const inherited = Object.fromEntries(
    Object.entries(ambient).filter(([key]) => {
      const normalized = key.toLowerCase();
      const credentialLike =
        normalized.endsWith("_token") ||
        normalized.includes("auth_token") ||
        normalized.includes("password") ||
        normalized.includes("secret") ||
        normalized.endsWith("_api_key") ||
        normalized.endsWith("_access_key");
      return (
        !excluded.has(normalized) &&
        !credentialLike &&
        !normalized.startsWith("npm_config_") &&
        !normalized.startsWith("npm_package_") &&
        !normalized.startsWith("npm_lifecycle_")
      );
    }),
  );
  const ambientPath =
    Object.entries(ambient).find(([key]) => key.toLowerCase() === "path")?.[1] ?? "";
  const path = ambientPath
    .split(delimiter)
    .filter((entry) => entry !== "" && !isPathWithin(input.sourceRoot, entry))
    .join(delimiter);
  return {
    ...inherited,
    HOME: input.home,
    USERPROFILE: input.home,
    PATH: path,
    PWD: input.workspace,
    npm_config_cache: input.cache,
    npm_config_prefix: input.prefix,
    npm_config_userconfig: input.userConfig,
    npm_config_audit: "false",
    npm_config_bin_links: "true",
    npm_config_fund: "false",
    npm_config_ignore_scripts: "false",
    npm_config_update_notifier: "false",
  };
}

/**
 * @param {{executable: string, args: readonly string[]}} invocation
 * @param {{cwd: string, env: NodeJS.ProcessEnv, timeout?: number}} options
 */
function execute(invocation, options) {
  return spawnSync(invocation.executable, [...invocation.args], {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeout ?? 300_000,
  });
}

/** @param {ReturnType<typeof spawnSync>} result */
function processDetail(result) {
  if (result.error !== undefined) return result.error.message;
  return String(result.stderr || result.stdout || `exit ${String(result.status)}`).trim();
}

/**
 * @param {{cwd: string, env: NodeJS.ProcessEnv}} options
 */
function probeNpm(options) {
  let invocation;
  try {
    invocation = resolveNpmInvocation();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PackedInstallPrerequisiteError(
      "npm",
      `npm is unavailable: ${reason}`,
      "run verification through `npm run package:verify-install` with npm installed for a supported Node.js runtime",
    );
  }
  const version = execute(
    { executable: invocation.executable, args: [...invocation.argumentPrefix, "--version"] },
    options,
  );
  if (version.status !== 0 || version.error !== undefined) {
    throw new PackedInstallPrerequisiteError(
      "npm",
      `npm could not start: ${processDetail(version)}`,
      "install npm for the supported Node.js runtime, then rerun packed-install verification",
    );
  }
  return {
    invocation,
    version: String(version.stdout).trim(),
  };
}

/**
 * @typedef Snapshot
 * @property {"symlink" | "directory" | "file"} kind
 * @property {string=} target
 * @property {Record<string, Snapshot>=} entries
 * @property {string=} content
 */

/** @param {string} path @returns {Snapshot} */
function snapshotPath(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return { kind: "symlink", target: readlinkSync(path) };
  if (stat.isDirectory()) {
    return {
      kind: "directory",
      entries: Object.fromEntries(
        readdirSync(path)
          .sort()
          .map((name) => [name, snapshotPath(join(path, name))]),
      ),
    };
  }
  return { kind: "file", content: readFileSync(path).toString("base64") };
}

/**
 * Create representative content at every currently supported coding-agent personal and workspace
 * configuration surface. The verifier never invokes setup and treats the resulting snapshots as immutable.
 *
 * @param {string} home
 * @param {string} workspace
 */
function createConfigurationFixtures(home, workspace) {
  /** @type {Array<[string, string]>} */
  const files = [
    [join(home, ".agents", "config.toml"), 'model = "preserve-codex-personal"\n'],
    [join(home, ".claude", "settings.json"), '{"fixture":"preserve-claude-personal"}\n'],
    [join(workspace, ".agents", "config.json"), '{"fixture":"preserve-codex-scope"}\n'],
    [join(workspace, ".claude", "settings.json"), '{"fixture":"preserve-claude-scope"}\n'],
    [join(workspace, "AGENTS.md"), "# preserve-codex-workspace\n"],
    [join(workspace, "CLAUDE.md"), "# preserve-claude-workspace\n"],
  ];
  for (const [path, content] of files) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return [
    join(home, ".agents"),
    join(home, ".claude"),
    join(workspace, ".agents"),
    join(workspace, ".claude"),
    join(workspace, "AGENTS.md"),
    join(workspace, "CLAUDE.md"),
  ];
}

/** @param {string} name */
function assertSafeCommandName(name) {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error(`declared executable name is not safe for an npm-generated shim path: ${name}`);
  }
}

/**
 * Install and exercise the exact archive identified by one accepted Story 1.2 report. The command writes only
 * beneath its local consumer evidence directory and has no publication, release, credential, or remote-write
 * capability.
 *
 * @param {readonly string[]} args
 * @param {OutputSink} stdout
 * @param {OutputSink} stderr
 * @returns {0 | 1 | 2}
 */
export function runPackedInstallVerification(args, stdout, stderr) {
  try {
    const options = parseArguments(args);
    const reportPath = resolve(options.reportPath);
    let report;
    try {
      report = JSON.parse(
        readRequiredFile(
          reportPath,
          "package inspection report is unavailable; run `npm run package:inspect -- --revision HEAD` and save its accepted JSON report",
        ).toString("utf8"),
      );
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`package inspection report is not valid JSON: ${error.message}`);
      }
      throw error;
    }

    if (
      typeof report !== "object" ||
      report === null ||
      Array.isArray(report) ||
      typeof (/** @type {{artifact?: {path?: unknown}}} */ (report).artifact?.path) !== "string"
    ) {
      throw new TypeError("package inspection report does not contain artifact.path");
    }
    const inspectedPath = resolve(
      dirname(reportPath),
      /** @type {{artifact: {path: string}}} */ (report).artifact.path,
    );
    const archiveBytes = readRequiredFile(
      inspectedPath,
      "inspected package artifact is unavailable; rerun `npm run package:inspect -- --revision HEAD` and use its accepted report",
    );
    const archive = inspectPackageArchiveBytes(archiveBytes);
    const evidence = validateInspectedPackageReport(report, archive);
    assertNodePrerequisite(archive.packedManifest, process.versions.node);

    const root =
      options.outputDirectory === undefined
        ? mkdtempSync(join(tmpdir(), "wpm-packed-install-"))
        : resolve(options.outputDirectory);
    if (options.outputDirectory !== undefined && existsSync(root)) {
      throw new Error(`consumer evidence directory already exists: ${root}`);
    }
    if (isPathWithin(SOURCE_ROOT, root)) {
      throw new PackedInstallPrerequisiteError(
        "source-free consumer directory",
        `consumer evidence directory is inside the verifier source checkout: ${root}`,
        "choose a fresh --output directory outside the source checkout, then rerun packed-install verification",
      );
    }
    const home = join(root, "home");
    const workspace = join(root, "workspace");
    const cache = join(root, "npm-cache");
    const prefix = join(root, "prefix");
    const input = join(root, "input");
    const userConfig = join(root, "npmrc");
    for (const directory of [home, workspace, cache, prefix, input]) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(userConfig, "");
    const frozenPath = join(input, basename(inspectedPath));
    writeFileSync(frozenPath, archiveBytes);

    const configurationPaths = createConfigurationFixtures(home, workspace);
    const beforeConfiguration = new Map(
      configurationPaths.map((path) => [path, JSON.stringify(snapshotPath(path))]),
    );
    const realRoot = realpathSync(root);
    const env = createIsolatedEnvironment({
      home,
      workspace,
      cache,
      prefix,
      userConfig,
      sourceRoot: SOURCE_ROOT,
    });
    const npm = probeNpm({ cwd: workspace, env });
    const prerequisites = assertInstallPrerequisites(
      archive.packedManifest,
      process.versions.node,
      npm.version,
    );

    const install = execute(
      {
        executable: npm.invocation.executable,
        args: [
          ...npm.invocation.argumentPrefix,
          "install",
          "--global",
          "--prefix",
          prefix,
          "--no-audit",
          "--no-fund",
          frozenPath,
        ],
      },
      { cwd: workspace, env },
    );
    if (install.status !== 0 || install.error !== undefined) {
      throw new PackedInstallPrerequisiteError(
        "npm package installation",
        `npm could not install the exact inspected archive: ${processDetail(install)}`,
        "restore the reported npm, dependency-registry, or filesystem prerequisite, then reinstall the same accepted archive in a fresh prefix",
      );
    }

    const layout = resolveGlobalInstallLayout(prefix, evidence.package.name);
    if (!existsSync(layout.packageRoot)) {
      throw new PackedInstallPrerequisiteError(
        "npm package installation",
        `npm reported success but did not create the installed package root: ${layout.packageRoot}`,
        "remove the fresh prefix and reinstall the exact accepted archive after verifying npm's global-prefix support",
      );
    }
    const installedPackageRoot = realpathSync(layout.packageRoot);
    if (
      !isPathWithin(realRoot, installedPackageRoot) ||
      isPathWithin(SOURCE_ROOT, installedPackageRoot)
    ) {
      throw new Error(
        `installed package root escaped the source-free consumer boundary: ${installedPackageRoot}; reinstall the exact accepted archive in a fresh prefix outside the source checkout`,
      );
    }
    const observedPaths = [];
    const escapedPaths = [];
    for (const path of evidence.expectedPaths) {
      const installedPath = join(installedPackageRoot, ...path.split("/"));
      if (!existsSync(installedPath)) continue;
      const resolvedPath = realpathSync(installedPath);
      if (isPathWithin(installedPackageRoot, resolvedPath)) observedPaths.push(path);
      else escapedPaths.push(path);
    }
    if (escapedPaths.length > 0) {
      throw new Error(
        `installed declared resources escape the package root: ${escapedPaths.join(", ")}; reinstall the exact accepted archive in a fresh prefix and inspect its links`,
      );
    }
    const resources = evaluateInstalledPaths(evidence.expectedPaths, observedPaths);
    if (resources.status !== "accepted") {
      throw new Error(
        `installed package is missing declared resources: ${resources.missingPaths.join(", ")}; reinstall the exact accepted archive in a fresh prefix`,
      );
    }

    const executables = [];
    for (const [name, target] of Object.entries(evidence.package.executableTargets)) {
      assertSafeCommandName(name);
      const invocation = resolveInstalledExecutableInvocation(
        process.platform,
        join(layout.executableRoot, name),
        ["--version"],
      );
      if (!existsSync(invocation.shimPath)) {
        assertInstalledExecutableObservation({
          name,
          shimPath: invocation.shimPath,
          shimPresent: false,
          expectedVersion: evidence.package.version,
        });
      }
      const version = execute(invocation, { cwd: workspace, env, timeout: 60_000 });
      const observedVersion = assertInstalledExecutableObservation({
        name,
        shimPath: invocation.shimPath,
        shimPresent: true,
        exitStatus: version.status,
        failureDetail: processDetail(version),
        stdout: String(version.stdout),
        expectedVersion: evidence.package.version,
      });
      executables.push({
        name,
        target,
        shimPath: invocation.shimPath,
        version: observedVersion,
      });
    }

    const probeCommand = executables[0];
    if (probeCommand === undefined) {
      throw new Error("installed WPM package declares no executable for the resource probe");
    }
    const probeInvocation = resolveInstalledExecutableInvocation(
      process.platform,
      join(layout.executableRoot, probeCommand.name),
      ["template", "show", "minimal", "--scope", "project"],
    );
    const probe = execute(probeInvocation, { cwd: workspace, env, timeout: 60_000 });
    if (probe.status !== 0 || probe.error !== undefined) {
      throw new Error(
        `installed built-in template resource probe failed: ${processDetail(probe)}; reinstall the exact accepted archive and verify its declared resource paths`,
      );
    }

    const configurationSurfaces = configurationPaths.map((path) => ({
      path,
      unchanged: beforeConfiguration.get(path) === JSON.stringify(snapshotPath(path)),
    }));
    if (configurationSurfaces.some(({ unchanged }) => !unchanged)) {
      const changed = configurationSurfaces
        .filter(({ unchanged }) => !unchanged)
        .map(({ path }) => path)
        .join(", ");
      throw new Error(`package installation changed coding-agent configuration: ${changed}`);
    }

    stdout.write(
      `${JSON.stringify(
        {
          status: "accepted",
          sourceRevision: evidence.sourceRevision,
          sourceBinding: {
            requestedRevision: evidence.requestedRevision,
            checkoutRevision: evidence.sourceRevision,
            clean: true,
          },
          package: evidence.package,
          artifact: {
            inspectedPath,
            frozenPath,
            size: archive.archiveSize,
          },
          environment: {
            root,
            home,
            workspace,
            prefix,
            npmCache: cache,
            packageRoot: installedPackageRoot,
          },
          prerequisites,
          installation: { status: "installed", npmVersion: npm.version },
          executables,
          resources: {
            ...resources,
            probe: {
              status: "accepted",
              command: `${probeCommand.name} template show minimal --scope project`,
              output: String(probe.stdout).trim(),
            },
          },
          configuration: { status: "unchanged", surfaces: configurationSurfaces },
        },
        undefined,
        2,
      )}\n`,
    );
    return 0;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof UsageError) {
      stderr.write(`${reason}\n`);
      return 2;
    }
    if (error instanceof PackedInstallPrerequisiteError) {
      stderr.write(
        `packed-install prerequisite ${error.prerequisite}: ${reason}; recovery: ${error.recovery}\n`,
      );
      return 1;
    }
    stderr.write(`could not verify packed installation: ${reason}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  process.exitCode = runPackedInstallVerification(
    process.argv.slice(2),
    process.stdout,
    process.stderr,
  );
}
