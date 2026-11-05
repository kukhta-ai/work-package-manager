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
import { parseSkillRefs } from "./bundle.js";
import { isPlainObject, optionalString, requireArray, requireString } from "./problems.js";

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

  // `installerSkills` is OPTIONAL and top-level (the project-scope analogue of a bundle's `installerSkills`).
  // Absent ⇒ `[]`, purely additive (every existing `manifest.yml` — and the `minimal` template's, which has no
  // such key — still parses). When present it must be a list of `{name, path}` mappings; it rides the SHARED
  // `parseSkillRefs` validator (exported from the bundle schema), parameterised by the `installerSkills` field
  // label so its errors name the right registry.
  const installerSkills = parseSkillRefs(data.installerSkills, CTX, "installerSkills");
  if (!installerSkills.ok) return installerSkills;

  return ok({ meta, bundles, targets, installerSkills: installerSkills.value });
}
