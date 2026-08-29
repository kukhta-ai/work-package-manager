import type { BundleId } from "./ids.js";
import type { ConfirmationLevel } from "./manifest.js";
import type { SemVer, VersionRange } from "./version.js";

/**
 * One registered payload skill (doc 10 row 170) — the delivered runtime product. A skill is identified by its
 * `name` (the registry key, the `skills remove <name>` deregister key, the menu line in `skills list`) AND
 * located by `path`, the bundle-relative path to its skill-frontmatter document (the conventional
 * `payload/agent-skills/<name>/SKILL.md`, or an arbitrary document basename at the `--path` location).
 *
 * The path is carried — unlike the bare-string `files`/`templates`/`scripts` registries — because `--path` can
 * move a skill document off the conventional location, so `skills list` and the downstream "Verify skill
 * registration" authoring task (doc 11) must be able to LOCATE each registered skill's file. Payload skills are
 * inert until install copies them into a scanned scope (doc 06), so this registry — not a directory scan — is
 * the authoritative list of what a bundle delivers.
 *
 * The same `{ name, path }` shape is reused by the bundle/project installer-skill registries (P/F).
 */
export interface SkillRef {
  /** The skill's registered name (the registry key + the `skills remove <name>` deregister key). */
  readonly name: string;
  /** The bundle-relative skill-document path (conventional `.../<name>/SKILL.md`, or an explicit `--path`). */
  readonly path: string;
}

/**
 * A bundle's registered payload references (doc 10 `files`/`templates`/`scripts` rows; doc 06/07 payload layout)
 * — the registry of paths the author has registered under each on-disk payload category, kept in `bundle.yml` so
 * a reference can be DEREGISTERED (`files remove`) while the file is left on disk (doc 10 row 167). Distinct from
 * the files themselves: it is the "or equivalent" registry doc 10 row 165 permits.
 *
 * Each category is a list of relative paths (relative to that category's on-disk directory), in registration
 * order: `files` (`payload/files/`) and `templates` (`payload/templates/`) both DELIVER to the environment;
 * `scripts` references `installer-scripts/` — install-time TOOLING (probes, smoke tests) that is **NOT
 * delivered** and lives as a SIBLING of `payload/` on disk (doc 06 line 77 / doc 07 line 51), yet is recorded
 * in this same `payload:` reference registry for representational consistency (the registry lists references;
 * the delivered-vs-install-time distinction is a downstream build concern, not where the list is kept). Each
 * category is purely additive — **absent in `bundle.yml` ⇒ that category is empty** — so an old or partial
 * manifest still parses everywhere (the parser is on the load path for every command).
 */
export interface BundlePayload {
  /** Registered `payload/files/` reference paths (relative to `payload/files/`), in registration order. */
  readonly files: readonly string[];
  /** Registered `payload/templates/` reference paths (relative to `payload/templates/`), in registration order. */
  readonly templates: readonly string[];
  /**
   * Registered `installer-scripts/` reference paths (relative to `installer-scripts/`), in registration order.
   * `installer-scripts/` is install-time tooling — NOT delivered to the user — and a sibling of `payload/` on
   * disk; the references are kept here under the `payload:` registry for consistency with files/templates.
   */
  readonly scripts: readonly string[];
  /**
   * Registered payload skills (doc 10 row 170) — the delivered runtime products under `payload/agent-skills/`.
   * Each is a {@link SkillRef} (`{ name, path }`): the `name` is the registry/deregister key, the `path` locates
   * its skill document (conventional `payload/agent-skills/<name>/SKILL.md`, or an arbitrary `--path`). Unlike
   * files/templates/scripts, payload skills are inert until install copies them into a scanned scope (doc 06),
   * so this registry — not a directory scan — is the authoritative list. Absent in `bundle.yml` ⇒ empty.
   */
  readonly skills: readonly SkillRef[];
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
  /**
   * Registered bundle-scoped install-time helper skills (doc 10 row 173). Each is a {@link SkillRef} (`{ name,
   * path }`): the `name` is the registry/deregister key, the `path` locates the `SKILL.md` (conventional
   * `installer-skills/<name>/SKILL.md`, or a `--path` location). **NOT payload** — installer-skills are
   * install-time HELPERS the executing agent uses *during* install, never delivered to the user (doc 06 line 77;
   * doc 07 line 51) — so they live in their OWN top-level registry, a sibling of {@link payload}, not inside it.
   *
   * This registry backs `add`/`remove`/completion; the `installer-skills list` command instead SCANS the
   * `bundles/<id>/installer-skills/` directory (the helpers are union-scanned at install — doc 06 — so an
   * author-placed `SKILL.md` is a real helper whether or not it was `add`-registered, and a `remove`-deregistered
   * helper whose file is left still scans). Absent in `bundle.yml` ⇒ empty (purely additive — an old/partial
   * `bundle.yml` still parses, as for {@link payload}).
   */
  readonly installerSkills: readonly SkillRef[];
}
