import { type CompletionSource, fixedEnum } from "./sources.js";

/**
 * The fixed-enum completion sources (doc 12 names this slot `src/completion/enums.ts` — "finite value sets
 * (bump levels, formats, etc.)"). Each is a {@link CompletionSource} over a constant array, so an option
 * declared with one of these source names completes to exactly its valid values (task-29 AC#2). The value sets
 * are doc 10's: bump levels, build formats, confirmation levels, task kinds, template scopes — plus the shells
 * the `completion install` command itself accepts.
 *
 * These are knowable without project state; later command leaves (tasks 34–84) reference them by name (e.g.
 * `project version bump <level>` → `"bump-levels"`) and get completion for free.
 */

/** Version-bump levels (doc 10; `project|bundle version bump <level>`). */
export const BUMP_LEVELS = ["major", "minor", "patch"] as const;
/** Build output formats (doc 10; `build package --format`). */
export const BUILD_FORMATS = ["zip", "tarball", "git"] as const;
/** Bundle confirmation levels (doc 10; `bundle <id> meta --confirmation-level`). */
export const CONFIRMATION_LEVELS = ["safe", "dangerous"] as const;
/** Recipe-task kinds (doc 08; the `kind:` label values an authoring agent applies). */
export const TASK_KINDS = ["kind:state", "kind:migration"] as const;
/** Template scopes (doc 10; `template list --scope`). */
export const TEMPLATE_SCOPES = ["project", "bundle"] as const;
/** The shells `completion install` supports (doc 12: "bash/zsh/fish completion scripts"). */
export const SHELLS = ["bash", "zsh", "fish"] as const;

/**
 * The built-in fixed-enum sources, keyed by the name a command/option references them by. Registered into the
 * default registry so AC#2 holds for every finite enum doc 10 names.
 */
export const FIXED_ENUM_SOURCES: Readonly<Record<string, CompletionSource>> = {
  "bump-levels": fixedEnum(BUMP_LEVELS),
  "build-formats": fixedEnum(BUILD_FORMATS),
  "confirmation-levels": fixedEnum(CONFIRMATION_LEVELS),
  "task-kinds": fixedEnum(TASK_KINDS),
  "template-scopes": fixedEnum(TEMPLATE_SCOPES),
  shells: fixedEnum(SHELLS),
};
