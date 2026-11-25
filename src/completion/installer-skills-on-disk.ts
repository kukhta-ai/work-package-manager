import type { FileSystem } from "../core/ports/index.js";
import { resolveContext } from "../core/services/context.js";
import { type CompletionContext, type CompletionSource, prefixFilter } from "./sources.js";

/**
 * The on-disk installer-skill name completion source — completes a helper NAME for `bundle <id> installer-skills
 * add <name>` (doc 10 row 173) from the immediate SUBDIRECTORY names under the host bundle's `installer-skills/`
 * that CONTAIN a `SKILL.md`. Each such directory is a candidate install-time helper the author placed (its
 * `SKILL.md` makes `add <name>` an ATTACH), so this offers exactly the attachable names — the same set the
 * directory-SCAN `installer-skills list` shows. A brand-new name yields no suggestion (like `bundle new <id>`).
 *
 * It is the installer-skills twin of `skill-names-on-disk` (Family O), against `installer-skills/` instead of
 * `payload/agent-skills/`. It needs the host `<id>`, threaded into {@link CompletionContext.bundleId} by the
 * per-bundle completion recursion. State-dependent but PURE over the ports: it locates the project via
 * `resolveContext` (honouring `-C/--project`) and lists `bundles/<id>/installer-skills/` through the FileSystem
 * port. No id, no project, or a missing directory → `[]` (completion degrades, never errors). It imports only pure
 * core services + the port — never the CLI framework / `node:fs`.
 */

/** The bundle-relative on-disk directory bundle-scoped install-time helper skills live under. */
const INSTALLER_SKILLS_DIR = "installer-skills";
/** The file whose presence marks a subdirectory as a helper skill (a SKILL.md is the skill). */
const SKILL_FILE = "SKILL.md";

/**
 * Complete an installer-skill name from the subdirectory names under the host bundle's `installer-skills/` that
 * contain a `SKILL.md`.
 *
 * @param ctx - The completion context (fs/env ports, host bundle id, partial).
 * @returns The helper-folder names present on disk (those with a SKILL.md), prefix-filtered.
 */
export const installerSkillNamesOnDisk: CompletionSource = (ctx: CompletionContext): string[] => {
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
  const base = `${context.deliverableRoot}/bundles/${ctx.bundleId}/${INSTALLER_SKILLS_DIR}`;
  return prefixFilter(helperNames(ctx.fs, base), ctx.partial);
};

/**
 * The immediate subdirectory names of `base` that contain a `SKILL.md` (sorted), reading through the FileSystem
 * port. Returns `[]` when `base` does not exist. Only directories holding a SKILL.md are returned (a helper IS a
 * `<name>/SKILL.md` folder); stray files and empty directories are ignored.
 *
 * @param fs - The FileSystem port.
 * @param base - The absolute `installer-skills/` directory to list.
 * @returns The helper-folder names under `base`, sorted.
 */
function helperNames(fs: FileSystem, base: string): string[] {
  if (!fs.exists(base)) {
    return [];
  }
  return fs
    .list(base)
    .filter(
      (entry) => entry.kind === "directory" && fs.exists(`${base}/${entry.name}/${SKILL_FILE}`),
    )
    .map((entry) => entry.name)
    .sort();
}
