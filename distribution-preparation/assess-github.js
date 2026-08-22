#!/usr/bin/env node

import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";
import { assessGitHubStaging, GitHubAssessmentInputError } from "./github-assessment.js";
import { loadPersistedCandidate } from "./prepare-candidate.js";

/** @typedef {import("./candidate.js").CandidateFinding} CandidateFinding */

class UsageError extends Error {}

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

/** @param {unknown} value @returns {value is string} */
function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** @param {string} left @param {string} right */
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** @param {import("node:fs").Stats} left @param {import("node:fs").Stats} right */
function sameFile(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs
  );
}

/**
 * Read one caller-owned policy or observation as a stable ordinary file. Explicit paths may live anywhere,
 * but links and path swaps are rejected so the bytes assessed cannot silently differ from the named input.
 *
 * @param {string} path
 * @param {"policy" | "observation"} field
 */
function readOrdinaryFile(path, field) {
  const pathStat = lstatSync(path);
  if (pathStat.isSymbolicLink()) throw new Error(`${field} input must not be a symbolic link`);
  if (!pathStat.isFile()) throw new Error(`${field} input must be an ordinary file`);
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || !sameFile(pathStat, before)) {
      throw new Error(`${field} input changed while it was opened`);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (!sameFile(before, after)) throw new Error(`${field} input changed while it was read`);
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

/** @param {readonly string[]} args */
function parseArguments(args) {
  const supported = new Set(["--candidate", "--policy", "--observation"]);
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (option === undefined || !supported.has(option) || !hasText(value) || values.has(option)) {
      throw new UsageError(
        "usage: node distribution-preparation/assess-github.js --candidate <candidate-directory> --policy <github-policy.json> --observation <github-observation.json>",
      );
    }
    values.set(option, value);
  }
  if (values.size !== supported.size) {
    throw new UsageError(
      "usage: node distribution-preparation/assess-github.js --candidate <candidate-directory> --policy <github-policy.json> --observation <github-observation.json>",
    );
  }
  return {
    candidateDirectory: resolve(values.get("--candidate")),
    policyPath: resolve(values.get("--policy")),
    observationPath: resolve(values.get("--observation")),
  };
}

/**
 * @param {string} path
 * @param {"policy" | "observation"} field
 * @param {CandidateFinding[]} findings
 */
function readJson(path, field, findings) {
  try {
    const decoded = UTF8_DECODER.decode(readOrdinaryFile(path, field));
    const value = JSON.parse(decoded);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError(`${field} must contain a JSON object`);
    }
    return value;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    findings.push({
      kind: "invalid",
      field: `${field}.file`,
      detail: `could not read ${field} input: ${reason}`,
    });
    return undefined;
  }
}

/**
 * Run one local GitHub staging assessment. This adapter reads only the supplied candidate, policy, and
 * observation files; it has no Git, GitHub, network, credential, release, asset, or activation capability.
 *
 * @param {readonly string[]} args
 * @param {{write: (chunk: string) => unknown}} stdout
 * @param {{write: (chunk: string) => unknown}} stderr
 * @param {{loadCandidate?: typeof loadPersistedCandidate}=} dependencies
 * @returns {0 | 1 | 2}
 */
export function runGitHubAssessment(args, stdout, stderr, dependencies = {}) {
  try {
    const options = parseArguments(args);
    /** @type {CandidateFinding[]} */
    const findings = [];
    let candidate;
    try {
      const loaded = (dependencies.loadCandidate ?? loadPersistedCandidate)(
        options.candidateDirectory,
      );
      candidate = loaded.record;
      findings.push(...loaded.findings);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      findings.push({
        kind: "invalid",
        field: "candidate.file",
        detail: `could not load persisted candidate: ${reason}`,
      });
    }
    const policy = readJson(options.policyPath, "policy", findings);
    const observation = readJson(options.observationPath, "observation", findings);
    findings.sort(({ field: left }, { field: right }) => compareText(left, right));
    if (
      findings.length > 0 ||
      candidate === undefined ||
      policy === undefined ||
      observation === undefined
    ) {
      stdout.write(
        `${JSON.stringify({ status: "rejected", releaseEligibility: "ineligible", findings }, undefined, 2)}\n`,
      );
      return 1;
    }

    try {
      const assessment = assessGitHubStaging({ candidate, policy, observation });
      stdout.write(`${JSON.stringify({ status: "assessed", assessment }, undefined, 2)}\n`);
      return 0;
    } catch (error) {
      const assessmentFindings =
        error instanceof GitHubAssessmentInputError
          ? error.issues
              .map(({ field, detail }) => ({ kind: "invalid", field, detail }))
              .sort(({ field: left }, { field: right }) => compareText(left, right))
          : [
              {
                kind: "invalid",
                field: "assessment.input",
                detail: error instanceof Error ? error.message : String(error),
              },
            ];
      stdout.write(
        `${JSON.stringify(
          {
            status: "rejected",
            releaseEligibility: "ineligible",
            findings: assessmentFindings,
          },
          undefined,
          2,
        )}\n`,
      );
      return 1;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof UsageError) {
      stderr.write(`${reason}\n`);
      return 2;
    }
    stderr.write(`could not assess GitHub staging: ${reason}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  process.exitCode = runGitHubAssessment(process.argv.slice(2), process.stdout, process.stderr);
}
