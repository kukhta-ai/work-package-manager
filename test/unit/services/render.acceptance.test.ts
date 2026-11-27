import { describe, expect, it } from "vitest";
import type { TemplateFile } from "../../../src/core/model/index.js";
import { type RenderParams, renderSnippet, renderTree } from "../../../src/core/services/render.js";

/**
 * Acceptance test for the render engine: an end-to-end render of a realistic, full project-template-shaped
 * file tree, exercising all three ACs together (substitution in content + path, `.tmpl` stripping,
 * files-vs-snippets, and the fail-loud / no-logic guarantees). Pure — render touches no file system, so this
 * is a unit-level acceptance test of the whole engine.
 */

function params(obj: Record<string, string>): RenderParams {
  return new Map(Object.entries(obj));
}

/** A project-template-shaped `files/` tree (the kind `init` would render). */
const PROJECT_TEMPLATE_FILES: TemplateFile[] = [
  {
    path: "manifest.yml.tmpl",
    content:
      "project:\n  name: {{project-name}}\n  version: {{version}}\ntargets:\n  - {{tool}}\nbundles: []\n",
  },
  {
    path: "AGENTS.md.tmpl",
    content: "# {{project-name}}\n\nInstall this project with your {{tool}} agent.\n",
  },
  {
    path: "installer-skills/{{project-name}}-installer/SKILL.md.tmpl",
    content: "# {{project-name}} installer (v{{version}})\n",
  },
  {
    path: "RALPH-LOOP.md.tmpl",
    content: "Loop: install {{project-name}} until done.\n",
  },
];

describe("render engine — acceptance (full project template, AC#1/#2/#3 together)", () => {
  it("renders the whole files/ tree: paths .tmpl-stripped + substituted, content substituted", () => {
    const out = renderTree(
      PROJECT_TEMPLATE_FILES,
      params({
        "project-name": "hermes-handoff",
        version: "0.1.0",
        tool: "claude-code",
      }),
    );

    expect(out).toEqual([
      {
        path: "manifest.yml",
        content:
          "project:\n  name: hermes-handoff\n  version: 0.1.0\ntargets:\n  - claude-code\nbundles: []\n",
      },
      {
        path: "AGENTS.md",
        content: "# hermes-handoff\n\nInstall this project with your claude-code agent.\n",
      },
      {
        path: "installer-skills/hermes-handoff-installer/SKILL.md",
        content: "# hermes-handoff installer (v0.1.0)\n",
      },
      {
        path: "RALPH-LOOP.md",
        content: "Loop: install hermes-handoff until done.\n",
      },
    ]);
  });

  it("renders an on-demand advisor snippet via renderSnippet (AC#3)", () => {
    const advisor: TemplateFile = {
      path: "snippets/advisor.SKILL.md.tmpl",
      content: "---\nname: {{bundle-id}}-advisor\n---\nRecommends the {{bundle-id}} bundle.\n",
    };
    expect(renderSnippet(advisor, params({ "bundle-id": "web-handoff" }))).toEqual({
      path: "snippets/advisor.SKILL.md",
      content: "---\nname: web-handoff-advisor\n---\nRecommends the web-handoff bundle.\n",
    });
  });

  it("fails loudly, naming the file, when the batch has an unresolved placeholder (AC#1)", () => {
    // Missing the `tool` parameter — the manifest and AGENTS files reference it.
    expect(() =>
      renderTree(PROJECT_TEMPLATE_FILES, params({ "project-name": "p", version: "1.0.0" })),
    ).toThrow(/\{\{tool\}\}/);
    expect(() =>
      renderTree(PROJECT_TEMPLATE_FILES, params({ "project-name": "p", version: "1.0.0" })),
    ).toThrow(/manifest\.yml\.tmpl/);
  });

  it("does not interpret a {{#if}} logic token embedded in a template (AC#2)", () => {
    const withLogic: TemplateFile[] = [
      { path: "AGENTS.md.tmpl", content: "# {{project-name}}\n{{#if windows}}note{{/if}}\n" },
    ];
    expect(() => renderTree(withLogic, params({ "project-name": "p", windows: "yes" }))).toThrow(
      /invalid or unresolved placeholder/,
    );
  });
});
