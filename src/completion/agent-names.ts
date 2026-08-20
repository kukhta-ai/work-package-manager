import { ALIAS_PATHS } from "../core/services/agent-aliases.js";
import { resolveContext } from "../core/services/context.js";
import { parseManifest } from "../core/services/schema/index.js";
import { parseYaml } from "../util/yaml.js";
import { type CompletionContext, prefixFilter } from "./sources.js";

/**
 * The agent-name completion sources (doc 12 names this slot `src/completion/agent-names.ts` — "from
 * `manifest.yml.targets` / built-in well-known"). doc 10 splits the two sides: `project targets add <agent>`
 * completes from the CLI's built-in well-known list, while `project targets remove <agent>` completes from the
 * project's currently-declared targets. Both are provided as named sources.
 */

/**
 * The `"target-names"` source — the built-in well-known agents (the keys of the scope-alias map: `claude-code`,
 * `codex`, `hermes`, `openclaw`), for the `add` side. Knowable without project state.
 *
 * @param ctx - The completion context (only the partial is used).
 * @returns The well-known agent names, prefix-filtered by the partial.
 */
export function wellKnownAgentNames(ctx: CompletionContext): string[] {
  return prefixFilter(Object.keys(ALIAS_PATHS), ctx.partial);
}

/**
 * The `"installed-target-names"` source — the agents currently declared in the resolved project's
 * `manifest.yml.targets`, for the `remove` side. State-dependent, PURE over the ports (via `resolveContext` +
 * `parseManifest`). No project / malformed manifest → `[]`.
 *
 * @param ctx - The completion context (ports + `-C` override + partial).
 * @returns The project's declared target agent names, prefix-filtered by the partial.
 */
export function installedTargetNames(ctx: CompletionContext): string[] {
  const context = resolveContext(
    { fs: ctx.fs, env: ctx.env },
    ctx.projectOverride !== undefined ? { projectOverride: ctx.projectOverride } : undefined,
  );
  if (!context.found) {
    return [];
  }
  const manifest = parseManifest(parseYaml(ctx.fs.read(`${context.deliverableRoot}/manifest.yml`)));
  if (!manifest.ok) {
    return [];
  }
  return prefixFilter(manifest.value.targets as readonly string[], ctx.partial);
}
