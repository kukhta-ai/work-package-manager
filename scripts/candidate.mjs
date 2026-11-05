#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readAssessmentJson } from "../distribution-preparation/assessment-files.js";
import {
  loadPersistedCandidate,
  runCandidatePreparation,
} from "../distribution-preparation/prepare-candidate.js";
import {
  resolveNpmInvocation,
  runPackageBoundaryPreparation,
} from "../distribution-preparation/prepare-package.js";
import {
  captureOrdinaryArchive,
  runPackedInstallVerification,
  validateNpmCacheArchive,
} from "../distribution-preparation/verify-packed-install.js";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** @param {string | Buffer} bytes */
export function digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
/** @param {string} path @returns {unknown} */
function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
/** @param {string} executable @param {readonly string[]} args @param {string} root @param {boolean} inherit */
function execute(executable, args, root, inherit = false) {
  const result = spawnSync(executable, [...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 3_600_000,
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0 || result.error)
    throw new Error(
      `${executable} ${args.join(" ")} failed: ${result.error?.message ?? result.stderr ?? result.status}`,
    );
  return (result.stdout ?? "").trim();
}
/** @param {string} root */
function revision(root) {
  return execute("git", ["rev-parse", "--verify", "HEAD^{commit}"], root);
}
/** Resolve existing ancestors before checking an output that may not exist yet.
 * @param {string} root @param {string} output
 */
export function assertCandidateOutput(root, output) {
  let ancestor = resolve(output);
  /** @type {string[]} */
  const missing = [];
  while (!lstatSync(ancestor, { throwIfNoEntry: false })) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error("candidate output has no existing ancestor");
    missing.unshift(basename(ancestor));
    ancestor = parent;
  }
  const canonical = resolve(realpathSync(ancestor), ...missing);
  const inside = relative(realpathSync(root), canonical);
  if (inside === "" || (!inside.startsWith(`..${sep}`) && inside !== ".." && !isAbsolute(inside)))
    throw new Error("candidate output must be outside the source checkout");
}
/** @param {string} root @param {string} sourceRevision @param {string} lockfileDigest */
export function assertUnchangedSource(root, sourceRevision, lockfileDigest) {
  if (
    revision(root) !== sourceRevision ||
    digest(readFileSync(join(root, "package-lock.json"))) !== lockfileDigest ||
    execute("git", ["status", "--porcelain=v1", "--untracked-files=all"], root)
  )
    throw new Error("source changed during qualification");
}
/** @param {(out: {write: (value: string) => void}, err: {write: (value: string) => void}) => number} action @returns {Record<string, unknown>} */
function capture(action) {
  let stdout = "";
  let stderr = "";
  const status = action(
    {
      write: (value) => {
        stdout += value;
      },
    },
    {
      write: (value) => {
        stderr += value;
      },
    },
  );
  if (status !== 0) throw new Error(stderr || stdout || `candidate step failed (${status})`);
  const value = /** @type {unknown} */ (JSON.parse(stdout));
  if (!record(value)) throw new Error("candidate step did not return a JSON object");
  return value;
}
/** Inspect the exact tarball with the lockfile-pinned publint CLI; tarball mode never repacks.
 * @param {string} root @param {string} archive
 */
export function publintArchive(root, archive) {
  const manifest = json(join(root, "package.json"));
  const installed = json(join(root, "node_modules", "publint", "package.json"));
  if (
    !record(manifest) ||
    !record(manifest.devDependencies) ||
    typeof manifest.devDependencies.publint !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(manifest.devDependencies.publint) ||
    !record(installed) ||
    installed.version !== manifest.devDependencies.publint
  )
    throw new Error("publint must be installed at its exact local dependency pin");
  return execute(
    process.execPath,
    [join(root, "node_modules", "publint", "src", "cli.js"), archive, "--strict"],
    dirname(archive),
  );
}

/** @param {Record<string, unknown>} value @param {readonly string[]} allowed */
function closedFields(value, allowed) {
  if (Object.keys(value).some((field) => !allowed.includes(field)))
    throw new Error("qualification contains unsupported fields");
}
/** Read candidate-owned qualification evidence without following links or accepting a changing file.
 * @param {string} output @returns {unknown}
 */
function readQualification(output) {
  const path = join(output, "qualification.json");
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1)
    throw new Error("qualification must be an ordinary candidate-owned file");
  /** @type {Array<{kind: string, field: string, detail: string}>} */
  const findings = [];
  const parsed = readAssessmentJson(path, "qualification", findings);
  const after = lstatSync(path);
  if (
    findings.length ||
    !after.isFile() ||
    after.isSymbolicLink() ||
    after.nlink !== 1 ||
    before.ino !== after.ino ||
    before.dev !== after.dev ||
    before.size !== after.size ||
    before.ctimeMs !== after.ctimeMs ||
    before.mtimeMs !== after.mtimeMs
  )
    throw new Error(`qualification evidence changed or is unreadable: ${JSON.stringify(findings)}`);
  return parsed;
}

/**
 * Verify the compact qualification envelope against exact candidate bytes; no rebuild, scripts or network.
 * @param {unknown} envelope @param {{candidateId: string, candidateDigest: string, sourceRevision: string}} expected
 */
export function validateQualification(envelope, expected) {
  if (!record(envelope) || !record(envelope.binding))
    throw new Error("candidate qualification is missing");
  closedFields(envelope, ["qualificationId", "binding"]);
  const binding = envelope.binding;
  closedFields(binding, [
    "schemaVersion",
    "candidateId",
    "candidateDigest",
    "sourceRevision",
    "distribution",
    "qualityCommand",
    "toolchain",
  ]);
  if (envelope.qualificationId !== digest(JSON.stringify(binding)))
    throw new Error("qualification integrity differs");
  if (
    binding.schemaVersion !== 1 ||
    binding.distribution !== "inactive" ||
    binding.qualityCommand !== "npm run quality:release"
  ) {
    throw new Error("qualification policy differs or public distribution is active");
  }
  if (
    binding.candidateId !== expected.candidateId ||
    binding.candidateDigest !== expected.candidateDigest ||
    binding.sourceRevision !== expected.sourceRevision
  ) {
    throw new Error("qualification does not describe this exact source and candidate");
  }
  if (
    !record(binding.toolchain) ||
    typeof binding.toolchain.node !== "string" ||
    typeof binding.toolchain.npm !== "string" ||
    !/^\d+\.\d+\.\d+/.test(binding.toolchain.node) ||
    !/^\d+\.\d+\.\d+/.test(binding.toolchain.npm) ||
    typeof binding.toolchain.platform !== "string" ||
    typeof binding.toolchain.arch !== "string" ||
    typeof binding.toolchain.lockfileDigest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(binding.toolchain.lockfileDigest)
  ) {
    throw new Error("qualification toolchain evidence is incomplete");
  }
  closedFields(binding.toolchain, ["node", "npm", "platform", "arch", "lockfileDigest"]);
  return binding;
}
/** @param {readonly unknown[]} values */
function canonicalPeerIdentities(values) {
  const identities = values.map((value) => {
    if (
      !record(value) ||
      typeof value.name !== "string" ||
      typeof value.version !== "string" ||
      typeof value.integrity !== "string" ||
      !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(value.integrity)
    )
      throw new Error("candidate explicit peer identity is incomplete");
    return { name: value.name, version: value.version, integrity: value.integrity };
  });
  if (new Set(identities.map(({ name }) => name)).size !== identities.length)
    throw new Error("candidate explicit peer identities are duplicated");
  return identities.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
}

/** A preparation request must retain the exact qualified peer selection, independent of input paths.
 * @param {readonly unknown[]} requested
 * @param {unknown} report
 * @param {string} lockfileDigest
 */
export function assertPeerQualificationAffinity(requested, report, lockfileDigest) {
  if (!record(report) || !record(report.installation))
    throw new Error("persisted packed-install evidence is missing");
  const selection = report.installation.explicitPeers;
  /** @type {unknown[]} */
  let observed = [];
  if (selection !== undefined) {
    if (
      !record(selection) ||
      selection.lockfileDigest !== lockfileDigest ||
      !Array.isArray(selection.packages) ||
      !selection.packages.length ||
      selection.packages.some((peer) => !record(peer) || peer.observedVersion !== peer.version)
    )
      throw new Error(
        "persisted explicit peer selection is incomplete or binds a different lockfile",
      );
    observed = selection.packages;
  }
  if (
    JSON.stringify(canonicalPeerIdentities(requested)) !==
    JSON.stringify(canonicalPeerIdentities(observed))
  )
    throw new Error(
      "existing candidate peer qualification differs; choose a fresh output, never overwrite approval bytes",
    );
}

/** Rehash the stable persisted report against the already verified candidate binding.
 * @param {string} output @param {unknown} candidateRecord
 */
function readPersistedPeerEvidence(output, candidateRecord) {
  const evidence =
    record(candidateRecord) &&
    record(candidateRecord.binding) &&
    record(candidateRecord.binding.evidence)
      ? candidateRecord.binding.evidence.packedInstall
      : undefined;
  if (
    !record(evidence) ||
    evidence.path !== "evidence/packed-install.json" ||
    typeof evidence.rawDigest !== "string"
  )
    throw new Error("persisted packed-install evidence binding is missing");
  for (const path of [output, join(output, "evidence")]) {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("persisted packed-install evidence must remain candidate-owned");
  }
  const bytes = captureOrdinaryArchive(join(output, "evidence/packed-install.json"));
  if (digest(bytes) !== evidence.rawDigest)
    throw new Error("persisted packed-install evidence differs from its immutable digest");
  return /** @type {unknown} */ (JSON.parse(bytes.toString("utf8")));
}
/** @param {string} output */
function verifiedCandidateState(output) {
  const loaded = loadPersistedCandidate(output);
  if (
    loaded.findings.length ||
    !record(loaded.record) ||
    !record(loaded.record.binding) ||
    typeof loaded.record.candidateId !== "string" ||
    typeof loaded.record.binding.sourceRevision !== "string"
  ) {
    throw new Error(`candidate failed exact-byte verification: ${JSON.stringify(loaded.findings)}`);
  }
  const candidateBytes = captureOrdinaryArchive(join(output, "candidate.json"));
  const capturedRecord = /** @type {unknown} */ (JSON.parse(candidateBytes.toString("utf8")));
  if (JSON.stringify(capturedRecord) !== JSON.stringify(loaded.record))
    throw new Error("candidate record changed after exact-byte verification");
  const binding = validateQualification(readQualification(output), {
    candidateId: loaded.record.candidateId,
    candidateDigest: digest(candidateBytes),
    sourceRevision: loaded.record.binding.sourceRevision,
  });
  return {
    record: loaded.record,
    qualification: binding,
    result: {
      status: "verified",
      candidateId: loaded.record.candidateId,
      sourceRevision: binding.sourceRevision,
      distribution: "inactive",
      artifact: loaded.record.binding.artifact,
    },
  };
}
/** @param {string} output */
export function verifyCandidate(output) {
  return verifiedCandidateState(output).result;
}
/** @param {readonly string[]} args */
function argumentsFor(args) {
  const [command, ...rest] = args;
  /** @type {Map<string, string>} */
  const values = new Map();
  /** @type {string[]} */
  const npmCacheArchives = [];
  /** @type {string[]} */
  const peerArchives = [];
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (
      !key ||
      !["--output", "--notes", "--npm-cache-archive", "--peer-archive"].includes(key) ||
      !value ||
      (key !== "--npm-cache-archive" && key !== "--peer-archive" && values.has(key))
    )
      throw new Error(
        "usage: candidate prepare --output <outside-checkout> --notes <release-notes> [--npm-cache-archive <locked-upstream.tgz>]... [--peer-archive <locked-peer.tgz>]...; candidate verify --output <directory>",
      );
    if (key === "--npm-cache-archive") npmCacheArchives.push(resolve(value));
    else if (key === "--peer-archive") peerArchives.push(resolve(value));
    else values.set(key, value);
  }
  const output = values.get("--output");
  if (!output || (command !== "prepare" && command !== "verify"))
    throw new Error("candidate needs prepare|verify and --output");
  const notes = values.get("--notes");
  if (command === "prepare" && !notes) throw new Error("candidate preparation requires --notes");
  if (command === "verify" && notes) throw new Error("candidate verification takes only --output");
  if (command === "verify" && (npmCacheArchives.length || peerArchives.length))
    throw new Error("candidate verification takes only --output");
  return {
    command,
    output: resolve(output),
    notes: notes ? resolve(notes) : undefined,
    npmCacheArchives,
    peerArchives,
  };
}
/**
 * Qualify a clean committed revision, pack once, verify that archive in a fresh consumer, and persist inactive evidence.
 * @param {readonly string[]} args @param {string} root
 */
export function runCandidate(args, root = SOURCE_ROOT) {
  const options = argumentsFor(args);
  if (options.command === "verify") return verifyCandidate(options.output);
  assertCandidateOutput(root, options.output);
  if (execute("git", ["status", "--porcelain=v1", "--untracked-files=all"], root))
    throw new Error("candidate requires a clean committed checkout");
  const sourceRevision = revision(root);
  const lockBytes = readFileSync(join(root, "package-lock.json"));
  const lockfileDigest = digest(lockBytes);
  const lock = /** @type {unknown} */ (JSON.parse(lockBytes.toString("utf8")));
  /** @param {readonly string[]} paths */
  const captureRequests = (paths) =>
    paths.map((path) => {
      const bytes = captureOrdinaryArchive(path);
      return { bytes, evidence: validateNpmCacheArchive(bytes, lock) };
    });
  const requestedCache = captureRequests(options.npmCacheArchives);
  const requestedPeers = captureRequests(options.peerArchives);
  if (
    new Set(requestedCache.map(({ evidence }) => evidence.integrity)).size !== requestedCache.length
  )
    throw new Error("duplicate npm cache archive bytes were supplied");
  const notesPath = options.notes;
  if (!notesPath) throw new Error("release notes are required");
  if (existsSync(options.output)) {
    const existing = verifiedCandidateState(options.output);
    const verified = existing.result;
    const old = existing.qualification;
    const candidateRecord = existing.record;
    if (
      !record(old.toolchain) ||
      old.toolchain.lockfileDigest !== lockfileDigest ||
      verified.sourceRevision !== sourceRevision ||
      !record(candidateRecord) ||
      !record(candidateRecord.binding) ||
      !record(candidateRecord.binding.releaseNotes) ||
      candidateRecord.binding.releaseNotes.digest !== digest(readFileSync(notesPath))
    )
      throw new Error(
        "existing candidate differs; choose a fresh output, never overwrite approval bytes",
      );
    assertPeerQualificationAffinity(
      requestedPeers.map(({ evidence }) => evidence),
      readPersistedPeerEvidence(options.output, candidateRecord),
      lockfileDigest,
    );
    assertUnchangedSource(root, sourceRevision, lockfileDigest);
    return { ...verified, outcome: "reused" };
  }
  const npm = resolveNpmInvocation();
  const npmVersion = execute(npm.executable, [...npm.argumentPrefix, "--version"], root);
  execute(npm.executable, [...npm.argumentPrefix, "run", "quality:release"], root, true);
  assertUnchangedSource(root, sourceRevision, lockfileDigest);
  const scratch = mkdtempSync(join(tmpdir(), "wpm-candidate-work-"));
  try {
    const inspection = capture((out, err) =>
      runPackageBoundaryPreparation(
        ["--revision", sourceRevision, "--output", join(scratch, "archive")],
        out,
        err,
        root,
      ),
    );
    if (!record(inspection.artifact) || typeof inspection.artifact.path !== "string")
      throw new Error("inspected archive path missing");
    publintArchive(root, inspection.artifact.path);
    const inspectionPath = join(scratch, "inspection.json");
    writeFileSync(inspectionPath, `${JSON.stringify(inspection)}\n`);
    /** @param {typeof requestedCache} captured @param {string} kind */
    const stageRequests = (captured, kind) =>
      captured.map(({ bytes }, index) => {
        const path = join(scratch, `${kind}-${index}.tgz`);
        writeFileSync(path, bytes, { flag: "wx" });
        return path;
      });
    const stagedCache = stageRequests(requestedCache, "cache");
    const stagedPeers = stageRequests(requestedPeers, "peer");
    const install = capture((out, err) =>
      runPackedInstallVerification(
        [
          "--report",
          inspectionPath,
          "--output",
          join(scratch, "consumer"),
          ...stagedCache.flatMap((path) => ["--npm-cache-archive", path]),
          ...stagedPeers.flatMap((path) => ["--peer-archive", path]),
        ],
        out,
        err,
        root,
      ),
    );
    const installPath = join(scratch, "install.json");
    writeFileSync(installPath, `${JSON.stringify(install)}\n`);
    const qualityPath = join(scratch, "quality.json");
    writeFileSync(
      qualityPath,
      `${JSON.stringify({
        status: "accepted",
        sourceRevision,
        checks: [
          { name: "npm run quality:release", status: "passed" },
          { name: "publint exact archive --strict", status: "passed" },
        ],
      })}\n`,
    );
    const manifest = json(join(root, "package.json"));
    if (!record(manifest) || typeof manifest.version !== "string")
      throw new Error("package version missing");
    const packageVersion = manifest.version;
    assertUnchangedSource(root, sourceRevision, lockfileDigest);
    const prepared = capture((out, err) =>
      runCandidatePreparation(
        [
          "--inspection",
          inspectionPath,
          "--install",
          installPath,
          "--quality",
          qualityPath,
          "--tag",
          `v${packageVersion}`,
          "--notes",
          notesPath,
          "--output",
          options.output,
        ],
        out,
        err,
      ),
    );
    const binding = {
      schemaVersion: 1,
      candidateId: prepared.candidateId,
      candidateDigest: digest(readFileSync(join(options.output, "candidate.json"))),
      sourceRevision,
      distribution: "inactive",
      qualityCommand: "npm run quality:release",
      toolchain: {
        node: process.versions.node,
        npm: npmVersion,
        platform: process.platform,
        arch: process.arch,
        lockfileDigest,
      },
    };
    writeFileSync(
      join(options.output, "qualification.json"),
      `${JSON.stringify({ qualificationId: digest(JSON.stringify(binding)), binding }, null, 2)}\n`,
      { flag: "wx" },
    );
    const verified = verifyCandidate(options.output);
    assertUnchangedSource(root, sourceRevision, lockfileDigest);
    return { ...verified, outcome: "prepared" };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(runCandidate(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
