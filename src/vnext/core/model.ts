import { Ajv } from "ajv";
import { parse as parseVersion } from "semver";

/** A source definition for the recipient's existing agent; never an installed agent. */
export interface SetupDefinition {
  source: string;
  backend: "plain" | "apm";
}
export interface WorkOperation {
  operation: string;
  task: string;
  setup?: string | null;
}
export interface OperationGroup {
  operations: string[];
  groups: string[];
}
/** Independent vNext source contract; legacy manifest.yml remains unchanged. */
export interface PackageSource {
  schemaVersion: 1;
  name: string;
  version: string;
  work: WorkOperation[];
  groups: Record<string, OperationGroup>;
  workerSetup: { default?: string; setups: Record<string, SetupDefinition> };
  files: string[];
}

const slug = { type: "string", pattern: "^[a-z][a-z0-9-]*$" };
export const packageSchema = {
  $id: "https://wpm.local/schema/package-vnext-1",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "name", "version", "work", "groups", "workerSetup", "files"],
  properties: {
    schemaVersion: { const: 1 },
    name: slug,
    version: {
      type: "string",
      minLength: 1,
    },
    work: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["operation", "task"],
        properties: {
          operation: slug,
          task: { type: "string", pattern: "^[A-Za-z]+-[0-9]+$" },
          setup: { anyOf: [slug, { type: "null" }] },
        },
      },
    },
    groups: {
      type: "object",
      propertyNames: slug,
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["operations", "groups"],
        properties: {
          operations: { type: "array", uniqueItems: true, items: slug },
          groups: { type: "array", uniqueItems: true, items: slug },
        },
      },
    },
    workerSetup: {
      type: "object",
      additionalProperties: false,
      required: ["setups"],
      properties: {
        default: slug,
        setups: {
          type: "object",
          propertyNames: slug,
          additionalProperties: {
            type: "object",
            additionalProperties: false,
            required: ["source", "backend"],
            properties: {
              source: { type: "string", minLength: 1 },
              backend: { enum: ["plain", "apm"] },
            },
          },
        },
      },
    },
    files: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1 } },
  },
} as const;
const validateSchema = new Ajv({ allErrors: true, strict: true }).compile<PackageSource>(
  packageSchema,
);

/** Reject path escapes and filename aliases that cannot be represented on supported hosts. */
export function assertPortablePath(value: string): string {
  const path = value.startsWith("./") ? value.slice(2) : value;
  const segments = path.split("/");
  if (
    !path ||
    /[<>"|?*:\\]/.test(path) ||
    /[\p{Cc}\p{Cs}]/u.test(path) ||
    segments.some(
      (part) =>
        !part ||
        part.endsWith(".") ||
        part.endsWith(" ") ||
        /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(part),
    )
  )
    throw new Error(`unsafe portable path: ${value}`);
  return path;
}

/** Explicit source registration cannot turn developer state or known credential files into payload. */
export function assertSourcePath(value: string): string {
  const path = assertPortablePath(value);
  const privateNames = new Set([
    ".git",
    ".agents",
    ".claude",
    ".codex",
    ".bmad",
    ".quality",
    "_bmad",
    "_bmad-output",
    "skills-results",
    ".wpm-source",
    ".wpm-test",
    ".wpm-transactions",
    ".wpm-mutation.lock",
    ".wpm-apm",
    ".npmrc",
    ".env",
    ".ssh",
    ".aws",
    "node_modules",
    "backlog",
  ]);
  if (
    path.split("/").some((part) => {
      const lower = part.toLowerCase();
      return (
        privateNames.has(lower) ||
        lower.startsWith("wpm-repo-") ||
        lower.startsWith(".wpm-pending-") ||
        (lower.startsWith(".env.") && lower !== ".env.example" && lower !== ".env.template")
      );
    })
  )
    throw new Error(`development-only or private source path: ${value}`);
  return path;
}

/** Validate portable names used by operation and worker setup source paths. */
export function assertSlug(value: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(value) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(value))
    throw new Error(`invalid name: ${value}`);
}

/** Validate shape and cross-references without reading files or launching tools. */
export function parsePackage(value: unknown): PackageSource {
  if (!validateSchema(value))
    throw new Error(`invalid package.yml: ${new Ajv().errorsText(validateSchema.errors)}`);
  const version = parseVersion(value.version);
  if (
    !version ||
    `${version.version}${version.build.length ? `+${version.build.join(".")}` : ""}` !==
      value.version
  )
    throw new Error("package version must be canonical semver");
  const ids = new Set<string>();
  const tasks = new Set<string>();
  for (const work of value.work) {
    assertSlug(work.operation);
    if (ids.has(work.operation)) throw new Error(`duplicate operation: ${work.operation}`);
    if (tasks.has(work.task.toLowerCase()))
      throw new Error(`task belongs to multiple operations: ${work.task}`);
    ids.add(work.operation);
    tasks.add(work.task.toLowerCase());
    if (
      work.setup !== undefined &&
      work.setup !== null &&
      !Object.hasOwn(value.workerSetup.setups, work.setup)
    ) {
      throw new Error(`unknown setup: ${work.setup}`);
    }
  }
  const defaultSetup = value.workerSetup.default;
  if (defaultSetup !== undefined && !Object.hasOwn(value.workerSetup.setups, defaultSetup))
    throw new Error(`unknown default setup: ${defaultSetup}`);
  for (const definition of Object.values(value.workerSetup.setups))
    assertSourcePath(definition.source);
  const portableFiles = new Set<string>();
  for (const file of value.files) {
    const portable = assertSourcePath(file).normalize("NFC").toLowerCase();
    if (
      portableFiles.has(portable) ||
      [...portableFiles].some(
        (other) => other.startsWith(`${portable}/`) || portable.startsWith(`${other}/`),
      )
    )
      throw new Error(`portable payload path collision: ${file}`);
    portableFiles.add(portable);
    if (!assertSourcePath(file).startsWith("payload/"))
      throw new Error(`payload file must be under payload/: ${file}`);
  }
  for (const group of Object.keys(value.groups)) selectOperations(value, group);
  return value;
}

/** Selection expands nested groups, without inventing prerequisites or sequence. */
export function selectOperations(source: PackageSource, group: string): string[] {
  const selected = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const known = new Set(source.work.map((work) => work.operation));
  const visit = (name: string): void => {
    if (visiting.has(name)) throw new Error(`cyclic group: ${name}`);
    if (visited.has(name)) return;
    const definition = Object.hasOwn(source.groups, name) ? source.groups[name] : undefined;
    if (!definition) throw new Error(`unknown group: ${name}`);
    visiting.add(name);
    for (const operation of definition.operations) {
      if (!known.has(operation)) throw new Error(`unknown operation: ${operation}`);
      selected.add(operation);
    }
    for (const child of definition.groups) visit(child);
    visiting.delete(name);
    visited.add(name);
  };
  visit(group);
  return [...selected].sort();
}

/** Null explicitly disables inheritance. Named definitions never become an implicit default. */
export function effectiveSetup(source: PackageSource, operation: WorkOperation): string | null {
  return operation.setup === undefined ? (source.workerSetup.default ?? null) : operation.setup;
}

/** Preflight the entire batch; authored sources are never part of the removal plan. */
export function removeSetups(source: PackageSource, names: readonly string[]): PackageSource {
  const selected = new Set(names);
  if (selected.size === 0) throw new Error("select at least one setup");
  for (const name of selected) {
    if (!Object.hasOwn(source.workerSetup.setups, name)) throw new Error(`unknown setup: ${name}`);
    if (source.work.some((work) => effectiveSetup(source, work) === name))
      throw new Error(`setup is referenced by work: ${name}`);
  }
  const setups = Object.fromEntries(
    Object.entries(source.workerSetup.setups).filter(([name]) => !selected.has(name)),
  );
  const oldDefault = source.workerSetup.default;
  const workerSetup =
    oldDefault === undefined || selected.has(oldDefault)
      ? { setups }
      : { default: oldDefault, setups };
  return { ...source, workerSetup };
}

/** New package source starts with no implicit setup or recipient tooling prerequisite. */
export function emptyPackage(name: string): PackageSource {
  assertSlug(name);
  return {
    schemaVersion: 1,
    name,
    version: "0.1.0",
    work: [],
    groups: {},
    workerSetup: { setups: {} },
    files: [],
  };
}

/** Stable JSON representation used for contracts and locks, independent of object insertion order. */
export function stableJson(value: unknown): string {
  const stable = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(stable);
    if (entry !== null && typeof entry === "object")
      return Object.fromEntries(
        Object.keys(entry)
          .sort()
          .map((key) => [key, stable((entry as Record<string, unknown>)[key])]),
      );
    return entry;
  };
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}
