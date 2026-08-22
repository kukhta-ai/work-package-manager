import { createHash } from "node:crypto";

/** @typedef {Record<string, unknown>} JsonRecord */

/**
 * @typedef CandidateFinding
 * @property {"missing" | "invalid" | "inconsistent" | "changed"} kind
 * @property {string} field
 * @property {string} detail
 */

/**
 * @typedef ArtifactDigestSet
 * @property {string} sha256
 * @property {string} sha512
 */

/**
 * @typedef CandidateBinding
 * @property {1} schemaVersion
 * @property {{name: string, version: string}} package
 * @property {string} proposedTag
 * @property {string} sourceRevision
 * @property {{path: string, filename: string, size: number, digests: ArtifactDigestSet}} artifact
 * @property {{inspection: {path: string, status: "accepted", digest: string, rawDigest: string}, quality: {path: string, status: "accepted", digest: string, rawDigest: string}, packedInstall: {path: string, status: "accepted", digest: string, rawDigest: string}}} evidence
 * @property {{path: string, preview: string, digest: string}} releaseNotes
 */

/** @param {unknown} value @returns {value is JsonRecord} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is string} */
function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** @param {unknown} value @returns {value is number} */
function isPositiveSafeInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** @param {unknown} value @param {"sha256" | "sha512"} algorithm @returns {value is string} */
function isDigest(value, algorithm) {
  const length = algorithm === "sha256" ? 64 : 128;
  return typeof value === "string" && new RegExp(`^${algorithm}:[a-f0-9]{${length}}$`).test(value);
}

/** @param {unknown} value @returns {value is string} */
function isPortableArtifactFilename(value) {
  return (
    hasText(value) &&
    value !== "." &&
    value !== ".." &&
    !/[<>:"/\\|?*]/.test(value) &&
    [...value].every((character) => (character.codePointAt(0) ?? 0) >= 32) &&
    !/[. ]$/.test(value)
  );
}

/**
 * Add one stable finding per affected field. More specific earlier observations win over derivative duplicates.
 *
 * @param {CandidateFinding[]} findings
 * @param {CandidateFinding["kind"]} kind
 * @param {string} field
 * @param {string} detail
 */
function addFinding(findings, kind, field, detail) {
  if (findings.some((finding) => finding.field === field)) return;
  findings.push({ kind, field, detail });
}

/** @param {string} left @param {string} right */
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** @param {unknown} value @returns {unknown} */
function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareText)
      .map((key) => [key, canonicalValue(value[key])]),
  );
}

/** @param {unknown} value */
function semanticDigest(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalValue(value)))
    .digest("hex")}`;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @param {CandidateFinding[]} findings
 */
function normalizedStringRecord(value, field, findings) {
  if (!isRecord(value)) {
    addFinding(findings, "missing", field, `${field} must be a non-empty string map`);
    return undefined;
  }
  const entries = Object.entries(value).sort(([left], [right]) => compareText(left, right));
  if (entries.length === 0 || entries.some(([key, entry]) => !hasText(key) || !hasText(entry))) {
    addFinding(findings, "invalid", field, `${field} must be a non-empty string map`);
    return undefined;
  }
  return Object.fromEntries(entries);
}

/**
 * @param {unknown} value
 * @param {string} field
 * @param {CandidateFinding[]} findings
 */
function normalizedStringArray(value, field, findings) {
  if (!Array.isArray(value) || value.some((entry) => !hasText(entry))) {
    addFinding(findings, "invalid", field, `${field} must be an array of non-empty strings`);
    return undefined;
  }
  const normalized = [...new Set(value)].sort(compareText);
  if (normalized.length !== value.length) {
    addFinding(findings, "invalid", field, `${field} must not contain duplicate paths`);
    return undefined;
  }
  return normalized;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @param {CandidateFinding[]} findings
 */
function normalizedPackage(value, field, findings) {
  if (!isRecord(value)) {
    addFinding(findings, "missing", field, `${field} must be a JSON object`);
    return undefined;
  }
  if (!hasText(value.name))
    addFinding(findings, "missing", `${field}.name`, "package name is required");
  if (!hasText(value.version)) {
    addFinding(findings, "missing", `${field}.version`, "package version is required");
  }
  const executableTargets = normalizedStringRecord(
    value.executableTargets,
    `${field}.executableTargets`,
    findings,
  );
  if (!hasText(value.name) || !hasText(value.version) || executableTargets === undefined) {
    return undefined;
  }
  return { name: value.name, version: value.version, executableTargets };
}

/**
 * @param {unknown} value
 * @param {CandidateFinding[]} findings
 */
function normalizedInspection(value, findings) {
  if (!isRecord(value)) {
    addFinding(findings, "missing", "inspection", "inspection report is required");
    return undefined;
  }
  if (value.status !== "accepted") {
    addFinding(findings, "invalid", "inspection.status", "inspection status must be accepted");
  }
  if (!Array.isArray(value.violations) || value.violations.length !== 0) {
    addFinding(
      findings,
      "invalid",
      "inspection.violations",
      "inspection must contain no violations",
    );
  }
  if (!hasText(value.sourceRevision)) {
    addFinding(
      findings,
      "missing",
      "inspection.sourceRevision",
      "inspection source revision is required",
    );
  }
  if (!isRecord(value.sourceBinding)) {
    addFinding(
      findings,
      "missing",
      "inspection.sourceBinding",
      "inspection source binding is required",
    );
  } else {
    if (value.sourceBinding.clean !== true) {
      addFinding(
        findings,
        "invalid",
        "inspection.sourceBinding.clean",
        "inspection source must be clean",
      );
    }
    if (
      !hasText(value.sourceBinding.checkoutRevision) ||
      value.sourceBinding.checkoutRevision !== value.sourceRevision
    ) {
      addFinding(
        findings,
        "inconsistent",
        "inspection.sourceBinding.checkoutRevision",
        "inspection checkout revision must equal its source revision",
      );
    }
  }
  const packageIdentity = normalizedPackage(value.package, "inspection.package", findings);
  if (!isRecord(value.artifact) || !isPositiveSafeInteger(value.artifact.size)) {
    addFinding(
      findings,
      "missing",
      "inspection.artifact.size",
      "inspection artifact size is required",
    );
  }
  const expectedPaths = normalizedStringArray(
    value.expectedPaths,
    "inspection.expectedPaths",
    findings,
  );
  const actualPaths = normalizedStringArray(value.actualPaths, "inspection.actualPaths", findings);
  if (expectedPaths !== undefined && actualPaths !== undefined) {
    const actual = new Set(actualPaths);
    const missing = expectedPaths.filter((path) => !actual.has(path));
    if (missing.length > 0) {
      addFinding(
        findings,
        "inconsistent",
        "inspection.actualPaths",
        `inspection actual paths omit required paths: ${missing.join(", ")}`,
      );
    }
  }
  if (
    value.status !== "accepted" ||
    !Array.isArray(value.violations) ||
    value.violations.length !== 0 ||
    !hasText(value.sourceRevision) ||
    !isRecord(value.sourceBinding) ||
    value.sourceBinding.clean !== true ||
    value.sourceBinding.checkoutRevision !== value.sourceRevision ||
    packageIdentity === undefined ||
    !isRecord(value.artifact) ||
    !isPositiveSafeInteger(value.artifact.size) ||
    expectedPaths === undefined ||
    actualPaths === undefined
  ) {
    return undefined;
  }
  return {
    status: "accepted",
    sourceRevision: value.sourceRevision,
    package: packageIdentity,
    artifact: { size: value.artifact.size },
    expectedPaths,
    actualPaths,
  };
}

/**
 * @param {unknown} value
 * @param {CandidateFinding[]} findings
 */
function normalizedQuality(value, findings) {
  if (!isRecord(value)) {
    addFinding(findings, "missing", "quality", "quality report is required");
    return undefined;
  }
  if (value.status !== "accepted") {
    addFinding(findings, "invalid", "quality.status", "quality status must be accepted");
  }
  if (!hasText(value.sourceRevision)) {
    addFinding(
      findings,
      "missing",
      "quality.sourceRevision",
      "quality source revision is required",
    );
  }
  if (!Array.isArray(value.checks) || value.checks.length === 0) {
    addFinding(
      findings,
      "missing",
      "quality.checks",
      "quality evidence must name at least one check",
    );
    return undefined;
  }
  const checks = [];
  const names = new Set();
  for (const check of value.checks) {
    if (!isRecord(check) || !hasText(check.name)) {
      addFinding(findings, "invalid", "quality.checks", "every quality check must have a name");
      continue;
    }
    if (names.has(check.name)) {
      addFinding(
        findings,
        "invalid",
        `quality.checks.${check.name}`,
        `quality check ${check.name} is duplicated`,
      );
      continue;
    }
    names.add(check.name);
    if (check.status !== "passed") {
      addFinding(
        findings,
        "invalid",
        `quality.checks.${check.name}`,
        `quality check ${check.name} must have status passed`,
      );
    }
    checks.push({ name: check.name, status: check.status });
  }
  checks.sort(({ name: left }, { name: right }) => compareText(left, right));
  if (
    value.status !== "accepted" ||
    !hasText(value.sourceRevision) ||
    checks.length !== value.checks.length ||
    checks.some(({ status }) => status !== "passed")
  ) {
    return undefined;
  }
  return { status: "accepted", sourceRevision: value.sourceRevision, checks };
}

/**
 * @param {unknown} value
 * @param {CandidateFinding[]} findings
 */
function normalizedPackedInstall(value, findings) {
  if (!isRecord(value)) {
    addFinding(findings, "missing", "packedInstall", "packed-install report is required");
    return undefined;
  }
  if (value.status !== "accepted") {
    addFinding(
      findings,
      "invalid",
      "packedInstall.status",
      "packed-install status must be accepted",
    );
  }
  if (!hasText(value.sourceRevision)) {
    addFinding(
      findings,
      "missing",
      "packedInstall.sourceRevision",
      "packed-install source revision is required",
    );
  }
  if (!isRecord(value.sourceBinding)) {
    addFinding(findings, "missing", "packedInstall.sourceBinding", "source binding is required");
  } else {
    if (!hasText(value.sourceBinding.requestedRevision)) {
      addFinding(
        findings,
        "missing",
        "packedInstall.sourceBinding.requestedRevision",
        "packed-install requested revision is required",
      );
    }
    if (value.sourceBinding.clean !== true) {
      addFinding(findings, "invalid", "packedInstall.sourceBinding.clean", "source must be clean");
    }
    if (
      !hasText(value.sourceBinding.checkoutRevision) ||
      value.sourceBinding.checkoutRevision !== value.sourceRevision
    ) {
      addFinding(
        findings,
        "inconsistent",
        "packedInstall.sourceBinding.checkoutRevision",
        "packed-install checkout revision must equal its source revision",
      );
    }
  }
  const packageIdentity = normalizedPackage(value.package, "packedInstall.package", findings);
  if (!isRecord(value.artifact)) {
    addFinding(findings, "missing", "packedInstall.artifact", "artifact evidence is required");
  } else {
    if (!hasText(value.artifact.inspectedPath)) {
      addFinding(
        findings,
        "missing",
        "packedInstall.artifact.inspectedPath",
        "inspected artifact path is required",
      );
    }
    if (!hasText(value.artifact.frozenPath)) {
      addFinding(
        findings,
        "missing",
        "packedInstall.artifact.frozenPath",
        "frozen artifact path is required",
      );
    }
    if (!isPositiveSafeInteger(value.artifact.size)) {
      addFinding(findings, "missing", "packedInstall.artifact.size", "artifact size is required");
    }
  }
  if (!isRecord(value.installation) || value.installation.status !== "installed") {
    addFinding(
      findings,
      "invalid",
      "packedInstall.installation.status",
      "installation status must be installed",
    );
  }
  if (isRecord(value.installation) && !hasText(value.installation.npmVersion)) {
    addFinding(
      findings,
      "missing",
      "packedInstall.installation.npmVersion",
      "packed-install npm version observation is required",
    );
  }
  const executables = [];
  const executableNames = new Set();
  if (!Array.isArray(value.executables) || value.executables.length === 0) {
    addFinding(
      findings,
      "missing",
      "packedInstall.executables",
      "packed-install evidence must include executable observations",
    );
  } else {
    for (const executable of value.executables) {
      if (
        !isRecord(executable) ||
        !hasText(executable.name) ||
        !hasText(executable.target) ||
        !hasText(executable.shimPath) ||
        !hasText(executable.version)
      ) {
        addFinding(
          findings,
          "invalid",
          "packedInstall.executables",
          "every executable observation must contain name, target, shim path, and version",
        );
        continue;
      }
      if (executableNames.has(executable.name)) {
        addFinding(
          findings,
          "invalid",
          `packedInstall.executables.${executable.name}`,
          `packed-install executable ${executable.name} is duplicated`,
        );
        continue;
      }
      executableNames.add(executable.name);
      executables.push({
        name: executable.name,
        target: executable.target,
        version: executable.version,
      });
    }
  }
  executables.sort(({ name: left }, { name: right }) => compareText(left, right));
  if (packageIdentity !== undefined) {
    const observations = new Map(executables.map((executable) => [executable.name, executable]));
    for (const [name, target] of Object.entries(packageIdentity.executableTargets)) {
      const observation = observations.get(name);
      if (observation === undefined) {
        addFinding(
          findings,
          "missing",
          `packedInstall.executables.${name}`,
          `packed-install evidence omits declared executable ${name}`,
        );
      } else if (observation.target !== target || observation.version !== packageIdentity.version) {
        addFinding(
          findings,
          "inconsistent",
          `packedInstall.executables.${name}`,
          `packed-install executable ${name} does not match its declared target and package version`,
        );
      }
    }
    for (const { name } of executables) {
      if (!Object.hasOwn(packageIdentity.executableTargets, name)) {
        addFinding(
          findings,
          "inconsistent",
          `packedInstall.executables.${name}`,
          `packed-install evidence contains undeclared executable ${name}`,
        );
      }
    }
  }
  let resolvedPaths;
  let missingPaths;
  if (!isRecord(value.resources) || value.resources.status !== "accepted") {
    addFinding(
      findings,
      "invalid",
      "packedInstall.resources.status",
      "installed resources status must be accepted",
    );
  }
  if (isRecord(value.resources)) {
    resolvedPaths = normalizedStringArray(
      value.resources.resolvedPaths,
      "packedInstall.resources.resolvedPaths",
      findings,
    );
    missingPaths = normalizedStringArray(
      value.resources.missingPaths,
      "packedInstall.resources.missingPaths",
      findings,
    );
    if (missingPaths !== undefined && missingPaths.length > 0) {
      addFinding(
        findings,
        "inconsistent",
        "packedInstall.resources.missingPaths",
        "installed resources must contain no missing paths",
      );
    }
    if (!isRecord(value.resources.probe) || value.resources.probe.status !== "accepted") {
      addFinding(
        findings,
        "invalid",
        "packedInstall.resources.probe.status",
        "installed resource probe status must be accepted",
      );
    } else {
      if (!hasText(value.resources.probe.command)) {
        addFinding(
          findings,
          "missing",
          "packedInstall.resources.probe.command",
          "installed resource probe command is required",
        );
      }
      if (!hasText(value.resources.probe.output)) {
        addFinding(
          findings,
          "missing",
          "packedInstall.resources.probe.output",
          "installed resource probe output is required",
        );
      }
    }
  }
  if (!isRecord(value.configuration) || value.configuration.status !== "unchanged") {
    addFinding(
      findings,
      "invalid",
      "packedInstall.configuration.status",
      "coding-agent configuration status must be unchanged",
    );
  }
  if (
    isRecord(value.configuration) &&
    (!Array.isArray(value.configuration.surfaces) || value.configuration.surfaces.length === 0)
  ) {
    addFinding(
      findings,
      "missing",
      "packedInstall.configuration.surfaces",
      "packed-install evidence must include coding-agent configuration observations",
    );
  } else if (isRecord(value.configuration) && Array.isArray(value.configuration.surfaces)) {
    const surfacePaths = new Set();
    for (const surface of value.configuration.surfaces) {
      if (!isRecord(surface) || !hasText(surface.path) || surface.unchanged !== true) {
        addFinding(
          findings,
          "inconsistent",
          "packedInstall.configuration.surfaces",
          "every observed coding-agent configuration surface must have a path and remain unchanged",
        );
        continue;
      }
      if (surfacePaths.has(surface.path)) {
        addFinding(
          findings,
          "invalid",
          "packedInstall.configuration.surfaces",
          "coding-agent configuration observations must not contain duplicate paths",
        );
      }
      surfacePaths.add(surface.path);
    }
  }
  if (
    !hasText(value.sourceRevision) ||
    packageIdentity === undefined ||
    !isRecord(value.artifact) ||
    !isPositiveSafeInteger(value.artifact.size) ||
    resolvedPaths === undefined ||
    missingPaths === undefined ||
    !Array.isArray(value.executables)
  ) {
    return undefined;
  }
  return {
    status: "accepted",
    sourceRevision: value.sourceRevision,
    package: packageIdentity,
    artifact: { size: value.artifact.size },
    installation: { status: "installed" },
    executables,
    resources: { status: "accepted", resolvedPaths, missingPaths: [] },
    configuration: { status: "unchanged" },
  };
}

/**
 * Evaluate all local candidate evidence without I/O. Independent discrepancies are accumulated in stable
 * field order, and a binding is returned only when every required observation agrees.
 *
 * @param {unknown} input
 * @returns {{findings: CandidateFinding[], binding?: CandidateBinding}}
 */
export function evaluateCandidateBinding(input) {
  /** @type {CandidateFinding[]} */
  const findings = [];
  if (!isRecord(input)) {
    return {
      findings: [{ kind: "missing", field: "input", detail: "candidate input is required" }],
    };
  }
  if (!hasText(input.proposedTag)) {
    addFinding(findings, "missing", "proposedTag", "proposed tag is required as inert local data");
  }

  const artifact = isRecord(input.artifact) ? input.artifact : undefined;
  if (artifact === undefined) {
    addFinding(findings, "missing", "artifact", "exact artifact observation is required");
  }
  if (!hasText(artifact?.filename)) {
    addFinding(findings, "missing", "artifact.filename", "artifact filename is required");
  } else if (!isPortableArtifactFilename(artifact.filename)) {
    addFinding(
      findings,
      "invalid",
      "artifact.filename",
      "artifact filename must be a portable single path segment",
    );
  }
  if (!isPositiveSafeInteger(artifact?.size)) {
    addFinding(
      findings,
      "missing",
      "artifact.size",
      "artifact size must be a positive safe integer",
    );
  }
  const artifactDigests = isRecord(artifact?.digests) ? artifact.digests : undefined;
  if (!isDigest(artifactDigests?.sha256, "sha256")) {
    addFinding(findings, "missing", "artifact.digests.sha256", "artifact SHA-256 is required");
  }
  if (!isDigest(artifactDigests?.sha512, "sha512")) {
    addFinding(findings, "missing", "artifact.digests.sha512", "artifact SHA-512 is required");
  }

  const inspectionEnvelope = isRecord(input.inspection) ? input.inspection : undefined;
  if (inspectionEnvelope === undefined) {
    addFinding(findings, "missing", "inspection", "inspection evidence is required");
  }
  if (!isDigest(inspectionEnvelope?.rawDigest, "sha256")) {
    addFinding(
      findings,
      "missing",
      "inspection.rawDigest",
      "inspection evidence digest is required",
    );
  }
  const inspectionReport = isRecord(inspectionEnvelope?.report)
    ? inspectionEnvelope.report
    : undefined;
  const inspection = normalizedInspection(inspectionReport, findings);

  const installEnvelope = isRecord(input.packedInstall) ? input.packedInstall : undefined;
  if (installEnvelope === undefined) {
    addFinding(findings, "missing", "packedInstall", "packed-install evidence is required");
  }
  if (!isDigest(installEnvelope?.rawDigest, "sha256")) {
    addFinding(
      findings,
      "missing",
      "packedInstall.rawDigest",
      "packed-install evidence digest is required",
    );
  }
  const packedInstallReport = isRecord(installEnvelope?.report)
    ? installEnvelope.report
    : undefined;
  const packedInstall = normalizedPackedInstall(packedInstallReport, findings);
  const frozenArtifact = isRecord(installEnvelope?.frozenArtifact)
    ? installEnvelope.frozenArtifact
    : undefined;
  if (frozenArtifact === undefined) {
    addFinding(
      findings,
      "missing",
      "packedInstall.frozenArtifact",
      "frozen installed artifact observation is required",
    );
  } else {
    if (!isPositiveSafeInteger(frozenArtifact.size)) {
      addFinding(
        findings,
        "invalid",
        "packedInstall.frozenArtifact.size",
        "frozen artifact size is required",
      );
    }
    const frozenDigests = isRecord(frozenArtifact.digests) ? frozenArtifact.digests : undefined;
    if (!isDigest(frozenDigests?.sha256, "sha256")) {
      addFinding(
        findings,
        "invalid",
        "packedInstall.frozenArtifact.digests.sha256",
        "frozen artifact SHA-256 is required",
      );
    }
    if (!isDigest(frozenDigests?.sha512, "sha512")) {
      addFinding(
        findings,
        "invalid",
        "packedInstall.frozenArtifact.digests.sha512",
        "frozen artifact SHA-512 is required",
      );
    }
  }

  const qualityEnvelope = isRecord(input.quality) ? input.quality : undefined;
  if (qualityEnvelope === undefined) {
    addFinding(findings, "missing", "quality", "quality evidence is required");
  }
  if (!isDigest(qualityEnvelope?.rawDigest, "sha256")) {
    addFinding(findings, "missing", "quality.rawDigest", "quality evidence digest is required");
  }
  const qualityReport = isRecord(qualityEnvelope?.report) ? qualityEnvelope.report : undefined;
  const quality = normalizedQuality(qualityReport, findings);

  const releaseNotes = isRecord(input.releaseNotes) ? input.releaseNotes : undefined;
  if (releaseNotes === undefined) {
    addFinding(findings, "missing", "releaseNotes", "release-note preview is required");
  }
  if (!hasText(releaseNotes?.preview)) {
    addFinding(
      findings,
      "missing",
      "releaseNotes.preview",
      "release-note preview must be non-empty",
    );
  }
  if (!isDigest(releaseNotes?.digest, "sha256")) {
    addFinding(
      findings,
      "missing",
      "releaseNotes.digest",
      "release-note preview digest is required",
    );
  }

  if (inspection !== undefined && artifact !== undefined) {
    if (inspection.artifact.size !== artifact.size) {
      addFinding(
        findings,
        "inconsistent",
        "artifact.size",
        `artifact size ${String(artifact.size)} differs from inspection size ${String(inspection.artifact.size)}`,
      );
    }
  }
  if (
    inspectionReport !== undefined &&
    isRecord(inspectionReport.artifact) &&
    isPositiveSafeInteger(inspectionReport.artifact.size) &&
    artifact !== undefined &&
    isPositiveSafeInteger(artifact.size) &&
    inspectionReport.artifact.size !== artifact.size
  ) {
    addFinding(
      findings,
      "inconsistent",
      "artifact.size",
      "artifact size differs from inspection evidence",
    );
  }
  if (inspection !== undefined && packedInstall !== undefined) {
    if (packedInstall.sourceRevision !== inspection.sourceRevision) {
      addFinding(
        findings,
        "inconsistent",
        "packedInstall.sourceRevision",
        "packed-install revision differs from inspection revision",
      );
    }
    if (JSON.stringify(packedInstall.package) !== JSON.stringify(inspection.package)) {
      addFinding(
        findings,
        "inconsistent",
        "packedInstall.package",
        "packed-install package identity or executables differ from inspection",
      );
    }
    if (packedInstall.artifact.size !== inspection.artifact.size) {
      addFinding(
        findings,
        "inconsistent",
        "packedInstall.artifact.size",
        "packed-install artifact size differs from inspection",
      );
    }
    if (
      JSON.stringify(packedInstall.resources.resolvedPaths) !==
      JSON.stringify(inspection.expectedPaths)
    ) {
      addFinding(
        findings,
        "inconsistent",
        "packedInstall.resources.resolvedPaths",
        "packed-install resolved resources differ from the inspected required paths",
      );
    }
  }
  if (
    inspectionReport !== undefined &&
    packedInstallReport !== undefined &&
    hasText(inspectionReport.sourceRevision) &&
    hasText(packedInstallReport.sourceRevision) &&
    packedInstallReport.sourceRevision !== inspectionReport.sourceRevision
  ) {
    addFinding(
      findings,
      "inconsistent",
      "packedInstall.sourceRevision",
      "packed-install revision differs from inspection revision",
    );
  }
  if (
    inspectionReport !== undefined &&
    packedInstallReport !== undefined &&
    isRecord(inspectionReport.artifact) &&
    isRecord(packedInstallReport.artifact) &&
    isPositiveSafeInteger(inspectionReport.artifact.size) &&
    isPositiveSafeInteger(packedInstallReport.artifact.size) &&
    inspectionReport.artifact.size !== packedInstallReport.artifact.size
  ) {
    addFinding(
      findings,
      "inconsistent",
      "packedInstall.artifact.size",
      "packed-install artifact size differs from inspection",
    );
  }
  if (
    inspectionReport !== undefined &&
    packedInstallReport !== undefined &&
    isRecord(inspectionReport.artifact) &&
    isRecord(packedInstallReport.artifact) &&
    hasText(inspectionReport.artifact.path) &&
    hasText(packedInstallReport.artifact.inspectedPath) &&
    inspectionReport.artifact.path !== packedInstallReport.artifact.inspectedPath
  ) {
    addFinding(
      findings,
      "inconsistent",
      "packedInstall.artifact.inspectedPath",
      "packed-install evidence identifies a different inspected artifact",
    );
  }
  if (
    inspectionReport !== undefined &&
    packedInstallReport !== undefined &&
    isRecord(packedInstallReport.resources)
  ) {
    const expectedPaths = normalizedStringArray(
      inspectionReport.expectedPaths,
      "inspection.expectedPaths",
      findings,
    );
    const resolvedPaths = normalizedStringArray(
      packedInstallReport.resources.resolvedPaths,
      "packedInstall.resources.resolvedPaths",
      findings,
    );
    if (
      expectedPaths !== undefined &&
      resolvedPaths !== undefined &&
      JSON.stringify(expectedPaths) !== JSON.stringify(resolvedPaths)
    ) {
      addFinding(
        findings,
        "inconsistent",
        "packedInstall.resources.resolvedPaths",
        "packed-install resolved resources differ from the inspected required paths",
      );
    }
  }
  if (
    inspectionReport !== undefined &&
    packedInstallReport !== undefined &&
    isRecord(inspectionReport.package) &&
    isRecord(packedInstallReport.package) &&
    JSON.stringify(canonicalValue(packedInstallReport.package)) !==
      JSON.stringify(canonicalValue(inspectionReport.package))
  ) {
    addFinding(
      findings,
      "inconsistent",
      "packedInstall.package",
      "packed-install package identity or executables differ from inspection",
    );
  }
  if (
    inspectionReport !== undefined &&
    qualityReport !== undefined &&
    hasText(inspectionReport.sourceRevision) &&
    hasText(qualityReport.sourceRevision) &&
    qualityReport.sourceRevision !== inspectionReport.sourceRevision
  ) {
    addFinding(
      findings,
      "inconsistent",
      "quality.sourceRevision",
      "quality revision differs from inspection revision",
    );
  }
  if (artifact !== undefined && frozenArtifact !== undefined) {
    if (frozenArtifact.size !== artifact.size) {
      addFinding(
        findings,
        "inconsistent",
        "packedInstall.frozenArtifact.size",
        "frozen installed artifact size differs from candidate artifact",
      );
    }
    if (
      isRecord(artifact.digests) &&
      isRecord(frozenArtifact.digests) &&
      artifact.digests.sha256 !== frozenArtifact.digests.sha256
    ) {
      addFinding(
        findings,
        "inconsistent",
        "packedInstall.frozenArtifact.digests.sha256",
        "frozen installed artifact SHA-256 differs from candidate artifact",
      );
    }
    if (
      isRecord(artifact.digests) &&
      isRecord(frozenArtifact.digests) &&
      artifact.digests.sha512 !== frozenArtifact.digests.sha512
    ) {
      addFinding(
        findings,
        "inconsistent",
        "packedInstall.frozenArtifact.digests.sha512",
        "frozen installed artifact SHA-512 differs from candidate artifact",
      );
    }
  }

  findings.sort(({ field: left }, { field: right }) => compareText(left, right));
  if (
    findings.length > 0 ||
    inspection === undefined ||
    packedInstall === undefined ||
    quality === undefined ||
    artifact === undefined ||
    artifactDigests === undefined ||
    !hasText(input.proposedTag) ||
    releaseNotes === undefined ||
    !hasText(releaseNotes.preview) ||
    !isDigest(releaseNotes.digest, "sha256") ||
    !isPortableArtifactFilename(artifact.filename) ||
    !isPositiveSafeInteger(artifact.size) ||
    !isDigest(artifactDigests.sha256, "sha256") ||
    !isDigest(artifactDigests.sha512, "sha512") ||
    !isDigest(inspectionEnvelope?.rawDigest, "sha256") ||
    !isDigest(installEnvelope?.rawDigest, "sha256") ||
    !isDigest(qualityEnvelope?.rawDigest, "sha256")
  ) {
    return { findings };
  }

  /** @type {CandidateBinding} */
  const binding = {
    schemaVersion: 1,
    package: { name: inspection.package.name, version: inspection.package.version },
    proposedTag: input.proposedTag,
    sourceRevision: inspection.sourceRevision,
    artifact: {
      path: `artifact/${artifact.filename}`,
      filename: artifact.filename,
      size: artifact.size,
      digests: { sha256: artifactDigests.sha256, sha512: artifactDigests.sha512 },
    },
    evidence: {
      inspection: {
        path: "evidence/inspection.json",
        status: "accepted",
        digest: semanticDigest(inspection),
        rawDigest: /** @type {string} */ (inspectionEnvelope.rawDigest),
      },
      quality: {
        path: "evidence/quality.json",
        status: "accepted",
        digest: semanticDigest(quality),
        rawDigest: /** @type {string} */ (qualityEnvelope.rawDigest),
      },
      packedInstall: {
        path: "evidence/packed-install.json",
        status: "accepted",
        digest: semanticDigest(packedInstall),
        rawDigest: /** @type {string} */ (installEnvelope.rawDigest),
      },
    },
    releaseNotes: {
      path: "release-notes.md",
      preview: releaseNotes.preview,
      digest: releaseNotes.digest,
    },
  };
  return { findings, binding };
}

/** @param {CandidateBinding} binding */
function identityBasis(binding) {
  return {
    schemaVersion: binding.schemaVersion,
    package: binding.package,
    proposedTag: binding.proposedTag,
    sourceRevision: binding.sourceRevision,
    artifact: binding.artifact,
    evidence: {
      inspection: {
        digest: binding.evidence.inspection.digest,
        rawDigest: binding.evidence.inspection.rawDigest,
      },
      quality: {
        digest: binding.evidence.quality.digest,
        rawDigest: binding.evidence.quality.rawDigest,
      },
      packedInstall: {
        digest: binding.evidence.packedInstall.digest,
        rawDigest: binding.evidence.packedInstall.rawDigest,
      },
    },
    releaseNotes: {
      digest: binding.releaseNotes.digest,
      preview: binding.releaseNotes.preview,
    },
  };
}

/**
 * Derive the stable local candidate identity from the canonical binding. Storage paths, timestamps, and
 * other record-local presentation fields do not participate; exact evidence-byte digests do.
 *
 * @param {CandidateBinding} binding
 */
export function createCandidateIdentity(binding) {
  return semanticDigest(identityBasis(binding));
}

/**
 * Compare two accepted bindings and report every changed identity field in deterministic path order.
 *
 * @param {CandidateBinding} recorded
 * @param {CandidateBinding} proposed
 * @returns {CandidateFinding[]}
 */
export function compareCandidateBindings(recorded, proposed) {
  /** @type {Record<string, unknown>} */
  const recordedLeaves = {};
  /** @type {Record<string, unknown>} */
  const proposedLeaves = {};
  /** @param {unknown} value @param {string} prefix @param {Record<string, unknown>} target */
  const flatten = (value, prefix, target) => {
    if (Array.isArray(value)) {
      target[prefix] = JSON.stringify(value);
      return;
    }
    if (isRecord(value)) {
      for (const key of Object.keys(value).sort(compareText)) {
        flatten(value[key], prefix.length === 0 ? key : `${prefix}.${key}`, target);
      }
      return;
    }
    target[prefix] = value;
  };
  flatten(identityBasis(recorded), "", recordedLeaves);
  flatten(identityBasis(proposed), "", proposedLeaves);
  return [...new Set([...Object.keys(recordedLeaves), ...Object.keys(proposedLeaves)])]
    .sort(compareText)
    .flatMap((field) =>
      recordedLeaves[field] === proposedLeaves[field]
        ? []
        : [
            {
              kind: /** @type {const} */ ("changed"),
              field,
              detail: `candidate binding ${field} differs from the recorded candidate`,
            },
          ],
    );
}
