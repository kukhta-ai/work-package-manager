import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { perBundleAuthoringTaskCatalog } from "../../../src/core/operations/create-bundle.js";
import { projectWideAuthoringTaskCatalog } from "../../../src/core/operations/init-project.js";

/**
 * Cross-artifact acceptance guard for TASK-101. The package README and every Markdown file below `docs/` ship
 * alongside `templates/`, so executable examples and built-in inventories must follow the registry users
 * actually receive. Resolver semantics have focused tests elsewhere; this suite prevents the static surfaces
 * from drifting apart again.
 */

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DOCS_ROOT = join(REPO_ROOT, "docs");
const TEMPLATES_ROOT = join(REPO_ROOT, "templates");

type TemplateScope = "project" | "bundle";

function markdownDocs(
  directory = DOCS_ROOT,
  prefix = "docs",
): Array<{ name: string; text: string }> {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const name = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return markdownDocs(path, name);
      if (!entry.isFile() || !entry.name.endsWith(".md")) return [];
      return [{ name, text: readFileSync(path, "utf8") }];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

const shippedDocs = [
  { name: "README.md", text: readFileSync(join(REPO_ROOT, "README.md"), "utf8") },
  ...markdownDocs(),
];

function builtInTemplateNames(scope: TemplateScope): string[] {
  const scopeRoot = join(TEMPLATES_ROOT, scope);
  return readdirSync(scopeRoot, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(join(scopeRoot, entry.name, "template.yml")),
    )
    .map((entry) => entry.name)
    .sort();
}

function declaredInventories(scope: TemplateScope): Array<{ doc: string; names: string[] }> {
  const marker = `**Shipped ${scope} templates:**`;
  return shippedDocs.flatMap(({ name, text }) =>
    text
      .split("\n")
      .filter((line) => line.includes(marker))
      .map((line) => ({
        doc: name,
        names: [...line.matchAll(/`([a-z][a-z0-9-]*)`/g)]
          .map((match) => match[1])
          .filter((templateName): templateName is string => templateName !== undefined)
          .sort(),
      })),
  );
}

function concreteCommandTemplates(pattern: RegExp): Array<{ doc: string; template: string }> {
  return shippedDocs.flatMap(({ name, text }) =>
    [...text.matchAll(pattern)].flatMap((match) =>
      match[1] === undefined ? [] : [{ doc: name, template: match[1] }],
    ),
  );
}

describe("shipped docs stay aligned with the real built-in template registry (TASK-101)", () => {
  it("covers every package-shipped Markdown surface without scanning unshipped planning docs", () => {
    const names = shippedDocs.map(({ name }) => name);
    expect(names).toContain("README.md");
    expect(names).toContain("docs/SDLC.md");
    expect(names).toContain("docs/task-writing-conventions.md");
    expect(names).not.toContain("FOUNDATION.md");
    expect(names).not.toContain("ROADMAP.md");
  });

  it("derives the exact built-in inventory from the template trees", () => {
    expect(builtInTemplateNames("project")).toEqual(["minimal"]);
    expect(builtInTemplateNames("bundle")).toEqual(["default"]);
  });

  it.each<TemplateScope>([
    "project",
    "bundle",
  ])("every declared shipped %s-template inventory equals the real registry", (scope) => {
    const actual = builtInTemplateNames(scope);
    const declarations = declaredInventories(scope);

    expect(declarations.length, `docs must declare the shipped ${scope} inventory`).toBeGreaterThan(
      0,
    );
    for (const declaration of declarations) {
      expect(declaration.names, `${declaration.doc} ${scope} inventory`).toEqual(actual);
    }
  });

  it("every concrete --template command resolves in the appropriate built-in scope", () => {
    const projectCommands = concreteCommandTemplates(
      /wpm\s+init\b[^\n]*?--template\s+([a-z][a-z0-9-]*)/g,
    );
    const bundleCommands = concreteCommandTemplates(
      /wpm\s+bundle\s+new\b[^\n]*?--template\s+([a-z][a-z0-9-]*)/g,
    );

    expect(
      projectCommands.length,
      "at least one concrete project-template command is documented",
    ).toBeGreaterThan(0);
    expect(
      projectCommands.every(({ template }) => builtInTemplateNames("project").includes(template)),
      JSON.stringify(projectCommands),
    ).toBe(true);
    expect(
      bundleCommands.every(({ template }) => builtInTemplateNames("bundle").includes(template)),
      JSON.stringify(bundleCommands),
    ).toBe(true);
  });

  it("does not name deferred templates as if they ship", () => {
    const deferred = [
      "single-bundle",
      "multi-bundle",
      "with-payload-skill",
      "adopts-system-tool",
    ] as const;

    for (const { name, text } of shippedDocs) {
      // Doc 05 has exactly one allowlisted adjectival use of "multi-bundle work". Keep that exemption
      // file- and sentence-specific so a new occurrence elsewhere cannot silently bypass the whole-doc scan.
      let templateContexts = text;
      if (name === "docs/05-native-agent-surfaces.md") {
        const ordinaryUse = "A useful property for multi-bundle work is";
        expect(text.match(/multi-bundle work/g)).toHaveLength(1);
        expect(text).toContain(ordinaryUse);
        templateContexts = text.replace(
          ordinaryUse,
          "A useful property for work spanning multiple bundles is",
        );
      }
      const concreteDeferredNames = deferred.filter((templateName) => {
        const escaped = templateName.replaceAll("-", "\\-");
        return new RegExp(`(?<![a-z0-9-])${escaped}(?![a-z0-9-])`).test(templateContexts);
      });
      expect(concreteDeferredNames, `${name} names unavailable templates`).toEqual([]);
    }
  });
});

describe("shipped docs use payload/files-relative registration paths (TASK-101)", () => {
  it("never prefixes a concrete files-add argument with payload/files", () => {
    for (const { name, text } of shippedDocs) {
      const commands = [...text.matchAll(/wpm\s+bundle\s+\S+\s+files\s+add\s+(\S+)/g)];
      for (const command of commands) {
        const argument = command[1] ?? "";
        if (argument.startsWith("<") || argument === "…") continue;
        expect(argument, `${name}: files add paths are relative to payload/files`).not.toMatch(
          /^payload\/files\//,
        );
      }
    }
  });

  it.each([
    "10-authoring-cli.md",
    "11-authoring-process.md",
  ])("%s demonstrates registering launcher.json by its relative path", (doc) => {
    const text = readFileSync(join(DOCS_ROOT, doc), "utf8");
    expect(text).toMatch(/wpm bundle [a-z0-9-]+ files add launcher\.json/);
  });
});

describe("worked documentation sessions remain internally coherent (TASK-101)", () => {
  it("documents the default init workspace at <cwd>/<name>, matching the worked-session cd", () => {
    const text = readFileSync(join(DOCS_ROOT, "10-authoring-cli.md"), "utf8");
    expect(text).not.toContain("defaults to cwd");
    expect(text).not.toContain("`<path>`/cwd");
    expect(text).toContain("otherwise to `<cwd>/<name>`");
  });

  it("uses the explicitly created core version for its recipe-task milestone in doc 11", () => {
    const text = readFileSync(join(DOCS_ROOT, "11-authoring-process.md"), "utf8");
    const coreVersion = text.match(
      /wpm bundle new core --version (\d+\.\d+\.\d+) --no-advisor/,
    )?.[1];
    const coreTaskMilestone = text.match(
      /\(cd wip\/bundles\/core && \\\n[\s\S]*?\n\s+-m (\d+\.\d+\.\d+)/,
    )?.[1];

    expect(coreVersion, "doc 11 must create core at an explicit version").toBeDefined();
    expect(coreTaskMilestone, "doc 11 must version the core recipe task").toBe(coreVersion);
  });
});

describe("template authoring-task declaration contract remains documented (TASK-125)", () => {
  const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");

  it("documents the inert descriptor and exact context vocabulary", () => {
    expect(readme).toContain('revision: "rev-1"');
    expect(readme).toContain("authoring-tasks:");
    expect(readme).toContain("acceptance-criteria:");
    expect(readme).toContain("depends-on:");
    for (const context of ["wpm.project.name", "wpm.bundle.id", "wpm.bundle.version"]) {
      expect(readme).toContain(`{{${context}}}`);
    }
    expect(readme).toContain("cannot replace or disable WPM's mandatory work");
  });

  it("documents every unconditional stable mandatory reference and no conditional advisor reference", () => {
    const references = [
      ...projectWideAuthoringTaskCatalog(),
      ...perBundleAuthoringTaskCatalog("<bundle-id>", { advisor: false }),
    ].map(({ reference }) => reference);
    for (const reference of references) expect(readme).toContain(`\`${reference}\``);
    expect(readme).not.toContain("`wpm:bundle:write-advisor-content`");
  });
});
