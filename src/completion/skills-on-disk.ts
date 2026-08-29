import type { FileSystem } from "../core/ports/index.js";
import { resolveContext } from "../core/services/context.js";
import { type CompletionContext, type CompletionSource, prefixFilter } from "./sources.js";

/**
 * The on-disk payload-skill name completion source — completes a skill NAME for `bundle <id> skills add <name>`
 * (doc 10 row 170) from the immediate SUBDIRECTORY names under the host bundle's `payload/agent-skills/`. Each
 * such directory is a candidate skill the author placed (its `SKILL.md` makes `add <name>` an ATTACH); a brand-
 * new name yields no suggestion (like `bundle new <id>`), so this offers exactly the attachable names.
 *
 * Unlike the file sources (which list descendant FILES), this lists DIR NAMES — a skill is named by its folder
 * (`payload/agent-skills/<name>/`). It needs the host `<id>`, threaded into {@link CompletionContext.bundleId}
 * by the per-bundle completion recursion. State-dependent but PURE over the ports: it locates the project via
 * `resolveContext` (honouring `-C/--project`) and lists `bundles/<id>/payload/agent-skills/` through the
 * FileSystem port. No id, no project, or a missing directory → `[]` (completion degrades, never errors). It
 * imports only pure core services + the port — never the CLI framework / `node:fs`.
 */

/** The bundle-relative on-disk directory payload skills live under. */
const AGENT_SKILLS_DIR = "payload/agent-skills";

/**
 * Complete a payload-skill name from the subdirectory names under the host bundle's `payload/agent-skills/`.
 *
 * @param ctx - The completion context (fs/env ports, host bundle id, partial).
 * @returns The skill-folder names present on disk, prefix-filtered.
 */
export const skillNamesOnDisk: CompletionSource = (ctx: CompletionContext): string[] => {
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
  const base = `${context.deliverableRoot}/bundles/${ctx.bundleId}/${AGENT_SKILLS_DIR}`;
  return prefixFilter(subdirNames(ctx.fs, base), ctx.partial);
};

/**
 * The immediate subdirectory names of `base` (sorted), reading through the FileSystem port. Returns `[]` when
 * `base` does not exist. Only directory entries (skill folders) are returned; stray files are ignored.
 *
 * @param fs - The FileSystem port.
 * @param base - The absolute directory to list.
 * @returns The subdirectory names under `base`, sorted.
 */
function subdirNames(fs: FileSystem, base: string): string[] {
  if (!fs.exists(base)) {
    return [];
  }
  return fs
    .list(base)
    .filter((entry) => entry.kind === "directory")
    .map((entry) => entry.name)
    .sort();
}
