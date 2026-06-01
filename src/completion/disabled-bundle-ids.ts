import { resolveContext } from "../core/services/context.js";
import { parseManifest } from "../core/services/schema/index.js";
import { parseYaml } from "../util/yaml.js";
import { type CompletionContext, prefixFilter } from "./sources.js";

/**
 * The `"disabled-bundle-ids"` completion source — the id positional for `bundle enable <id>` (doc 10 row 150;
 * task-51 AC#5: "the id positional completes from disabled-but-present bundle directories"). It lists the bundle
 * DIRECTORY names under `<root>/bundles/` that are NOT currently in `manifest.yml.bundles` (i.e. present on disk
 * but disabled) — exactly the set `bundle enable` accepts. The project's own scaffold template directory
 * (`bundle-template/`, doc 10 row 149 step 2) is excluded: it is not an enable-able bundle.
 *
 * State-dependent but PURE over the ports (mirrors `bundle-ids.ts`): it resolves the project via the task-24
 * `resolveContext` (honouring `-C/--project`), reads `manifest.yml` through the FileSystem port, lists
 * `bundles/` through the port, and parses with the task-10 `parseManifest`. No project, no `bundles/` dir, or a
 * malformed manifest → `[]` (completion degrades to "no suggestions", never an error). It imports only pure core
 * services + the port — never `node:fs`/`commander`.
 *
 * @param ctx - The completion context (ports + the `-C` override + the partial token).
 * @returns The disabled-but-present bundle directory names, prefix-filtered by the partial; `[]` when none.
 */
export function disabledBundleIds(ctx: CompletionContext): string[] {
  const context = resolveContext(
    { fs: ctx.fs, env: ctx.env },
    ctx.projectOverride !== undefined ? { projectOverride: ctx.projectOverride } : undefined,
  );
  if (!context.found) {
    return [];
  }
  const manifest = parseManifest(parseYaml(ctx.fs.read(`${context.root}/manifest.yml`)));
  if (!manifest.ok) {
    return [];
  }
  const enabled = new Set<string>(manifest.value.bundles as readonly string[]);

  const bundlesDir = `${context.root}/bundles`;
  if (!ctx.fs.exists(bundlesDir)) {
    return [];
  }
  const disabled = ctx.fs
    .list(bundlesDir)
    .filter((entry) => entry.kind === "directory")
    .map((entry) => entry.name)
    .filter((name) => name !== BUNDLE_TEMPLATE_DIR && !enabled.has(name));

  return prefixFilter(disabled, ctx.partial);
}

/** The project's own bundle scaffold-template directory under `bundles/` — never an enable-able bundle (doc 10). */
const BUNDLE_TEMPLATE_DIR = "bundle-template";
