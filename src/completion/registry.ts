import { installedTargetNames, wellKnownAgentNames } from "./agent-names.js";
import { bundleIds } from "./bundle-ids.js";
import { disabledBundleIds } from "./disabled-bundle-ids.js";
import { FIXED_ENUM_SOURCES } from "./enums.js";
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
  registry.register("disabled-bundle-ids", disabledBundleIds);
  registry.register("template-names", allTemplateNames);
  registry.register("project-template-names", projectTemplateNames);
  registry.register("bundle-template-names", bundleTemplateNames);
  registry.register("target-names", wellKnownAgentNames);
  registry.register("installed-target-names", installedTargetNames);

  return registry;
}
