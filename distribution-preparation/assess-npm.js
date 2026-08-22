#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compareText } from "./assessment-contract.js";
import { readAssessmentJson } from "./assessment-files.js";
import { assessNpmPublication, NpmAssessmentInputError } from "./npm-assessment.js";
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
        "usage: node distribution-preparation/assess-npm.js --candidate <candidate-directory> --policy <npm-policy.json> --observation <npm-observation.json>",
      );
    }
    values.set(option, value);
  }
  if (values.size !== supported.size) {
    throw new UsageError(
      "usage: node distribution-preparation/assess-npm.js --candidate <candidate-directory> --policy <npm-policy.json> --observation <npm-observation.json>",
    );
  }
  return {
    candidateDirectory: resolve(values.get("--candidate")),
    policyPath: resolve(values.get("--policy")),
    observationPath: resolve(values.get("--observation")),
  };
}

/**
 * Run one local npm publication assessment. This adapter reads only the exact persisted candidate and named
 * local policy/observation files; it has no registry, credential, publication, tag, owner, trust, or
 * activation capability.
 *
 * @param {readonly string[]} args
 * @param {{write: (chunk: string) => unknown}} stdout
 * @param {{write: (chunk: string) => unknown}} stderr
 * @param {{loadCandidate?: typeof loadPersistedCandidate}=} dependencies
 * @returns {0 | 1 | 2}
 */
export function runNpmAssessment(args, stdout, stderr, dependencies = {}) {
  try {
    const options = parseArguments(args);
    /** @type {CandidateFinding[]} */
    const findings = [];
    /** @type {unknown} */
    let candidate;
    /** @type {unknown} */
    let archive;
    try {
      const loaded = (dependencies.loadCandidate ?? loadPersistedCandidate)(
        options.candidateDirectory,
      );
      candidate = loaded.record;
      archive = loaded.archive;
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
    let assessment;
    try {
      assessment = assessNpmPublication({ candidate, archive, policy, observation });
    } catch (error) {
      /** @type {CandidateFinding[]} */
      const assessmentFindings =
        error instanceof NpmAssessmentInputError
          ? error.issues
              .filter(({ field }) => {
                if (field === "candidate") return candidate !== undefined || archive !== undefined;
                if (field === "policy") return policy !== undefined;
                return observation !== undefined;
              })
              .map(({ field, detail }) => ({ kind: "invalid", field, detail }))
          : [
              {
                kind: "invalid",
                field: "assessment.input",
                detail: error instanceof Error ? error.message : String(error),
              },
            ];
      findings.push(...assessmentFindings);
    }
    findings.sort(
      (left, right) =>
        compareText(left.field, right.field) || compareText(left.detail, right.detail),
    );
    const uniqueFindings = findings.filter(
      (finding, index) =>
        index === 0 ||
        finding.field !== findings[index - 1]?.field ||
        finding.detail !== findings[index - 1]?.detail,
    );
    if (uniqueFindings.length > 0 || assessment === undefined) {
      stdout.write(
        `${JSON.stringify(
          {
            status: "rejected",
            releaseEligibility: "ineligible",
            findings: uniqueFindings,
          },
          undefined,
          2,
        )}\n`,
      );
      return 1;
    }
    stdout.write(`${JSON.stringify({ status: "assessed", assessment }, undefined, 2)}\n`);
    return 0;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof UsageError) {
      stderr.write(`${reason}\n`);
      return 2;
    }
    stderr.write(`could not assess npm publication: ${reason}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  process.exitCode = runNpmAssessment(process.argv.slice(2), process.stdout, process.stderr);
}
