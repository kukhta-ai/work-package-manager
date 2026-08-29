#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compareText } from "./assessment-contract.js";
import { readAssessmentJson } from "./assessment-files.js";
import { assessGitHubStaging, GitHubAssessmentInputError } from "./github-assessment.js";
import { loadPersistedCandidate } from "./prepare-candidate.js";

/** @typedef {import("./candidate.js").CandidateFinding} CandidateFinding */

class UsageError extends Error {}

/** @param {unknown} value @returns {value is string} */
function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
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
    const policy = readAssessmentJson(options.policyPath, "policy", findings);
    const observation = readAssessmentJson(options.observationPath, "observation", findings);
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
