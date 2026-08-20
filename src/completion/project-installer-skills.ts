import { isReservedInstallerSkillName } from "../core/operations/installer-skills-project.js";
import type { FileSystem } from "../core/ports/index.js";
import { resolveContext } from "../core/services/context.js";
import { parseManifest } from "../core/services/schema/index.js";
import { parseYaml } from "../util/yaml.js";
import { type CompletionContext, type CompletionSource, prefixFilter } from "./sources.js";

/**
 * The PROJECT-scoped installer-skill completion sources (Family F) — the project analogue of the bundle
 * installer-skill sources (P), for `project installer-skills add|remove <name>` (doc 10 rows 178/180). Unlike the
 * per-bundle sources, these are NOT id-aware (no `ctx.bundleId`): they resolve the project root directly via
 * `resolveContext`, exactly like the `installed-target-names` source (which reads `manifest.targets`).
 *
 * - **`project-installer-skills-on-disk`** (`add` side) — the attachable helper-folder names under the root
 *   `installer-skills/` (subdirs containing a `SKILL.md`), EXCLUDING the reserved names `add` would refuse (the
 *   main `<project>-installer` + any `<id>-advisor`), so completion never offers a name the command rejects.
 * - **`project-installer-skills-registered`** (`remove` side, AC47#5 "completes from registered project helpers")
 *   — the registered `manifest.installerSkills` names.
 *
 * State-dependent but PURE over the ports; no project / a missing dir / a malformed manifest → `[]` (completion
 * degrades, never errors). Imports only pure core services + the port — never the CLI framework / `node:fs`.
 */

/** The root-relative on-disk directory project-scoped install-time helper skills live under. */
const INSTALLER_SKILLS_DIR = "installer-skills";
/** The file whose presence marks a subdirectory as a helper skill (a SKILL.md is the skill). */
const SKILL_FILE = "SKILL.md";

/**
 * Complete a project installer-skill name from the on-disk helper folders under the root `installer-skills/`,
 * excluding the reserved names (`<project>-installer` + any `*-advisor`) `add` would refuse.
 *
 * @param ctx - The completion context (fs/env ports, `-C` override, partial).
 * @returns The attachable helper-folder names present on disk (minus the reserved ones), prefix-filtered.
 */
export const projectInstallerSkillNamesOnDisk: CompletionSource = (
  ctx: CompletionContext,
): string[] => {
  const context = resolveContext(
    { fs: ctx.fs, env: ctx.env },
    ctx.projectOverride !== undefined ? { projectOverride: ctx.projectOverride } : undefined,
  );
  if (!context.found) {
    return [];
  }
  // The project name (for the reserved-name exclusion) comes from the manifest; if it cannot be parsed, fall back
  // to no project name (only the `*-advisor` reservation then applies — completion degrades gracefully).
  const manifest = parseManifest(parseYaml(ctx.fs.read(`${context.deliverableRoot}/manifest.yml`)));
  const projectName = manifest.ok ? manifest.value.meta.name : "";
  const names = helperNames(ctx.fs, `${context.deliverableRoot}/${INSTALLER_SKILLS_DIR}`).filter(
    (name) => !isReservedInstallerSkillName(name, projectName),
  );
  return prefixFilter(names, ctx.partial);
};

/**
 * Complete a project installer-skill name from the registered `manifest.installerSkills` names.
 *
 * @param ctx - The completion context (fs/env ports, `-C` override, partial).
 * @returns The registered project installer-skill names, prefix-filtered.
 */
export const projectInstallerSkillNamesRegistered: CompletionSource = (
  ctx: CompletionContext,
): string[] => {
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
  return prefixFilter(
    manifest.value.installerSkills.map((skill) => skill.name),
    ctx.partial,
  );
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
