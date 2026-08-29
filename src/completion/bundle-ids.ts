import { resolveContext } from "../core/services/context.js";
import { parseManifest } from "../core/services/schema/index.js";
import { parseYaml } from "../util/yaml.js";
import { type CompletionContext, prefixFilter } from "./sources.js";

/**
 * The `"bundle-ids"` completion source (doc 12 names this slot `src/completion/bundle-ids.ts` — "from current
 * project's `manifest.yml`"). It completes a bundle-id value (e.g. `bundle <id> …`, a `requires` dependency)
 * from the enabled bundles of the resolved project.
 *
 * State-dependent but PURE over the ports: it locates the project via the task-24 `resolveContext` (honouring
 * the `-C/--project` override), reads `manifest.yml` through the FileSystem port, and parses it with the
 * task-10 `parseManifest`. No project, no manifest, or a malformed manifest → `[]` (completion degrades to "no
 * suggestions", never an error). It imports only pure core services + the port — never `node:fs`/`commander`.
 *
 * @param ctx - The completion context (ports + the `-C` override + the partial token).
 * @returns The enabled bundle ids, prefix-filtered by the partial; `[]` when no project resolves.
 */
export function bundleIds(ctx: CompletionContext): string[] {
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
  return prefixFilter(manifest.value.bundles as readonly string[], ctx.partial);
}
