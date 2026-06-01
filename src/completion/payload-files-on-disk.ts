import type { FileSystem } from "../core/ports/index.js";
import { resolveContext } from "../core/services/context.js";
import { type CompletionContext, type CompletionSource, prefixFilter } from "./sources.js";

/**
 * The on-disk payload-reference completion sources — complete a path from the files PRESENT under the host
 * bundle's on-disk payload category directory (for `bundle <id> <category> add <path>`; e.g. doc 10 row 165 for
 * files, row 168 for templates: "the path [completes] from files present under `payload/<category>`").
 *
 * The behaviour is identical across categories (files L, templates M, scripts N) — they differ ONLY by the
 * bundle-relative on-disk directory to walk — so {@link payloadOnDiskSource} is a FACTORY parameterised by that
 * directory, and each named registry source is a thin binding. This keeps the project-resolution + recursive
 * walk + degrade-to-`[]` logic in ONE place (the same reason the operation behind these commands is
 * descriptor-driven).
 *
 * It needs the host `<id>`, which the per-bundle completion recursion threads into
 * {@link CompletionContext.bundleId}. State-dependent but PURE over the ports: it locates the project via the
 * task-24 `resolveContext` (honouring the `-C/--project` override) and recursively lists
 * `bundles/<id>/<onDiskDir>/` through the FileSystem port. No id, no project, or a missing directory → `[]`
 * (completion degrades to "no suggestions", never an error). It imports only pure core services + the port —
 * never `node:fs`/`commander`.
 *
 * @param onDiskDir - The bundle-relative on-disk directory to walk (e.g. `payload/files`, `payload/templates`).
 * @returns A {@link CompletionSource} over the relative paths present under `bundles/<id>/<onDiskDir>/`.
 */
export function payloadOnDiskSource(onDiskDir: string): CompletionSource {
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
    const base = `${context.root}/bundles/${ctx.bundleId}/${onDiskDir}`;
    return prefixFilter(listRelativeFiles(ctx.fs, base), ctx.partial);
  };
}

/**
 * The `"payload-files-on-disk"` source (Family L) — files present under the host bundle's `payload/files/`, for
 * `bundle <id> files add <path>` (doc 10 row 165). A binding of {@link payloadOnDiskSource}.
 */
export const payloadFilesOnDisk: CompletionSource = payloadOnDiskSource("payload/files");

/**
 * Recursively list the files under `base` as sorted relative paths (directories contribute their descendant
 * files, not their own entry), reading through the FileSystem port. Returns `[]` when `base` does not exist.
 *
 * @param fs - The FileSystem port.
 * @param base - The absolute directory to walk.
 * @returns The relative file paths under `base`, sorted.
 */
function listRelativeFiles(fs: FileSystem, base: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    const abs = rel === "" ? base : `${base}/${rel}`;
    if (!fs.exists(abs)) {
      return;
    }
    for (const entry of fs.list(abs)) {
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.kind === "directory") {
        walk(childRel);
      } else {
        out.push(childRel);
      }
    }
  };
  walk("");
  return out.sort();
}
