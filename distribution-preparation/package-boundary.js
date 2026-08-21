import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

/** @typedef {Record<string, unknown>} PackageManifest */

/**
 * @typedef PackageEntry
 * @property {string} path
 * @property {"file" | "symlink" | "hardlink"} type
 * @property {string=} linkTarget
 */

/**
 * @typedef PackageBoundaryViolation
 * @property {string} kind
 * @property {string} path
 * @property {string} detail
 */

/**
 * @typedef PackageBoundaryInput
 * @property {string} sourceRevision
 * @property {readonly string[]} expectedPaths
 * @property {readonly PackageEntry[]} actualEntries
 * @property {PackageManifest} sourceManifest
 * @property {PackageManifest} packedManifest
 * @property {readonly PackageBoundaryViolation[]=} declarationViolations
 */

const VIOLATION_ORDER = Object.freeze([
  "invalid-declared-path",
  "duplicate-declared-path",
  "invalid-packed-path",
  "duplicate-packed-path",
  "prohibited-development",
  "prohibited-backlog",
  "prohibited-planning",
  "prohibited-workspace-authoring",
  "prohibited-credential",
  "prohibited-preparation",
  "escaping-link",
  "unresolvable-link",
  "missing-required-path",
  "unexpected-path",
  "metadata-mismatch",
  "invalid-bin-target",
  "missing-bin-target",
]);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {string} left @param {string} right */
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Normalize a package-relative path without allowing it to acquire authority outside the archive root.
 *
 * @param {string} input
 * @returns {string | undefined}
 */
export function normalizePackagePath(input) {
  if (input.length === 0 || input.includes("\0")) return undefined;
  const portable = input.replaceAll("\\", "/");
  if (
    posix.isAbsolute(portable) ||
    /^[A-Za-z]:/.test(portable) ||
    portable.split("/").includes("..")
  ) {
    return undefined;
  }
  const normalized = posix.normalize(portable).replace(/^\.\//, "");
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    return undefined;
  }
  return normalized;
}

/**
 * @typedef DeclaredShipSet
 * @property {PackageManifest} manifest
 * @property {string[]} expectedPaths
 * @property {PackageBoundaryViolation[]} declarationViolations
 */

const PACKAGE_GLOB_CHARACTERS = /[*?[{]/;

/**
 * Add every leaf beneath one literal package path. Symbolic links are leaves: following them here could make
 * ambient files part of the declared source set, while the packed-boundary evaluator validates their target.
 *
 * @param {string} sourceRoot
 * @param {string} packagePath
 * @param {Set<string>} paths
 */
function addLeafPaths(sourceRoot, packagePath, paths) {
  const filesystemPath = join(sourceRoot, ...packagePath.split("/"));
  const stat = lstatSync(filesystemPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    paths.add(packagePath);
    return;
  }

  for (const name of readdirSync(filesystemPath).sort()) {
    addLeafPaths(sourceRoot, posix.join(packagePath, name), paths);
  }
}

/**
 * Expand the package declaration for one built source tree into its exact, normalized leaf set. The collector
 * deliberately understands only npm's generic declaration seams (literal `files` roots and mandatory root
 * metadata); it does not encode WPM-specific skill, template, documentation, or future asset categories.
 *
 * @param {string} sourceRoot
 * @returns {DeclaredShipSet}
 */
export function collectDeclaredShipSet(sourceRoot) {
  const manifestPath = join(sourceRoot, "package.json");
  const parsedManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!isRecord(parsedManifest)) throw new TypeError("package.json must contain an object");
  /** @type {PackageManifest} */
  const manifest = parsedManifest;
  /** @type {PackageBoundaryViolation[]} */
  const declarationViolations = [];
  const expected = new Set(["package.json"]);
  const declarationCounts = new Map();

  const declaredRoots = manifest.files;
  if (!Array.isArray(declaredRoots)) {
    declarationViolations.push(
      violation(
        "invalid-declared-path",
        "package.json#files",
        "package must declare an explicit array of literal ship roots",
      ),
    );
  } else {
    for (const [index, rawRoot] of declaredRoots.entries()) {
      if (typeof rawRoot !== "string") {
        declarationViolations.push(
          violation(
            "invalid-declared-path",
            `package.json#files[${index}]`,
            "declared package root must be a string",
          ),
        );
        continue;
      }
      const root = normalizePackagePath(rawRoot);
      if (root === undefined || PACKAGE_GLOB_CHARACTERS.test(rawRoot)) {
        declarationViolations.push(
          violation(
            "invalid-declared-path",
            rawRoot,
            "declared package root must be a literal root-relative path",
          ),
        );
        continue;
      }
      declarationCounts.set(root, (declarationCounts.get(root) ?? 0) + 1);
      if (!existsSync(join(sourceRoot, ...root.split("/")))) {
        expected.add(root);
        declarationViolations.push(
          violation("missing-required-path", root, "declared package root is absent from source"),
        );
        continue;
      }
      addLeafPaths(sourceRoot, root, expected);
    }
  }

  for (const [path, count] of declarationCounts) {
    if (count > 1) {
      declarationViolations.push(
        violation("duplicate-declared-path", path, "declared package root appears more than once"),
      );
    }
  }

  const rootNames = readdirSync(sourceRoot).sort();
  const readmes = rootNames.filter((name) => /^readme(?:\..+)?$/i.test(name));
  const licenses = rootNames.filter((name) => /^(?:license|licence)(?:\..+)?$/i.test(name));
  for (const name of [...readmes, ...licenses]) addLeafPaths(sourceRoot, name, expected);

  if (readmes.length === 0) {
    expected.add("README.md");
    declarationViolations.push(
      violation(
        "missing-required-path",
        "README.md",
        "required package readme is absent from source",
      ),
    );
  }
  if (
    typeof manifest.license === "string" &&
    manifest.license.toUpperCase() !== "UNLICENSED" &&
    licenses.length === 0
  ) {
    expected.add("LICENSE");
    declarationViolations.push(
      violation(
        "missing-required-path",
        "LICENSE",
        "declared package license is absent from source",
      ),
    );
  }

  const executables = executableDeclaration(manifest);
  declarationViolations.push(...executables.violations);
  const specialTargets = [
    ...(typeof manifest.main === "string" ? [manifest.main] : []),
    ...Object.values(executables.targets),
  ];
  for (const rawTarget of specialTargets) {
    const target = normalizePackagePath(rawTarget);
    if (target === undefined) {
      declarationViolations.push(
        violation(
          "invalid-declared-path",
          rawTarget,
          "special package target must be a root-relative path",
        ),
      );
      continue;
    }
    expected.add(target);
    if (!existsSync(join(sourceRoot, ...target.split("/")))) {
      declarationViolations.push(
        violation("missing-required-path", target, "special package target is absent from source"),
      );
    }
  }

  declarationViolations.sort(compareViolations);
  return {
    manifest,
    expectedPaths: [...expected].sort(),
    declarationViolations,
  };
}

/**
 * @typedef ExecutableDeclaration
 * @property {Record<string, string>} targets
 * @property {PackageBoundaryViolation[]} violations
 */

/** @param {PackageManifest} manifest @returns {ExecutableDeclaration} */
function executableDeclaration(manifest) {
  const declared = manifest.bin;
  if (typeof declared === "string") {
    const rawName = typeof manifest.name === "string" ? manifest.name : "package";
    const name = rawName.includes("/") ? rawName.slice(rawName.lastIndexOf("/") + 1) : rawName;
    if (declared.length === 0) {
      return {
        targets: {},
        violations: [
          violation(
            "invalid-bin-target",
            "package.json#bin",
            "declared executable target must be a non-empty string",
          ),
        ],
      };
    }
    return { targets: { [name]: declared }, violations: [] };
  }
  if (declared === undefined) return { targets: {}, violations: [] };
  if (!isRecord(declared)) {
    return {
      targets: {},
      violations: [
        violation(
          "invalid-bin-target",
          "package.json#bin",
          "executable declaration must be a string or command-to-target object",
        ),
      ],
    };
  }
  /** @type {Record<string, string>} */
  const targets = {};
  /** @type {PackageBoundaryViolation[]} */
  const violations = [];
  for (const [name, target] of Object.entries(declared)) {
    const locator = `package.json#bin[${JSON.stringify(name)}]`;
    if (name.length === 0) {
      violations.push(
        violation("invalid-bin-target", locator, "executable command name must not be empty"),
      );
    }
    if (typeof target !== "string" || target.length === 0) {
      violations.push(
        violation(
          "invalid-bin-target",
          locator,
          "declared executable target must be a non-empty string",
        ),
      );
      continue;
    }
    if (name.length > 0) targets[name] = target;
  }
  return {
    targets: Object.fromEntries(
      Object.entries(targets).sort(([left], [right]) => compareText(left, right)),
    ),
    violations,
  };
}

/** @param {unknown} value @returns {unknown} */
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

/** @param {unknown} left @param {unknown} right */
function valuesEqual(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

/**
 * Classify prohibited package paths by their actual role. This deliberately inspects path structure rather
 * than prose: a shipped document may discuss credentials or planning without becoming credential state.
 *
 * @param {string} path
 * @returns {string | undefined}
 */
function prohibitedKind(path) {
  const segments = path.split("/").map((segment) => segment.toLowerCase());
  const [root = ""] = segments;
  const basename = posix.basename(path).toLowerCase();

  if (
    ["src", "test", "research"].includes(root) ||
    ["node_modules", ".git", ".github", ".serena", ".codex"].some((segment) =>
      segments.includes(segment),
    ) ||
    /^tsconfig(?:\..+)?\.json$/i.test(root) ||
    ["biome.json", "vitest.config.ts"].includes(root)
  ) {
    return "prohibited-development";
  }
  if (root === "backlog" || segments.includes(".authoring-backlog")) {
    return "prohibited-backlog";
  }
  if (
    ["_bmad-output", ".bmad"].some((segment) => segments.includes(segment)) ||
    (root === "foundation.md" && basename === "foundation.md")
  ) {
    return "prohibited-planning";
  }
  if (
    ["builds", ".claude", ".agents"].includes(root) ||
    (segments.length === 1 && ["agents.md", "claude.md"].includes(basename))
  ) {
    return "prohibited-workspace-authoring";
  }
  if (segments.includes("distribution-preparation")) return "prohibited-preparation";

  const environmentFile = basename === ".env" || /^\.env\.(?!example$|sample$).+/.test(basename);
  if (
    environmentFile ||
    [".npmrc", ".yarnrc", "credentials.json", "secrets.json"].includes(basename) ||
    /\.(?:pem|p12|pfx|key)$/.test(basename)
  ) {
    return "prohibited-credential";
  }
  return undefined;
}

/** @param {string} kind @param {string} path @param {string} detail */
function violation(kind, path, detail) {
  return { kind, path, detail };
}

/** @param {PackageBoundaryViolation} left @param {PackageBoundaryViolation} right */
function compareViolations(left, right) {
  const leftOrder = VIOLATION_ORDER.indexOf(left.kind);
  const rightOrder = VIOLATION_ORDER.indexOf(right.kind);
  const kindOrder =
    (leftOrder === -1 ? VIOLATION_ORDER.length : leftOrder) -
    (rightOrder === -1 ? VIOLATION_ORDER.length : rightOrder);
  return kindOrder || compareText(left.path, right.path) || compareText(left.detail, right.detail);
}

/**
 * Compare one source revision's declared package boundary with the entries and metadata read from its packed
 * archive. The evaluator knows no WPM asset categories: a new required path is enforced solely by entering
 * the expected set.
 *
 * @param {PackageBoundaryInput} input
 */
export function evaluatePackageBoundary(input) {
  /** @type {PackageBoundaryViolation[]} */
  const violations = [...(input.declarationViolations ?? [])];
  /** @type {Map<string, number>} */
  const expectedCounts = new Map();
  /** @type {Map<string, number>} */
  const actualCounts = new Map();
  /** @type {Map<string, PackageEntry>} */
  const actualEntries = new Map();
  const actualDirectories = new Set([""]);

  for (const rawPath of input.expectedPaths) {
    const path = normalizePackagePath(rawPath);
    if (path === undefined) {
      violations.push(
        violation("invalid-declared-path", rawPath, "declared package path is not root-relative"),
      );
      continue;
    }
    expectedCounts.set(path, (expectedCounts.get(path) ?? 0) + 1);
  }

  for (const entry of input.actualEntries) {
    const path = normalizePackagePath(entry.path);
    if (path === undefined) {
      violations.push(
        violation("invalid-packed-path", entry.path, "packed path is not root-relative"),
      );
      continue;
    }
    actualCounts.set(path, (actualCounts.get(path) ?? 0) + 1);
    if (!actualEntries.has(path)) actualEntries.set(path, entry);
    let parent = posix.dirname(path);
    while (parent !== "." && parent !== "") {
      actualDirectories.add(parent);
      parent = posix.dirname(parent);
    }
    const prohibited = prohibitedKind(path);
    if (prohibited !== undefined) {
      violations.push(violation(prohibited, path, "path belongs to a prohibited package surface"));
    }
  }

  /** @param {PackageEntry} entry @param {string} path */
  const linkDestination = (entry, path) => {
    const target = entry.linkTarget?.replaceAll("\\", "/") ?? "";
    if (
      target.length === 0 ||
      target.includes("\0") ||
      posix.isAbsolute(target) ||
      /^[A-Za-z]:/.test(target)
    ) {
      return undefined;
    }
    if (entry.type === "hardlink") return normalizePackagePath(target);
    const resolved = posix.normalize(posix.join(posix.dirname(path), target));
    if (resolved === ".." || resolved.startsWith("../")) return undefined;
    return resolved === "." ? "" : resolved;
  };

  /** @param {string} path @param {Set<string>} seen @returns {boolean} */
  const resolvesInsidePackage = (path, seen) => {
    if (seen.has(path)) return false;
    const entry = actualEntries.get(path);
    if (entry === undefined) return actualDirectories.has(path);
    if (entry.type === "file") return true;
    const destination = linkDestination(entry, path);
    if (destination === undefined) return false;
    const nextSeen = new Set(seen);
    nextSeen.add(path);
    if (entry.type === "hardlink" && actualDirectories.has(destination)) return false;
    return resolvesInsidePackage(destination, nextSeen);
  };

  for (const [path, entry] of actualEntries) {
    if (entry.type === "file") continue;
    const destination = linkDestination(entry, path);
    if (destination === undefined) {
      violations.push(
        violation("escaping-link", path, "packed link does not resolve inside the package"),
      );
    } else if (!resolvesInsidePackage(path, new Set())) {
      violations.push(
        violation(
          "unresolvable-link",
          path,
          "packed link target is absent or does not resolve to a package entry",
        ),
      );
    }
  }

  for (const [path, count] of expectedCounts) {
    if (count > 1) {
      violations.push(
        violation("duplicate-declared-path", path, "declared package path appears more than once"),
      );
    }
  }
  for (const [path, count] of actualCounts) {
    if (count > 1) {
      violations.push(
        violation("duplicate-packed-path", path, "packed path appears more than once"),
      );
    }
  }

  const expectedPaths = [...expectedCounts.keys()].sort();
  const actualPaths = [...actualCounts.keys()].sort();
  for (const path of expectedPaths) {
    if (!actualCounts.has(path)) {
      violations.push(
        violation(
          "missing-required-path",
          path,
          "declared package path is absent from the packed archive",
        ),
      );
    }
  }
  for (const path of actualPaths) {
    if (!expectedCounts.has(path) && prohibitedKind(path) === undefined) {
      violations.push(
        violation("unexpected-path", path, "packed path is absent from the declared ship set"),
      );
    }
  }

  const metadataFields = [
    ...new Set([...Object.keys(input.sourceManifest), ...Object.keys(input.packedManifest)]),
  ].sort();
  for (const field of metadataFields) {
    if (!valuesEqual(input.sourceManifest[field], input.packedManifest[field])) {
      violations.push(
        violation(
          "metadata-mismatch",
          `package.json#${field}`,
          "packed metadata differs from the evaluated source revision",
        ),
      );
    }
  }

  const executable = executableDeclaration(input.packedManifest);
  for (const executableViolation of executable.violations) {
    if (
      !violations.some(
        (existing) =>
          existing.kind === executableViolation.kind &&
          existing.path === executableViolation.path &&
          existing.detail === executableViolation.detail,
      )
    ) {
      violations.push(executableViolation);
    }
  }
  const bins = executable.targets;
  for (const target of Object.values(bins)) {
    const path = normalizePackagePath(target);
    if (path === undefined) {
      violations.push(
        violation("invalid-bin-target", target, "declared executable target is not root-relative"),
      );
    } else if (!actualCounts.has(path)) {
      violations.push(
        violation("missing-bin-target", path, "declared executable target is absent from package"),
      );
    }
  }

  violations.sort(compareViolations);
  return {
    status: violations.length === 0 ? "accepted" : "rejected",
    sourceRevision: input.sourceRevision,
    package: {
      name: typeof input.packedManifest.name === "string" ? input.packedManifest.name : null,
      version:
        typeof input.packedManifest.version === "string" ? input.packedManifest.version : null,
      executableTargets: bins,
    },
    expectedPaths,
    actualPaths,
    violations,
  };
}
