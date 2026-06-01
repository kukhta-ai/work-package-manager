import { describe, expect, it } from "vitest";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { type RenderParams, renderTree } from "../../../src/core/services/render.js";
import {
  listTemplates,
  type ResolverDeps,
  resolveTemplate,
} from "../../../src/core/services/template-resolver.js";

/**
 * Acceptance test for the template resolver: the resolve -> render end-to-end thread, which is the
 * resolver's whole purpose (it feeds the render engine, task-16). Pure — the resolver computes over the
 * in-memory FileSystem fake, render is a pure function. Exercises all three ACs and that resolve and render
 * compose into the file map an `init` would write.
 */

const BUILTIN = "/pkg/templates";
const PROJECT = "/proj/templates";

function params(obj: Record<string, string>): RenderParams {
  return new Map(Object.entries(obj));
}

/** Seed a project-template-shaped `minimal` template under `root`, with the given marker content. */
function seedMinimal(fs: MemoryFileSystem, root: string, marker: string): void {
  const dir = `${root}/project/minimal`;
  fs.write(
    `${dir}/template.yml`,
    "name: minimal\nscope: project\nparameters:\n  - name: project-name\n  - name: version\n  - name: tool\n",
  );
  fs.write(
    `${dir}/files/manifest.yml.tmpl`,
    `# ${marker}\nproject:\n  name: {{project-name}}\n  version: {{version}}\ntargets:\n  - {{tool}}\n`,
  );
  fs.write(
    `${dir}/files/installer-skills/{{project-name}}-installer/SKILL.md.tmpl`,
    "# {{project-name}} installer (v{{version}})\n",
  );
}

describe("template resolver — acceptance (resolve -> render thread)", () => {
  it("resolves the project-local override, then renders the tree to the final file map", () => {
    const fs = new MemoryFileSystem();
    seedMinimal(fs, BUILTIN, "BUILTIN");
    seedMinimal(fs, PROJECT, "PROJECT-LOCAL");
    // Also seed a bundle-scope template so listTemplates has both scopes.
    fs.write(
      `${BUILTIN}/bundle/default/template.yml`,
      "name: default\nscope: bundle\nparameters: []\n",
    );
    fs.write(`${BUILTIN}/bundle/default/files/bundle.yml.tmpl`, "id: {{bundle-id}}\n");

    const deps: ResolverDeps = {
      fs,
      builtinTemplatesRoot: BUILTIN,
      projectTemplatesRoot: PROJECT,
    };

    // AC#1: the project-local minimal shadows the built-in.
    const resolution = resolveTemplate("minimal", "project", deps);
    expect(resolution.found).toBe(true);
    if (!resolution.found) return;
    expect(
      resolution.template.files.find((f) => f.path === "manifest.yml.tmpl")?.content,
    ).toContain("# PROJECT-LOCAL");

    // AC#2: listing shows both scopes; filtering narrows it.
    expect(listTemplates(deps)).toEqual([
      { name: "default", scope: "bundle" },
      { name: "minimal", scope: "project" },
    ]);
    expect(listTemplates(deps, { scope: "project" })).toEqual([
      { name: "minimal", scope: "project" },
    ]);

    // resolve -> render: pipe the resolved files through renderTree.
    const rendered = renderTree(
      resolution.template.files,
      params({ "project-name": "hermes-handoff", version: "0.1.0", tool: "claude-code" }),
    );
    expect(rendered).toEqual([
      {
        path: "installer-skills/hermes-handoff-installer/SKILL.md",
        content: "# hermes-handoff installer (v0.1.0)\n",
      },
      {
        path: "manifest.yml",
        content:
          "# PROJECT-LOCAL\nproject:\n  name: hermes-handoff\n  version: 0.1.0\ntargets:\n  - claude-code\n",
      },
    ]);
  });

  it("yields a clear not-found result for an unknown template name (AC#3)", () => {
    const fs = new MemoryFileSystem();
    seedMinimal(fs, BUILTIN, "BUILTIN");
    const resolution = resolveTemplate("does-not-exist", "project", {
      fs,
      builtinTemplatesRoot: BUILTIN,
      projectTemplatesRoot: PROJECT,
    });
    expect(resolution.found).toBe(false);
    if (!resolution.found) {
      expect(resolution.name).toBe("does-not-exist");
      expect(resolution.searched).toContain("/pkg/templates/project/does-not-exist");
    }
  });
});
