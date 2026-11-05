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
