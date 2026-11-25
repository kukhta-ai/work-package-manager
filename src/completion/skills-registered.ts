import { resolveContext } from "../core/services/context.js";
import { parseBundleManifest } from "../core/services/schema/index.js";
import { parseYaml } from "../util/yaml.js";
import { type CompletionContext, type CompletionSource, prefixFilter } from "./sources.js";

/**
 * The registered payload-skill name completion source — completes a skill NAME for `bundle <id> skills remove
 * <name>` (doc 10 row 172) from the host bundle's REGISTERED payload skills (`bundle.yml`'s `payload.skills`,
 * projecting each entry's `name`). This is the registry counterpart of the on-disk source: `remove` deregisters
 * a registered name, so it completes from exactly the registered set (a `--path`-relocated skill is still
 * registered by name, so it completes here too).
 *
 * It needs the host `<id>`, threaded into {@link CompletionContext.bundleId} by the per-bundle completion
 * recursion. State-dependent but PURE over the ports: it locates the project via `resolveContext` (honouring
 * `-C/--project`), reads `bundles/<id>/bundle.yml` through the FileSystem port, and parses it with the task-11
 * `parseBundleManifest`. No id, no project, a missing or malformed `bundle.yml` → `[]` (completion degrades,
 * never errors). It imports only pure core services + the port — never the CLI framework / `node:fs`.
 */

/**
 * Complete a payload-skill name from the host bundle's registered `payload.skills` names.
 *
 * @param ctx - The completion context (fs/env ports, host bundle id, partial).
 * @returns The registered skill names, prefix-filtered.
 */
export const skillNamesRegistered: CompletionSource = (ctx: CompletionContext): string[] => {
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
    parseYaml(ctx.fs.read(`${context.deliverableRoot}/bundles/${ctx.bundleId}/bundle.yml`)),
  );
  if (!parsed.ok) {
    return [];
  }
  return prefixFilter(
    parsed.value.payload.skills.map((skill) => skill.name),
    ctx.partial,
  );
};
