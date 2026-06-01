import { installedTargetNames, wellKnownAgentNames } from "./agent-names.js";
import { bundleIds } from "./bundle-ids.js";
import { bundleRequires } from "./bundle-requires.js";
import { disabledBundleIds } from "./disabled-bundle-ids.js";
import { FIXED_ENUM_SOURCES } from "./enums.js";
import { payloadFilesOnDisk } from "./payload-files-on-disk.js";
import { payloadFilesRegistered } from "./payload-files-registered.js";
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
  registry.register("disabled-bundle-ids", disabledBundleIds);
  registry.register("template-names", allTemplateNames);
  registry.register("project-template-names", projectTemplateNames);
  registry.register("bundle-template-names", bundleTemplateNames);
  registry.register("target-names", wellKnownAgentNames);
  registry.register("installed-target-names", installedTargetNames);

  return registry;
}
