import type { BundleId } from "../core/model/index.js";
import { resolveContext } from "../core/services/context.js";
import { parseBundleManifest } from "../core/services/schema/index.js";
import { parseYaml } from "../util/yaml.js";
import { type CompletionContext, prefixFilter } from "./sources.js";

/**
 * The `"bundle-requires"` completion source — completes a dependency id from the HOST bundle's CURRENT
 * `requires` map (for `bundle <id> requires remove <dep>`, doc 10 row 164; 64#4: "the dependency id completes
 * from this bundle's current requires entries").
 *
 * It needs the host `<id>`, which the per-bundle completion recursion threads into
 * {@link CompletionContext.bundleId}. State-dependent but PURE over the ports: it locates the project via the
 * task-24 `resolveContext` (honouring the `-C/--project` override), reads `bundles/<id>/bundle.yml` through the
 * FileSystem port, and parses it with the task-11 `parseBundleManifest`. No id, no project, a missing
 * `bundle.yml`, or a malformed one → `[]` (completion degrades to "no suggestions", never an error). It imports
 * only pure core services + the port — never `node:fs`/`commander`.
 *
 * @param ctx - The completion context (ports + the `-C` override + the host `bundleId` + the partial token).
 * @returns The host bundle's current `requires` keys, prefix-filtered; `[]` when no project/bundle resolves.
 */
export function bundleRequires(ctx: CompletionContext): string[] {
  if (ctx.bundleId === undefined) {
    return [];
  }
  const context = resolveContext(
    { fs: ctx.fs, env: ctx.env },
    ctx.projectOverride !== undefined ? { projectOverride: ctx.projectOverride } : undefined,
  );
  if (!context.found) {
    return [];
  }
  const parsed = parseBundleManifest(
    parseYaml(ctx.fs.read(`${context.root}/bundles/${ctx.bundleId}/bundle.yml`)),
  );
  if (!parsed.ok) {
    return [];
  }
  const depIds = [...parsed.value.requires.keys()].map((key) => key as BundleId as string);
  return prefixFilter(depIds, ctx.partial);
}
