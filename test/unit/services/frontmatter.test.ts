import { describe, expect, it } from "vitest";
import { DomainError } from "../../../src/core/errors.js";
import { validateSkillFrontmatter } from "../../../src/core/services/frontmatter.js";

/**
 * Unit tests for the SKILL.md frontmatter validator (doc 10 row 170 step 2; doc 05). A pure helper: SKILL.md
 * content in, the validated `{name, description}` out, or a typed `ValidationError` (category `validation` ⇒
 * exit 1). It underpins the `bundle <id> skills add` ATTACH branch (and, later, P/F's installer-skill attach),
 * so the two required frontmatter fields are validated once, here.
 */

/** Assert that calling `fn` throws a DomainError of category `validation` whose message contains `needle`. */
function expectValidationError(fn: () => void, needle: string): void {
  let thrown: unknown;
  try {
    fn();
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(DomainError);
  expect((thrown as DomainError).category).toBe("validation");
  expect((thrown as Error).message).toContain(needle);
}

const WHERE = "bundles/web/payload/agent-skills/handoff/SKILL.md";

describe("validateSkillFrontmatter", () => {
  it("accepts a well-formed head and returns name + description", () => {
    const md =
      "---\nname: handoff-web\ndescription: Hand off a web page\n---\n\n# handoff-web\nbody";
    expect(validateSkillFrontmatter(md, WHERE)).toEqual({
      name: "handoff-web",
      description: "Hand off a web page",
    });
  });

  it("tolerates extra optional frontmatter fields (only name + description are required)", () => {
    const md =
      "---\nname: x\ndescription: y\nversion: 1.0.0\nlicense: MIT\ntags: [a, b]\n---\nbody\n";
    expect(validateSkillFrontmatter(md, WHERE)).toEqual({ name: "x", description: "y" });
  });

  it("rejects a SKILL.md with no frontmatter block (body only)", () => {
    expectValidationError(
      () => validateSkillFrontmatter("# just a heading\nno frontmatter\n", WHERE),
      "no",
    );
  });

  it("rejects frontmatter that is not the very first content (text before the ---)", () => {
    // doc 05: the block must be the very first content. A leading line before `---` is not valid frontmatter.
    const md = "Some preamble\n---\nname: x\ndescription: y\n---\n";
    expectValidationError(() => validateSkillFrontmatter(md, WHERE), "no");
  });

  it("rejects a missing name", () => {
    const md = "---\ndescription: y\n---\nbody\n";
    expectValidationError(() => validateSkillFrontmatter(md, WHERE), "name");
  });

  it("rejects a missing description", () => {
    const md = "---\nname: x\n---\nbody\n";
    expectValidationError(() => validateSkillFrontmatter(md, WHERE), "description");
  });

  it("rejects an empty name", () => {
    const md = '---\nname: ""\ndescription: y\n---\nbody\n';
    expectValidationError(() => validateSkillFrontmatter(md, WHERE), "name");
  });

  it("rejects an empty description", () => {
    const md = '---\nname: x\ndescription: ""\n---\nbody\n';
    expectValidationError(() => validateSkillFrontmatter(md, WHERE), "description");
  });

  it("names the offending SKILL.md (where) in the error message", () => {
    expectValidationError(() => validateSkillFrontmatter("body only\n", WHERE), WHERE);
  });

  it("accepts CRLF line endings in the frontmatter fence", () => {
    const md = "---\r\nname: x\r\ndescription: y\r\n---\r\nbody\r\n";
    expect(validateSkillFrontmatter(md, WHERE)).toEqual({ name: "x", description: "y" });
  });
});
