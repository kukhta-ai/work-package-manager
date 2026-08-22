#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertKnownFields, compareText, requiredRecord } from "./assessment-contract.js";
import { readAssessmentJson } from "./assessment-files.js";
import {
  ConvergenceAssessmentInputError,
  classifyConvergentState,
} from "./convergence-assessment.js";
import { loadPersistedCandidate } from "./prepare-candidate.js";

/** @typedef {import("./candidate.js").CandidateFinding} CandidateFinding */

class UsageError extends Error {}

/** @param {unknown} value @returns {value is string} */
function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** @param {readonly string[]} args */
function parseArguments(args) {
  const supported = new Set(["--candidate", "--policy", "--github-assessment", "--npm-assessment"]);
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (option === undefined || !supported.has(option) || !hasText(value) || values.has(option)) {
      throw new UsageError(
        "usage: node distribution-preparation/assess-convergence.js --candidate <candidate-directory> --policy <convergence-policy.json> --github-assessment <github-assessment.json> --npm-assessment <npm-assessment.json>",
      );
    }
    values.set(option, value);
  }
  if (values.size !== supported.size) {
    throw new UsageError(
      "usage: node distribution-preparation/assess-convergence.js --candidate <candidate-directory> --policy <convergence-policy.json> --github-assessment <github-assessment.json> --npm-assessment <npm-assessment.json>",
    );
  }
  return {
    candidateDirectory: resolve(values.get("--candidate")),
    policyPath: resolve(values.get("--policy")),
    githubPath: resolve(values.get("--github-assessment")),
    npmPath: resolve(values.get("--npm-assessment")),
  };
}

/** @param {unknown} value @param {"github" | "npm"} channel */
function assessmentFromEnvelope(value, channel) {
  const envelope = requiredRecord(value, channel);
  assertKnownFields(envelope, ["status", "assessment"], channel);
  if (envelope.status !== "assessed") {
    throw new TypeError(`${channel}.status must be assessed`);
  }
  return requiredRecord(envelope.assessment, `${channel}.assessment`);
}

/**
 * Combine the exact persisted candidate with named local policy and reviewed channel-assessment files. The
 * adapter performs stable reads only and exposes no Git, GitHub, npm, network, credential, publication, or
 * activation capability.
 *
 * @param {readonly string[]} args
 * @param {{write: (chunk: string) => unknown}} stdout
 * @param {{write: (chunk: string) => unknown}} stderr
 * @param {{loadCandidate?: typeof loadPersistedCandidate}=} dependencies
 * @returns {0 | 1 | 2}
 */
export function runConvergenceAssessment(args, stdout, stderr, dependencies = {}) {
  try {
    const options = parseArguments(args);
    /** @type {CandidateFinding[]} */
    const findings = [];
    /** @type {unknown} */
    let candidate;
    try {
      const loaded = (dependencies.loadCandidate ?? loadPersistedCandidate)(
        options.candidateDirectory,
      );
      candidate = loaded.record;
      findings.push(...loaded.findings);
    } catch (error) {
      findings.push({
        kind: "invalid",
        field: "candidate.file",
        detail: `could not load persisted candidate: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    const policy = readAssessmentJson(options.policyPath, "policy", findings);
    const githubEnvelope = readAssessmentJson(options.githubPath, "github", findings);
    const npmEnvelope = readAssessmentJson(options.npmPath, "npm", findings);
    /** @type {unknown} */
    let github;
    /** @type {unknown} */
    let npm;
    for (const [channelValue, envelope] of [
      ["github", githubEnvelope],
      ["npm", npmEnvelope],
    ]) {
      const channel = /** @type {"github" | "npm"} */ (channelValue);
      if (envelope === undefined) continue;
      try {
        const assessment = assessmentFromEnvelope(envelope, channel);
        if (channel === "github") github = assessment;
        else npm = assessment;
      } catch (error) {
        findings.push({
          kind: "invalid",
          field: channel,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }

    let result;
    try {
      result = classifyConvergentState({ candidate, policy, github, npm });
    } catch (error) {
      /** @type {CandidateFinding[]} */
      const assessmentFindings =
        error instanceof ConvergenceAssessmentInputError
          ? error.issues
              .filter(({ field }) => {
                if (field === "candidate") return candidate !== undefined;
                if (field === "policy") return policy !== undefined;
                if (field === "github") return github !== undefined;
                return npm !== undefined;
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
    if (uniqueFindings.length > 0 || result === undefined) {
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
    stdout.write(`${JSON.stringify({ status: "classified", result }, undefined, 2)}\n`);
    return 0;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof UsageError) {
      stderr.write(`${reason}\n`);
      return 2;
    }
    stderr.write(`could not classify dual-channel state: ${reason}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  process.exitCode = runConvergenceAssessment(
    process.argv.slice(2),
    process.stdout,
    process.stderr,
  );
}
