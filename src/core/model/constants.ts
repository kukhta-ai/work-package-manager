/**
 * Shared domain constants (pure data — no imports, no effects). Kept in the model so every layer references one
 * source and they cannot drift.
 */

/**
 * The hidden authoring-backlog directory at a project root (doc 10 step 6; doc 11) — its own Backlog.md root
 * with `task_prefix=authoring`, where every mutating operation materialises its authoring tasks. `init` creates
 * it here and the lifecycle harness materialises into it; they share this constant so the path can never
 * diverge (the root-mismatch class of bug).
 */
export const AUTHORING_BACKLOG_DIR = ".authoring-backlog";

/** The `task_prefix` of the authoring backlog (doc 11) — its tasks are `authoring-<n>`. */
export const AUTHORING_TASK_PREFIX = "authoring";
