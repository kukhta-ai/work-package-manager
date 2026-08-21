#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assessInactiveDistribution } from "./readiness.js";

const EVIDENCE_KINDS = new Set([
  "available",
  "controlled",
  "occupied-incompatible",
  "metadata-only",
]);

/**
 * @typedef OutputSink
 * @property {(chunk: string) => unknown} write
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObjectRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate the nested fields that can be reflected into the machine-readable report. Missing facts are valid
 * incomplete input, but a supplied proposal, authorization, or evidence value must have the declared shape.
 *
 * @param {string} key
 * @param {Record<string, unknown>} fact
 */
function assertActivationFactShape(key, fact) {
  if (fact.proposedValue !== undefined && typeof fact.proposedValue !== "string") {
    throw new TypeError(`activation fact "${key}" proposedValue must be a string`);
  }

  if (fact.authorization !== undefined) {
    if (!isObjectRecord(fact.authorization)) {
      throw new TypeError(`activation fact "${key}" authorization must be a JSON object`);
    }
    if (
      fact.authorization.decision !== "authorized" ||
      typeof fact.authorization.reference !== "string"
    ) {
      throw new TypeError(
        `activation fact "${key}" authorization must contain decision "authorized" and a string reference`,
      );
    }
  }

  if (fact.evidence !== undefined) {
    if (!isObjectRecord(fact.evidence)) {
      throw new TypeError(`activation fact "${key}" evidence must be a JSON object`);
    }
    if (
      typeof fact.evidence.kind !== "string" ||
      !EVIDENCE_KINDS.has(fact.evidence.kind) ||
      typeof fact.evidence.reference !== "string"
    ) {
      throw new TypeError(
        `activation fact "${key}" evidence must contain a supported kind and a string reference`,
      );
    }
  }
}

/**
 * Parse the deliberately small local input envelope without accepting structurally invalid JSON as a missing
 * record. Unknown fact keys remain inert: the classifier reads only its closed inventory.
 *
 * @param {string} source
 * @returns {Parameters<typeof assessInactiveDistribution>[0]}
 */
function parseActivationRecord(source) {
  const record = JSON.parse(source);
  if (!isObjectRecord(record)) {
    throw new TypeError("activation record must be a JSON object");
  }
  if (record.facts !== undefined) {
    if (!isObjectRecord(record.facts)) {
      throw new TypeError('activation record "facts" must be a JSON object');
    }
    for (const [key, fact] of Object.entries(record.facts)) {
      if (!isObjectRecord(fact)) {
        throw new TypeError(`activation fact "${key}" must be a JSON object`);
      }
      assertActivationFactShape(key, fact);
    }
  }
  return record;
}

/**
 * Run the maintainer-only inactive-readiness assessment against an optional caller-supplied local JSON record.
 * The assessment intentionally has no success exit in Story 1.1: a valid report exits 1 because activation is
 * disabled; bad invocation exits 2; malformed or unreadable input exits 1 with a clear diagnostic.
 *
 * @param {readonly string[]} args
 * @param {OutputSink} stdout
 * @param {OutputSink} stderr
 * @returns {0 | 1 | 2}
 */
export function runInactiveReadinessAssessment(args, stdout, stderr) {
  if (args.length > 1) {
    stderr.write(
      "usage: node distribution-preparation/assess-readiness.js [activation-record.json]\n",
    );
    return 2;
  }

  try {
    const record =
      args[0] === undefined
        ? undefined
        : parseActivationRecord(readFileSync(resolve(args[0]), "utf8"));
    const result = assessInactiveDistribution(record);
    stdout.write(`${JSON.stringify(result, undefined, 2)}\n`);
    return 1;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    stderr.write(`could not assess inactive distribution readiness: ${reason}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  process.exitCode = runInactiveReadinessAssessment(
    process.argv.slice(2),
    process.stdout,
    process.stderr,
  );
}
