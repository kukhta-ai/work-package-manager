import { parseYaml } from "../../util/yaml.js";
import { ValidationError } from "../errors.js";

/**
 * The SKILL.md frontmatter validator (doc 13 §4 — a pure service; doc 05 §"Agent Skills, in depth": a SKILL.md
 * opens with a `---`-fenced YAML frontmatter block whose `name` and `description` are the required fields). The
 * `bundle <id> skills add` ATTACH branch (doc 10 row 170 step 2) "validates frontmatter" before registering an
 * author-placed SKILL.md; this is that validation.
 *
 * **Pure: string in, validated head out.** It takes the SKILL.md *content* as data and returns the parsed
 * `name`/`description` — the FILE READ is done by the operation through the FileSystem port (doc 13 §4: "services
 * that read content take it as data, and the operation does the I/O"). It imports ONLY the task-13 yaml leaf and
 * the typed error model — never the CLI framework, the subprocess library, or `node:fs` — so the import-boundary
 * rule on `src/core/` holds.
 *
 * It is reused by every skill-attach family: payload skills (O), bundle installer-skills (P), and project
 * installer-skills (F) all validate the same two required frontmatter fields before registering.
 */

/** The required frontmatter fields a valid SKILL.md head carries (doc 05). */
export interface SkillFrontmatter {
  /** The skill's `name` (lowercase-with-hyphens by convention; required, non-empty). */
  readonly name: string;
  /** The skill's `description` — the load-bearing "when to activate" field (required, non-empty). */
  readonly description: string;
}

/** Matches the leading `---`-fenced YAML block that MUST be the very first content of a SKILL.md (doc 05). */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Validate the frontmatter of a SKILL.md and return its `name` + `description` (doc 10 row 170 step 2).
 *
 * The leading `---`-fenced YAML block must be the very first content (doc 05: "the block must be the very first
 * content, fenced by `---`"); it is parsed via the task-13 yaml leaf, and both `name` and `description` must be
 * present as non-empty strings. Any failure — no frontmatter, a non-mapping head, a missing or empty
 * `name`/`description` — raises a {@link ValidationError} (exit 1; a content/schema defect, not a bad CLI
 * argument) naming the SKILL.md (`where`) and what is wrong, so the author can fix the file they placed.
 *
 * @param skillMd - The SKILL.md file content.
 * @param where - A human label for the SKILL.md (its path), included in error messages.
 * @returns The validated frontmatter (`name` + `description`).
 * @throws {ValidationError} When the frontmatter is missing, malformed, or missing a required field.
 */
export function validateSkillFrontmatter(skillMd: string, where: string): SkillFrontmatter {
  const match = FRONTMATTER.exec(skillMd);
  if (match === null) {
    throw new ValidationError(
      `SKILL.md at ${where} has no \`---\`-delimited frontmatter block at its start — a skill must open with a YAML head declaring at least name and description`,
    );
  }

  // The captured YAML head; parse it via the comment-tolerant leaf (the same one the schemas use).
  const head: unknown = parseYaml(match[1] as string);
  if (head === null || typeof head !== "object" || Array.isArray(head)) {
    throw new ValidationError(
      `SKILL.md at ${where} has a frontmatter block that is not a YAML mapping of fields`,
    );
  }
  const record = head as Record<string, unknown>;

  const name = record.name;
  if (typeof name !== "string" || name.length === 0) {
    throw new ValidationError(
      `SKILL.md at ${where} is missing a non-empty "name" in its frontmatter`,
    );
  }
  const description = record.description;
  if (typeof description !== "string" || description.length === 0) {
    throw new ValidationError(
      `SKILL.md at ${where} is missing a non-empty "description" in its frontmatter`,
    );
  }

  return { name, description };
}
