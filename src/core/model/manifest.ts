import type { SkillRef } from "./bundle.js";
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
  /**
   * Registered PROJECT-scoped install-time helper skills (doc 10 row 178), living at the project root's
   * `installer-skills/`. Each is a {@link SkillRef} (`{ name, path }`): the `name` is the registry/deregister key,
   * the `path` locates the `SKILL.md` (conventional `installer-skills/<name>/SKILL.md`, or a `--path` location).
   * **NOT delivered** — install-time HELPERS the executing agent uses *during* install (doc 06 line 77; doc 07
   * line 51), the project-scope analogue of a bundle's `installerSkills`.
   *
   * This registry backs `add`/`remove`/completion; the `project installer-skills list` command instead SCANS the
   * root `installer-skills/` directory, EXCLUDING the main `<project>-installer` skill and the `<id>-advisor`
   * skills (doc 10 row 179) — neither of which is in this registry (they are created by `init` / `bundle <id>
   * advisor add`, not by `installer-skills add`), which is why `list` must scan rather than read the registry.
   * Absent in `manifest.yml` ⇒ empty (purely additive — an old/partial `manifest.yml` still parses).
   */
  readonly installerSkills: readonly SkillRef[];
}
