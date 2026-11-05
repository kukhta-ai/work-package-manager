#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import semver from "semver";
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
const COLD_PACKAGE_INSTALL_TIMEOUT_MS = 600_000;

/**
 * @typedef OutputSink
 * @property {(chunk: string) => unknown} write
 */

class UsageError extends Error {}

/**
 * @param {readonly string[]} args
 * @returns {{reportPath: string, outputDirectory: string | undefined, npmCacheArchives: string[], peerArchives: string[]}}
 */
function parseArguments(args) {
  let reportPath;
  let outputDirectory;
  /** @type {string[]} */
  const npmCacheArchives = [];
  /** @type {string[]} */
  const peerArchives = [];
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
    } else if (option === "--npm-cache-archive" && value !== undefined && value !== "") {
      npmCacheArchives.push(resolve(value));
      index += 1;
    } else if (option === "--peer-archive" && value !== undefined && value !== "") {
      peerArchives.push(resolve(value));
      index += 1;
    } else {
      throw new UsageError(
        "usage: node distribution-preparation/verify-packed-install.js --report <accepted-report.json> [--output <consumer-directory>] [--npm-cache-archive <locked-upstream.tgz>]... [--peer-archive <locked-peer.tgz>]...",
      );
    }
  }
  if (reportPath === undefined) {
    throw new UsageError(
      "usage: node distribution-preparation/verify-packed-install.js --report <accepted-report.json> [--output <consumer-directory>] [--npm-cache-archive <locked-upstream.tgz>]... [--peer-archive <locked-peer.tgz>]...",
    );
  }
  return { reportPath, outputDirectory, npmCacheArchives, peerArchives };
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Validate captured upstream bytes before decompressing or creating consumer state.
 * @param {Buffer} bytes @param {unknown} lock
 */
export function validateNpmCacheArchive(bytes, lock) {
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  if (!record(lock) || !record(lock.packages))
    throw new Error("npm cache bootstrap requires the current source package-lock.json");
  const matches = Object.entries(lock.packages).filter(([path, entry]) => {
    if (
      !path.includes("node_modules/") ||
      !record(entry) ||
      entry.integrity !== integrity ||
      typeof entry.version !== "string" ||
      typeof entry.resolved !== "string"
    )
      return false;
    try {
      const url = new URL(entry.resolved);
      return (
        url.origin === "https://registry.npmjs.org" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  });
  if (!matches.length)
    throw new Error(
      "npm cache archive SHA512 does not match an exact registry entry in the current root lockfile",
    );
  const { packedManifest } = inspectPackageArchiveBytes(bytes);
  for (const [lockPath, entry] of matches) {
    if (!record(entry)) continue;
    const name =
      entry.name ?? lockPath.slice(lockPath.lastIndexOf("node_modules/") + "node_modules/".length);
    if (
      typeof name === "string" &&
      /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name) &&
      typeof entry.version === "string" &&
      packedManifest.name === name &&
      packedManifest.version === entry.version &&
      typeof entry.resolved === "string"
    )
      return {
        name,
        version: entry.version,
        lockPath,
        resolved: entry.resolved,
        integrity,
        size: bytes.length,
      };
  }
  throw new Error("npm cache archive package identity differs from its exact root lockfile entry");
}

/** The explicit qualification environment may select only compatible declared peers.
 * @param {ReadonlyArray<ReturnType<typeof validateNpmCacheArchive>>} peers
 * @param {Record<string, unknown>} manifest
 */
export function validateQualificationPeers(peers, manifest) {
  const names = new Set();
  for (const peer of peers) {
    const range = record(manifest.peerDependencies)
      ? manifest.peerDependencies[peer.name]
      : undefined;
    if (
      names.has(peer.name) ||
      typeof range !== "string" ||
      !semver.validRange(range) ||
      !semver.valid(peer.version) ||
      !semver.satisfies(peer.version, range)
    )
      throw new Error(
        `explicit peer archive is undeclared, duplicated or incompatible: ${peer.name}`,
      );
    names.add(peer.name);
  }
}

/** Capture an ordinary file once; later bootstrap uses only the verified captured bytes.
 * @param {string} path
 */
export function captureOrdinaryArchive(path) {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1)
    throw new Error("npm cache archive must be an ordinary single-link file");
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(descriptor);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const current = lstatSync(path);
    if (
      !opened.isFile() ||
      !current.isFile() ||
      current.isSymbolicLink() ||
      [opened, after, current].some(
        (stat) =>
          stat.nlink !== 1 ||
          stat.ino !== before.ino ||
          stat.dev !== before.dev ||
          stat.size !== before.size ||
          stat.mtimeMs !== before.mtimeMs ||
          stat.ctimeMs !== before.ctimeMs,
      )
    )
      throw new Error("npm cache archive changed while capturing its bytes");
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

/** @param {string} path @param {string} recovery */
function readRequiredFile(path, recovery) {
  try {
    return readFileSync(path);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${recovery}: ${path} (${reason})`, { cause: error });
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
 * npm-run context, Node injection/search variables, and ambient supported-client config/session variables,
 * and remove source-checkout entries from PATH so an installed executable cannot silently load repository
 * code or inherit a prior coding-agent conversation.
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
      const codingClientContext =
        normalized.startsWith("codex_") ||
        normalized.startsWith("claude_") ||
        normalized === "claudecode";
      return (
        !excluded.has(normalized) &&
        !credentialLike &&
        !codingClientContext &&
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
 * @param {{executable: string, args: readonly string[], windowsVerbatimArguments?: boolean}} invocation
 * @param {{cwd: string, env: NodeJS.ProcessEnv, timeout?: number}} options
 */
function execute(invocation, options) {
  return spawnSync(invocation.executable, [...invocation.args], {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeout ?? 300_000,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
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
 * @property {number} mode
 * @property {string=} target
 * @property {Record<string, Snapshot>=} entries
 * @property {string=} content
 */

/** @param {string} path @returns {Snapshot} */
function snapshotPath(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    return { kind: "symlink", mode: stat.mode, target: readlinkSync(path) };
  }
  if (stat.isDirectory()) {
    return {
      kind: "directory",
      mode: stat.mode,
      entries: Object.fromEntries(
        readdirSync(path)
          .sort()
          .map((name) => [name, snapshotPath(join(path, name))]),
      ),
    };
  }
  return { kind: "file", mode: stat.mode, content: readFileSync(path).toString("base64") };
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
 * @param {string} lockRoot
 * @returns {0 | 1 | 2}
 */
export function runPackedInstallVerification(args, stdout, stderr, lockRoot = SOURCE_ROOT) {
  try {
    const options = parseArguments(args);
    const lockBytes =
      options.npmCacheArchives.length || options.peerArchives.length
        ? readRequiredFile(
            join(lockRoot, "package-lock.json"),
            "cache bootstrap lockfile is unavailable",
          )
        : undefined;
    const lock = lockBytes
      ? /** @type {unknown} */ (JSON.parse(lockBytes.toString("utf8")))
      : undefined;
    const cacheArchives = options.npmCacheArchives.map((path) => {
      const bytes = captureOrdinaryArchive(path);
      return { bytes, evidence: validateNpmCacheArchive(bytes, lock) };
    });
    const peerArchives = options.peerArchives.map((path) => {
      const bytes = captureOrdinaryArchive(path);
      return { bytes, evidence: validateNpmCacheArchive(bytes, lock) };
    });
    if (
      new Set(cacheArchives.map(({ evidence }) => evidence.integrity)).size !== cacheArchives.length
    )
      throw new Error("duplicate npm cache archive bytes were supplied");
    const reportPath = resolve(options.reportPath);
    /** @type {unknown} */
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
        throw new Error(`package inspection report is not valid JSON: ${error.message}`, {
          cause: error,
        });
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
    validateQualificationPeers(
      peerArchives.map(({ evidence: peer }) => peer),
      archive.packedManifest,
    );

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
    const configurationRoots = [home, workspace];
    const beforeConfigurationRoots = new Map(
      configurationRoots.map((path) => [path, JSON.stringify(snapshotPath(path))]),
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

    if (cacheArchives.length) {
      const bootstrap = join(input, "npm-cache-bootstrap");
      mkdirSync(bootstrap);
      for (const [index, captured] of cacheArchives.entries()) {
        const staged = join(bootstrap, `${index}.tgz`);
        writeFileSync(staged, captured.bytes, { flag: "wx" });
        const seeded = execute(
          {
            executable: npm.invocation.executable,
            args: [
              ...npm.invocation.argumentPrefix,
              "cache",
              "add",
              staged,
              "--offline",
              "--ignore-scripts",
            ],
          },
          { cwd: workspace, env, timeout: 60_000 },
        );
        if (seeded.status !== 0 || seeded.error)
          throw new Error(
            `could not seed verified upstream archive into isolated npm cache: ${processDetail(seeded)}`,
          );
      }
    }

    const stagedPeers = peerArchives.map((captured, index) => {
      const path = join(input, `peer-${index}.tgz`);
      writeFileSync(path, captured.bytes, { flag: "wx" });
      return path;
    });

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
          ...stagedPeers,
        ],
      },
      { cwd: workspace, env, timeout: COLD_PACKAGE_INSTALL_TIMEOUT_MS },
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
    const observedPeers = peerArchives.map(({ evidence: peer }) => {
      const peerRoot = realpathSync(resolveGlobalInstallLayout(prefix, peer.name).packageRoot);
      if (!isPathWithin(realRoot, peerRoot) || isPathWithin(SOURCE_ROOT, peerRoot))
        throw new Error(
          `installed explicit qualification peer escaped consumer boundary: ${peer.name}`,
        );
      const observed = /** @type {unknown} */ (
        JSON.parse(readFileSync(join(peerRoot, "package.json"), "utf8"))
      );
      if (!record(observed) || observed.name !== peer.name || observed.version !== peer.version)
        throw new Error(
          `installed explicit qualification peer differs from pinned archive: ${peer.name}`,
        );
      return { ...peer, packageRoot: peerRoot, observedVersion: observed.version };
    });
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
    const configurationRootSurfaces = configurationRoots.map((path) => ({
      path,
      unchanged: beforeConfigurationRoots.get(path) === JSON.stringify(snapshotPath(path)),
    }));
    if (configurationRootSurfaces.some(({ unchanged }) => !unchanged)) {
      const changed = configurationRootSurfaces
        .filter(({ unchanged }) => !unchanged)
        .map(({ path }) => path)
        .join(", ");
      throw new Error(`package installation changed a coding-agent configuration root: ${changed}`);
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
          installation: {
            status: "installed",
            npmVersion: npm.version,
            ...(lockBytes && cacheArchives.length
              ? {
                  cacheBootstrap: {
                    lockfileDigest: `sha256:${createHash("sha256").update(lockBytes).digest("hex")}`,
                    archives: cacheArchives.map(({ evidence }) => evidence),
                  },
                }
              : {}),
            ...(lockBytes && observedPeers.length
              ? {
                  explicitPeers: {
                    lockfileDigest: `sha256:${createHash("sha256").update(lockBytes).digest("hex")}`,
                    packages: observedPeers,
                  },
                }
              : {}),
          },
          executables,
          resources: {
            ...resources,
            probe: {
              status: "accepted",
              command: `${probeCommand.name} template show minimal --scope project`,
              output: String(probe.stdout).trim(),
            },
          },
          configuration: {
            status: "unchanged",
            surfaces: configurationSurfaces,
            roots: configurationRootSurfaces,
          },
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
