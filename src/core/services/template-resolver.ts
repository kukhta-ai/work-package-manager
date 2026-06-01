import { join } from "node:path";
// `parseYaml` is a pure leaf (no I/O); the FS port supplies the text it parses.
import { parseYaml } from "../../util/yaml.js";
import type { Template, TemplateFile, TemplateScope } from "../model/index.js";
import type { FileSystem } from "../ports/index.js";
import { parseTemplateDescriptor } from "./schema/index.js";

/**
 * The two-tier `template-resolver` service (doc 13 §4): given a template name and scope, it finds the
 * matching template directory — **project-local before built-in** (doc 10/12: "project-local templates/
 * shadow these") — reads it into a fully-populated {@link Template}, and can list the available templates
 * filtered by scope.
 *
 * It is pure **over the FileSystem port** (doc 13 §4: the operation does the I/O, here through the injected
 * port). It uses `node:path` for path joins — pure string operations, which the import-boundary rule permits
 * in the core — but never `node:fs`: all disk access is through {@link FileSystem}. It composes the schema
 * service (`parseTemplateDescriptor`) and the yaml leaf (`parseYaml`) to read `template.yml`, and the task-10
 * model for the result shapes.
 *
 * Templates live at `<root>/<scope>/<name>/`, each holding `template.yml` + a `files/` tree (+ optional
 * `snippets/`), under two roots: the built-in root (shipped in the package) and the project-local root
 * (`<projectRoot>/templates/`).
 */

/** The injected dependencies a resolution needs: the filesystem port and the two template roots. */
export interface ResolverDeps {
  /** The injected filesystem port (real or fake). */
  readonly fs: FileSystem;
  /** The built-in templates root (shipped with the package). */
  readonly builtinTemplatesRoot: string;
  /**
   * The project-local templates root (`<projectRoot>/templates/`), if a project is in context. Omitted for a
   * no-project context, where only built-ins are searched/listed (doc 10: "built-in otherwise").
   */
  readonly projectTemplatesRoot?: string;
}

/** A lightweight template listing entry — the directory layout alone yields these (no `files/` read). */
export interface TemplateSummary {
  /** The template's name. */
  readonly name: string;
  /** The template's scope. */
  readonly scope: TemplateScope;
}

/** A filter for {@link listTemplates}. */
export interface ListFilter {
  /** Only list templates of this scope. */
  readonly scope?: TemplateScope;
}

/**
 * The result of {@link resolveTemplate}: either the fully-read template, or a clear not-found outcome naming
 * the searched directories. A lookup miss is an EXPECTED result (the operation maps `found: false` to the
 * Not-found domain error, task-23) — not a thrown error. (A malformed `template.yml` on a found template *is*
 * thrown, because that is a template-authoring bug.)
 */
export type TemplateResolution =
  | { readonly found: true; readonly template: Template }
  | {
      readonly found: false;
      readonly name: string;
      readonly scope: TemplateScope;
      /** The directories searched, in order (project-local first when present, then built-in). */
      readonly searched: readonly string[];
    };

/** The two scopes, used to enumerate scope directories for listing. */
const SCOPES: readonly TemplateScope[] = ["project", "bundle"];

/**
 * Recursively read a directory tree into {@link TemplateFile}s whose `path` is relative to `baseDir`. Returns
 * `[]` if `baseDir` does not exist. Uses only the FileSystem port.
 *
 * @param fs - The filesystem port.
 * @param baseDir - The root directory to read (e.g. `<template>/files`).
 * @returns The files under `baseDir`, each with a path relative to `baseDir`.
 */
function readTree(fs: FileSystem, baseDir: string): TemplateFile[] {
  if (!fs.exists(baseDir)) {
    return [];
  }
  const files: TemplateFile[] = [];
  const walk = (dir: string, relPrefix: string): void => {
    for (const entry of fs.list(dir)) {
      const childAbs = join(dir, entry.name);
      const childRel = relPrefix === "" ? entry.name : `${relPrefix}/${entry.name}`;
      if (entry.kind === "directory") {
        walk(childAbs, childRel);
      } else {
        files.push({ path: childRel, content: fs.read(childAbs) });
      }
    }
  };
  walk(baseDir, "");
  // Sort by path for a deterministic order regardless of the port's listing order.
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

/**
 * Read a template directory (known to exist) into a fully-populated {@link Template}: parse its `template.yml`
 * descriptor (name/scope/parameters), then read its `files/` and `snippets/` trees.
 *
 * @param fs - The filesystem port.
 * @param templateDir - The template directory (`<root>/<scope>/<name>`).
 * @returns The fully-read template.
 * @throws If `template.yml` is missing or malformed (a template-authoring bug).
 */
function readTemplate(fs: FileSystem, templateDir: string): Template {
  const descriptorPath = join(templateDir, "template.yml");
  const parsed = parseTemplateDescriptor(parseYaml(fs.read(descriptorPath)));
  if (!parsed.ok) {
    throw new Error(`template-resolver: invalid "${descriptorPath}" — ${parsed.problem.message}`);
  }
  const descriptor = parsed.value;
  return {
    name: descriptor.name,
    scope: descriptor.scope,
    ...(descriptor.description !== undefined ? { description: descriptor.description } : {}),
    parameters: descriptor.parameters,
    files: readTree(fs, join(templateDir, "files")),
    snippets: readTree(fs, join(templateDir, "snippets")),
  };
}

/**
 * Resolve a template by name and scope, preferring a project-local template over a built-in of the same name
 * (AC#1). On a hit, the template is read fully (descriptor + `files/` + `snippets/`). On a miss, a clear
 * not-found result is returned naming the directories searched (AC#3) — not thrown.
 *
 * @param name - The template name to resolve.
 * @param scope - The scope to resolve within (`project` or `bundle`).
 * @param deps - The injected filesystem port and template roots.
 * @returns A {@link TemplateResolution}.
 * @throws Only if a *found* template's `template.yml` is missing or malformed.
 */
export function resolveTemplate(
  name: string,
  scope: TemplateScope,
  deps: ResolverDeps,
): TemplateResolution {
  const candidates: string[] = [];
  if (deps.projectTemplatesRoot !== undefined) {
    candidates.push(join(deps.projectTemplatesRoot, scope, name));
  }
  candidates.push(join(deps.builtinTemplatesRoot, scope, name));

  for (const dir of candidates) {
    if (deps.fs.exists(dir)) {
      return { found: true, template: readTemplate(deps.fs, dir) };
    }
  }
  return { found: false, name, scope, searched: candidates };
}

/**
 * List the available templates, merging both roots with project-local entries shadowing a built-in of the
 * same (name, scope), optionally filtered to a single scope (AC#2). Summaries come from the directory layout
 * alone — the scope is the directory a template lives under — so no `files/` content is read.
 *
 * @param deps - The injected filesystem port and template roots.
 * @param filter - Optional scope filter.
 * @returns The template summaries (project-local + built-in, de-duplicated by name+scope), sorted.
 */
export function listTemplates(deps: ResolverDeps, filter?: ListFilter): TemplateSummary[] {
  const scopes = filter?.scope !== undefined ? [filter.scope] : SCOPES;
  // Key by `scope/name`; insert built-ins first, then let project-local overwrite (shadow) them.
  const byKey = new Map<string, TemplateSummary>();
  const collect = (root: string | undefined): void => {
    if (root === undefined) {
      return;
    }
    for (const scope of scopes) {
      const scopeDir = join(root, scope);
      if (!deps.fs.exists(scopeDir)) {
        continue;
      }
      for (const entry of deps.fs.list(scopeDir)) {
        if (entry.kind === "directory") {
          byKey.set(`${scope}/${entry.name}`, { name: entry.name, scope });
        }
      }
    }
  };
  collect(deps.builtinTemplatesRoot);
  collect(deps.projectTemplatesRoot);
  return [...byKey.values()].sort(
    (a, b) => a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name),
  );
}
