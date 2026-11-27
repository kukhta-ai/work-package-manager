import type { TemplateFile } from "../model/index.js";

/**
 * The `render` service (doc 13 §4): pure `{{placeholder}}` substitution over a template's file tree
 * (Structure-not-Content, doc 10; "templates as data, not code", doc 12). It takes the template files **as
 * data** — the operation reads them off disk via the FileSystem port — plus a parameter map, and returns the
 * rendered output files. It performs substitution ONLY: no conditionals, no loops, no computed content.
 *
 * Pure: this lives under `src/core/services/`, so the import-boundary rule applies — it imports only the
 * model and touches no disk.
 *
 * Two entry points distinguish the two uses doc 12 names (they share one substitution path — "both use the
 * same render.ts substitution; they differ only in *when*"):
 * - {@link renderTree} renders the init-time `files/` batch (for `init` / `bundle new`);
 * - {@link renderSnippet} renders one on-demand `snippets/` stub (the scaffold branch of the add-paths).
 */

/** The parameter values a render uses: placeholder name -> its substitution value. */
export type RenderParams = ReadonlyMap<string, string>;

/** A rendered output file: its final (placeholder-substituted, `.tmpl`-stripped) path and content. */
export interface RenderedFile {
  /** The output path, with placeholders substituted and any trailing `.tmpl` removed. */
  readonly path: string;
  /** The output content, with placeholders substituted. */
  readonly content: string;
}

/**
 * A placeholder is exactly `{{<param-name>}}` where `<param-name>` is a strict kebab token. This grammar
 * deliberately does NOT match logic-like constructs (`{{#if ...}}`, `{{/each}}`, `{{> partial}}`): those
 * leave a `{{...}}` brace pair that the substitution does not consume, so they surface as an error — which is
 * how the "substitution only, no logic" rule (doc 10) is enforced rather than merely asserted.
 */
const PLACEHOLDER = /\{\{([a-z0-9]+(?:-[a-z0-9]+)*)\}\}/g;

/** Any remaining `{{ ... }}` brace pair, used to detect unresolved or invalid placeholders after substitution. */
const ANY_BRACES = /\{\{[^}]*\}\}/;

/** The suffix stripped from a rendered path. */
const TMPL_SUFFIX = ".tmpl";

/**
 * Substitute every valid `{{name}}` placeholder in `text`, then verify nothing placeholder-like remains. A
 * remaining `{{...}}` — an unknown parameter, or a token that is not a valid placeholder at all (e.g.
 * `{{#if}}`) — is an error, named together with `where` (the file path + which part) so template typos and
 * stray logic are caught loudly.
 *
 * @param text - The template text (a file's content, or its path).
 * @param params - The parameter values.
 * @param where - A human label for error messages (e.g. `content of "manifest.yml.tmpl"`).
 * @returns The substituted text.
 * @throws If a placeholder cannot be resolved or an invalid `{{...}}` construct is present.
 */
function renderString(text: string, params: RenderParams, where: string): string {
  const substituted = text.replace(PLACEHOLDER, (_match, name: string) => {
    const value = params.get(name);
    if (value === undefined) {
      throw new Error(
        `render: unresolved placeholder "{{${name}}}" in ${where} — no value for parameter "${name}"`,
      );
    }
    return value;
  });
  const leftover = ANY_BRACES.exec(substituted);
  if (leftover !== null) {
    throw new Error(
      `render: invalid or unresolved placeholder "${leftover[0]}" in ${where} — only "{{kebab-name}}" substitution is supported (no conditionals or loops)`,
    );
  }
  return substituted;
}

/** Strip a single trailing `.tmpl` from a path, if present. */
function stripTmpl(path: string): string {
  return path.endsWith(TMPL_SUFFIX) ? path.slice(0, -TMPL_SUFFIX.length) : path;
}

/**
 * Render one template file: substitute placeholders in both its path and its content, and strip a trailing
 * `.tmpl` from the path (doc 06; doc 12).
 *
 * @param file - The template file (path + pre-substitution content).
 * @param params - The parameter values.
 * @returns The rendered output file.
 * @throws If any placeholder in the path or content cannot be resolved (or is invalid).
 */
function renderFile(file: TemplateFile, params: RenderParams): RenderedFile {
  const renderedPath = stripTmpl(renderString(file.path, params, `path "${file.path}"`));
  const renderedContent = renderString(file.content, params, `content of "${file.path}"`);
  return { path: renderedPath, content: renderedContent };
}

/**
 * Render a template's `files/` tree as a batch — the init-time scaffold (doc 12). Every file's placeholders
 * (in path and content) are substituted; every output path has any trailing `.tmpl` stripped.
 *
 * @param files - The template's file tree, as data.
 * @param params - The parameter values.
 * @returns The rendered output files, in input order.
 * @throws If any file contains an unresolved or invalid placeholder.
 */
export function renderTree(files: readonly TemplateFile[], params: RenderParams): RenderedFile[] {
  return files.map((file) => renderFile(file, params));
}

/**
 * Render a single on-demand snippet — the scaffold branch of the add-paths (doc 12). Identical substitution
 * to {@link renderTree}, applied to one file.
 *
 * @param snippet - The snippet template file, as data.
 * @param params - The parameter values.
 * @returns The rendered output file.
 * @throws If the snippet contains an unresolved or invalid placeholder.
 */
export function renderSnippet(snippet: TemplateFile, params: RenderParams): RenderedFile {
  return renderFile(snippet, params);
}
