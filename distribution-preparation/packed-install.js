import { posix, win32 } from "node:path";
import semver from "semver";
import { evaluatePackageBoundary, normalizePackagePath } from "./package-boundary.js";

/** @typedef {Record<string, unknown>} JsonRecord */

/**
 * A prerequisite failure whose machine-readable fields let the driving command name both the missing or
 * unsupported requirement and one concrete way to recover.
 */
export class PackedInstallPrerequisiteError extends Error {
  /**
   * @param {string} prerequisite
   * @param {string} message
   * @param {string} recovery
   */
  constructor(prerequisite, message, recovery) {
    super(message);
    this.name = "PackedInstallPrerequisiteError";
    this.prerequisite = prerequisite;
    this.recovery = recovery;
  }
}

/** @param {unknown} value @returns {value is JsonRecord} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {string} left @param {string} right */
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string[]}
 */
function requirePathArray(value, field) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new TypeError(`${field} must be an array of package-relative path strings`);
  }
  const paths = /** @type {string[]} */ (value);
  for (const path of paths) {
    if (normalizePackagePath(path) !== path) {
      throw new TypeError(`${field} contains an invalid package-relative path: ${path}`);
    }
  }
  if (new Set(paths).size !== paths.length) {
    throw new TypeError(`${field} must not contain duplicate paths`);
  }
  return [...paths].sort(compareText);
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {Record<string, string>}
 */
function requireStringRecord(value, field) {
  if (!isRecord(value) || Object.values(value).some((entry) => typeof entry !== "string")) {
    throw new TypeError(`${field} must be a string-to-string object`);
  }
  return Object.fromEntries(
    Object.entries(/** @type {Record<string, string>} */ (value)).sort(([left], [right]) =>
      compareText(left, right),
    ),
  );
}

/** @param {unknown} value @param {string} field */
function requireText(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value;
}

/**
 * @typedef ArchiveInspection
 * @property {number} archiveSize
 * @property {readonly import("./package-boundary.js").PackageEntry[]} entries
 * @property {JsonRecord} packedManifest
 */

/**
 * Validate an accepted Story 1.2 report against a fresh inspection of the exact bytes that will be frozen for
 * installation. Required paths remain data: adding a later asset to the report makes it mandatory here without
 * adding an artifact-type rule.
 *
 * @param {unknown} input
 * @param {ArchiveInspection} archive
 */
export function validateInspectedPackageReport(input, archive) {
  if (!isRecord(input)) throw new TypeError("package inspection report must be a JSON object");
  if (input.status !== "accepted") {
    throw new Error("packed installation requires an accepted package inspection report");
  }
  if (!Array.isArray(input.violations) || input.violations.length !== 0) {
    throw new Error("accepted package inspection report must contain no violations");
  }

  const sourceRevision = requireText(input.sourceRevision, "sourceRevision");
  if (!isRecord(input.sourceBinding)) {
    throw new TypeError("sourceBinding must be a JSON object");
  }
  const requestedRevision = requireText(
    input.sourceBinding.requestedRevision,
    "sourceBinding.requestedRevision",
  );
  const checkoutRevision = requireText(
    input.sourceBinding.checkoutRevision,
    "sourceBinding.checkoutRevision",
  );
  if (input.sourceBinding.clean !== true || checkoutRevision !== sourceRevision) {
    throw new Error(
      `package inspection source revision is not cleanly bound: report ${sourceRevision}, checkout ${checkoutRevision}`,
    );
  }

  if (!isRecord(input.artifact)) throw new TypeError("artifact must be a JSON object");
  const artifactPath = requireText(input.artifact.path, "artifact.path");
  if (
    typeof input.artifact.size !== "number" ||
    !Number.isSafeInteger(input.artifact.size) ||
    input.artifact.size <= 0
  ) {
    throw new TypeError("artifact.size must be a positive safe integer");
  }
  if (input.artifact.size !== archive.archiveSize) {
    throw new Error(
      `inspected artifact size ${String(input.artifact.size)} does not match current archive size ${String(archive.archiveSize)}`,
    );
  }

  const expectedPaths = requirePathArray(input.expectedPaths, "expectedPaths");
  const reportedActualPaths = requirePathArray(input.actualPaths, "actualPaths");
  const current = evaluatePackageBoundary({
    sourceRevision,
    expectedPaths,
    actualEntries: archive.entries,
    sourceManifest: archive.packedManifest,
    packedManifest: archive.packedManifest,
  });
  if (current.status !== "accepted") {
    const findings = current.violations.map(({ kind, path }) => `${kind}: ${path}`).join(", ");
    throw new Error(`current archive no longer satisfies the accepted report: ${findings}`);
  }
  if (JSON.stringify(current.actualPaths) !== JSON.stringify(reportedActualPaths)) {
    throw new Error("current archive paths do not match the accepted report actualPaths");
  }

  if (!isRecord(input.package)) throw new TypeError("package must be a JSON object");
  const packageName = requireText(input.package.name, "package.name");
  const packageVersion = requireText(input.package.version, "package.version");
  const executableTargets = requireStringRecord(
    input.package.executableTargets,
    "package.executableTargets",
  );
  if (
    current.package.name !== packageName ||
    current.package.version !== packageVersion ||
    JSON.stringify(current.package.executableTargets) !== JSON.stringify(executableTargets)
  ) {
    throw new Error(
      "current archive package identity, version, or executables differ from the report",
    );
  }

  return {
    sourceRevision,
    requestedRevision,
    package: { name: packageName, version: packageVersion, executableTargets },
    artifact: { path: artifactPath, size: input.artifact.size },
    expectedPaths,
  };
}

/**
 * Compare the generic revision-required path set with package-relative paths observed under the installed
 * package root. Extra dependency paths are irrelevant; every declared path must resolve.
 *
 * @param {readonly string[]} expectedPaths
 * @param {readonly string[]} installedPaths
 */
export function evaluateInstalledPaths(expectedPaths, installedPaths) {
  const expected = requirePathArray(expectedPaths, "expectedPaths");
  const installed = new Set(requirePathArray(installedPaths, "installedPaths"));
  const resolvedPaths = expected.filter((path) => installed.has(path));
  const missingPaths = expected.filter((path) => !installed.has(path));
  return {
    status: missingPaths.length === 0 ? "accepted" : "rejected",
    resolvedPaths,
    missingPaths,
  };
}

/**
 * Validate runtime/tool prerequisites more strictly than npm's default advisory `engines` warning.
 *
 * @param {unknown} packedManifest
 * @param {string} nodeVersion
 * @param {string | undefined} npmVersion
 */
export function assertInstallPrerequisites(packedManifest, nodeVersion, npmVersion) {
  const node = assertNodePrerequisite(packedManifest, nodeVersion);
  if (!isRecord(packedManifest)) throw new TypeError("packed package manifest must be an object");
  const engines = packedManifest.engines;
  if (engines !== undefined && !isRecord(engines)) {
    throw new TypeError("package engines must be an object");
  }
  const npmRange = typeof engines?.npm === "string" ? engines.npm : undefined;
  if (npmVersion === undefined || semver.valid(npmVersion) === null) {
    throw new PackedInstallPrerequisiteError(
      "npm",
      "npm is required to install the inspected local package",
      "install npm for the supported Node.js runtime, then rerun packed-install verification",
    );
  }
  if (npmRange !== undefined) {
    if (semver.validRange(npmRange) === null) {
      throw new TypeError(`package engines.npm is not a valid range: ${npmRange}`);
    }
    if (!semver.satisfies(npmVersion, npmRange)) {
      throw new PackedInstallPrerequisiteError(
        "npm",
        `npm ${npmVersion} does not satisfy the package requirement ${npmRange}`,
        `install or select an npm release matching ${npmRange}, then rerun packed-install verification`,
      );
    }
  }
  return {
    node,
    npm: { observed: npmVersion, required: npmRange ?? null },
  };
}

/**
 * Validate Node independently so the verifier can reject an unsupported runtime before attempting to spawn
 * npm, which may itself fail under that runtime and obscure the actual prerequisite.
 *
 * @param {unknown} packedManifest
 * @param {string} nodeVersion
 */
export function assertNodePrerequisite(packedManifest, nodeVersion) {
  if (!isRecord(packedManifest)) throw new TypeError("packed package manifest must be an object");
  const engines = packedManifest.engines;
  if (engines !== undefined && !isRecord(engines)) {
    throw new TypeError("package engines must be an object");
  }
  const nodeRange = typeof engines?.node === "string" ? engines.node : "*";
  if (semver.validRange(nodeRange) === null) {
    throw new TypeError(`package engines.node is not a valid range: ${nodeRange}`);
  }
  if (semver.valid(nodeVersion) === null || !semver.satisfies(nodeVersion, nodeRange)) {
    throw new PackedInstallPrerequisiteError(
      "Node.js",
      `Node.js ${nodeVersion} does not satisfy the package requirement ${nodeRange}`,
      `install or select a Node.js release matching ${nodeRange}, then rerun packed-install verification`,
    );
  }
  return { observed: nodeVersion, required: nodeRange };
}

/**
 * Turn one platform adapter's observation of an installed executable into the stable prerequisite/version
 * contract reported by the packed-install journey.
 *
 * @param {{
 *   name: string,
 *   shimPath: string,
 *   shimPresent: boolean,
 *   exitStatus?: number | null,
 *   failureDetail?: string,
 *   stdout?: string,
 *   expectedVersion: string,
 * }} input
 */
export function assertInstalledExecutableObservation(input) {
  if (!input.shimPresent) {
    throw new PackedInstallPrerequisiteError(
      `npm-generated executable ${input.name}`,
      `npm-generated executable shim is missing: ${input.shimPath}`,
      `reinstall the exact accepted archive so npm can create the ${input.name} shim, then rerun verification`,
    );
  }
  if (input.exitStatus !== 0) {
    throw new PackedInstallPrerequisiteError(
      `installed executable ${input.name}`,
      `${input.name} could not start: ${input.failureDetail ?? "unknown process failure"}`,
      `restore the prerequisite named by ${input.name}, then rerun ${input.name} --version from the fresh prefix`,
    );
  }
  const observedVersion = (input.stdout ?? "").trim();
  if (observedVersion !== input.expectedVersion) {
    throw new PackedInstallPrerequisiteError(
      `installed executable ${input.name} version`,
      `${input.name} reported version ${observedVersion}, expected installed version ${input.expectedVersion}`,
      `reinstall the exact accepted archive so ${input.name} resolves to version ${input.expectedVersion}, then rerun ${input.name} --version from the fresh prefix`,
    );
  }
  return observedVersion;
}

/**
 * @param {string} prefix
 * @param {string} packageName
 * @param {NodeJS.Platform=} platform
 */
export function resolveGlobalInstallLayout(prefix, packageName, platform = process.platform) {
  if (
    packageName.length === 0 ||
    packageName.includes("\\") ||
    packageName.split("/").includes("..")
  ) {
    throw new TypeError(`invalid package name for global install layout: ${packageName}`);
  }
  const path = platform === "win32" ? win32 : posix;
  const packageSegments = packageName.split("/");
  return {
    packageRoot:
      platform === "win32"
        ? path.join(prefix, "node_modules", ...packageSegments)
        : path.join(prefix, "lib", "node_modules", ...packageSegments),
    executableRoot: platform === "win32" ? prefix : path.join(prefix, "bin"),
  };
}

/** @param {string} value */
function windowsCommandArgument(value) {
  if (/["%\r\n]/.test(value)) {
    throw new TypeError("Windows executable argument contains cmd.exe expansion or quoting syntax");
  }
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value;
  return `"${value}"`;
}

/**
 * Resolve an invocation of one actual npm-generated global executable shim.
 *
 * @param {NodeJS.Platform} platform
 * @param {string} shimBasePath
 * @param {readonly string[]} args
 * @param {string=} commandProcessor
 */
export function resolveInstalledExecutableInvocation(
  platform,
  shimBasePath,
  args,
  commandProcessor = process.env.ComSpec ?? "cmd.exe",
) {
  if (platform !== "win32") {
    return { executable: shimBasePath, args: [...args], shimPath: shimBasePath };
  }
  if (/["%\r\n]/.test(shimBasePath)) {
    throw new PackedInstallPrerequisiteError(
      "Windows executable shim path",
      "Windows executable shim path contains cmd.exe expansion or quoting syntax",
      "choose a fresh verification output path without `%`, quotes, or line breaks, then rerun packed-install verification",
    );
  }
  const shimPath = shimBasePath.endsWith(".cmd") ? shimBasePath : `${shimBasePath}.cmd`;
  const command = [`"${shimPath}"`, ...args.map(windowsCommandArgument)].join(" ");
  return {
    executable: commandProcessor,
    args: ["/d", "/s", "/v:off", "/c", command],
    shimPath,
  };
}
