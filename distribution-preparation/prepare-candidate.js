#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual, TextDecoder } from "node:util";
import {
  compareCandidateBindings,
  createCandidateIdentity,
  evaluateCandidateBinding,
} from "./candidate.js";
import { inspectPackageArchive, inspectPackageArchiveBytes } from "./package-archive.js";
import { validateInspectedPackageReport } from "./packed-install.js";
import { assessInactiveDistribution } from "./readiness.js";

/** @typedef {import("./candidate.js").CandidateFinding} CandidateFinding */

class UsageError extends Error {}

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is string} */
function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
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

/** @param {Buffer} bytes @param {"sha256" | "sha512"} algorithm */
function digestBytes(bytes, algorithm) {
  return `${algorithm}:${createHash(algorithm).update(bytes).digest("hex")}`;
}

/** @param {Buffer} bytes @param {string} field */
function decodeUtf8(bytes, field) {
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    throw new TypeError(`${field} must contain valid UTF-8 text`);
  }
}

/** @param {Buffer} bytes */
function hashCandidateBytes(bytes) {
  if (bytes.length === 0) throw new Error("candidate file is empty");
  return {
    size: bytes.length,
    digests: {
      sha256: digestBytes(bytes, "sha256"),
      sha512: digestBytes(bytes, "sha512"),
    },
  };
}

/**
 * Hash a local file once with both cross-channel algorithms without loading package-sized input into memory.
 *
 * @param {string} path
 * @returns {{size: number, digests: {sha256: string, sha512: string}}}
 */
export function hashCandidateFile(path) {
  const sha256 = createHash("sha256");
  const sha512 = createHash("sha512");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const descriptor = openSync(path, "r");
  let size = 0;
  try {
    for (;;) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      const chunk = buffer.subarray(0, count);
      sha256.update(chunk);
      sha512.update(chunk);
      size += count;
    }
  } finally {
    closeSync(descriptor);
  }
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error(`candidate file is empty: ${path}`);
  return {
    size,
    digests: { sha256: `sha256:${sha256.digest("hex")}`, sha512: `sha512:${sha512.digest("hex")}` },
  };
}

/** @param {readonly string[]} args */
function parseArguments(args) {
  const values = new Map();
  const supported = new Set([
    "--inspection",
    "--install",
    "--quality",
    "--tag",
    "--notes",
    "--output",
  ]);
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (option === undefined || !supported.has(option) || !hasText(value) || values.has(option)) {
      throw new UsageError(
        "usage: node distribution-preparation/prepare-candidate.js --inspection <accepted-report.json> --install <packed-install-report.json> --quality <quality-report.json> --tag <proposed-tag> --notes <release-notes.md> --output <candidate-directory>",
      );
    }
    values.set(option, value);
  }
  if (values.size !== supported.size) {
    throw new UsageError(
      "usage: node distribution-preparation/prepare-candidate.js --inspection <accepted-report.json> --install <packed-install-report.json> --quality <quality-report.json> --tag <proposed-tag> --notes <release-notes.md> --output <candidate-directory>",
    );
  }
  return {
    inspectionPath: resolve(values.get("--inspection")),
    installPath: resolve(values.get("--install")),
    qualityPath: resolve(values.get("--quality")),
    proposedTag: values.get("--tag"),
    notesPath: resolve(values.get("--notes")),
    outputDirectory: resolve(values.get("--output")),
  };
}

/**
 * @param {string} path
 * @param {string} field
 * @param {CandidateFinding[]} findings
 */
function readJsonEvidence(path, field, findings) {
  try {
    const bytes = readFileSync(path);
    const report = JSON.parse(decodeUtf8(bytes, field));
    if (!isRecord(report)) throw new TypeError(`${field} must contain a JSON object`);
    return { bytes, report, rawDigest: digestBytes(bytes, "sha256") };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    addFinding(findings, "missing", `${field}.file`, `could not read ${field} evidence: ${reason}`);
    return undefined;
  }
}

/**
 * Resolve a record-owned relative path beneath its candidate root and reject traversal or absolute aliases.
 *
 * @param {string} root
 * @param {unknown} path
 */
function candidatePath(root, path) {
  if (!hasText(path)) throw new TypeError("candidate-owned path must be a non-empty string");
  const segments = path.split("/");
  if (
    path.includes("\\") ||
    /^[A-Za-z]:/.test(path) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`candidate-owned path is not a canonical portable relative path: ${path}`);
  }
  const absolute = resolve(root, ...segments);
  const fromRoot = relative(root, absolute);
  if (
    fromRoot === "" ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    resolve(path) === path
  ) {
    throw new Error(`candidate-owned path escapes its root: ${path}`);
  }
  return absolute;
}

/**
 * Read one ordinary candidate-owned file without following a recorded symlink or accepting a path alias.
 * The descriptor is checked before and after reading so a replaced final entry cannot be silently consumed.
 *
 * @param {string} root
 * @param {unknown} path
 */
function readCandidateOwnedFile(root, path) {
  const absolute = candidatePath(root, path);
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("candidate root must be an ordinary directory");
  }
  let cursor = root;
  const segments = /** @type {string} */ (path).split("/");
  for (const [index, segment] of segments.entries()) {
    cursor = join(cursor, segment);
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) throw new Error(`candidate-owned path contains a symlink: ${path}`);
    if (index < segments.length - 1 && !stat.isDirectory()) {
      throw new Error(`candidate-owned path has a non-directory parent: ${path}`);
    }
    if (index === segments.length - 1 && !stat.isFile()) {
      throw new Error(`candidate-owned path is not an ordinary file: ${path}`);
    }
  }
  const realRoot = realpathSync(root);
  const realFile = realpathSync(absolute);
  const fromRealRoot = relative(realRoot, realFile);
  if (
    fromRealRoot === "" ||
    fromRealRoot === ".." ||
    fromRealRoot.startsWith(`..${sep}`) ||
    resolve(fromRealRoot) === fromRealRoot
  ) {
    throw new Error(`candidate-owned path resolves outside its root: ${path}`);
  }

  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  const descriptor = openSync(absolute, constants.O_RDONLY | noFollow);
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile()) throw new Error(`candidate-owned path is not an ordinary file: ${path}`);
    if (before.nlink !== 1) {
      throw new Error(`candidate-owned path must not be a hard link: ${path}`);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs
    ) {
      throw new Error(`candidate-owned file changed while it was being read: ${path}`);
    }
    return { path: absolute, bytes };
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Validate a persisted candidate's record, exact archive, evidence copies, notes, and inactive state.
 * Independent corruptions are aggregated rather than hidden by the first failure.
 *
 * @param {string} root
 * @param {unknown} record
 * @returns {CandidateFinding[]}
 */
export function validatePersistedCandidate(root, record) {
  /** @type {CandidateFinding[]} */
  const findings = [];
  if (!isRecord(record)) {
    return [
      {
        kind: "invalid",
        field: "candidate.record",
        detail: "candidate record must be a JSON object",
      },
    ];
  }
  for (const key of Object.keys(record)) {
    if (!["schemaVersion", "status", "candidateId", "distribution", "binding"].includes(key)) {
      addFinding(
        findings,
        "invalid",
        `candidate.record.${key}`,
        `candidate record contains unsupported field ${key}`,
      );
    }
  }
  if (record.schemaVersion !== 1) {
    addFinding(
      findings,
      "invalid",
      "candidate.schemaVersion",
      "candidate schema version must be 1",
    );
  }
  if (record.status !== "prepared") {
    addFinding(findings, "invalid", "candidate.status", "candidate status must be prepared");
  }
  const binding = isRecord(record.binding) ? record.binding : undefined;
  if (binding === undefined) {
    addFinding(findings, "missing", "candidate.binding", "candidate binding is required");
  }
  if (!hasText(record.candidateId)) {
    addFinding(findings, "missing", "candidate.candidateId", "candidate identity is required");
  } else if (binding !== undefined) {
    try {
      if (
        createCandidateIdentity(
          /** @type {Parameters<typeof createCandidateIdentity>[0]} */ (binding),
        ) !== record.candidateId
      ) {
        addFinding(
          findings,
          "inconsistent",
          "candidate.candidateId",
          "candidate identity differs from its recorded binding",
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      addFinding(
        findings,
        "invalid",
        "candidate.binding",
        `candidate binding is malformed: ${reason}`,
      );
    }
  }

  const distribution = isRecord(record.distribution) ? record.distribution : undefined;
  if (!isDeepStrictEqual(distribution, assessInactiveDistribution(undefined))) {
    addFinding(
      findings,
      "invalid",
      "candidate.distribution",
      "candidate must retain the complete inactive readiness result",
    );
  }

  if (binding !== undefined) {
    const artifact = isRecord(binding.artifact) ? binding.artifact : undefined;
    let persistedArtifactPath;
    let persistedArtifactBytes;
    let observedArtifact;
    try {
      const persistedArtifact = readCandidateOwnedFile(root, artifact?.path);
      persistedArtifactPath = persistedArtifact.path;
      persistedArtifactBytes = persistedArtifact.bytes;
      observedArtifact = hashCandidateBytes(persistedArtifact.bytes);
      if (observedArtifact.size !== artifact?.size) {
        addFinding(findings, "inconsistent", "artifact.size", "persisted artifact size differs");
      }
      const digests = isRecord(artifact?.digests) ? artifact.digests : undefined;
      if (observedArtifact.digests.sha256 !== digests?.sha256) {
        addFinding(
          findings,
          "inconsistent",
          "artifact.digests.sha256",
          "persisted artifact SHA-256 differs",
        );
      }
      if (observedArtifact.digests.sha512 !== digests?.sha512) {
        addFinding(
          findings,
          "inconsistent",
          "artifact.digests.sha512",
          "persisted artifact SHA-512 differs",
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      addFinding(
        findings,
        "missing",
        "artifact.file",
        `could not verify persisted artifact: ${reason}`,
      );
    }

    const evidence = isRecord(binding.evidence) ? binding.evidence : undefined;
    /** @type {Record<string, {bytes: Buffer, report: Record<string, unknown>, rawDigest: string}>} */
    const observedEvidence = {};
    for (const name of ["inspection", "quality", "packedInstall"]) {
      const entry = isRecord(evidence?.[name]) ? evidence[name] : undefined;
      try {
        const bytes = readCandidateOwnedFile(root, entry?.path).bytes;
        const rawDigest = digestBytes(bytes, "sha256");
        if (rawDigest !== entry?.rawDigest) {
          addFinding(
            findings,
            "inconsistent",
            `evidence.${name}.rawDigest`,
            `persisted ${name} evidence digest differs`,
          );
        }
        const report = JSON.parse(decodeUtf8(bytes, `evidence.${name}`));
        if (!isRecord(report)) throw new TypeError("evidence must contain a JSON object");
        observedEvidence[name] = { bytes, report, rawDigest };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        addFinding(
          findings,
          "missing",
          `evidence.${name}.file`,
          `could not verify persisted ${name} evidence: ${reason}`,
        );
      }
    }

    const notes = isRecord(binding.releaseNotes) ? binding.releaseNotes : undefined;
    let observedNotes;
    let observedNotesPreview;
    try {
      observedNotes = readCandidateOwnedFile(root, notes?.path).bytes;
      if (digestBytes(observedNotes, "sha256") !== notes?.digest) {
        addFinding(
          findings,
          "inconsistent",
          "releaseNotes.digest",
          "persisted release-note digest differs",
        );
      }
      try {
        observedNotesPreview = decodeUtf8(observedNotes, "releaseNotes.preview");
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        addFinding(findings, "invalid", "releaseNotes.preview", reason);
      }
      if (observedNotesPreview !== undefined && observedNotesPreview !== notes?.preview) {
        addFinding(
          findings,
          "inconsistent",
          "releaseNotes.preview",
          "persisted release-note preview differs",
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      addFinding(
        findings,
        "missing",
        "releaseNotes.file",
        `could not verify persisted release notes: ${reason}`,
      );
    }

    const inspection = observedEvidence.inspection;
    const quality = observedEvidence.quality;
    const packedInstall = observedEvidence.packedInstall;
    if (
      persistedArtifactPath !== undefined &&
      persistedArtifactBytes !== undefined &&
      observedArtifact !== undefined &&
      inspection !== undefined &&
      quality !== undefined &&
      packedInstall !== undefined &&
      observedNotes !== undefined &&
      observedNotesPreview !== undefined
    ) {
      try {
        validateInspectedPackageReport(
          inspection.report,
          inspectPackageArchiveBytes(persistedArtifactBytes),
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        addFinding(
          findings,
          "inconsistent",
          "inspection.archiveBinding",
          `persisted artifact no longer matches inspection evidence: ${reason}`,
        );
      }
      const reevaluated = evaluateCandidateBinding({
        proposedTag: binding.proposedTag,
        artifact: {
          filename: hasText(artifact?.filename)
            ? artifact.filename
            : basename(persistedArtifactPath),
          ...observedArtifact,
        },
        inspection: {
          report: inspection.report,
          rawDigest: inspection.rawDigest,
        },
        quality: { report: quality.report, rawDigest: quality.rawDigest },
        packedInstall: {
          report: packedInstall.report,
          rawDigest: packedInstall.rawDigest,
          frozenArtifact: observedArtifact,
        },
        releaseNotes: {
          preview: observedNotesPreview,
          digest: digestBytes(observedNotes, "sha256"),
        },
      });
      for (const finding of reevaluated.findings) {
        addFinding(findings, finding.kind, finding.field, finding.detail);
      }
      if (reevaluated.binding !== undefined) {
        for (const finding of compareCandidateBindings(
          /** @type {Parameters<typeof compareCandidateBindings>[0]} */ (binding),
          reevaluated.binding,
        )) {
          addFinding(findings, finding.kind, finding.field, finding.detail);
        }
        if (!isDeepStrictEqual(binding, reevaluated.binding)) {
          addFinding(
            findings,
            "inconsistent",
            "candidate.binding",
            "persisted candidate binding differs from its verified canonical binding",
          );
        }
      }
    }
  }

  return findings.sort(({ field: left }, { field: right }) => compareText(left, right));
}

/** @param {string} outputDirectory */
function loadExistingRecord(outputDirectory) {
  const output = lstatSync(outputDirectory);
  if (!output.isDirectory() || output.isSymbolicLink()) {
    throw new Error("candidate output exists but is not an ordinary directory");
  }
  return JSON.parse(
    decodeUtf8(readCandidateOwnedFile(outputDirectory, "candidate.json").bytes, "candidate.record"),
  );
}

/**
 * Load and fully revalidate one persisted inactive candidate for later read-only channel assessment. The
 * returned record is never accepted without the same exact-byte, canonical-binding, inactive-readiness, and
 * candidate-owned path checks used for preparation reruns.
 *
 * @param {string} outputDirectory
 */
export function loadPersistedCandidate(outputDirectory) {
  const root = resolve(outputDirectory);
  const record = loadExistingRecord(root);
  return { record, findings: validatePersistedCandidate(root, record) };
}

/**
 * Claim a fresh destination before moving verified staged entries into it. `candidate.json` moves last and is
 * the visible commit marker; an existing destination, including an empty one created in a race, is never
 * replaced. Every move remains on the same filesystem because staging is adjacent to the destination.
 *
 * @param {string} staging
 * @param {string} outputDirectory
 * @param {() => void} verify
 */
function commitStagedCandidate(staging, outputDirectory, verify) {
  mkdirSync(outputDirectory);
  const moved = [];
  try {
    for (const name of ["artifact", "evidence", "release-notes.md", "candidate.json"]) {
      renameSync(join(staging, name), join(outputDirectory, name));
      moved.push(name);
    }
    verify();
  } catch (error) {
    for (const name of [...moved].reverse()) {
      const installed = join(outputDirectory, name);
      const staged = join(staging, name);
      if (existsSync(installed) && !existsSync(staged)) {
        try {
          renameSync(installed, staged);
        } catch {
          // Preserve an entry that changed concurrently rather than deleting unknown local data.
        }
      }
    }
    try {
      rmdirSync(outputDirectory);
    } catch {
      // A non-empty or concurrently changed destination is deliberately preserved for the next validation.
    }
    throw error;
  }
}

/**
 * @param {string} outputDirectory
 * @param {Record<string, unknown>} record
 * @param {{artifactPath: string, inspection: Buffer, quality: Buffer, packedInstall: Buffer, notes: Buffer}} files
 */
function persistNewCandidate(outputDirectory, record, files) {
  const parent = dirname(outputDirectory);
  mkdirSync(parent, { recursive: true });
  const staging = mkdtempSync(join(parent, `.${basename(outputDirectory)}.staging-`));
  try {
    mkdirSync(join(staging, "artifact"));
    mkdirSync(join(staging, "evidence"));
    const binding = /** @type {{artifact: {path: string}}} */ (record.binding);
    copyFileSync(files.artifactPath, candidatePath(staging, binding.artifact.path));
    writeFileSync(join(staging, "evidence", "inspection.json"), files.inspection);
    writeFileSync(join(staging, "evidence", "quality.json"), files.quality);
    writeFileSync(join(staging, "evidence", "packed-install.json"), files.packedInstall);
    writeFileSync(join(staging, "release-notes.md"), files.notes);
    writeFileSync(join(staging, "candidate.json"), `${JSON.stringify(record, undefined, 2)}\n`);
    const stagedFindings = validatePersistedCandidate(staging, record);
    if (stagedFindings.length > 0) {
      throw new Error(
        `staged candidate verification failed: ${stagedFindings.map(({ field }) => field).join(", ")}`,
      );
    }
    commitStagedCandidate(staging, outputDirectory, () => {
      const persistedFindings = validatePersistedCandidate(outputDirectory, record);
      if (persistedFindings.length > 0) {
        throw new Error(
          `persisted candidate verification failed: ${persistedFindings
            .map(({ field }) => field)
            .join(", ")}`,
        );
      }
    });
  } finally {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * Run local candidate preparation. This entry point performs filesystem reads/writes only and has no Git,
 * GitHub, npm, network, credential, trust, tag, release, asset, or publication capability.
 *
 * @param {readonly string[]} args
 * @param {{write: (chunk: string) => unknown}} stdout
 * @param {{write: (chunk: string) => unknown}} stderr
 * @returns {0 | 1 | 2}
 */
export function runCandidatePreparation(args, stdout, stderr) {
  try {
    const options = parseArguments(args);
    /** @type {CandidateFinding[]} */
    const findings = [];
    const inspection = readJsonEvidence(options.inspectionPath, "inspection", findings);
    const packedInstall = readJsonEvidence(options.installPath, "packedInstall", findings);
    const quality = readJsonEvidence(options.qualityPath, "quality", findings);
    let notes;
    let notesPreview;
    try {
      notes = readFileSync(options.notesPath);
      try {
        notesPreview = decodeUtf8(notes, "releaseNotes.preview");
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        addFinding(findings, "invalid", "releaseNotes.preview", reason);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      addFinding(
        findings,
        "missing",
        "releaseNotes.file",
        `could not read release notes: ${reason}`,
      );
    }

    let artifactPath;
    let artifact;
    const inspectionArtifact =
      inspection !== undefined && isRecord(inspection.report.artifact)
        ? inspection.report.artifact
        : undefined;
    if (inspection !== undefined && hasText(inspectionArtifact?.path)) {
      artifactPath = resolve(dirname(options.inspectionPath), inspectionArtifact.path);
      try {
        artifact = hashCandidateFile(artifactPath);
        const archive = inspectPackageArchive(artifactPath);
        try {
          validateInspectedPackageReport(inspection.report, archive);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          addFinding(
            findings,
            "inconsistent",
            "inspection.archiveBinding",
            `current archive no longer matches accepted inspection evidence: ${reason}`,
          );
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        addFinding(
          findings,
          "missing",
          "artifact.file",
          `could not inspect candidate artifact: ${reason}`,
        );
      }
    } else {
      addFinding(
        findings,
        "missing",
        "inspection.artifact.path",
        "inspection evidence does not identify an artifact path",
      );
    }

    let frozenArtifact;
    const installArtifact =
      packedInstall !== undefined && isRecord(packedInstall.report.artifact)
        ? packedInstall.report.artifact
        : undefined;
    if (hasText(installArtifact?.frozenPath)) {
      try {
        frozenArtifact = hashCandidateFile(
          resolve(dirname(options.installPath), installArtifact.frozenPath),
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        addFinding(
          findings,
          "missing",
          "packedInstall.frozenArtifact.file",
          `could not verify frozen installed artifact: ${reason}`,
        );
      }
    } else {
      addFinding(
        findings,
        "missing",
        "packedInstall.artifact.frozenPath",
        "packed-install evidence does not identify its frozen artifact",
      );
    }
    if (
      artifactPath !== undefined &&
      hasText(installArtifact?.inspectedPath) &&
      resolve(dirname(options.installPath), installArtifact.inspectedPath) !== artifactPath
    ) {
      addFinding(
        findings,
        "inconsistent",
        "packedInstall.artifact.inspectedPath",
        "packed-install evidence identifies a different inspected artifact path",
      );
    }

    const evaluated = evaluateCandidateBinding({
      proposedTag: options.proposedTag,
      artifact:
        artifact === undefined || artifactPath === undefined
          ? undefined
          : { filename: basename(artifactPath), ...artifact },
      inspection:
        inspection === undefined
          ? undefined
          : { report: inspection.report, rawDigest: inspection.rawDigest },
      packedInstall:
        packedInstall === undefined
          ? undefined
          : {
              report: packedInstall.report,
              rawDigest: packedInstall.rawDigest,
              frozenArtifact,
            },
      quality:
        quality === undefined
          ? undefined
          : { report: quality.report, rawDigest: quality.rawDigest },
      releaseNotes:
        notes === undefined
          ? undefined
          : { preview: notesPreview, digest: digestBytes(notes, "sha256") },
    });
    for (const finding of evaluated.findings) {
      addFinding(findings, finding.kind, finding.field, finding.detail);
    }
    findings.sort(({ field: left }, { field: right }) => compareText(left, right));
    if (
      findings.length > 0 ||
      evaluated.binding === undefined ||
      artifactPath === undefined ||
      inspection === undefined ||
      packedInstall === undefined ||
      quality === undefined ||
      notes === undefined
    ) {
      stdout.write(
        `${JSON.stringify({ status: "rejected", releaseEligibility: "ineligible", findings }, undefined, 2)}\n`,
      );
      return 1;
    }

    const distribution = assessInactiveDistribution(undefined);
    const candidateId = createCandidateIdentity(evaluated.binding);
    const record = {
      schemaVersion: 1,
      status: "prepared",
      candidateId,
      distribution,
      binding: evaluated.binding,
    };
    let outcome = "created";
    if (existsSync(options.outputDirectory)) {
      let recorded;
      try {
        recorded = loadExistingRecord(options.outputDirectory);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        addFinding(findings, "invalid", "candidate.record", reason);
      }
      if (isRecord(recorded)) {
        const persistedFindings = validatePersistedCandidate(options.outputDirectory, recorded);
        for (const finding of persistedFindings) {
          addFinding(findings, finding.kind, finding.field, finding.detail);
        }
        if (isRecord(recorded.binding)) {
          try {
            for (const finding of compareCandidateBindings(
              /** @type {Parameters<typeof compareCandidateBindings>[0]} */ (recorded.binding),
              evaluated.binding,
            )) {
              addFinding(findings, finding.kind, finding.field, finding.detail);
            }
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            addFinding(
              findings,
              "invalid",
              "candidate.binding",
              `recorded binding is malformed: ${reason}`,
            );
          }
        }
      }
      findings.sort(({ field: left }, { field: right }) => compareText(left, right));
      if (findings.length > 0 || !isRecord(recorded)) {
        stdout.write(
          `${JSON.stringify({ status: "rejected", releaseEligibility: "ineligible", findings }, undefined, 2)}\n`,
        );
        return 1;
      }
      outcome = "reused";
      const existingRecord = /** @type {typeof record} */ (recorded);
      record.schemaVersion = existingRecord.schemaVersion;
      record.status = existingRecord.status;
      record.candidateId = existingRecord.candidateId;
      record.distribution = existingRecord.distribution;
      record.binding = existingRecord.binding;
    } else {
      try {
        persistNewCandidate(options.outputDirectory, record, {
          artifactPath,
          inspection: inspection.bytes,
          quality: quality.bytes,
          packedInstall: packedInstall.bytes,
          notes,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        addFinding(
          findings,
          "invalid",
          "candidate.output",
          `could not persist a fresh candidate without overwriting local state: ${reason}`,
        );
        stdout.write(
          `${JSON.stringify({ status: "rejected", releaseEligibility: "ineligible", findings }, undefined, 2)}\n`,
        );
        return 1;
      }
    }

    stdout.write(
      `${JSON.stringify(
        {
          status: "prepared",
          outcome,
          candidateId: record.candidateId,
          recordPath: join(options.outputDirectory, "candidate.json"),
          artifactPath: candidatePath(options.outputDirectory, record.binding.artifact.path),
          binding: record.binding,
          distribution: record.distribution,
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
    stderr.write(`could not prepare inactive candidate: ${reason}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  process.exitCode = runCandidatePreparation(process.argv.slice(2), process.stdout, process.stderr);
}
