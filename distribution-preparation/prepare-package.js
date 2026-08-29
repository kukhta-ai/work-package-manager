#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inspectPackageArchive } from "./package-archive.js";
import { collectDeclaredShipSet, evaluatePackageBoundary } from "./package-boundary.js";

const PERMITTED_IGNORED_INPUTS = ["node_modules/", ".husky/_/"];

/**
 * @typedef OutputSink
 * @property {(chunk: string) => unknown} write
 */

class UsageError extends Error {}

/**
 * Resolve npm without asking Windows to execute a `.cmd` file as though it were a native executable. npm
 * exposes its JavaScript entry point to package scripts, so the supported command can execute that entry
 * through the current Node runtime without a shell or command-string interpolation.
 *
 * @param {NodeJS.Platform=} platform
 * @param {string=} npmExecPath
 * @param {string=} nodeExecutable
 * @returns {{executable: string, argumentPrefix: string[]}}
 */
export function resolveNpmInvocation(
  platform = process.platform,
  npmExecPath = process.env.npm_execpath,
  nodeExecutable = process.execPath,
) {
  if (npmExecPath !== undefined && npmExecPath !== "") {
    return { executable: nodeExecutable, argumentPrefix: [npmExecPath] };
  }
  if (platform === "win32") {
    throw new Error(
      "npm executable path is unavailable; run package inspection through `npm run package:inspect`",
    );
  }
  return { executable: "npm", argumentPrefix: [] };
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {readonly string[]} args
 * @returns {{revision: string, outputDirectory: string | undefined}}
 */
function parseArguments(args) {
  let revision = "HEAD";
  let outputDirectory;
  let sawRevision = false;
  let sawOutput = false;

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];
    if (option === "--revision" && !sawRevision && value !== undefined && value !== "") {
      revision = value;
      sawRevision = true;
      index += 1;
    } else if (option === "--output" && !sawOutput && value !== undefined && value !== "") {
      outputDirectory = value;
      sawOutput = true;
      index += 1;
    } else {
      throw new UsageError(
        "usage: node distribution-preparation/prepare-package.js [--revision <git-revision>] [--output <directory>]",
      );
    }
  }
  return { revision, outputDirectory };
}

/**
 * @param {string} executable
 * @param {readonly string[]} args
 * @param {string} cwd
 */
function execute(executable, args, cwd) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || `exit ${String(result.status)}`).trim();
    throw new Error(`${executable} ${args[0] ?? ""} failed: ${detail}`);
  }
  return result.stdout.trim();
}

/** @param {readonly string[]} args @param {string} cwd */
function executeNpm(args, cwd) {
  const invocation = resolveNpmInvocation();
  return execute(invocation.executable, [...invocation.argumentPrefix, ...args], cwd);
}

/** @param {string} sourceRoot @param {string} revision */
function resolveRevision(sourceRoot, revision) {
  return execute(
    "git",
    ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`],
    sourceRoot,
  );
}

/** @param {string} sourceRoot */
function assertCleanCheckout(sourceRoot) {
  const status = execute("git", ["status", "--porcelain=v1", "--untracked-files=all"], sourceRoot);
  if (status !== "") throw new Error(`checkout is not clean:\n${status}`);
}

/** @param {string} sourceRoot */
function assertNoContributorLocalState(sourceRoot) {
  const status = execute(
    "git",
    ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=matching"],
    sourceRoot,
  );
  const unexpected = status
    .split("\0")
    .filter((entry) => entry.startsWith("!! "))
    .map((entry) => entry.slice(3).replaceAll("\\", "/"))
    .filter(
      (path) =>
        !PERMITTED_IGNORED_INPUTS.some(
          (permitted) => path === permitted.slice(0, -1) || path.startsWith(permitted),
        ),
    )
    .sort();
  if (unexpected.length > 0) {
    throw new Error(
      `ignored contributor-local state remains after clean:\n${unexpected.join("\n")}`,
    );
  }
}

/** @param {string} output */
function parsePackedFilename(output) {
  const parsed = JSON.parse(output);
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 1 ||
    !isRecord(parsed[0]) ||
    typeof parsed[0].filename !== "string" ||
    parsed[0].filename === "" ||
    basename(parsed[0].filename) !== parsed[0].filename
  ) {
    throw new Error("npm pack did not report exactly one safe artifact filename");
  }
  return parsed[0].filename;
}

/**
 * Build, pack, and inspect a local npm artifact for one exact clean Git revision. This preparation command
 * has no publication, credential, release, commit, tag, or remote-write capability.
 *
 * @param {readonly string[]} args
 * @param {OutputSink} stdout
 * @param {OutputSink} stderr
 * @param {string=} sourceRoot
 * @returns {0 | 1 | 2}
 */
export function runPackageBoundaryPreparation(args, stdout, stderr, sourceRoot = process.cwd()) {
  try {
    const options = parseArguments(args);
    const checkoutRevision = resolveRevision(sourceRoot, "HEAD");
    const requestedRevision = resolveRevision(sourceRoot, options.revision);
    if (requestedRevision !== checkoutRevision) {
      throw new Error(
        `requested revision ${requestedRevision} does not match checked-out revision ${checkoutRevision}`,
      );
    }
    assertCleanCheckout(sourceRoot);

    executeNpm(["run", "--silent", "clean"], sourceRoot);
    assertCleanCheckout(sourceRoot);
    assertNoContributorLocalState(sourceRoot);

    const outputDirectory =
      options.outputDirectory === undefined
        ? mkdtempSync(join(tmpdir(), "wpm-package-"))
        : resolve(sourceRoot, options.outputDirectory);
    mkdirSync(outputDirectory, { recursive: true });
    const packOutput = executeNpm(
      ["pack", "--json", "--silent", "--pack-destination", outputDirectory],
      sourceRoot,
    );
    assertCleanCheckout(sourceRoot);
    const artifactPath = join(outputDirectory, parsePackedFilename(packOutput));
    const declared = collectDeclaredShipSet(sourceRoot);
    const archive = inspectPackageArchive(artifactPath);
    const boundary = evaluatePackageBoundary({
      sourceRevision: checkoutRevision,
      expectedPaths: declared.expectedPaths,
      actualEntries: archive.entries,
      sourceManifest: declared.manifest,
      packedManifest: archive.packedManifest,
      declarationViolations: declared.declarationViolations,
    });
    assertCleanCheckout(sourceRoot);
    const finalRevision = resolveRevision(sourceRoot, "HEAD");
    if (finalRevision !== checkoutRevision) {
      throw new Error(
        `checked-out revision changed during packaging from ${checkoutRevision} to ${finalRevision}`,
      );
    }
    const report = {
      ...boundary,
      sourceBinding: {
        requestedRevision: options.revision,
        checkoutRevision,
        clean: true,
      },
      artifact: { path: artifactPath, size: archive.archiveSize },
    };
    stdout.write(`${JSON.stringify(report, undefined, 2)}\n`);
    return boundary.status === "accepted" ? 0 : 1;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof UsageError) {
      stderr.write(`${reason}\n`);
      return 2;
    }
    stderr.write(`could not prepare package boundary: ${reason}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  process.exitCode = runPackageBoundaryPreparation(
    process.argv.slice(2),
    process.stdout,
    process.stderr,
  );
}
