import {
  type AgentName,
  type BundleId,
  type Manifest,
  ok,
  type Parsed,
  type ProjectMeta,
  parseAgentName,
  parseBundleId,
  parseSemVer,
} from "../../model/index.js";
import { isPlainObject, optionalString, requireArray, requireString } from "./problems.js";

/**
 * The plain-object shape of a `manifest.yml`, as the YAML layer (task-13) reads and writes it. This is the
 * serialization target — pure data, all strings — distinct from the parsed {@link Manifest} (whose fields
 * are branded domain values). Optional `project` fields are omitted when absent.
 */
export interface ManifestData {
  readonly project: {
    readonly name: string;
    readonly version: string;
    readonly description?: string;
    readonly license?: string;
    readonly repository?: string;
    readonly author?: string;
  };
  readonly targets: readonly string[];
  readonly bundles: readonly string[];
}

const CTX = "manifest";

/**
 * Parse already-parsed manifest data into a {@link Manifest} (doc 13 §4; doc 06). Validates structure first
 * (object, required keys, value types), then delegates domain values to the task-10 parsers
 * (`parseSemVer`/`parseAgentName`/`parseBundleId`) so ids/versions follow the model's rules (AC#4). Pure and
 * total — returns a {@link Parsed}, never throws; fails at the first problem with a field-precise message.
 *
 * Note: `bundles` is a **flat list of id strings** (doc 06 "flat list of enabled bundle IDs"; doc 00; doc
 * 13). It is not a list of `{ id }` objects.
 *
 * @param data - Already-parsed manifest data (e.g. from YAML), of unknown shape.
 * @returns The parsed {@link Manifest}, or a {@link ValidationProblem}.
 */
export function parseManifest(data: unknown): Parsed<Manifest> {
  if (!isPlainObject(data)) {
    return { ok: false, problem: { message: `${CTX}: must be a mapping`, field: CTX } };
  }

  const projectRaw = data.project;
  if (!isPlainObject(projectRaw)) {
    return {
      ok: false,
      problem: { message: `${CTX}: "project" is required and must be a mapping`, field: "project" },
    };
  }

  const name = requireString(projectRaw, "name", CTX, "project");
  if (!name.ok) return name;

  const versionStr = requireString(projectRaw, "version", CTX, "project");
  if (!versionStr.ok) return versionStr;
  const version = parseSemVer(versionStr.value);
  if (!version.ok) {
    return {
      ok: false,
      problem: {
        message: `${CTX}: "project.version" ${version.problem.message}`,
        field: "project.version",
      },
    };
  }

  const description = optionalString(projectRaw, "description", CTX, "project");
  if (!description.ok) return description;
  const license = optionalString(projectRaw, "license", CTX, "project");
  if (!license.ok) return license;
  const repository = optionalString(projectRaw, "repository", CTX, "project");
  if (!repository.ok) return repository;
  const author = optionalString(projectRaw, "author", CTX, "project");
  if (!author.ok) return author;

  const meta: ProjectMeta = {
    name: name.value,
    version: version.value,
    ...(description.value !== undefined ? { description: description.value } : {}),
    ...(license.value !== undefined ? { license: license.value } : {}),
    ...(repository.value !== undefined ? { repository: repository.value } : {}),
    ...(author.value !== undefined ? { author: author.value } : {}),
  };

  const targetsRaw = requireArray(data, "targets", CTX);
  if (!targetsRaw.ok) return targetsRaw;
  const targets: AgentName[] = [];
  for (let i = 0; i < targetsRaw.value.length; i++) {
    const entry = targetsRaw.value[i];
    if (typeof entry !== "string") {
      return {
        ok: false,
        problem: { message: `${CTX}: "targets[${i}]" must be a string`, field: `targets[${i}]` },
      };
    }
    const parsed = parseAgentName(entry);
    if (!parsed.ok) {
      return {
        ok: false,
        problem: {
          message: `${CTX}: "targets[${i}]" ${parsed.problem.message}`,
          field: `targets[${i}]`,
        },
      };
    }
    targets.push(parsed.value);
  }

  const bundlesRaw = requireArray(data, "bundles", CTX);
  if (!bundlesRaw.ok) return bundlesRaw;
  const bundles: BundleId[] = [];
  for (let i = 0; i < bundlesRaw.value.length; i++) {
    const entry = bundlesRaw.value[i];
    if (typeof entry !== "string") {
      return {
        ok: false,
        problem: {
          message: `${CTX}: "bundles[${i}]" must be a string (a bundle id)`,
          field: `bundles[${i}]`,
        },
      };
    }
    const parsed = parseBundleId(entry);
    if (!parsed.ok) {
      return {
        ok: false,
        problem: {
          message: `${CTX}: "bundles[${i}]" ${parsed.problem.message}`,
          field: `bundles[${i}]`,
        },
      };
    }
    bundles.push(parsed.value);
  }

  return ok({ meta, bundles, targets });
}

/**
 * Serialize a {@link Manifest} back into plain {@link ManifestData} for the YAML layer to emit (doc 13 §4).
 * Absent optional `project` fields are omitted, so the output matches the shape of a hand-written
 * `manifest.yml`. Round-trips: `parseManifest(serializeManifest(m))` yields a value equal to `m` (modulo the
 * model's semver normalization). Pure.
 *
 * @param manifest - The manifest to serialize.
 * @returns The plain-object representation.
 */
export function serializeManifest(manifest: Manifest): ManifestData {
  const { meta } = manifest;
  return {
    project: {
      name: meta.name,
      version: meta.version,
      ...(meta.description !== undefined ? { description: meta.description } : {}),
      ...(meta.license !== undefined ? { license: meta.license } : {}),
      ...(meta.repository !== undefined ? { repository: meta.repository } : {}),
      ...(meta.author !== undefined ? { author: meta.author } : {}),
    },
    targets: manifest.targets.map((t) => t as string),
    bundles: manifest.bundles.map((b) => b as string),
  };
}
