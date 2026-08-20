import { installedTargetNames, wellKnownAgentNames } from "./agent-names.js";
import { bundleIds } from "./bundle-ids.js";
import { bundleRequires } from "./bundle-requires.js";
import { disabledBundleIds } from "./disabled-bundle-ids.js";
import { FIXED_ENUM_SOURCES } from "./enums.js";
import { installerSkillNamesOnDisk } from "./installer-skills-on-disk.js";
import { installerSkillNamesRegistered } from "./installer-skills-registered.js";
import { payloadFilesOnDisk, payloadOnDiskSource } from "./payload-files-on-disk.js";
import { payloadFilesRegistered, payloadRegisteredSource } from "./payload-files-registered.js";
import {
  projectInstallerSkillNamesOnDisk,
  projectInstallerSkillNamesRegistered,
} from "./project-installer-skills.js";
import { skillNamesOnDisk } from "./skills-on-disk.js";
import { skillNamesRegistered } from "./skills-registered.js";
import { CompletionRegistry } from "./sources.js";
import { allTemplateNames, bundleTemplateNames, projectTemplateNames } from "./template-names.js";

/**
 * Build the default {@link CompletionRegistry} pre-loaded with every built-in completion source (doc 10's
 * completable-value list; doc 12's `src/completion/` sources). This is the single place the built-in source
 * NAMES are bound to their resolvers, so a command/option references one by name (e.g. `"template-names"`) and a
 * later leaf (tasks 34–84) registers a new one without touching the dispatch (task-29 AC#3).
 *
 * The names, grouped:
 * - **fixed enums (AC#2):** `bump-levels`, `build-formats`, `confirmation-levels`, `task-kinds`,
 *   `template-scopes`, `shells`.
 * - **state-dependent (AC#3):** `bundle-ids` (enabled, for `bundle disable`), `disabled-bundle-ids`
 *   (present-but-disabled bundle dirs, for `bundle enable`), `template-names` (+ `project-template-names` /
 *   `bundle-template-names`), `target-names` (well-known, for `add`) / `installed-target-names` (for `remove`).
 *
 * @returns A registry with all built-in sources registered.
 */
export function defaultRegistry(): CompletionRegistry {
  const registry = new CompletionRegistry();

  // Fixed-enum sources (knowable without project state).
  for (const [name, source] of Object.entries(FIXED_ENUM_SOURCES)) {
    registry.register(name, source);
  }

  // State-dependent sources (resolved from project state through the ports).
  registry.register("bundle-ids", bundleIds);
  // `bundle-requires`: the host bundle's CURRENT requires keys (for `bundle <id> requires remove <dep>`); it
  // reads `ctx.bundleId`, threaded in by the per-bundle completion recursion.
  registry.register("bundle-requires", bundleRequires);
  // The payload-files sources (Family L) — both id-aware (read `ctx.bundleId`): `files add <path>` completes
  // from files PRESENT on disk under payload/files/; `files remove <path>` from the REGISTERED refs.
  registry.register("payload-files-on-disk", payloadFilesOnDisk);
  registry.register("payload-files-registered", payloadFilesRegistered);
  // The payload-templates sources (Family M) — the same two id-aware shapes against `payload/templates/` /
  // `payload.templates`, bound through the shared factories (the operation behind them is descriptor-driven; the
  // completion follows the same category seam).
  registry.register("payload-templates-on-disk", payloadOnDiskSource("payload/templates"));
  registry.register(
    "payload-templates-registered",
    payloadRegisteredSource((bundle) => bundle.payload.templates),
  );
  // The payload-scripts sources (Family N) — the same two shapes against `installer-scripts/` (a sibling of
  // `payload/` on disk) / the registered `payload.scripts`. The on-disk factory takes the on-disk dir, so a
  // non-`payload/` directory works unchanged.
  registry.register("payload-scripts-on-disk", payloadOnDiskSource("installer-scripts"));
  registry.register(
    "payload-scripts-registered",
    payloadRegisteredSource((bundle) => bundle.payload.scripts),
  );
  // The payload-skill sources (Family O) — both id-aware (read `ctx.bundleId`): `skills add <name>` completes
  // from the skill-folder NAMES present under payload/agent-skills/ (attachable skills); `skills remove <name>`
  // from the REGISTERED `payload.skills` names. The registry, not a scan, is authoritative for the registered
  // set because payload skills are inert until install (doc 06).
  registry.register("skills-on-disk", skillNamesOnDisk);
  registry.register("skills-registered", skillNamesRegistered);
  // The installer-skill sources (Family P) — the installer-skills twins of the payload-skill sources, both
  // id-aware (read `ctx.bundleId`): `installer-skills add <name>` completes from the helper-folder NAMES present
  // under `bundles/<id>/installer-skills/` (the attachable helpers, matching the directory-scan `list`);
  // `installer-skills remove <name>` from the REGISTERED `installerSkills` names (AC79#4 — the deregister set).
  registry.register("installer-skills-on-disk", installerSkillNamesOnDisk);
  registry.register("installer-skills-registered", installerSkillNamesRegistered);
  // The PROJECT installer-skill sources (Family F) — the project-scoped twins, NOT id-aware (they resolve the
  // project root directly, like `installed-target-names`): `project installer-skills add <name>` completes from
  // the on-disk root `installer-skills/` helper folders (minus the reserved main-installer + advisor names);
  // `project installer-skills remove <name>` from the registered `manifest.installerSkills` names (AC47#5).
  registry.register("project-installer-skills-on-disk", projectInstallerSkillNamesOnDisk);
  registry.register("project-installer-skills-registered", projectInstallerSkillNamesRegistered);
  registry.register("disabled-bundle-ids", disabledBundleIds);
  registry.register("template-names", allTemplateNames);
  registry.register("project-template-names", projectTemplateNames);
  registry.register("bundle-template-names", bundleTemplateNames);
  registry.register("target-names", wellKnownAgentNames);
  registry.register("installed-target-names", installedTargetNames);

  return registry;
}
