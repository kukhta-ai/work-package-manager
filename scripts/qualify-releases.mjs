#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  captureOrdinaryArchive,
  createIsolatedEnvironment,
} from "../distribution-preparation/verify-packed-install.js";

/** @param {Buffer | string} bytes */
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
/** @param {unknown} value @returns {Record<string, unknown>} */
function object(value) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value));
  return /** @type {Record<string, unknown>} */ (value);
}
/** @param {string} text @returns {Record<string, unknown>} */
function json(text) {
  const value = /** @type {unknown} */ (JSON.parse(text));
  return object(value);
}
/** @param {string} root @returns {Record<string, string>} */
function inventory(root) {
  /** @type {[string, string][]} */
  const files = [];
  /** @param {string} directory @param {string} prefix */
  const visit = (directory, prefix) => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = `${prefix}${item.name}`;
      assert(!item.isSymbolicLink(), "Recipient files must be regular, never links");
      if (item.isDirectory()) visit(join(directory, item.name), `${path}/`);
      else {
        assert(item.isFile());
        files.push([path, sha(readFileSync(join(directory, item.name)))]);
      }
    }
  };
  visit(root, "");
  return Object.fromEntries(files.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Qualify only the supplied installed CLI; never build, pack, install tools or execute package work.
 * @param {string[]} argv
 */
function qualifyReleases(argv) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      "wpm-cli": { type: "string" },
      output: { type: "string" },
      "sdk-archive": { type: "string" },
      "sdk-sha256": { type: "string" },
    },
  });
  const cli = values["wpm-cli"];
  assert(cli && isAbsolute(cli), "Supply --wpm-cli /absolute/installed/wpm/dist/cli.js");
  assert(values.output, "Supply --output <report.json>");
  assert.equal(
    Boolean(values["sdk-archive"]),
    Boolean(values["sdk-sha256"]),
    "Supply both SDK archive and digest",
  );
  const output = resolve(values.output);
  const cliBytes = captureOrdinaryArchive(cli);
  const archivePath = values["sdk-archive"];
  if (archivePath) assert(isAbsolute(archivePath), "SDK archive path must be absolute");
  const sdkBytes = archivePath ? captureOrdinaryArchive(archivePath) : undefined;
  if (sdkBytes) {
    assert(/^[a-f0-9]{64}$/.test(values["sdk-sha256"] ?? ""));
    assert.equal(sha(sdkBytes), values["sdk-sha256"]);
  }
  const peerRequire = createRequire(cli);
  const peerPackagePath = peerRequire.resolve("backlog.md/package.json");
  const peerPackage = json(readFileSync(peerPackagePath, "utf8"));
  const peerCli = join(dirname(peerPackagePath), "cli.js");
  const peerResolver = object(
    /** @type {unknown} */ (peerRequire(join(dirname(peerPackagePath), "resolveBinary.cjs"))),
  );
  assert.equal(typeof peerResolver.resolveBinaryPath, "function");
  const resolveNativePeer = /** @type {() => string} */ (peerResolver.resolveBinaryPath);
  const nativePeer = resolveNativePeer();
  const nativePeerBytes = captureOrdinaryArchive(nativePeer);
  const peerBytes = captureOrdinaryArchive(peerCli);
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "wpm-release-qualification-")));
  const home = join(root, "home"),
    workspace = join(root, "source"),
    artifacts = join(root, "artifacts");
  mkdirSync(home);
  mkdirSync(artifacts);
  /** @type {NodeJS.ProcessEnv} */
  const env = createIsolatedEnvironment({
    home,
    workspace: root,
    cache: join(root, "cache"),
    prefix: root,
    userConfig: join(root, "npmrc"),
    sourceRoot: fileURLToPath(new URL("..", import.meta.url)),
  });
  env.PATH = [dirname(nativePeer), dirname(process.execPath), env.PATH]
    .filter(Boolean)
    .join(delimiter);
  /** @type {[string, string][]} */
  const privateDirectories = [
    ["XDG_CONFIG_HOME", "config"],
    ["XDG_CACHE_HOME", "cache"],
    ["XDG_DATA_HOME", "data"],
    ["APPDATA", "appdata"],
    ["LOCALAPPDATA", "localappdata"],
  ];
  for (const [key, name] of privateDirectories) env[key] = join(home, name);
  /** @type {object[]} */
  const commands = [];
  /** @param {string} bin @param {string[]} args @param {string} cwd */
  const run = (bin, args, cwd = root) =>
    execFileSync(bin, args, {
      cwd,
      env,
      encoding: "utf8",
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
    }).trim();
  /** @param {string} anchor @param {string[]} args @returns {Record<string, unknown>} */
  const invoke = (anchor, args) => {
    const result = json(run(process.execPath, [cli, "vnext", "--root", anchor, ...args]));
    commands.push({ root: anchor, args, result });
    return result;
  };
  /** @param {string} anchor @param {string[]} args @param {RegExp} reason */
  const reject = (anchor, args, reason) => {
    const result = spawnSync(process.execPath, [cli, "vnext", "--root", anchor, ...args], {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 180_000,
    });
    assert(!result.error, result.error?.message);
    assert.notEqual(result.status, 0, "A stale or modified subject must fail");
    assert.match(result.stderr, reason);
    commands.push({
      root: anchor,
      args,
      rejected: true,
      exitStatus: result.status,
      diagnostic: result.stderr.trim(),
    });
  };
  let passed = false;
  try {
    assert.equal(run(process.execPath, [peerCli, "--version"]), peerPackage.version);
    assert.equal(run(nativePeer, ["--version"]), peerPackage.version);
    const tarVersion = run("tar", ["--version"]).split("\n")[0];
    const pythonVersion = run("python3", ["--version"]);
    let sdkFileCount = 0;
    if (sdkBytes && archivePath) {
      const checked = json(
        run("python3", [
          "-c",
          `import sys,tarfile,pathlib,json
archive,installed=sys.argv[1:]
count=0
with tarfile.open(archive,'r:gz') as bundle:
 for member in bundle.getmembers():
  if member.isdir(): continue
  assert member.isfile(), 'SDK archive contains nonordinary entries'
  parts=pathlib.PurePosixPath(member.name).parts
  assert parts and parts[0]=='package' and '..' not in parts, 'Invalid SDK archive path'
  path=pathlib.Path(installed).joinpath(*parts[1:])
  assert path.is_file() and not path.is_symlink(), 'Installed SDK file is missing or aliased: '+str(path)
  assert path.read_bytes()==bundle.extractfile(member).read(), 'Installed SDK bytes differ: '+str(path)
  count+=1
print(json.dumps({'files':count}))`,
          archivePath,
          dirname(dirname(cli)),
        ]),
      );
      assert(typeof checked.files === "number" && checked.files > 0);
      sdkFileCount = checked.files;
    }
    invoke(workspace, ["workspace", "init"]);
    for (const name of ["app", "lib", "author-tools"])
      invoke(workspace, ["package", "create", name]);
    invoke(workspace, ["--package", "lib", "package", "version", "1.0.0"]);
    invoke(workspace, ["--package", "app", "package", "version", "1.0.0"]);
    invoke(workspace, ["--package", "app", "package", "deps", "add", "lib@^1.0.0"]);
    invoke(workspace, ["--package", "app", "package", "deps", "add", "author-tools@*", "--dev"]);
    invoke(workspace, ["--package", "app", "worker-setup", "create", "context"]);
    writeFileSync(
      join(workspace, "packages/app/worker-setup/context/WORKER.md"),
      "# Release qualification context\nRead the selected operation and verify its acceptance criteria.\n",
    );
    invoke(workspace, [
      "--package",
      "app",
      "operation",
      "add",
      "assemble",
      "Produce a portable result",
      "--ac",
      "A readable result matches the selected operation",
      "--setup",
      "context",
    ]);
    invoke(workspace, ["--package", "app", "group", "set", "delivery", "--operation", "assemble"]);
    invoke(workspace, ["--package", "app", "lock"]);
    const legacy = invoke(workspace, ["--package", "app", "build"]);
    assert.equal(typeof legacy.archive, "string");
    const legacySaved = join(artifacts, "legacy.tgz");
    cpSync(join(workspace, "packages/app", String(legacy.archive)), legacySaved);
    const legacySha = sha(captureOrdinaryArchive(legacySaved));
    /** @type {Record<string, object>} */
    const outputs = {};
    /** @type {string[]} */
    const contentDigests = [];
    /** @type {Record<string, string>} */
    let expectedInventory = {};
    for (const format of ["directory", "tgz", "zip"]) {
      const path = join(artifacts, format === "directory" ? "release" : `release.${format}`);
      const built = invoke(workspace, [
        "--package",
        "app",
        "release",
        "build",
        "--format",
        format,
        "--out",
        path,
        "--files",
      ]);
      assert.equal(typeof built.contentDigest, "string");
      contentDigests.push(String(built.contentDigest));
      const before = format === "directory" ? inventory(path) : sha(captureOrdinaryArchive(path));
      const repeat = invoke(workspace, [
        "--package",
        "app",
        "release",
        "build",
        "--format",
        format,
        "--out",
        path,
      ]);
      assert.equal(repeat.reused, true);
      assert.deepEqual(
        format === "directory" ? inventory(path) : sha(captureOrdinaryArchive(path)),
        before,
      );
      if (format === "directory") expectedInventory = inventory(path);
      for (const target of ["codex", "claude-code"])
        for (const opening of ["project", "session"]) {
          const view = invoke(root, [
            "release",
            "view",
            path,
            "--files",
            "--agent-support",
            "--target",
            target,
            "--opening",
            opening,
          ]);
          assert(Array.isArray(view.packages));
          const names = view.packages.map((entry) => object(entry).name).sort();
          assert.deepEqual(names, ["app", "lib"]);
          assert(JSON.stringify(view.packages).includes("assemble"));
          assert(Array.isArray(view.agentSupport) && view.agentSupport.length === 1);
          const support = object(view.agentSupport[0]);
          assert.equal(support.opening, opening);
          assert.equal(support.contextLoaded, false);
          assert.equal(support.authenticated, false);
        }
      const verified = invoke(root, ["release", "verify", path]);
      assert.equal(verified.status, "verified");
      assert.equal(verified.executionOccurred, false);
      const exactDigest = String(verified.artifactDigest ?? verified.contentDigest);
      invoke(root, ["release", "verify", path, "--expected-digest", `sha256:${exactDigest}`]);
      outputs[format] = {
        format,
        path,
        contentDigest: verified.contentDigest,
        artifactDigest: verified.artifactDigest,
        repeatedBytesIdentical: true,
      };
    }
    assert.equal(new Set(contentDigests).size, 1);
    const request = join(root, "review-request");
    invoke(root, ["release", "review", join(artifacts, "release.zip"), "--out", request]);
    const report = json(readFileSync(join(request, "report-template.json"), "utf8"));
    report.reviewer = { name: "External qualification reviewer", identity: "static-fixture" };
    report.completedAt = "2026-11-27T20:00:00.000Z";
    report.findings = [
      {
        severity: "medium",
        path: "AGENTS.md",
        message: "Recipient must select work explicitly",
        evidence: "Root context delegates explicit package/operation selection",
      },
    ];
    report.unknowns = [
      "No model, instruction execution or production authentication was exercised",
    ];
    report.recommendations = ["Review the selected operation before starting work"];
    const reportFile = join(root, "external-review.json");
    writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
    const accepted = invoke(root, [
      "release",
      "review",
      join(artifacts, "release.zip"),
      "--report",
      reportFile,
      "--out",
      join(root, "accepted-review"),
    ]);
    assert.equal(accepted.status, "reviewed");
    assert.deepEqual(accepted.findings, report.findings);
    assert.deepEqual(accepted.unknowns, report.unknowns);
    assert.equal(accepted.reviewerTrust, "unverified");
    invoke(workspace, ["--package", "app", "package", "version", "1.0.1"]);
    invoke(workspace, ["--package", "app", "lock"]);
    const changed = join(root, "changed.zip");
    invoke(workspace, [
      "--package",
      "app",
      "release",
      "build",
      "--format",
      "zip",
      "--out",
      changed,
    ]);
    reject(
      root,
      ["release", "review", changed, "--report", reportFile, "--out", join(root, "stale-review")],
      /subject|digest/i,
    );
    assert(!existsSync(join(root, "stale-review")));
    renameSync(workspace, join(root, "relocated-source"));
    const relocatedArtifacts = join(root, "relocated-artifacts");
    renameSync(artifacts, relocatedArtifacts);
    for (const path of ["release", "release.tgz", "release.zip"])
      invoke(root, ["release", "view", join(relocatedArtifacts, path)]);
    rmSync(join(root, "relocated-source"), { recursive: true });
    for (const path of ["release", "release.tgz", "release.zip"])
      invoke(root, ["release", "verify", join(relocatedArtifacts, path)]);
    const legacyView = invoke(root, ["release", "view", join(relocatedArtifacts, "legacy.tgz")]);
    assert.equal(legacyView.integrity, "unrecorded");
    reject(
      root,
      ["release", "verify", join(relocatedArtifacts, "legacy.tgz")],
      /unrecorded|expected/i,
    );
    invoke(root, [
      "release",
      "verify",
      join(relocatedArtifacts, "legacy.tgz"),
      "--expected-digest",
      legacySha,
    ]);
    const extractedTar = join(root, "recipient-tar"),
      extractedZip = join(root, "recipient-zip");
    mkdirSync(extractedTar);
    mkdirSync(extractedZip);
    run("tar", ["-xzf", join(relocatedArtifacts, "release.tgz"), "-C", extractedTar]);
    run("python3", [
      "-c",
      "import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])",
      join(relocatedArtifacts, "release.zip"),
      extractedZip,
    ]);
    assert.deepEqual(inventory(extractedTar), expectedInventory);
    assert.deepEqual(inventory(extractedZip), expectedInventory);
    assert.deepEqual(inventory(join(relocatedArtifacts, "release")), expectedInventory);
    assert(
      !Object.keys(expectedInventory).some((path) =>
        /(?:^|\/)(?:node_modules|apm_modules|\.wpm-source|wpm-repo-[^/]+)(?:\/|$)/.test(path),
      ),
    );
    assert.deepEqual(captureOrdinaryArchive(cli), cliBytes);
    assert.deepEqual(captureOrdinaryArchive(peerCli), peerBytes);
    assert.deepEqual(captureOrdinaryArchive(nativePeer), nativePeerBytes);
    if (sdkBytes && archivePath) assert.deepEqual(captureOrdinaryArchive(archivePath), sdkBytes);
    const receipt = {
      schemaVersion: 1,
      status: "passed",
      kind: sdkBytes ? "saved-sdk-release-qualification" : "supplied-cli-release-qualification",
      wpmCliSha256: sha(cliBytes),
      ...(sdkBytes ? { sdkArchiveSha256: sha(sdkBytes), sdkInstalledFileCount: sdkFileCount } : {}),
      backlogVersion: peerPackage.version,
      backlogCliSha256: sha(peerBytes),
      backlogNativeSha256: sha(nativePeerBytes),
      outputs,
      sharedContentDigest: contentDigests[0],
      inventory: expectedInventory,
      legacyArchiveSha256: legacySha,
      externalReview: {
        fixtureOnly: true,
        status: accepted.status,
        findings: report.findings,
        unknowns: report.unknowns,
        reviewerTrust: "unverified",
        staleReportRejected: true,
      },
      artifactRelocationQualified: true,
      sourceRemovalQualified: true,
      staticRecipientExtraction: {
        tarVersion,
        pythonVersion,
        tarMatchesDirectory: true,
        zipMatchesDirectory: true,
        requiresWpm: false,
        requiresApm: false,
      },
      commands,
      commandCount: commands.length,
      agentExecution: false,
      authenticationAttempted: false,
      packageWorkExecuted: false,
      distribution: "inactive",
    };
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
    passed = true;
    process.stdout.write(
      `${JSON.stringify({
        status: "passed",
        output,
        sdkArchiveSha256: sdkBytes ? sha(sdkBytes) : undefined,
        commandCount: commands.length,
      })}\n`,
    );
  } catch (error) {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(
      output,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          status: "failed",
          wpmCliSha256: sha(cliBytes),
          ...(sdkBytes ? { sdkArchiveSha256: sha(sdkBytes) } : {}),
          commands,
          commandCount: commands.length,
          error: error instanceof Error ? error.message : String(error),
          agentExecution: false,
          authenticationAttempted: false,
        },
        null,
        2,
      )}\n`,
    );
    throw error;
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (!passed)
      process.stderr.write(`Release qualification failed; report retained at ${output}\n`);
  }
}
qualifyReleases(process.argv.slice(2));
