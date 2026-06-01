import { describe, expect, it } from "vitest";
import type { TemplateFile } from "../../../src/core/model/index.js";
import { type RenderParams, renderSnippet, renderTree } from "../../../src/core/services/render.js";

/** Build a RenderParams map from a plain object, for readable tests. */
function params(obj: Record<string, string>): RenderParams {
  return new Map(Object.entries(obj));
}

describe("render — placeholder substitution (AC#1)", () => {
  it("substitutes placeholders in file CONTENT", () => {
    const file: TemplateFile = {
      path: "manifest.yml",
      content: "name: {{project-name}}\nv: {{version}}\n",
    };
    const [out] = renderTree(
      [file],
      params({ "project-name": "hermes-handoff", version: "0.1.0" }),
    );
    expect(out?.content).toBe("name: hermes-handoff\nv: 0.1.0\n");
  });

  it("substitutes placeholders in the PATH", () => {
    const file: TemplateFile = {
      path: "installer-skills/{{project-name}}-installer/SKILL.md.tmpl",
      content: "# skill",
    };
    const [out] = renderTree([file], params({ "project-name": "hermes" }));
    expect(out?.path).toBe("installer-skills/hermes-installer/SKILL.md");
  });

  it("handles multiple occurrences of the same placeholder", () => {
    const file: TemplateFile = { path: "f", content: "{{tool}} and {{tool}} again" };
    const [out] = renderTree([file], params({ tool: "claude" }));
    expect(out?.content).toBe("claude and claude again");
  });

  it("leaves a file with no placeholders unchanged (minus .tmpl)", () => {
    const file: TemplateFile = { path: "README.md.tmpl", content: "static text\n" };
    const [out] = renderTree([file], params({}));
    expect(out).toEqual({ path: "README.md", content: "static text\n" });
  });

  it("ignores an extra param that has no placeholder (harmless)", () => {
    const file: TemplateFile = { path: "f", content: "{{a}}" };
    const [out] = renderTree([file], params({ a: "1", unused: "2" }));
    expect(out?.content).toBe("1");
  });
});

describe("render — .tmpl stripping", () => {
  it("strips a trailing .tmpl", () => {
    const [out] = renderTree([{ path: "manifest.yml.tmpl", content: "x" }], params({}));
    expect(out?.path).toBe("manifest.yml");
  });

  it("leaves a non-.tmpl path unchanged", () => {
    const [out] = renderTree([{ path: "AGENTS.md", content: "x" }], params({}));
    expect(out?.path).toBe("AGENTS.md");
  });

  it("strips only the FINAL .tmpl", () => {
    const [out] = renderTree([{ path: "weird.tmpl.tmpl", content: "x" }], params({}));
    expect(out?.path).toBe("weird.tmpl");
  });
});

describe("render — every placeholder must resolve (AC#1 error)", () => {
  it("throws naming the placeholder + file when a content placeholder has no value", () => {
    const file: TemplateFile = { path: "manifest.yml.tmpl", content: "name: {{missing}}\n" };
    expect(() => renderTree([file], params({}))).toThrow(/\{\{missing\}\}/);
    expect(() => renderTree([file], params({}))).toThrow(/manifest\.yml\.tmpl/);
  });

  it("throws when a PATH placeholder has no value, naming it", () => {
    const file: TemplateFile = { path: "{{bundle-id}}/bundle.yml.tmpl", content: "x" };
    expect(() => renderTree([file], params({}))).toThrow(/\{\{bundle-id\}\}/);
  });
});

describe("render — substitution only, NO logic (AC#2)", () => {
  it("does NOT interpret an {{#if}} block — it errors as an invalid placeholder", () => {
    const file: TemplateFile = { path: "f", content: "{{#if x}}yes{{/if}}" };
    // The logic token is never executed; it surfaces as an invalid/unresolved placeholder.
    expect(() => renderTree([file], params({ x: "1" }))).toThrow(
      /invalid or unresolved placeholder/,
    );
  });

  it("does NOT interpret {{#each}} or a partial {{> p}}", () => {
    expect(() =>
      renderTree([{ path: "f", content: "{{#each items}}{{/each}}" }], params({})),
    ).toThrow();
    expect(() => renderTree([{ path: "f", content: "{{> partial}}" }], params({}))).toThrow();
  });

  it("treats an unknown bare token as an error, never computing or blanking it", () => {
    const file: TemplateFile = { path: "f", content: "value is {{notaparam}}" };
    expect(() => renderTree([file], params({}))).toThrow();
  });
});

describe("render — files vs snippets are distinct entry points (AC#3)", () => {
  it("renderTree renders a multi-file batch in order", () => {
    const files: TemplateFile[] = [
      { path: "manifest.yml.tmpl", content: "name: {{project-name}}" },
      { path: "AGENTS.md.tmpl", content: "# {{project-name}}" },
    ];
    const out = renderTree(files, params({ "project-name": "p" }));
    expect(out).toEqual([
      { path: "manifest.yml", content: "name: p" },
      { path: "AGENTS.md", content: "# p" },
    ]);
  });

  it("renderSnippet renders exactly ONE on-demand file", () => {
    const snippet: TemplateFile = {
      path: "snippets/advisor.SKILL.md.tmpl",
      content: "# {{bundle-id}} advisor",
    };
    const out = renderSnippet(snippet, params({ "bundle-id": "web-handoff" }));
    expect(out).toEqual({ path: "snippets/advisor.SKILL.md", content: "# web-handoff advisor" });
  });

  it("renderTree of an empty tree is an empty list", () => {
    expect(renderTree([], params({}))).toEqual([]);
  });
});

describe("render — realistic project-template fixture", () => {
  it("renders a small files/ tree with placeholders in content and paths", () => {
    const files: TemplateFile[] = [
      {
        path: "manifest.yml.tmpl",
        content: "project:\n  name: {{project-name}}\n  version: {{version}}\n",
      },
      {
        path: "installer-skills/{{project-name}}-installer/SKILL.md.tmpl",
        content: "# {{project-name}} installer\nversion {{version}}\n",
      },
    ];
    const out = renderTree(files, params({ "project-name": "hermes-handoff", version: "0.1.0" }));
    expect(out).toEqual([
      { path: "manifest.yml", content: "project:\n  name: hermes-handoff\n  version: 0.1.0\n" },
      {
        path: "installer-skills/hermes-handoff-installer/SKILL.md",
        content: "# hermes-handoff installer\nversion 0.1.0\n",
      },
    ]);
  });
});
