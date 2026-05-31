import type { AgentName, BundleId } from "./ids.js";
import type { SemVer } from "./version.js";

/**
 * How much consent a bundle step needs, decided by the author and respected at run time (doc 00
 * "Vocabulary"; doc 10 `bundle <id> meta`). `"safe"` proceeds with minimal ceremony; `"dangerous"` requires
 * explicit confirmation.
 */
export type ConfirmationLevel = "safe" | "dangerous";

/**
 * The project's release identity (doc 06; doc 10 `project meta`). The name and version are required; the
 * rest are optional descriptive metadata.
 */
export interface ProjectMeta {
  /** The project name. */
  readonly name: string;
  /** The project's release version. */
  readonly version: SemVer;
  /** Optional one-line description. */
  readonly description?: string;
  /** Optional SPDX license identifier. */
  readonly license?: string;
  /** Optional repository URL. */
  readonly repository?: string;
  /** Optional author. */
  readonly author?: string;
}

/**
 * The parsed `manifest.yml` (doc 13 §2; doc 06): the project's release identity, the flat list of enabled
 * bundle ids, and the target agents. A bundle directory absent from {@link bundles} is disabled; the
 * {@link targets} are the peer-dependency agents the install checks for. Per-bundle metadata lives in each
 * bundle's own {@link BundleManifest}, not here.
 */
export interface Manifest {
  /** The project's release identity. */
  readonly meta: ProjectMeta;
  /** The flat list of enabled bundle ids. */
  readonly bundles: readonly BundleId[];
  /** The target agent runtimes this project supports. */
  readonly targets: readonly AgentName[];
}
