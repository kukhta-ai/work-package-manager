import type { BundleManifest } from "../core/model/index.js";
import { resolveContext } from "../core/services/context.js";
import { parseBundleManifest } from "../core/services/schema/index.js";
import { parseYaml } from "../util/yaml.js";
import { type CompletionContext, type CompletionSource, prefixFilter } from "./sources.js";

/**
 * The registered payload-reference completion sources — complete a path from the host bundle's REGISTERED
 * references in one `bundle.yml` payload category (for `bundle <id> <category> remove <path>`; e.g. doc 10 row
 * 167 for files, row 168 for templates: "the path completes from registered payload <category>").
 *
 * The behaviour is identical across categories (files L, templates M, scripts N) — they differ ONLY by WHICH
 * category list to project off the parsed manifest — so {@link payloadRegisteredSource} is a FACTORY
 * parameterised by that selector, and each named registry source is a thin binding (the same selector the
 * matching `PayloadRefDescriptor.select` uses, keeping the completion and the operation in lock-step).
 *
 * It needs the host `<id>`, which the per-bundle completion recursion threads into
 * {@link CompletionContext.bundleId}. State-dependent but PURE over the ports: it locates the project via the
 * task-24 `resolveContext` (honouring the `-C/--project` override), reads `bundles/<id>/bundle.yml` through the
 * FileSystem port, and parses it with the task-11 `parseBundleManifest`. No id, no project, a missing
 * `bundle.yml`, or a malformed one → `[]` (completion degrades to "no suggestions", never an error). It imports
 * only pure core services + the port — never `node:fs`/`commander`.
 *
 * @param select - Projects the registered-reference list off the parsed manifest (e.g. `(b) => b.payload.files`).
 * @returns A {@link CompletionSource} over the host bundle's registered references in that category.
 */
export function payloadRegisteredSource(
  select: (bundle: BundleManifest) => readonly string[],
): CompletionSource {
  return (ctx: CompletionContext): string[] => {
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
    return prefixFilter([...select(parsed.value)], ctx.partial);
  };
}

/**
 * The `"payload-files-registered"` source (Family L) — the host bundle's registered `payload.files`, for
 * `bundle <id> files remove <path>` (doc 10 row 167). A binding of {@link payloadRegisteredSource}.
 */
export const payloadFilesRegistered: CompletionSource = payloadRegisteredSource(
  (bundle) => bundle.payload.files,
);
