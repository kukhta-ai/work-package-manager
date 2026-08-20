import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import {
  listTemplates,
  type ResolverDeps,
  resolveTemplate,
} from "../../../src/core/services/template-resolver.js";

const BUILTIN = "/pkg/templates";
const PROJECT = "/proj/templates";

/** Memory fake that records the raw candidate paths used for filesystem probes. */
class RecordingMemoryFileSystem extends MemoryFileSystem {
  readonly existsCalls: string[] = [];

  override exists(path: string): boolean {
    this.existsCalls.push(path);
    return super.exists(path);
  }
}

/** Write a minimal template (template.yml + files/ + optional snippets/) into a MemoryFileSystem. */
function writeTemplate(
  fs: MemoryFileSystem,
  root: string,
  scope: "project" | "bundle",
  name: string,
  opts: {
    scopeInYml?: string;
    params?: string;
    files?: Record<string, string>;
    snippets?: Record<string, string>;
  } = {},
): void {
  const dir = `${root}/${scope}/${name}`;
  const scopeLine = opts.scopeInYml ?? scope;
  const paramsBlock = opts.params ?? "parameters: []\n";
  fs.write(`${dir}/template.yml`, `name: ${name}\nscope: ${scopeLine}\n${paramsBlock}`);
  for (const [path, content] of Object.entries(opts.files ?? { "manifest.yml.tmpl": "x" })) {
    fs.write(`${dir}/files/${path}`, content);
  }
  for (const [path, content] of Object.entries(opts.snippets ?? {})) {
    fs.write(`${dir}/snippets/${path}`, content);
  }
}

function deps(fs: MemoryFileSystem, withProject = true): ResolverDeps {
  return withProject
    ? { fs, builtinTemplatesRoot: BUILTIN, projectTemplatesRoot: PROJECT }
    : { fs, builtinTemplatesRoot: BUILTIN };
}

describe("resolveTemplate — two-tier resolution (AC#1)", () => {
  it("resolves from the built-in root when there is no project-local override", () => {
    const fs = new MemoryFileSystem();
    writeTemplate(fs, BUILTIN, "project", "minimal", {
      params: "parameters:\n  - name: project-name\n",
      files: { "manifest.yml.tmpl": "name: {{project-name}}\n" },
    });
    const result = resolveTemplate("minimal", "project", deps(fs));
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.template.name).toBe("minimal");
      expect(result.template.scope).toBe("project");
      expect(result.template.parameters).toEqual([{ name: "project-name" }]);
      expect(result.template.files).toEqual([
        { path: "manifest.yml.tmpl", content: "name: {{project-name}}\n" },
      ]);
    }
  });

  it("prefers a project-local template over a built-in of the same name (shadowing)", () => {
    const fs = new MemoryFileSystem();
    writeTemplate(fs, BUILTIN, "project", "minimal", {
      files: { "manifest.yml.tmpl": "BUILTIN" },
    });
    writeTemplate(fs, PROJECT, "project", "minimal", {
      files: { "manifest.yml.tmpl": "PROJECT-LOCAL" },
    });
    const result = resolveTemplate("minimal", "project", deps(fs));
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.template.files[0]?.content).toBe("PROJECT-LOCAL");
    }
  });

  it("only searches the built-in root in a no-project context", () => {
    const fs = new MemoryFileSystem();
    writeTemplate(fs, BUILTIN, "project", "minimal");
    const result = resolveTemplate("minimal", "project", deps(fs, false));
    expect(result.found).toBe(true);
  });
});

describe("resolveTemplate — reads the full tree", () => {
  it("reads a nested files/ tree with paths relative to files/, plus snippets/", () => {
    const fs = new MemoryFileSystem();
    writeTemplate(fs, BUILTIN, "project", "minimal", {
      files: {
        "manifest.yml.tmpl": "m",
        "installer-skills/{{project-name}}-installer/SKILL.md.tmpl": "s",
      },
      snippets: { "advisor.SKILL.md.tmpl": "a" },
    });
    const result = resolveTemplate("minimal", "project", deps(fs));
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.template.files.map((f) => f.path)).toEqual([
        "installer-skills/{{project-name}}-installer/SKILL.md.tmpl",
        "manifest.yml.tmpl",
      ]);
      expect(result.template.snippets).toEqual([{ path: "advisor.SKILL.md.tmpl", content: "a" }]);
    }
  });

  it("returns [] snippets when the template has no snippets/ dir", () => {
    const fs = new MemoryFileSystem();
    writeTemplate(fs, BUILTIN, "bundle", "default", { files: { "bundle.yml.tmpl": "x" } });
    const result = resolveTemplate("default", "bundle", deps(fs));
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.template.snippets).toEqual([]);
    }
  });
});

describe("resolveTemplate — not found (AC#3)", () => {
  it("returns a clear not-found result naming the searched directories", () => {
    const fs = new MemoryFileSystem();
    const result = resolveTemplate("nope", "project", deps(fs));
    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.name).toBe("nope");
      expect(result.scope).toBe("project");
      // project-local searched first, then built-in.
      expect(result.searched).toEqual([
        "/proj/templates/project/nope",
        "/pkg/templates/project/nope",
      ]);
    }
  });

  it("does not throw for a missing template — it is an expected lookup miss", () => {
    const fs = new MemoryFileSystem();
    expect(() => resolveTemplate("nope", "bundle", deps(fs))).not.toThrow();
  });

  it("returns portable searched diagnostics for Windows-like native roots", () => {
    const fs = new RecordingMemoryFileSystem();
    const builtin = "C:\\pkg\\templates";
    const project = "C:\\work\\proj\\templates";
    const result = resolveTemplate("nope", "project", {
      fs,
      builtinTemplatesRoot: builtin,
      projectTemplatesRoot: project,
    });
    const nativeCandidates = [join(project, "project", "nope"), join(builtin, "project", "nope")];

    expect(fs.existsCalls).toEqual(nativeCandidates);
    expect(result).toEqual({
      found: false,
      name: "nope",
      scope: "project",
      searched: nativeCandidates.map((path) => path.replaceAll("\\", "/")),
    });
  });
});

describe("resolveTemplate — malformed template.yml throws (authoring bug)", () => {
  it("surfaces the schema error when template.yml is invalid (missing scope)", () => {
    const fs = new MemoryFileSystem();
    // Write a template.yml that the schema rejects (scope omitted).
    fs.write(`${BUILTIN}/project/broken/template.yml`, "name: broken\nparameters: []\n");
    fs.write(`${BUILTIN}/project/broken/files/x.tmpl`, "x");
    expect(() => resolveTemplate("broken", "project", deps(fs))).toThrow(/scope/);
  });

  it("surfaces the schema error for a bad scope value", () => {
    const fs = new MemoryFileSystem();
    writeTemplate(fs, BUILTIN, "project", "weird", { scopeInYml: "global" });
    expect(() => resolveTemplate("weird", "project", deps(fs))).toThrow(/scope/);
  });
});

describe("listTemplates — listing + scope filter (AC#2)", () => {
  it("lists templates from both roots and both scopes when unfiltered", () => {
    const fs = new MemoryFileSystem();
    writeTemplate(fs, BUILTIN, "project", "minimal");
    writeTemplate(fs, BUILTIN, "project", "multi-bundle");
    writeTemplate(fs, BUILTIN, "bundle", "default");
    writeTemplate(fs, PROJECT, "project", "custom");
    expect(listTemplates(deps(fs))).toEqual([
      { name: "default", scope: "bundle" },
      { name: "custom", scope: "project" },
      { name: "minimal", scope: "project" },
      { name: "multi-bundle", scope: "project" },
    ]);
  });

  it("filters to project scope only", () => {
    const fs = new MemoryFileSystem();
    writeTemplate(fs, BUILTIN, "project", "minimal");
    writeTemplate(fs, BUILTIN, "bundle", "default");
    expect(listTemplates(deps(fs), { scope: "project" })).toEqual([
      { name: "minimal", scope: "project" },
    ]);
  });

  it("filters to bundle scope only", () => {
    const fs = new MemoryFileSystem();
    writeTemplate(fs, BUILTIN, "project", "minimal");
    writeTemplate(fs, BUILTIN, "bundle", "default");
    writeTemplate(fs, BUILTIN, "bundle", "with-payload-skill");
    expect(listTemplates(deps(fs), { scope: "bundle" })).toEqual([
      { name: "default", scope: "bundle" },
      { name: "with-payload-skill", scope: "bundle" },
    ]);
  });

  it("de-duplicates a project-local template that shadows a same-name built-in", () => {
    const fs = new MemoryFileSystem();
    writeTemplate(fs, BUILTIN, "project", "minimal");
    writeTemplate(fs, PROJECT, "project", "minimal");
    const list = listTemplates(deps(fs));
    expect(list).toEqual([{ name: "minimal", scope: "project" }]);
  });

  it("lists only built-ins in a no-project context", () => {
    const fs = new MemoryFileSystem();
    writeTemplate(fs, BUILTIN, "project", "minimal");
    expect(listTemplates(deps(fs, false))).toEqual([{ name: "minimal", scope: "project" }]);
  });

  it("returns an empty list when no templates exist", () => {
    const fs = new MemoryFileSystem();
    expect(listTemplates(deps(fs))).toEqual([]);
  });
});
