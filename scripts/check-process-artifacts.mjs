#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, extname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

/** @typedef {{ path: string, code: string, detail: string }} ProcessArtifactViolation */
/** @typedef {Record<string, unknown>} UnknownRecord */

/**
 * @typedef ProcessArtifactPolicy
 * @property {number} schemaVersion
 * @property {{ roots: string[] }} workingMemory
 * @property {string} governanceDocument
 * @property {{ path: string, maxBytes: number, maxLines: number, requiredKeys: string[], allowedKeys: string[] }} state
 * @property {{
 *   evolutionRecords: { root: string, extension: string, schema: string, minCount: number, maxBytes: number },
 *   gateReceipts: { root: string, extension: string, schema: string, minCount: number, maxBytes: number }
 * }} durableEvidence
 * @property {{ allowedSchemes: string[], checksumPattern: string, privacyClasses: string[] }} archivePointers
 */

/**
 * @typedef RepositoryCheckOptions
 * @property {string} repositoryRoot
 * @property {string=} policyPath
 * @property {readonly string[]=} trackedPaths
 * @property {readonly string[]=} unstagedPaths
 * @property {boolean=} requireTrackedEvidence
 */

/**
 * @typedef RepositoryCheckResult
 * @property {boolean} ok
 * @property {ProcessArtifactViolation[]} violations
 * @property {number} trackedPathCount
 * @property {number} evolutionRecordCount
 * @property {number} gateReceiptCount
 */

/** @param {unknown} value @returns {value is UnknownRecord} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {UnknownRecord} value
 * @param {readonly string[]} allowed
 * @param {string} label
 * @param {ProcessArtifactViolation[]} violations
 * @param {string} path
 */
function rejectUnknownKeys(value, allowed, label, violations, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      violations.push({
        path,
        code: "invalid-state-shape",
        detail: `${label}.${key} is not allowed`,
      });
    }
  }
}

/** @param {string} left @param {string} right */
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** @param {ProcessArtifactViolation[]} violations */
function sortViolations(violations) {
  return violations.sort(
    (left, right) =>
      compareText(left.path, right.path) ||
      compareText(left.code, right.code) ||
      compareText(left.detail, right.detail),
  );
}

/**
 * Normalize a repository-relative path without granting authority outside the repository.
 *
 * @param {string} input
 * @returns {string | undefined}
 */
export function normalizeRepositoryPath(input) {
  if (input.length === 0 || input.includes("\0")) return undefined;
  const portable = input.replaceAll("\\", "/");
  if (posix.isAbsolute(portable) || /^[A-Za-z]:/.test(portable)) return undefined;
  const normalized = posix.normalize(portable).replace(/^\.\//, "").replace(/\/$/, "");
  if (
    normalized === "" ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    return undefined;
  }
  return normalized;
}

/** @param {string} path @param {string} root */
function isWithin(path, root) {
  const foldedPath = path.toLocaleLowerCase("en-US");
  const foldedRoot = root.toLocaleLowerCase("en-US");
  return foldedPath === foldedRoot || foldedPath.startsWith(`${foldedRoot}/`);
}

/**
 * Return one violation for every tracked working-memory path.
 *
 * @param {readonly string[]} trackedPaths
 * @param {readonly string[]} workingMemoryRoots
 * @returns {ProcessArtifactViolation[]}
 */
export function validateTrackedWorkingMemory(trackedPaths, workingMemoryRoots) {
  const roots = workingMemoryRoots
    .map(normalizeRepositoryPath)
    .filter((root) => root !== undefined);
  const violations = [];

  for (const rawPath of trackedPaths) {
    const path = normalizeRepositoryPath(rawPath);
    if (path === undefined) {
      violations.push({
        path: rawPath,
        code: "invalid-tracked-path",
        detail: "Git returned a path that is not a portable repository-relative path",
      });
      continue;
    }
    if (roots.some((root) => isWithin(path, root))) {
      violations.push({
        path,
        code: "tracked-working-memory",
        detail: "generated working memory must remain local and ignored",
      });
    }
  }

  return sortViolations(violations);
}

/** @param {string} value */
function isDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** @param {string} value */
function isDateTime(value) {
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (match === null || !isDate(match[1] ?? "")) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  const offsetHour = match[6] === undefined ? 0 : Number(match[6]);
  const offsetMinute = match[7] === undefined ? 0 : Number(match[7]);
  return (
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59 &&
    Number.isFinite(Date.parse(value))
  );
}

/** @param {unknown} value @param {string} expected */
function hasType(value, expected) {
  switch (expected) {
    case "null":
      return value === null;
    case "array":
      return Array.isArray(value);
    case "object":
      return isRecord(value);
    case "integer":
      return Number.isInteger(value);
    default:
      return typeof value === expected;
  }
}

/**
 * Resolve the local `$ref` subset used by the committed durable-evidence schemas.
 *
 * @param {UnknownRecord} rootSchema
 * @param {string} reference
 * @returns {UnknownRecord | undefined}
 */
function resolveLocalReference(rootSchema, reference) {
  if (!reference.startsWith("#/")) return undefined;
  let cursor = /** @type {unknown} */ (rootSchema);
  for (const rawSegment of reference.slice(2).split("/")) {
    const segment = rawSegment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isRecord(cursor) || !(segment in cursor)) return undefined;
    cursor = cursor[segment];
  }
  return isRecord(cursor) ? cursor : undefined;
}

const SUPPORTED_SCHEMA_KEYS = new Set([
  "$schema",
  "$id",
  "$ref",
  "$defs",
  "title",
  "description",
  "type",
  "const",
  "enum",
  "pattern",
  "format",
  "minLength",
  "minItems",
  "items",
  "properties",
  "required",
  "additionalProperties",
]);
const SUPPORTED_SCHEMA_TYPES = new Set([
  "array",
  "boolean",
  "integer",
  "null",
  "number",
  "object",
  "string",
]);

/**
 * Validate the schema language itself so an unsupported or malformed rule cannot silently become a no-op.
 *
 * @param {UnknownRecord} schema
 * @returns {string[]}
 */
export function validateSchemaDefinition(schema) {
  const problems = [];
  const seen = new Set();

  /** @param {UnknownRecord} node @param {string} path */
  const visit = (node, path) => {
    if (seen.has(node)) return;
    seen.add(node);
    for (const key of Object.keys(node)) {
      if (!SUPPORTED_SCHEMA_KEYS.has(key))
        problems.push(`${path}.${key}: unsupported schema keyword`);
    }
    if (typeof node.$ref === "string" && resolveLocalReference(schema, node.$ref) === undefined) {
      problems.push(`${path}.$ref: unresolved local reference ${node.$ref}`);
    } else if ("$ref" in node && typeof node.$ref !== "string") {
      problems.push(`${path}.$ref: must be a string`);
    }

    const types = typeof node.type === "string" ? [node.type] : node.type;
    if (
      types !== undefined &&
      (!Array.isArray(types) ||
        types.length === 0 ||
        types.some((type) => typeof type !== "string" || !SUPPORTED_SCHEMA_TYPES.has(type)) ||
        new Set(types).size !== types.length)
    ) {
      problems.push(`${path}.type: must contain unique supported JSON types`);
    }
    if (node.enum !== undefined && (!Array.isArray(node.enum) || node.enum.length === 0)) {
      problems.push(`${path}.enum: must be a non-empty array`);
    }
    if (node.pattern !== undefined) {
      if (typeof node.pattern !== "string") problems.push(`${path}.pattern: must be a string`);
      else {
        try {
          new RegExp(node.pattern);
        } catch (error) {
          problems.push(
            `${path}.pattern: invalid regular expression (${error instanceof Error ? error.message : String(error)})`,
          );
        }
      }
    }
    if (node.format !== undefined && !["date", "date-time"].includes(String(node.format))) {
      problems.push(`${path}.format: unsupported format ${String(node.format)}`);
    }
    for (const keyword of ["minLength", "minItems"]) {
      if (
        node[keyword] !== undefined &&
        (!Number.isInteger(node[keyword]) || Number(node[keyword]) < 0)
      ) {
        problems.push(`${path}.${keyword}: must be a non-negative integer`);
      }
    }
    if (node.additionalProperties !== undefined && node.additionalProperties !== false) {
      problems.push(`${path}.additionalProperties: only false is supported by this validator`);
    }
    if (node.required !== undefined) {
      if (
        !Array.isArray(node.required) ||
        node.required.some((key) => typeof key !== "string") ||
        new Set(node.required).size !== node.required.length
      ) {
        problems.push(`${path}.required: must contain unique property names`);
      } else if (isRecord(node.properties)) {
        for (const key of node.required) {
          if (!(key in node.properties))
            problems.push(`${path}.required: ${key} has no property schema`);
        }
      }
    }

    for (const [keyword, children] of [
      ["properties", node.properties],
      ["$defs", node.$defs],
    ]) {
      if (children === undefined) continue;
      if (!isRecord(children)) {
        problems.push(`${path}.${keyword}: must be an object of schemas`);
        continue;
      }
      for (const [key, child] of Object.entries(children)) {
        if (!isRecord(child)) problems.push(`${path}.${keyword}.${key}: must be a schema object`);
        else visit(child, `${path}.${keyword}.${key}`);
      }
    }
    if (node.items !== undefined) {
      if (!isRecord(node.items)) problems.push(`${path}.items: must be a schema object`);
      else visit(node.items, `${path}.items`);
    }
  };

  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    problems.push("$.$schema: must declare JSON Schema draft 2020-12");
  }
  visit(schema, "$");
  return problems;
}

/**
 * Validate the deliberately small JSON-Schema subset used by the durable records.
 *
 * @param {unknown} value
 * @param {UnknownRecord} schema
 * @param {string} path
 * @param {UnknownRecord=} rootSchema
 * @returns {string[]}
 */
export function validateSchemaValue(value, schema, path = "$", rootSchema = schema) {
  const problems = [];
  if (typeof schema.$ref === "string") {
    const target = resolveLocalReference(rootSchema, schema.$ref);
    if (target === undefined) return [`${path}: unresolved schema reference ${schema.$ref}`];
    return validateSchemaValue(value, target, path, rootSchema);
  }

  if ("const" in schema && !Object.is(value, schema.const)) {
    problems.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
    return problems;
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => Object.is(entry, value))) {
    problems.push(`${path}: must be one of ${schema.enum.map(String).join(", ")}`);
    return problems;
  }

  const expectedTypes =
    typeof schema.type === "string"
      ? [schema.type]
      : Array.isArray(schema.type)
        ? schema.type.filter((entry) => typeof entry === "string")
        : [];
  if (expectedTypes.length > 0 && !expectedTypes.some((type) => hasType(value, type))) {
    problems.push(`${path}: must have type ${expectedTypes.join(" or ")}`);
    return problems;
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      problems.push(`${path}: must contain at least ${schema.minLength} character(s)`);
    }
    if (typeof schema.pattern === "string") {
      try {
        if (!new RegExp(schema.pattern).test(value)) {
          problems.push(`${path}: does not match ${schema.pattern}`);
        }
      } catch (error) {
        problems.push(
          `${path}: schema pattern is invalid (${error instanceof Error ? error.message : String(error)})`,
        );
      }
    }
    if (schema.format === "date" && !isDate(value))
      problems.push(`${path}: must be a real ISO date`);
    if (schema.format === "date-time" && !isDateTime(value)) {
      problems.push(`${path}: must be an ISO date-time with timezone`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      problems.push(`${path}: must contain at least ${schema.minItems} item(s)`);
    }
    if (isRecord(schema.items)) {
      const itemSchema = schema.items;
      value.forEach((item, index) => {
        problems.push(...validateSchemaValue(item, itemSchema, `${path}[${index}]`, rootSchema));
      });
    }
  }

  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === "string" && !(key in value))
          problems.push(`${path}.${key}: is required`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) problems.push(`${path}.${key}: is not an allowed property`);
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value && isRecord(propertySchema)) {
        problems.push(
          ...validateSchemaValue(value[key], propertySchema, `${path}.${key}`, rootSchema),
        );
      }
    }
  }

  return problems;
}

/** @param {UnknownRecord} value @param {string} key */
function stringArray(value, key) {
  const candidate = value[key];
  return Array.isArray(candidate) && candidate.every((entry) => typeof entry === "string")
    ? candidate
    : undefined;
}

/** @param {UnknownRecord} value @param {readonly string[]} allowed @param {string} label @param {string[]} problems */
function rejectUnknownPolicyKeys(value, allowed, label, problems) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) problems.push(`${label}.${key} is not an allowed policy key`);
  }
}

/**
 * Parse and validate the artifact-policy shape before trusting any paths from it.
 *
 * @param {unknown} value
 * @returns {{ policy?: ProcessArtifactPolicy, problems: string[] }}
 */
export function parseArtifactPolicy(value) {
  /** @type {string[]} */
  const problems = [];
  if (!isRecord(value)) return { problems: ["policy root must be an object"] };
  const workingMemory = value.workingMemory;
  const governanceDocument = value.governanceDocument;
  const state = value.state;
  const durableEvidence = value.durableEvidence;
  const archivePointers = value.archivePointers;

  rejectUnknownPolicyKeys(
    value,
    [
      "schemaVersion",
      "workingMemory",
      "governanceDocument",
      "state",
      "durableEvidence",
      "archivePointers",
    ],
    "policy",
    problems,
  );
  if (value.schemaVersion !== 1) problems.push("schemaVersion must equal 1");
  if (!isRecord(workingMemory) || stringArray(workingMemory, "roots") === undefined) {
    problems.push("workingMemory.roots must be an array of paths");
  }
  if (typeof governanceDocument !== "string") {
    problems.push("governanceDocument must be a repository-relative path");
  }
  if (!isRecord(state)) problems.push("state must be an object");
  if (!isRecord(durableEvidence)) problems.push("durableEvidence must be an object");
  if (!isRecord(archivePointers)) problems.push("archivePointers must be an object");
  if (
    problems.length > 0 ||
    !isRecord(workingMemory) ||
    !isRecord(state) ||
    !isRecord(durableEvidence) ||
    !isRecord(archivePointers)
  ) {
    return { problems };
  }
  rejectUnknownPolicyKeys(workingMemory, ["roots"], "workingMemory", problems);
  rejectUnknownPolicyKeys(
    state,
    ["path", "maxBytes", "maxLines", "requiredKeys", "allowedKeys"],
    "state",
    problems,
  );
  rejectUnknownPolicyKeys(
    durableEvidence,
    ["evolutionRecords", "gateReceipts"],
    "durableEvidence",
    problems,
  );
  rejectUnknownPolicyKeys(
    archivePointers,
    ["allowedSchemes", "checksumPattern", "privacyClasses"],
    "archivePointers",
    problems,
  );

  const evolutionRecords = durableEvidence.evolutionRecords;
  const gateReceipts = durableEvidence.gateReceipts;
  for (const [name, entry] of Object.entries({ evolutionRecords, gateReceipts })) {
    if (
      !isRecord(entry) ||
      typeof entry.root !== "string" ||
      typeof entry.extension !== "string" ||
      typeof entry.schema !== "string" ||
      !Number.isInteger(entry.minCount) ||
      Number(entry.minCount) < 1 ||
      !Number.isInteger(entry.maxBytes) ||
      Number(entry.maxBytes) < 1
    ) {
      problems.push(
        `durableEvidence.${name} must declare root, extension, schema, positive minCount, and positive maxBytes`,
      );
    } else if (!/^\.[a-z0-9]+$/.test(entry.extension)) {
      problems.push(`durableEvidence.${name}.extension must be a lowercase filename extension`);
    } else {
      rejectUnknownPolicyKeys(
        entry,
        ["root", "extension", "schema", "minCount", "maxBytes"],
        `durableEvidence.${name}`,
        problems,
      );
    }
  }
  if (
    typeof state.path !== "string" ||
    !Number.isInteger(state.maxBytes) ||
    Number(state.maxBytes) < 1 ||
    !Number.isInteger(state.maxLines) ||
    Number(state.maxLines) < 1 ||
    stringArray(state, "requiredKeys") === undefined ||
    stringArray(state, "allowedKeys") === undefined
  ) {
    problems.push("state must declare path, integer limits, requiredKeys, and allowedKeys");
  }
  if (
    !isRecord(archivePointers) ||
    stringArray(archivePointers, "allowedSchemes") === undefined ||
    typeof archivePointers.checksumPattern !== "string" ||
    stringArray(archivePointers, "privacyClasses") === undefined
  ) {
    problems.push("archivePointers must declare schemes, checksumPattern, and privacyClasses");
  } else {
    const schemes = /** @type {string[]} */ (archivePointers.allowedSchemes);
    const privacyClasses = /** @type {string[]} */ (archivePointers.privacyClasses);
    if (schemes.length === 0 || privacyClasses.length === 0) {
      problems.push("archivePointers schemes and privacyClasses must not be empty");
    }
    if (
      new Set(schemes).size !== schemes.length ||
      new Set(privacyClasses).size !== privacyClasses.length
    ) {
      problems.push("archivePointers schemes and privacyClasses must not contain duplicates");
    }
  }
  if (problems.length > 0) return { problems };
  const evolutionEntry = /** @type {UnknownRecord} */ (evolutionRecords);
  const gateEntry = /** @type {UnknownRecord} */ (gateReceipts);

  const paths = [
    .../** @type {string[]} */ (workingMemory.roots),
    governanceDocument,
    state.path,
    evolutionEntry.root,
    evolutionEntry.schema,
    gateEntry.root,
    gateEntry.schema,
  ];
  if (
    paths.some((path) => typeof path !== "string" || normalizeRepositoryPath(path) === undefined)
  ) {
    return { problems: ["every configured path must be portable and repository-relative"] };
  }
  const normalizedRoots = /** @type {string[]} */ (workingMemory.roots).map(
    (path) => /** @type {string} */ (normalizeRepositoryPath(path)),
  );
  if (
    new Set(normalizedRoots.map((path) => path.toLocaleLowerCase("en-US"))).size !==
    normalizedRoots.length
  ) {
    problems.push("workingMemory.roots must not contain duplicate or case-colliding paths");
  }
  for (const requiredRoot of ["_bmad-output", "Skills-Results"]) {
    if (
      !normalizedRoots.some(
        (root) => root.toLocaleLowerCase("en-US") === requiredRoot.toLocaleLowerCase("en-US"),
      )
    ) {
      problems.push(`workingMemory.roots must include ${requiredRoot}`);
    }
  }
  const requiredKeys = /** @type {string[]} */ (state.requiredKeys);
  const allowedKeys = /** @type {string[]} */ (state.allowedKeys);
  if (
    new Set(requiredKeys).size !== requiredKeys.length ||
    new Set(allowedKeys).size !== allowedKeys.length
  ) {
    problems.push("state requiredKeys and allowedKeys must not contain duplicates");
  }
  for (const key of requiredKeys) {
    if (!allowedKeys.includes(key))
      problems.push(`state.requiredKeys entry is not allowed: ${key}`);
  }
  const normalizedDurablePaths = [
    /** @type {string} */ (normalizeRepositoryPath(/** @type {string} */ (governanceDocument))),
    /** @type {string} */ (normalizeRepositoryPath(/** @type {string} */ (state.path))),
    /** @type {string} */ (normalizeRepositoryPath(/** @type {string} */ (evolutionEntry.root))),
    /** @type {string} */ (normalizeRepositoryPath(/** @type {string} */ (evolutionEntry.schema))),
    /** @type {string} */ (normalizeRepositoryPath(/** @type {string} */ (gateEntry.root))),
    /** @type {string} */ (normalizeRepositoryPath(/** @type {string} */ (gateEntry.schema))),
  ];
  for (const path of normalizedDurablePaths) {
    if (normalizedRoots.some((root) => isWithin(path, root))) {
      problems.push(`durable path must not be inside working memory: ${path}`);
    }
  }
  try {
    new RegExp(/** @type {string} */ (archivePointers.checksumPattern));
  } catch (error) {
    problems.push(
      `archivePointers.checksumPattern is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    /** @type {string[]} */ (archivePointers.allowedSchemes).some(
      (scheme) => !/^[a-z][a-z0-9+.-]*$/.test(scheme),
    )
  ) {
    problems.push("archivePointers.allowedSchemes must contain lowercase URI schemes");
  }
  if (problems.length > 0) return { problems };

  /** @param {UnknownRecord} entry */
  const normalizeEntry = (entry) => ({
    root: /** @type {string} */ (normalizeRepositoryPath(/** @type {string} */ (entry.root))),
    extension: /** @type {string} */ (entry.extension),
    schema: /** @type {string} */ (normalizeRepositoryPath(/** @type {string} */ (entry.schema))),
    minCount: /** @type {number} */ (entry.minCount),
    maxBytes: /** @type {number} */ (entry.maxBytes),
  });
  return {
    policy: /** @type {ProcessArtifactPolicy} */ ({
      schemaVersion: 1,
      workingMemory: { roots: normalizedRoots },
      governanceDocument: /** @type {string} */ (
        normalizeRepositoryPath(/** @type {string} */ (governanceDocument))
      ),
      state: {
        path: /** @type {string} */ (normalizeRepositoryPath(/** @type {string} */ (state.path))),
        maxBytes: /** @type {number} */ (state.maxBytes),
        maxLines: /** @type {number} */ (state.maxLines),
        requiredKeys,
        allowedKeys,
      },
      durableEvidence: {
        evolutionRecords: normalizeEntry(/** @type {UnknownRecord} */ (evolutionRecords)),
        gateReceipts: normalizeEntry(/** @type {UnknownRecord} */ (gateReceipts)),
      },
      archivePointers: {
        allowedSchemes: /** @type {string[]} */ (archivePointers.allowedSchemes),
        checksumPattern: /** @type {string} */ (archivePointers.checksumPattern),
        privacyClasses: /** @type {string[]} */ (archivePointers.privacyClasses),
      },
    }),
    problems: [],
  };
}

/** @param {string} candidate @param {string} root */
function isFilesystemWithin(candidate, root) {
  const path = relative(root, candidate);
  return path === "" || normalizeRepositoryPath(path.replaceAll("\\", "/")) !== undefined;
}

/**
 * Inventory one governed evidence root without following symbolic links or ignoring unexpected files.
 *
 * @param {string} repositoryRoot
 * @param {ProcessArtifactPolicy["durableEvidence"]["evolutionRecords"]} entryPolicy
 * @returns {{ files: string[], violations: ProcessArtifactViolation[] }}
 */
function inspectEvidenceRoot(repositoryRoot, entryPolicy) {
  const rootPath = join(repositoryRoot, entryPolicy.root);
  /** @type {string[]} */
  const files = [];
  /** @type {ProcessArtifactViolation[]} */
  const violations = [];
  let repositoryReal;
  let rootReal;
  try {
    repositoryReal = realpathSync(repositoryRoot);
    const rootStat = lstatSync(rootPath);
    if (rootStat.isSymbolicLink()) {
      return {
        files,
        violations: [
          {
            path: entryPolicy.root,
            code: "symlink-evidence",
            detail: "durable-evidence roots must not be symbolic links",
          },
        ],
      };
    }
    if (!rootStat.isDirectory()) {
      return {
        files,
        violations: [
          {
            path: entryPolicy.root,
            code: "invalid-evidence-root",
            detail: "durable-evidence root must be a directory",
          },
        ],
      };
    }
    rootReal = realpathSync(rootPath);
  } catch (error) {
    return {
      files,
      violations: [
        {
          path: entryPolicy.root,
          code: "missing-evidence-root",
          detail: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
  if (!isFilesystemWithin(rootReal, repositoryReal)) {
    return {
      files,
      violations: [
        {
          path: entryPolicy.root,
          code: "evidence-root-escape",
          detail: "durable-evidence root resolves outside the repository",
        },
      ],
    };
  }

  /** @param {string} directory */
  const visit = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      violations.push({
        path: repositoryPath(repositoryRoot, directory),
        code: "unreadable-evidence-directory",
        detail: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    for (const directoryEntry of entries) {
      const filePath = join(directory, directoryEntry.name);
      const path = repositoryPath(repositoryRoot, filePath);
      let fileStat;
      try {
        fileStat = lstatSync(filePath);
      } catch (error) {
        violations.push({
          path,
          code: "unreadable-evidence-entry",
          detail: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (fileStat.isSymbolicLink()) {
        violations.push({
          path,
          code: "symlink-evidence",
          detail: "durable evidence must be a regular in-repository file",
        });
        continue;
      }
      if (fileStat.isDirectory()) {
        let directoryReal;
        try {
          directoryReal = realpathSync(filePath);
        } catch (error) {
          violations.push({
            path,
            code: "unreadable-evidence-directory",
            detail: error instanceof Error ? error.message : String(error),
          });
          continue;
        }
        if (!isFilesystemWithin(directoryReal, rootReal)) {
          violations.push({
            path,
            code: "evidence-path-escape",
            detail: "durable-evidence directory resolves outside its governed root",
          });
        } else visit(filePath);
        continue;
      }
      if (!fileStat.isFile()) {
        violations.push({
          path,
          code: "invalid-evidence-entry",
          detail: "durable-evidence roots may contain only directories and regular files",
        });
        continue;
      }
      if (extname(directoryEntry.name) !== entryPolicy.extension) {
        violations.push({
          path,
          code: "unexpected-evidence-file",
          detail: `every file under this root must use ${entryPolicy.extension}`,
        });
        continue;
      }
      if (fileStat.size > entryPolicy.maxBytes) {
        violations.push({
          path,
          code: "evidence-too-large",
          detail: `durable evidence exceeds ${entryPolicy.maxBytes} bytes`,
        });
        continue;
      }
      files.push(filePath);
    }
  };

  visit(rootPath);
  files.sort(compareText);
  return { files, violations: sortViolations(violations) };
}

/** @param {string} repositoryRoot @param {string} path */
function validateGovernedFile(repositoryRoot, path) {
  const absolutePath = join(repositoryRoot, path);
  try {
    const fileStat = lstatSync(absolutePath);
    if (fileStat.isSymbolicLink()) {
      return [
        {
          path,
          code: "symlink-governed-file",
          detail: "governed files must not be symbolic links",
        },
      ];
    }
    if (!fileStat.isFile()) {
      return [
        { path, code: "invalid-governed-file", detail: "governed path must be a regular file" },
      ];
    }
    if (!isFilesystemWithin(realpathSync(absolutePath), realpathSync(repositoryRoot))) {
      return [
        {
          path,
          code: "governed-file-escape",
          detail: "governed file resolves outside the repository",
        },
      ];
    }
    return [];
  } catch (error) {
    return [
      {
        path,
        code: "missing-governed-file",
        detail: error instanceof Error ? error.message : String(error),
      },
    ];
  }
}

/** @param {string} path */
function readStructuredFile(path) {
  const text = readFileSync(path, "utf8");
  return extname(path) === ".json" ? JSON.parse(text) : parse(text);
}

/** @param {string} root @param {string} path */
function repositoryPath(root, path) {
  return relative(root, path).replaceAll("\\", "/");
}

/**
 * @param {string} path
 * @param {unknown} value
 * @param {ProcessArtifactPolicy["archivePointers"]} policy
 * @returns {ProcessArtifactViolation[]}
 */
export function validateArchiveMetadata(path, value, policy) {
  if (!isRecord(value) || !isRecord(value.archive)) return [];
  const archive = value.archive;
  const pointer = archive.pointer;
  const violations = [];

  if (archive.status === "not-configured") {
    if (pointer !== undefined) {
      violations.push({
        path,
        code: "unexpected-archive-pointer",
        detail: "not-configured archives must not carry a pointer",
      });
    }
    if (archive.rawEvidenceDisposition === "external-archive") {
      violations.push({
        path,
        code: "invalid-archive-disposition",
        detail: "external-archive disposition requires an external archive",
      });
    }
    return violations;
  }

  if (archive.status !== "external" || !isRecord(pointer)) {
    return [
      {
        path,
        code: "missing-archive-pointer",
        detail: "external archives require a structured pointer",
      },
    ];
  }
  if (archive.rawEvidenceDisposition !== "external-archive") {
    violations.push({
      path,
      code: "invalid-archive-disposition",
      detail: "an external archive must use the external-archive disposition",
    });
  }

  const uri = pointer.uri;
  if (typeof uri !== "string") {
    violations.push({ path, code: "unsafe-archive-pointer", detail: "archive URI is missing" });
  } else {
    try {
      const parsed = new URL(uri);
      const scheme = parsed.protocol.slice(0, -1);
      if (!policy.allowedSchemes.includes(scheme)) {
        violations.push({
          path,
          code: "unsafe-archive-pointer",
          detail: `archive scheme ${scheme || "<empty>"} is not approved`,
        });
      }
      if (parsed.username !== "" || parsed.password !== "") {
        violations.push({
          path,
          code: "unsafe-archive-pointer",
          detail: "archive URI must not embed credentials",
        });
      }
      if (parsed.search !== "" || parsed.hash !== "") {
        violations.push({
          path,
          code: "unsafe-archive-pointer",
          detail: "archive URI must not contain a query string or fragment",
        });
      }
    } catch {
      violations.push({
        path,
        code: "unsafe-archive-pointer",
        detail: "archive URI is not a valid absolute URI",
      });
    }
  }

  let checksumMatches = false;
  try {
    checksumMatches =
      typeof pointer.checksum === "string" &&
      new RegExp(policy.checksumPattern).test(pointer.checksum);
  } catch {
    checksumMatches = false;
  }
  if (!checksumMatches) {
    violations.push({
      path,
      code: "invalid-archive-checksum",
      detail: `archive checksum must match ${policy.checksumPattern}`,
    });
  }
  if (typeof pointer.expiresOn !== "string" || !isDate(pointer.expiresOn)) {
    violations.push({
      path,
      code: "invalid-archive-expiry",
      detail: "archive expiry must be a real ISO date",
    });
  }
  if (
    typeof pointer.privacyClass !== "string" ||
    !policy.privacyClasses.includes(pointer.privacyClass)
  ) {
    violations.push({
      path,
      code: "invalid-archive-privacy",
      detail: "archive privacy class is not approved by policy",
    });
  }
  if (pointer.approvalAuthority !== "human") {
    violations.push({
      path,
      code: "missing-archive-approval",
      detail: "archive pointer requires human approval authority",
    });
  }
  if (typeof pointer.approvedBy !== "string" || pointer.approvedBy.trim() === "") {
    violations.push({
      path,
      code: "missing-archive-approval",
      detail: "archive pointer requires the approving human identity",
    });
  }
  if (typeof pointer.approvedAt !== "string" || !isDateTime(pointer.approvedAt)) {
    violations.push({
      path,
      code: "missing-archive-approval",
      detail: "archive pointer requires an ISO approval timestamp",
    });
  }
  return violations;
}

/**
 * @param {string} path
 * @param {string} text
 * @param {ProcessArtifactPolicy["state"]} statePolicy
 * @returns {ProcessArtifactViolation[]}
 */
export function validateStateDocument(path, text, statePolicy) {
  /** @type {ProcessArtifactViolation[]} */
  const violations = [];
  if (Buffer.byteLength(text, "utf8") > statePolicy.maxBytes) {
    violations.push({
      path,
      code: "state-too-large",
      detail: `state exceeds ${statePolicy.maxBytes} bytes`,
    });
  }
  const lines = text === "" ? [] : text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const lineCount = lines.length;
  if (lineCount > statePolicy.maxLines) {
    violations.push({
      path,
      code: "state-too-long",
      detail: `state exceeds ${statePolicy.maxLines} lines`,
    });
  }

  let value;
  try {
    value = parse(text);
  } catch (error) {
    return [
      ...violations,
      {
        path,
        code: "invalid-state-yaml",
        detail: error instanceof Error ? error.message : String(error),
      },
    ];
  }
  if (!isRecord(value)) {
    return [...violations, { path, code: "invalid-state", detail: "state root must be an object" }];
  }

  for (const key of statePolicy.requiredKeys) {
    if (!(key in value)) {
      violations.push({ path, code: "missing-state-key", detail: `${key} is required` });
    }
  }
  for (const key of Object.keys(value)) {
    if (!statePolicy.allowedKeys.includes(key)) {
      violations.push({ path, code: "unknown-state-key", detail: `${key} is not allowed` });
    }
  }
  if (value.schemaVersion !== 1) {
    violations.push({ path, code: "invalid-state-version", detail: "schemaVersion must equal 1" });
  }
  if (!Number.isInteger(value.phase) || Number(value.phase) < 1 || Number(value.phase) > 7) {
    violations.push({
      path,
      code: "invalid-state-phase",
      detail: "phase must be an integer from 1 to 7",
    });
  }
  for (const key of ["phaseName", "branch", "epic"]) {
    if (typeof value[key] !== "string" || value[key].trim() === "") {
      violations.push({ path, code: "invalid-state-value", detail: `${key} must be non-empty` });
    }
  }
  if (value.activeStory !== null && typeof value.activeStory !== "string") {
    violations.push({
      path,
      code: "invalid-state-value",
      detail: "activeStory must be a string or null",
    });
  }
  if (value.activeChange !== null && value.activeChange !== undefined) {
    if (!isRecord(value.activeChange)) {
      violations.push({
        path,
        code: "invalid-state-value",
        detail: "activeChange must be an object or null",
      });
    } else {
      rejectUnknownKeys(
        value.activeChange,
        ["id", "durableRecord"],
        "activeChange",
        violations,
        path,
      );
      if (typeof value.activeChange.id !== "string" || value.activeChange.id.trim() === "") {
        violations.push({
          path,
          code: "invalid-state-value",
          detail: "activeChange.id must be non-empty",
        });
      }
      if (
        value.activeChange.durableRecord !== undefined &&
        (typeof value.activeChange.durableRecord !== "string" ||
          normalizeRepositoryPath(value.activeChange.durableRecord) === undefined)
      ) {
        violations.push({
          path,
          code: "invalid-state-value",
          detail: "activeChange.durableRecord must be a repository-relative path",
        });
      }
    }
  }
  if (!Number.isInteger(value.reviewCycle) || Number(value.reviewCycle) < 0) {
    violations.push({
      path,
      code: "invalid-state-value",
      detail: "reviewCycle must be a non-negative integer",
    });
  }
  if (!isRecord(value.specialists)) {
    violations.push({ path, code: "invalid-state-value", detail: "specialists must be an object" });
  } else {
    for (const [name, specialist] of Object.entries(value.specialists)) {
      if (
        !isRecord(specialist) ||
        typeof specialist.role !== "string" ||
        specialist.role.trim() === "" ||
        typeof specialist.lastSkill !== "string" ||
        specialist.lastSkill.trim() === ""
      ) {
        violations.push({
          path,
          code: "invalid-specialist-state",
          detail: `${name} must contain non-empty role and lastSkill values`,
        });
      } else {
        rejectUnknownKeys(
          specialist,
          ["spawned", "role", "lastSkill"],
          `specialists.${name}`,
          violations,
          path,
        );
        if (specialist.spawned !== undefined && typeof specialist.spawned !== "boolean") {
          violations.push({
            path,
            code: "invalid-specialist-state",
            detail: `${name}.spawned must be boolean when present`,
          });
        }
      }
    }
  }
  if (!Array.isArray(value.gatesPending) || !Array.isArray(value.waivers)) {
    violations.push({
      path,
      code: "invalid-state-value",
      detail: "gatesPending and waivers must be arrays",
    });
  }
  if (Array.isArray(value.gatesPending)) {
    value.gatesPending.forEach((gate, index) => {
      if (!isRecord(gate)) {
        violations.push({
          path,
          code: "invalid-state-shape",
          detail: `gatesPending[${index}] must be an object`,
        });
        return;
      }
      rejectUnknownKeys(
        gate,
        ["id", "description", "receipt"],
        `gatesPending[${index}]`,
        violations,
        path,
      );
      for (const key of ["id", "description", "receipt"]) {
        if (typeof gate[key] !== "string" || gate[key].trim() === "") {
          violations.push({
            path,
            code: "invalid-state-value",
            detail: `gatesPending[${index}].${key} must be non-empty`,
          });
        }
      }
      if (typeof gate.receipt === "string" && normalizeRepositoryPath(gate.receipt) === undefined) {
        violations.push({
          path,
          code: "invalid-state-value",
          detail: `gatesPending[${index}].receipt must be repository-relative`,
        });
      }
    });
  }
  if (Array.isArray(value.waivers)) {
    value.waivers.forEach((waiver, index) => {
      if (!isRecord(waiver)) {
        violations.push({
          path,
          code: "invalid-state-shape",
          detail: `waivers[${index}] must be an object`,
        });
        return;
      }
      rejectUnknownKeys(waiver, ["receipt", "id"], `waivers[${index}]`, violations, path);
      for (const key of ["receipt", "id"]) {
        if (typeof waiver[key] !== "string" || waiver[key].trim() === "") {
          violations.push({
            path,
            code: "invalid-state-value",
            detail: `waivers[${index}].${key} must be non-empty`,
          });
        }
      }
      if (
        typeof waiver.receipt === "string" &&
        normalizeRepositoryPath(waiver.receipt) === undefined
      ) {
        violations.push({
          path,
          code: "invalid-state-value",
          detail: `waivers[${index}].receipt must be repository-relative`,
        });
      }
    });
  }
  if (value.workingMemory !== undefined) {
    if (!isRecord(value.workingMemory)) {
      violations.push({
        path,
        code: "invalid-state-shape",
        detail: "workingMemory must be an object",
      });
    } else {
      rejectUnknownKeys(
        value.workingMemory,
        ["roots", "durableEpisode"],
        "workingMemory",
        violations,
        path,
      );
      const roots = stringArray(value.workingMemory, "roots");
      if (
        roots === undefined ||
        roots.length === 0 ||
        roots.some((root) => normalizeRepositoryPath(root) === undefined)
      ) {
        violations.push({
          path,
          code: "invalid-state-value",
          detail: "workingMemory.roots must contain repository-relative paths",
        });
      }
      if (
        typeof value.workingMemory.durableEpisode !== "string" ||
        normalizeRepositoryPath(value.workingMemory.durableEpisode) === undefined
      ) {
        violations.push({
          path,
          code: "invalid-state-value",
          detail: "workingMemory.durableEpisode must be repository-relative",
        });
      }
    }
  }
  if (
    value.designRevisionLoaded !== undefined &&
    (typeof value.designRevisionLoaded !== "string" ||
      !/^[a-f0-9]{40}$/.test(value.designRevisionLoaded))
  ) {
    violations.push({
      path,
      code: "invalid-state-value",
      detail: "designRevisionLoaded must be a full Git revision",
    });
  }
  if (typeof value.lastUpdated !== "string" || !isDateTime(value.lastUpdated)) {
    violations.push({
      path,
      code: "invalid-state-value",
      detail: "lastUpdated must be an ISO date-time with timezone",
    });
  }
  return sortViolations(violations);
}

/** @param {string} repositoryRoot */
function listTrackedPaths(repositoryRoot) {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.error?.message || "git ls-files failed";
    throw new Error(detail);
  }
  return (result.stdout ?? "").split("\0").filter((entry) => entry !== "");
}

/** @param {string} repositoryRoot */
function listUnstagedPaths(repositoryRoot) {
  const result = spawnSync("git", ["diff", "--name-only", "-z", "--"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.error?.message || "git diff failed";
    throw new Error(detail);
  }
  return (result.stdout ?? "").split("\0").filter((entry) => entry !== "");
}

/** @param {string} repositoryRoot @param {string} object */
function gitObjectExists(repositoryRoot, object) {
  const result = spawnSync("git", ["cat-file", "-e", object], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0;
}

/**
 * Run the complete read-only repository policy check.
 *
 * @param {RepositoryCheckOptions} options
 * @returns {RepositoryCheckResult}
 */
export function checkProcessArtifacts(options) {
  const repositoryRoot = resolve(options.repositoryRoot);
  const configuredPolicyPath = normalizeRepositoryPath(
    options.policyPath ?? ".bmad/artifact-policy.yaml",
  );
  if (configuredPolicyPath === undefined) {
    return {
      ok: false,
      violations: [
        {
          path: options.policyPath ?? ".bmad/artifact-policy.yaml",
          code: "invalid-policy-path",
          detail: "policy path must be portable and repository-relative",
        },
      ],
      trackedPathCount: 0,
      evolutionRecordCount: 0,
      gateReceiptCount: 0,
    };
  }
  const policyPath = join(repositoryRoot, configuredPolicyPath);
  const violations = [];
  let policyValue;
  try {
    policyValue = parse(readFileSync(policyPath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      violations: [
        {
          path: configuredPolicyPath,
          code: "invalid-policy",
          detail: error instanceof Error ? error.message : String(error),
        },
      ],
      trackedPathCount: 0,
      evolutionRecordCount: 0,
      gateReceiptCount: 0,
    };
  }
  const parsedPolicy = parseArtifactPolicy(policyValue);
  if (parsedPolicy.policy === undefined) {
    return {
      ok: false,
      violations: parsedPolicy.problems.map((detail) => ({
        path: configuredPolicyPath,
        code: "invalid-policy",
        detail,
      })),
      trackedPathCount: 0,
      evolutionRecordCount: 0,
      gateReceiptCount: 0,
    };
  }
  const policy = parsedPolicy.policy;

  let trackedPaths = options.trackedPaths === undefined ? [] : [...options.trackedPaths];
  if (options.trackedPaths === undefined) {
    try {
      trackedPaths = listTrackedPaths(repositoryRoot);
    } catch (error) {
      violations.push({
        path: ".git",
        code: "tracked-path-read-failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  violations.push(...validateTrackedWorkingMemory(trackedPaths, policy.workingMemory.roots));

  let unstagedPaths = options.unstagedPaths === undefined ? [] : [...options.unstagedPaths];
  if (options.requireTrackedEvidence === true && options.unstagedPaths === undefined) {
    try {
      unstagedPaths = listUnstagedPaths(repositoryRoot);
    } catch (error) {
      violations.push({
        path: ".git",
        code: "unstaged-path-read-failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const statePath = join(repositoryRoot, policy.state.path);
  let stateValue;
  if (!existsSync(statePath)) {
    violations.push({
      path: policy.state.path,
      code: "missing-state",
      detail: "state file is required",
    });
  } else {
    try {
      const stateText = readFileSync(statePath, "utf8");
      violations.push(...validateStateDocument(policy.state.path, stateText, policy.state));
      stateValue = parse(stateText);
    } catch (error) {
      violations.push({
        path: policy.state.path,
        code: "unreadable-state",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const recordInventory = inspectEvidenceRoot(
    repositoryRoot,
    policy.durableEvidence.evolutionRecords,
  );
  const gateInventory = inspectEvidenceRoot(repositoryRoot, policy.durableEvidence.gateReceipts);
  const recordFiles = recordInventory.files;
  const gateFiles = gateInventory.files;
  violations.push(...recordInventory.violations, ...gateInventory.violations);
  if (recordFiles.length < policy.durableEvidence.evolutionRecords.minCount) {
    violations.push({
      path: policy.durableEvidence.evolutionRecords.root,
      code: "insufficient-durable-evidence",
      detail: `at least ${policy.durableEvidence.evolutionRecords.minCount} evolution record(s) are required`,
    });
  }
  if (gateFiles.length < policy.durableEvidence.gateReceipts.minCount) {
    violations.push({
      path: policy.durableEvidence.gateReceipts.root,
      code: "insufficient-durable-evidence",
      detail: `at least ${policy.durableEvidence.gateReceipts.minCount} gate receipt(s) are required`,
    });
  }

  const governedPaths = [
    configuredPolicyPath,
    policy.governanceDocument,
    policy.state.path,
    policy.durableEvidence.evolutionRecords.schema,
    policy.durableEvidence.gateReceipts.schema,
    ...recordFiles.map((file) => repositoryPath(repositoryRoot, file)),
    ...gateFiles.map((file) => repositoryPath(repositoryRoot, file)),
  ];
  for (const path of governedPaths) {
    violations.push(...validateGovernedFile(repositoryRoot, path));
  }
  if (options.requireTrackedEvidence === true) {
    const trackedSet = new Set(
      trackedPaths
        .map(normalizeRepositoryPath)
        .filter((path) => path !== undefined)
        .map((path) => path.toLocaleLowerCase("en-US")),
    );
    const governedSet = new Set(governedPaths.map((path) => path.toLocaleLowerCase("en-US")));
    for (const path of governedPaths) {
      if (!trackedSet.has(path.toLocaleLowerCase("en-US"))) {
        violations.push({
          path,
          code: "untracked-durable-evidence",
          detail: "CI requires governance, state, schemas, and durable evidence in the Git index",
        });
      }
    }
    for (const rawPath of unstagedPaths) {
      const path = normalizeRepositoryPath(rawPath);
      if (path !== undefined && governedSet.has(path.toLocaleLowerCase("en-US"))) {
        violations.push({
          path,
          code: "unstaged-durable-evidence",
          detail: "strict validation requires the worktree and Git-index candidate to agree",
        });
      }
    }
  }

  /** @param {string} schemaPath @returns {UnknownRecord | undefined} */
  const loadSchema = (schemaPath) => {
    try {
      const value = JSON.parse(readFileSync(join(repositoryRoot, schemaPath), "utf8"));
      if (!isRecord(value)) throw new TypeError("schema root must be an object");
      const schemaProblems = validateSchemaDefinition(value);
      if (schemaProblems.length > 0) {
        for (const detail of schemaProblems) {
          violations.push({ path: schemaPath, code: "invalid-evidence-schema", detail });
        }
        return undefined;
      }
      return value;
    } catch (error) {
      violations.push({
        path: schemaPath,
        code: "invalid-evidence-schema",
        detail: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  };
  const evolutionSchema = loadSchema(policy.durableEvidence.evolutionRecords.schema);
  const gateSchema = loadSchema(policy.durableEvidence.gateReceipts.schema);

  const gitObjectCache = new Map();
  /** @param {string} path @param {string} label @param {unknown} revision */
  const validateRevision = (path, label, revision) => {
    if (typeof revision !== "string" || !/^[a-f0-9]{40}$/.test(revision)) return;
    const object = `${revision}^{commit}`;
    let exists = gitObjectCache.get(object);
    if (exists === undefined) {
      exists = gitObjectExists(repositoryRoot, object);
      gitObjectCache.set(object, exists);
    }
    if (!exists) {
      violations.push({
        path,
        code: "unknown-git-revision",
        detail: `${label} does not resolve to a local Git commit: ${revision}`,
      });
    }
  };
  /** @param {string} path @param {unknown} value */
  const validateEvidencePointers = (path, value) => {
    if (typeof value === "string") {
      const match = /^git:([a-f0-9]{40}):(.+)$/.exec(value);
      if (match === null) return;
      const evidencePath = normalizeRepositoryPath(match[2] ?? "");
      if (evidencePath === undefined) {
        violations.push({
          path,
          code: "invalid-git-evidence-pointer",
          detail: `${value} contains a non-repository path`,
        });
        return;
      }
      const object = `${match[1]}:${evidencePath}`;
      let exists = gitObjectCache.get(object);
      if (exists === undefined) {
        exists = gitObjectExists(repositoryRoot, object);
        gitObjectCache.set(object, exists);
      }
      if (!exists) {
        violations.push({
          path,
          code: "missing-git-evidence",
          detail: `${value} does not resolve to a Git object`,
        });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        validateEvidencePointers(path, entry);
      });
    } else if (isRecord(value)) {
      Object.values(value).forEach((entry) => {
        validateEvidencePointers(path, entry);
      });
    }
  };

  const episodeIds = new Set();
  const episodeRecordsByPath = new Map();
  if (evolutionSchema !== undefined) {
    for (const file of recordFiles) {
      const path = repositoryPath(repositoryRoot, file);
      try {
        const value = readStructuredFile(file);
        for (const detail of validateSchemaValue(value, evolutionSchema)) {
          violations.push({ path, code: "invalid-evolution-record", detail });
        }
        violations.push(...validateArchiveMetadata(path, value, policy.archivePointers));
        validateEvidencePointers(path, value);
        if (isRecord(value) && typeof value.id === "string") {
          episodeRecordsByPath.set(path, value);
          if (episodeIds.has(value.id)) {
            violations.push({
              path,
              code: "duplicate-evolution-id",
              detail: `duplicate episode id ${value.id}`,
            });
          }
          episodeIds.add(value.id);
          if (basename(file) !== `${value.id}.yaml`) {
            violations.push({
              path,
              code: "evolution-name-mismatch",
              detail: "filename must equal the record id plus .yaml",
            });
          }
        }
        if (isRecord(value)) {
          validateRevision(path, "baselineRevision", value.baselineRevision);
          validateRevision(path, "preCleanupRevision", value.preCleanupRevision);
        }
      } catch (error) {
        violations.push({
          path,
          code: "unreadable-evolution-record",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const gateIds = new Set();
  const gateReceiptsByPath = new Map();
  if (gateSchema !== undefined) {
    for (const file of gateFiles) {
      const path = repositoryPath(repositoryRoot, file);
      try {
        const value = readStructuredFile(file);
        for (const detail of validateSchemaValue(value, gateSchema)) {
          violations.push({ path, code: "invalid-gate-receipt", detail });
        }
        validateEvidencePointers(path, value);
        if (isRecord(value)) {
          gateReceiptsByPath.set(path, value);
          if (typeof value.id === "string") {
            if (gateIds.has(value.id)) {
              violations.push({
                path,
                code: "duplicate-gate-id",
                detail: `duplicate gate id ${value.id}`,
              });
            }
            gateIds.add(value.id);
            if (basename(file) !== `${value.id}.json`) {
              violations.push({
                path,
                code: "gate-name-mismatch",
                detail: "filename must equal the receipt id plus .json",
              });
            }
          }
          if (typeof value.episodeId === "string" && !episodeIds.has(value.episodeId)) {
            violations.push({
              path,
              code: "unknown-gate-episode",
              detail: `episode ${value.episodeId} has no evolution record`,
            });
          }
          const candidate = value.candidate;
          validateRevision(path, "preCleanupRevision", value.preCleanupRevision);
          if (isRecord(candidate)) {
            validateRevision(path, "candidate.baselineRevision", candidate.baselineRevision);
            validateRevision(path, "candidate.revision", candidate.revision);
          }
          if (
            value.verdict !== "pending" &&
            (!isRecord(candidate) || typeof candidate.revision !== "string")
          ) {
            violations.push({
              path,
              code: "unbound-gate-verdict",
              detail: "a terminal verdict requires a concrete candidate revision",
            });
          }
          const waiverIds = Array.isArray(value.waivers)
            ? value.waivers.flatMap((waiver) =>
                isRecord(waiver) && typeof waiver.id === "string" ? [waiver.id] : [],
              )
            : [];
          if (new Set(waiverIds).size !== waiverIds.length) {
            violations.push({
              path,
              code: "duplicate-gate-waiver",
              detail: "waiver ids must be unique within a receipt",
            });
          }
          if (Array.isArray(value.checks)) {
            const names = value.checks.flatMap((check) =>
              isRecord(check) && typeof check.name === "string" ? [check.name] : [],
            );
            if (new Set(names).size !== names.length) {
              violations.push({
                path,
                code: "duplicate-gate-check",
                detail: "check names must be unique within a receipt",
              });
            }
            const terminal = value.verdict !== "pending";
            for (const check of value.checks) {
              if (!isRecord(check)) continue;
              if (terminal && (!Array.isArray(check.evidence) || check.evidence.length === 0)) {
                violations.push({
                  path,
                  code: "missing-terminal-evidence",
                  detail: `terminal check ${String(check.name)} requires evidence`,
                });
              }
              if (check.status === "waived") {
                if (typeof check.waiverId !== "string" || !waiverIds.includes(check.waiverId)) {
                  violations.push({
                    path,
                    code: "unbound-waived-check",
                    detail: `waived check ${String(check.name)} must reference a receipt waiver`,
                  });
                }
              } else if (check.waiverId !== undefined) {
                violations.push({
                  path,
                  code: "unexpected-check-waiver",
                  detail: `non-waived check ${String(check.name)} must not reference a waiver`,
                });
              }
            }
            const statuses = value.checks.flatMap((check) =>
              isRecord(check) && typeof check.status === "string" ? [check.status] : [],
            );
            if (value.verdict === "pass" && statuses.some((status) => status !== "passed")) {
              violations.push({
                path,
                code: "invalid-pass-verdict",
                detail:
                  "pass requires every check to be passed; waived checks require a waived verdict",
              });
            }
            if (
              value.verdict === "waived" &&
              (waiverIds.length === 0 ||
                !statuses.includes("waived") ||
                statuses.some((status) => !["passed", "waived"].includes(status)))
            ) {
              violations.push({
                path,
                code: "missing-gate-waiver",
                detail: "waived verdict requires passed/waived checks and a bound waiver",
              });
            }
            if (terminal && statuses.includes("pending")) {
              violations.push({
                path,
                code: "pending-terminal-check",
                detail: "terminal verdicts must not contain pending checks",
              });
            }
          }
        }
      } catch (error) {
        violations.push({
          path,
          code: "unreadable-gate-receipt",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (isRecord(stateValue)) {
    validateRevision(policy.state.path, "designRevisionLoaded", stateValue.designRevisionLoaded);
    if (isRecord(stateValue.workingMemory)) {
      const stateRoots = stringArray(stateValue.workingMemory, "roots") ?? [];
      for (const rawRoot of stateRoots) {
        const root = normalizeRepositoryPath(rawRoot);
        if (
          root !== undefined &&
          !policy.workingMemory.roots.some(
            (configured) =>
              configured.toLocaleLowerCase("en-US") === root.toLocaleLowerCase("en-US"),
          )
        ) {
          violations.push({
            path: policy.state.path,
            code: "unknown-state-working-root",
            detail: `working-memory root is not governed by policy: ${rawRoot}`,
          });
        }
      }
      if (typeof stateValue.workingMemory.durableEpisode === "string") {
        const episodePath = normalizeRepositoryPath(stateValue.workingMemory.durableEpisode);
        if (episodePath !== undefined && !episodeRecordsByPath.has(episodePath)) {
          violations.push({
            path: policy.state.path,
            code: "missing-state-evidence",
            detail: `durable episode does not resolve: ${stateValue.workingMemory.durableEpisode}`,
          });
        }
      }
    }
    if (
      isRecord(stateValue.activeChange) &&
      typeof stateValue.activeChange.durableRecord === "string"
    ) {
      const recordPath = normalizeRepositoryPath(stateValue.activeChange.durableRecord);
      if (recordPath !== undefined && !episodeRecordsByPath.has(recordPath)) {
        violations.push({
          path: policy.state.path,
          code: "missing-state-evidence",
          detail: `active change record does not resolve: ${stateValue.activeChange.durableRecord}`,
        });
      }
    }
    if (Array.isArray(stateValue.gatesPending)) {
      for (const gate of stateValue.gatesPending) {
        if (!isRecord(gate) || typeof gate.receipt !== "string") continue;
        const receiptPath = normalizeRepositoryPath(gate.receipt);
        const receipt = receiptPath === undefined ? undefined : gateReceiptsByPath.get(receiptPath);
        if (receipt === undefined) {
          violations.push({
            path: policy.state.path,
            code: "missing-state-evidence",
            detail: `pending gate receipt does not resolve: ${gate.receipt}`,
          });
        } else if (receipt.verdict !== "pending") {
          violations.push({
            path: policy.state.path,
            code: "stale-state-gate",
            detail: `gatesPending points to a non-pending receipt: ${gate.receipt}`,
          });
        }
      }
    }
    if (Array.isArray(stateValue.waivers)) {
      for (const waiver of stateValue.waivers) {
        if (
          !isRecord(waiver) ||
          typeof waiver.receipt !== "string" ||
          typeof waiver.id !== "string"
        ) {
          continue;
        }
        const receiptPath = normalizeRepositoryPath(waiver.receipt);
        const receipt = receiptPath === undefined ? undefined : gateReceiptsByPath.get(receiptPath);
        const receiptWaivers = /** @type {unknown[]} */ (
          receipt !== undefined && Array.isArray(receipt.waivers) ? receipt.waivers : []
        );
        if (
          receipt === undefined ||
          !receiptWaivers.some((candidate) => isRecord(candidate) && candidate.id === waiver.id)
        ) {
          violations.push({
            path: policy.state.path,
            code: "missing-state-waiver",
            detail: `waiver ${waiver.id} does not resolve in ${waiver.receipt}`,
          });
        }
      }
    }
  }

  sortViolations(violations);
  return {
    ok: violations.length === 0,
    violations,
    trackedPathCount: trackedPaths.length,
    evolutionRecordCount: recordFiles.length,
    gateReceiptCount: gateFiles.length,
  };
}

/** @param {RepositoryCheckResult} result */
export function formatProcessArtifactResult(result) {
  if (result.ok) {
    return `process-artifact policy: PASS (${result.evolutionRecordCount} evolution record(s), ${result.gateReceiptCount} gate receipt(s))`;
  }
  return [
    `process-artifact policy: FAIL (${result.violations.length} violation(s))`,
    ...result.violations.map(
      (violation) => `- ${violation.path} [${violation.code}] ${violation.detail}`,
    ),
  ].join("\n");
}

const modulePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === modulePath) {
  const repositoryRoot = resolve(dirname(modulePath), "..");
  const arguments_ = process.argv.slice(2);
  const unknownArguments = arguments_.filter((argument) => argument !== "--require-tracked");
  if (unknownArguments.length > 0) {
    console.error(`unknown process-artifact option(s): ${unknownArguments.join(", ")}`);
    process.exitCode = 2;
  } else {
    const result = checkProcessArtifacts({
      repositoryRoot,
      requireTrackedEvidence: arguments_.includes("--require-tracked"),
    });
    const output = formatProcessArtifactResult(result);
    if (result.ok) console.log(output);
    else console.error(output);
    process.exitCode = result.ok ? 0 : 1;
  }
}
