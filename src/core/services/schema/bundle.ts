import {
  type BundleId,
  type BundleManifest,
  type BundlePayload,
  type ConfirmationLevel,
  ok,
  type Parsed,
  parseBundleId,
  parseSemVer,
  parseVersionRange,
  type SkillRef,
  type VersionRange,
} from "../../model/index.js";
import {
  PAYLOAD_SKILL_PATH_REQUIREMENT,
  payloadSkillPackageRoot,
  skillPackageRootsOverlap,
} from "../skill-ref-path.js";
import { isPlainObject, requireString } from "./problems.js";

/** The valid `confirmation` values, kept in one place for the parser's check and the error message. */
const CONFIRMATION_LEVELS: readonly ConfirmationLevel[] = ["safe", "dangerous"];

/**
 * The plain-object shape of a `bundle.yml`, as the YAML layer (task-13) reads and writes it. The
 * serialization target — pure data, `requires` as a plain `{ id: range }` record (not a Map) — distinct from
 * the parsed {@link BundleManifest}.
 */
export interface BundleManifestData {
  readonly id: string;
  readonly version: string;
  readonly summary: string;
  readonly confirmation: string;
  readonly requires: Readonly<Record<string, string>>;
  readonly payload: {
    readonly files: readonly string[];
    readonly templates: readonly string[];
    readonly scripts: readonly string[];
    readonly skills: readonly { readonly name: string; readonly path: string }[];
  };
  /**
   * The bundle-scoped install-time helper-skill registry (doc 10 row 173) — a TOP-LEVEL field (sibling of
   * `payload`, NOT inside it, because installer-skills are not delivered payload — doc 06/07). A list of `{name,
   * path}` mappings. Absent ⇒ empty.
   */
  readonly installerSkills: readonly { readonly name: string; readonly path: string }[];
}

/**
 * Parse already-parsed bundle data into a {@link BundleManifest} (doc 13 §4; doc 06; doc 08). Validates
 * structure, then delegates id/version/range to the task-10 parsers (AC#4). The `requires` map is a record of
 * `dependency-id: version-range`; each key is parsed as a {@link BundleId} and each value as a
 * {@link VersionRange}. Pure and total; fails at the first problem with a field-precise message.
 *
 * @param data - Already-parsed bundle data, of unknown shape.
 * @returns The parsed {@link BundleManifest}, or a {@link ValidationProblem}.
 */
export function parseBundleManifest(data: unknown): Parsed<BundleManifest> {
  if (!isPlainObject(data)) {
    return { ok: false, problem: { message: "bundle: must be a mapping", field: "bundle" } };
  }

  // Resolve the id first so later messages can name the bundle.
  const idStr = requireString(data, "id", "bundle");
  if (!idStr.ok) return idStr;
  const id = parseBundleId(idStr.value);
  if (!id.ok) {
    return { ok: false, problem: { message: `bundle: "id" ${id.problem.message}`, field: "id" } };
  }
  const ctx = `bundle "${id.value}"`;

  const versionStr = requireString(data, "version", ctx);
  if (!versionStr.ok) return versionStr;
  const version = parseSemVer(versionStr.value);
  if (!version.ok) {
    return {
      ok: false,
      problem: { message: `${ctx}: "version" ${version.problem.message}`, field: "version" },
    };
  }

  const summary = requireString(data, "summary", ctx);
  if (!summary.ok) return summary;

  const confirmationStr = requireString(data, "confirmation", ctx);
  if (!confirmationStr.ok) return confirmationStr;
  if (!CONFIRMATION_LEVELS.includes(confirmationStr.value as ConfirmationLevel)) {
    return {
      ok: false,
      problem: {
        message: `${ctx}: "confirmation" must be one of ${CONFIRMATION_LEVELS.join(", ")} (got "${confirmationStr.value}")`,
        field: "confirmation",
      },
    };
  }
  const confirmation = confirmationStr.value as ConfirmationLevel;

  // `requires` is a mapping of dependency id -> version range.
  const requiresRaw = data.requires;
  if (!isPlainObject(requiresRaw)) {
    return {
      ok: false,
      problem: {
        message: `${ctx}: "requires" must be a mapping of bundle id to version range`,
        field: "requires",
      },
    };
  }
  const requires = new Map<BundleId, VersionRange>();
  for (const [depIdRaw, rangeRaw] of Object.entries(requiresRaw)) {
    const depId = parseBundleId(depIdRaw);
    if (!depId.ok) {
      return {
        ok: false,
        problem: {
          message: `${ctx}: "requires" key "${depIdRaw}" ${depId.problem.message}`,
          field: `requires.${depIdRaw}`,
        },
      };
    }
    if (typeof rangeRaw !== "string") {
      return {
        ok: false,
        problem: {
          message: `${ctx}: "requires.${depIdRaw}" must be a version-range string`,
          field: `requires.${depIdRaw}`,
        },
      };
    }
    const range = parseVersionRange(rangeRaw);
    if (!range.ok) {
      return {
        ok: false,
        problem: {
          message: `${ctx}: "requires.${depIdRaw}" ${range.problem.message}`,
          field: `requires.${depIdRaw}`,
        },
      };
    }
    requires.set(depId.value, range.value);
  }

  // `payload` is OPTIONAL: absent in an OLD `bundle.yml` ⇒ every category empty (so the field is purely
  // additive and pre-existing bundles still parse). When present it must be a mapping; each category
  // (`payload.files`, `payload.templates`), when present, must be a list of path strings (the registered
  // relative paths under that category's on-disk directory).
  const payloadResult = parsePayload(data.payload, ctx);
  if (!payloadResult.ok) {
    return payloadResult;
  }

  // `installerSkills` is OPTIONAL and a TOP-LEVEL field (sibling of `payload`, not inside it — installer-skills
  // are install-time HELPERS, not delivered payload — doc 06 line 77 / doc 07 line 51). Absent ⇒ `[]`, purely
  // additive (every existing `bundle.yml` still parses). When present it must be a list of `{name, path}`
  // mappings — the SAME structured shape as `payload.skills`, so it rides the shared `parseSkillRefs` validator
  // (parameterised by the field label so its errors name `installerSkills[i]…`).
  const installerSkills = parseSkillRefs(data.installerSkills, ctx, "installerSkills");
  if (!installerSkills.ok) {
    return installerSkills;
  }

  return ok({
    id: id.value,
    version: version.value,
    summary: summary.value,
    confirmation,
    requires,
    payload: payloadResult.value,
    installerSkills: installerSkills.value,
  });
}

/**
 * Parse the optional `payload` mapping into a {@link BundlePayload} (doc 10 `files`/`templates`/`scripts`/`skills`
 * rows). Absent ⇒ every category empty (old-bundle compatibility); a PARTIAL `payload` (e.g. only `files`) ⇒ the
 * missing categories are empty too. Validates that, when present, `payload` is a mapping, each present
 * path-list category (`payload.files`/`templates`/`scripts`) is a list of strings, and `payload.skills` is a
 * list of `{name, path}` mappings. Pure and total.
 *
 * @param raw - The `payload` value (possibly `undefined`).
 * @param ctx - The bundle context for error messages.
 * @returns The parsed {@link BundlePayload}, or a {@link ValidationProblem}.
 */
function parsePayload(raw: unknown, ctx: string): Parsed<BundlePayload> {
  // Absent payload ⇒ every category empty. The field is purely additive: an old/partial bundle.yml still parses.
  if (raw === undefined) {
    return ok({ files: [], templates: [], scripts: [], skills: [] });
  }
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      problem: { message: `${ctx}: "payload" must be a mapping`, field: "payload" },
    };
  }
  // Each category is independently optional (absent ⇒ empty) and, when present, must be a list of path strings.
  const files = parsePayloadCategory(raw.files, "payload.files", ctx);
  if (!files.ok) return files;
  const templates = parsePayloadCategory(raw.templates, "payload.templates", ctx);
  if (!templates.ok) return templates;
  const scripts = parsePayloadCategory(raw.scripts, "payload.scripts", ctx);
  if (!scripts.ok) return scripts;
  // `skills` is a structured registry (a list of `{name, path}` mappings, not bare strings — a skill is keyed by
  // name AND located by a relocatable path), so it has its own parser rather than `parsePayloadCategory`.
  const skills = parseSkillRefs(raw.skills, ctx, "payload.skills");
  if (!skills.ok) return skills;
  return ok({
    files: files.value,
    templates: templates.value,
    scripts: scripts.value,
    skills: skills.value,
  });
}

/**
 * Parse an optional skill-reference registry into a {@link SkillRef} list (doc 10 rows 170 + 173) — shared by the
 * `payload.skills` payload-skill registry AND the top-level `installerSkills` installer-skill registry, which have
 * the IDENTICAL `{name, path}` shape (a skill is identified by its name and located by a relocatable skill
 * document path — unlike the bare-string `payload.files`/etc). Payload skill documents may use any basename;
 * their containing directory is the package. The `fieldBase` parameter labels the registry in error messages
 * (`payload.skills` vs `installerSkills`), so the two call sites share one validator without confusing the
 * author about which list is malformed. Absent ⇒ `[]` (old/partial-bundle compatibility, like the other
 * registries); present ⇒ must be a list of mappings each with a string `name` AND a string `path` (else a
 * field-precise {@link ValidationProblem} naming `<fieldBase>[i].…`). Pure and total.
 *
 * @param raw - The registry value (possibly `undefined`).
 * @param ctx - The bundle context for error messages.
 * @param fieldBase - The registry's dotted field label (e.g. `payload.skills` or `installerSkills`).
 * @returns The parsed {@link SkillRef} list, or a {@link ValidationProblem}.
 */
export function parseSkillRefs(
  raw: unknown,
  ctx: string,
  fieldBase: string,
): Parsed<readonly SkillRef[]> {
  if (raw === undefined) {
    return ok([]);
  }
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      problem: {
        message: `${ctx}: "${fieldBase}" must be a list of { name, path } mappings`,
        field: fieldBase,
      },
    };
  }
  const skills: SkillRef[] = [];
  const packageRoots: Array<{ readonly root: string; readonly field: string }> = [];
  const payloadSkillNames = new Map<string, string>();
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    const field = `${fieldBase}[${i}]`;
    if (!isPlainObject(entry)) {
      return {
        ok: false,
        problem: { message: `${ctx}: "${field}" must be a { name, path } mapping`, field },
      };
    }
    if (typeof entry.name !== "string" || entry.name.length === 0) {
      return {
        ok: false,
        problem: {
          message: `${ctx}: "${field}.name" must be a non-empty string`,
          field: `${field}.name`,
        },
      };
    }
    if (typeof entry.path !== "string" || entry.path.length === 0) {
      return {
        ok: false,
        problem: {
          message: `${ctx}: "${field}.path" must be a non-empty string`,
          field: `${field}.path`,
        },
      };
    }
    if (fieldBase === "payload.skills") {
      const priorNameField = payloadSkillNames.get(entry.name);
      if (priorNameField !== undefined) {
        return {
          ok: false,
          problem: {
            message: `${ctx}: "${field}.name" duplicates ${priorNameField}; payload skill names must be unique because name is the deregistration key`,
            field: `${field}.name`,
          },
        };
      }
      const packageRoot = payloadSkillPackageRoot(entry.path);
      if (packageRoot === undefined) {
        return {
          ok: false,
          problem: {
            message: `${ctx}: "${field}.path" ${PAYLOAD_SKILL_PATH_REQUIREMENT}`,
            field: `${field}.path`,
          },
        };
      }
      const overlap = packageRoots.find((candidate) =>
        skillPackageRootsOverlap(candidate.root, packageRoot),
      );
      if (overlap !== undefined) {
        return {
          ok: false,
          problem: {
            message: `${ctx}: "${field}.path" resolves to package "${packageRoot}", which overlaps ${overlap.field} package "${overlap.root}"`,
            field: `${field}.path`,
          },
        };
      }
      payloadSkillNames.set(entry.name, `${field}.name`);
      packageRoots.push({ root: packageRoot, field: `${field}.path` });
    }
    skills.push({ name: entry.name, path: entry.path });
  }
  return ok(skills);
}

/**
 * Parse one optional `payload.<category>` sequence into a string list. Absent ⇒ `[]`; present ⇒ must be a list
 * of path strings (else a field-precise {@link ValidationProblem} naming `payload.<category>`). Pure and total.
 *
 * @param raw - The category value (possibly `undefined`).
 * @param field - The dotted field name for messages (e.g. `payload.templates`).
 * @param ctx - The bundle context for error messages.
 * @returns The parsed path list, or a {@link ValidationProblem}.
 */
function parsePayloadCategory(raw: unknown, field: string, ctx: string): Parsed<readonly string[]> {
  if (raw === undefined) {
    return ok([]);
  }
  if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== "string")) {
    return {
      ok: false,
      problem: { message: `${ctx}: "${field}" must be a list of path strings`, field },
    };
  }
  return ok([...(raw as string[])]);
}

/**
 * Serialize a {@link BundleManifest} back into plain {@link BundleManifestData} for the YAML layer (doc 13
 * §4). The `requires` Map becomes a plain record. Round-trips with {@link parseBundleManifest} (modulo semver
 * normalization). Pure.
 *
 * @param bundle - The bundle manifest to serialize.
 * @returns The plain-object representation.
 */
export function serializeBundleManifest(bundle: BundleManifest): BundleManifestData {
  const requires: Record<string, string> = {};
  for (const [depId, range] of bundle.requires) {
    requires[depId as string] = range as string;
  }
  return {
    id: bundle.id,
    version: bundle.version,
    summary: bundle.summary,
    confirmation: bundle.confirmation,
    requires,
    // Always emit `payload` with every category (an empty list serialises as `files: []` / `templates: []` /
    // `scripts: []` / `skills: []`) so a freshly-created bundle.yml carries the fields. Round-trips with
    // `parseBundleManifest` (absent ⇒ empty; present ⇒ the same lists/refs). `skills` entries are `{name, path}`
    // mappings (the structured payload-skill registry, doc 10 row 170).
    payload: {
      files: [...bundle.payload.files],
      templates: [...bundle.payload.templates],
      scripts: [...bundle.payload.scripts],
      skills: bundle.payload.skills.map((skill) => ({ name: skill.name, path: skill.path })),
    },
    // Always emit `installerSkills` (empty ⇒ `[]`), a sibling of `payload` — the bundle-scoped install-time
    // helper-skill registry (doc 10 row 173). Round-trips with `parseBundleManifest` (absent ⇒ empty).
    installerSkills: bundle.installerSkills.map((skill) => ({
      name: skill.name,
      path: skill.path,
    })),
  };
}
