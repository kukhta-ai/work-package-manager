import { resolveContext } from "../core/services/context.js";
import { type ListFilter, listTemplates } from "../core/services/template-resolver.js";
import type { CompletionContext } from "./sources.js";
import { prefixFilter } from "./sources.js";

/**
 * The template-name completion sources (doc 12 names this slot `src/completion/template-names.ts` — "from
 * built-in + project-local `templates/`, filterable by scope"). It completes a template name (e.g. `init
 * --template`, `bundle new --template`, `template show <name>`) from the available templates: the built-in set
 * shipped with the package, plus the resolved project's `templates/` (which shadow the built-ins).
 *
 * State-aware but PURE over the ports: it resolves the project via the task-24 `resolveContext` (so the
 * project-local `templates/` are included when a project is in context, and only built-ins otherwise), then
 * lists templates with the task-17 `listTemplates`. A scope filter narrows to `project` or `bundle` templates.
 *
 * @param ctx - The completion context (ports + `-C` override + partial).
 * @param filter - An optional scope filter (e.g. `{ scope: "bundle" }` for a bundle-template position).
 * @returns The template names, prefix-filtered by the partial.
 */
export function templateNames(ctx: CompletionContext, filter?: ListFilter): string[] {
  const context = resolveContext(
    { fs: ctx.fs, env: ctx.env },
    ctx.projectOverride !== undefined ? { projectOverride: ctx.projectOverride } : undefined,
  );
  const summaries = listTemplates(
    {
      fs: ctx.fs,
      builtinTemplatesRoot: ctx.builtinTemplatesRoot,
      ...(context.found ? { projectTemplatesRoot: `${context.root}/templates` } : {}),
    },
    filter,
  );
  return prefixFilter(
    summaries.map((s) => s.name),
    ctx.partial,
  );
}

/** The `"template-names"` source: all template names (any scope). */
export function allTemplateNames(ctx: CompletionContext): string[] {
  return templateNames(ctx);
}

/** The `"project-template-names"` source: project-scoped templates only (for `init --template`). */
export function projectTemplateNames(ctx: CompletionContext): string[] {
  return templateNames(ctx, { scope: "project" });
}

/** The `"bundle-template-names"` source: bundle-scoped templates only (for `bundle new --template`). */
export function bundleTemplateNames(ctx: CompletionContext): string[] {
  return templateNames(ctx, { scope: "bundle" });
}
