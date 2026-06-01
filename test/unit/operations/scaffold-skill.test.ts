import { describe, expect, it } from "vitest";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { DomainError } from "../../../src/core/errors.js";
import { scaffoldAdvisor } from "../../../src/core/operations/advisor.js";
import { renderSkillStub } from "../../../src/core/operations/scaffold-skill.js";

/**
 * Unit tests for the GENERALISED stub renderer (`renderSkillStub`) — the helper lifted out of the original
 * `scaffoldAdvisor` so the advisor, payload skills (O), and the installer-skill families (P/F) all render their
 * snippet through ONE implementation. Two halves: (1) `renderSkillStub` directly (resolve → render → write,
 * no-op-if-exists, NotFound on a missing template/snippet); (2) `scaffoldAdvisor` still works after being
 * refactored to delegate to it (the generalisation preserved behaviour).
 */

const ROOT = "/proj";
const BUILTIN = "/builtin-templates";

/** Seed the built-in minimal project template with an advisor snippet + a generic test snippet. */
function seedTemplates(): MemoryFileSystem {
  const fs = new MemoryFileSystem();
  fs.write(`${BUILTIN}/project/minimal/template.yml`, "name: minimal\nscope: project\n");
  fs.write(
    `${BUILTIN}/project/minimal/snippets/advisor.SKILL.md.tmpl`,
    "---\nname: {{bundle-id}}-advisor\n---\n\n# {{bundle-id}} advisor\n",
  );
  fs.write(
    `${BUILTIN}/project/minimal/snippets/payload-skill.SKILL.md.tmpl`,
    "---\nname: {{skill-name}}\ndescription: TODO for {{skill-name}}\n---\n\n# {{skill-name}}\n",
  );
  return fs;
}

describe("renderSkillStub", () => {
  it("resolves the snippet, substitutes placeholders, and writes the stub at the given rel path", () => {
    const fs = seedTemplates();
    const written = renderSkillStub(
      { builtinTemplatesRoot: BUILTIN },
      fs,
      ROOT,
      "payload/agent-skills/foo/SKILL.md",
      "payload-skill.SKILL.md.tmpl",
      new Map([["skill-name", "foo"]]),
    );
    expect(written).toEqual([`${ROOT}/payload/agent-skills/foo/SKILL.md`]);
    const content = fs.read(`${ROOT}/payload/agent-skills/foo/SKILL.md`);
    expect(content).toContain("name: foo");
    expect(content).toContain("TODO for foo");
  });

  it("is a no-op (returns []) when the stub already exists and does not clobber it", () => {
    const fs = seedTemplates();
    fs.write(`${ROOT}/payload/agent-skills/foo/SKILL.md`, "AUTHORED — keep me\n");
    const written = renderSkillStub(
      { builtinTemplatesRoot: BUILTIN },
      fs,
      ROOT,
      "payload/agent-skills/foo/SKILL.md",
      "payload-skill.SKILL.md.tmpl",
      new Map([["skill-name", "foo"]]),
    );
    expect(written).toEqual([]);
    expect(fs.read(`${ROOT}/payload/agent-skills/foo/SKILL.md`)).toBe("AUTHORED — keep me\n");
  });

  it("ignores unused substitution params (e.g. passing bundle-id to a snippet that only uses skill-name)", () => {
    const fs = seedTemplates();
    expect(() =>
      renderSkillStub(
        { builtinTemplatesRoot: BUILTIN },
        fs,
        ROOT,
        "payload/agent-skills/bar/SKILL.md",
        "payload-skill.SKILL.md.tmpl",
        new Map([
          ["skill-name", "bar"],
          ["bundle-id", "host"],
        ]),
      ),
    ).not.toThrow();
    expect(fs.read(`${ROOT}/payload/agent-skills/bar/SKILL.md`)).toContain("name: bar");
  });

  it("throws NotFound when the snippet is missing from the template", () => {
    const fs = seedTemplates();
    let thrown: unknown;
    try {
      renderSkillStub(
        { builtinTemplatesRoot: BUILTIN },
        fs,
        ROOT,
        "x/SKILL.md",
        "does-not-exist.tmpl",
        new Map(),
      );
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DomainError);
    expect((thrown as DomainError).category).toBe("not-found");
  });
});

describe("scaffoldAdvisor (delegates to renderSkillStub — behaviour preserved)", () => {
  it("renders the advisor stub at installer-skills/<id>-advisor/SKILL.md with {{bundle-id}} substituted", () => {
    const fs = seedTemplates();
    const written = scaffoldAdvisor({ builtinTemplatesRoot: BUILTIN }, fs, ROOT, "web");
    expect(written).toEqual([`${ROOT}/installer-skills/web-advisor/SKILL.md`]);
    const content = fs.read(`${ROOT}/installer-skills/web-advisor/SKILL.md`);
    expect(content).toContain("name: web-advisor");
    expect(content).toContain("# web advisor");
  });

  it("is a no-op when the advisor already exists", () => {
    const fs = seedTemplates();
    fs.write(`${ROOT}/installer-skills/web-advisor/SKILL.md`, "AUTHORED\n");
    expect(scaffoldAdvisor({ builtinTemplatesRoot: BUILTIN }, fs, ROOT, "web")).toEqual([]);
    expect(fs.read(`${ROOT}/installer-skills/web-advisor/SKILL.md`)).toBe("AUTHORED\n");
  });
});
