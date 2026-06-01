import type { BundleId } from "./ids.js";
import type { ConfirmationLevel } from "./manifest.js";
import type { SemVer, VersionRange } from "./version.js";

/**
 * A bundle's registered payload references (doc 10 `files`/`templates` rows; doc 06/07 payload layout) — the
 * registry of paths the author has registered under each on-disk payload category, kept in `bundle.yml` so a
 * reference can be DEREGISTERED (`files remove`) while the file is left on disk (doc 10 row 167). Distinct from
 * the files themselves: it is the "or equivalent" registry doc 10 row 165 permits.
 *
 * Each category is a list of relative paths (relative to that category's on-disk directory), in registration
 * order. Today only `files` (`payload/files/`); the upcoming `templates` (`payload/templates/`) and `scripts`
 * (`installer-scripts/`) families add their own categories the same minimal way.
 */
export interface BundlePayload {
  /** Registered `payload/files/` reference paths (relative to `payload/files/`), in registration order. */
  readonly files: readonly string[];
}

/**
 * The parsed `bundle.yml` of a single bundle (doc 13 §2; doc 06; doc 08). Holds the bundle's stable id, its
 * current version, the user-facing summary (the menu line), its confirmation level, the `requires` dependency
 * contract (a map of dependency {@link BundleId} to the npm-style {@link VersionRange} it must satisfy), and the
 * {@link BundlePayload} reference registry.
 *
 * Every field that is a domain primitive is already validated (it can only be a branded value), so a
 * `BundleManifest` is, by construction, well-formed at the type level.
 */
export interface BundleManifest {
  /** The bundle's stable identifier (never changes across releases). */
  readonly id: BundleId;
  /** The bundle's current version. */
  readonly version: SemVer;
  /** The user-facing one-liner the install menu shows. */
  readonly summary: string;
  /** How much consent this bundle's steps need. */
  readonly confirmation: ConfirmationLevel;
  /** The dependency contract: each required bundle id mapped to the version range it must satisfy. */
  readonly requires: ReadonlyMap<BundleId, VersionRange>;
  /** The registered payload references (doc 10 `files`). Absent in `bundle.yml` ⇒ every category empty. */
  readonly payload: BundlePayload;
}
