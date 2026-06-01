import type { FileSystem } from "../core/ports/index.js";
import { resolveContext } from "../core/services/context.js";
import { type CompletionContext, prefixFilter } from "./sources.js";

/**
 * The `"payload-files-on-disk"` completion source — completes a path from the files PRESENT under the host
 * bundle's `payload/files/` directory (for `bundle <id> files add <path>`, doc 10 row 165; 65#3: "the path
 * [completes] from files present under `payload/files`").
 *
 * It needs the host `<id>`, which the per-bundle completion recursion threads into
 * {@link CompletionContext.bundleId}. State-dependent but PURE over the ports: it locates the project via the
 * task-24 `resolveContext` (honouring the `-C/--project` override) and recursively lists
 * `bundles/<id>/payload/files/` through the FileSystem port. No id, no project, or a missing directory → `[]`
 * (completion degrades to "no suggestions", never an error). It imports only pure core services + the port —
 * never `node:fs`/`commander`.
 *
 * @param ctx - The completion context (ports + the `-C` override + the host `bundleId` + the partial token).
 * @returns The relative paths present under `payload/files/`, prefix-filtered; `[]` when nothing resolves.
 */
export function payloadFilesOnDisk(ctx: CompletionContext): string[] {
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
  const base = `${context.root}/bundles/${ctx.bundleId}/payload/files`;
  return prefixFilter(listRelativeFiles(ctx.fs, base), ctx.partial);
}

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
