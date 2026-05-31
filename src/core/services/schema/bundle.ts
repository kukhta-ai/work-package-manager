import {
  type BundleId,
  type BundleManifest,
  type ConfirmationLevel,
  ok,
  type Parsed,
  parseBundleId,
  parseSemVer,
  parseVersionRange,
  type VersionRange,
} from "../../model/index.js";
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

  return ok({
    id: id.value,
    version: version.value,
    summary: summary.value,
    confirmation,
    requires,
  });
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
  };
}
