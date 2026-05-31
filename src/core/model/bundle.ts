import type { BundleId } from "./ids.js";
import type { ConfirmationLevel } from "./manifest.js";
import type { SemVer, VersionRange } from "./version.js";

/**
 * The parsed `bundle.yml` of a single bundle (doc 13 §2; doc 06; doc 08). Holds the bundle's stable id, its
 * current version, the user-facing summary (the menu line), its confirmation level, and the `requires`
 * dependency contract: a map of dependency {@link BundleId} to the npm-style {@link VersionRange} it must
 * satisfy.
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
}
