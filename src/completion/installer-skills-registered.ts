import { resolveContext } from "../core/services/context.js";
import { parseBundleManifest } from "../core/services/schema/index.js";
import { parseYaml } from "../util/yaml.js";
import { type CompletionContext, type CompletionSource, prefixFilter } from "./sources.js";

/**
 * The registered installer-skill name completion source — completes a helper NAME for `bundle <id>
 * installer-skills remove <name>` (doc 10 row 175) from the host bundle's REGISTERED install-time helpers
 * (`bundle.yml`'s top-level `installerSkills`, projecting each entry's `name`). `remove` deregisters a registered
 * name (AC79#4 "completes from registered bundle helpers"), so it completes from exactly the registered set — the
 * REGISTRY counterpart of the on-disk source `add` uses. (A `--path`-relocated helper is still registered by name,
 * so it completes here too.)
 *
 * It is the installer-skills twin of `skill-names-registered` (Family O), reading the `installerSkills` registry
 * instead of `payload.skills`. It needs the host `<id>`, threaded into {@link CompletionContext.bundleId} by the
 * per-bundle completion recursion. State-dependent but PURE over the ports: it locates the project via
 * `resolveContext` (honouring `-C/--project`), reads `bundles/<id>/bundle.yml` through the FileSystem port, and
 * parses it with the task-11 `parseBundleManifest`. No id, no project, a missing or malformed `bundle.yml` → `[]`
 * (completion degrades, never errors). It imports only pure core services + the port — never the CLI framework /
 * `node:fs`.
 */

/**
 * Complete an installer-skill name from the host bundle's registered `installerSkills` names.
 *
 * @param ctx - The completion context (fs/env ports, host bundle id, partial).
 * @returns The registered installer-skill names, prefix-filtered.
 */
export const installerSkillNamesRegistered: CompletionSource = (
  ctx: CompletionContext,
): string[] => {
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
    parsed.value.installerSkills.map((skill) => skill.name),
    ctx.partial,
  );
};
