import type { Brand } from "./branded.js";
import { fail, ok, type Parsed } from "./result.js";

/**
 * A bundle's stable, internal identifier (doc 00 "Vocabulary"; doc 13 §2). Kebab-case and never a reserved
 * verb. It names the bundle's directory, its Backlog.md `task_prefix`, and how other bundles refer to it in
 * `requires`; it never changes across releases. Obtainable only via {@link parseBundleId}.
 */
export type BundleId = Brand<string, "BundleId">;

/**
 * A target-agent runtime name (doc 00 "Vocabulary") — the agent harness the installer declares support for
 * (e.g. `claude-code`, `codex`, `hermes`). These become the keys of the scope-alias map. Kebab-case;
 * obtainable only via {@link parseAgentName}.
 */
export type AgentName = Brand<string, "AgentName">;

/**
 * Kebab-case: one or more lowercase-alphanumeric segments joined by single hyphens. Forbids uppercase,
 * underscores, spaces, and leading/trailing/double hyphens. This is exactly the shape that is also a safe
 * directory name and Backlog.md `task_prefix`.
 */
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The reserved cross-bundle verbs a {@link BundleId} may not equal.
 *
 * Source: doc 10 (the authoring CLI). The `bundle` command group routes `bundle <verb>` (cross-bundle
 * operations) and `bundle <id> …` (per-bundle context) through the same positional slot, so a bundle id that
 * equalled a verb would make `bundle <id> …` ambiguous. Doc 10 states the set twice — under `bundle new`'s
 * validation and the `<id>` subtree note — as `new | enable | disable | remove | list | template`.
 */
export const RESERVED_BUNDLE_VERBS: readonly string[] = [
  "new",
  "enable",
  "disable",
  "remove",
  "list",
  "template",
];

/**
 * Parse a raw string into a {@link BundleId}, enforcing kebab-case and the reserved-verb exclusion
 * (doc 13 §2; AC#2). Pure and total — returns a {@link Parsed}, never throws.
 *
 * @param raw - The candidate id.
 * @returns The branded {@link BundleId} on success, or a {@link ValidationProblem} describing the rejection.
 */
export function parseBundleId(raw: string): Parsed<BundleId> {
  if (raw.length === 0) {
    return fail("bundle id must not be empty", "id");
  }
  if (!KEBAB_CASE.test(raw)) {
    return fail(
      `bundle id "${raw}" must be kebab-case (lowercase letters, digits, and single hyphens; no leading, trailing, or doubled hyphens)`,
      "id",
    );
  }
  if (RESERVED_BUNDLE_VERBS.includes(raw)) {
    return fail(
      `bundle id "${raw}" is a reserved command verb (${RESERVED_BUNDLE_VERBS.join(", ")}) and would collide with "bundle ${raw} …" routing`,
      "id",
    );
  }
  return ok(raw as BundleId);
}

/**
 * Parse a raw string into an {@link AgentName} (doc 13 §2). Validated to kebab-case — the canonical,
 * alias-safe spelling of a runtime name (e.g. `claude-code`). Pure and total.
 *
 * @param raw - The candidate agent name.
 * @returns The branded {@link AgentName} on success, or a {@link ValidationProblem}.
 */
export function parseAgentName(raw: string): Parsed<AgentName> {
  if (raw.length === 0) {
    return fail("agent name must not be empty", "agent");
  }
  if (!KEBAB_CASE.test(raw)) {
    return fail(
      `agent name "${raw}" must be kebab-case (lowercase letters, digits, and single hyphens), e.g. "claude-code"`,
      "agent",
    );
  }
  return ok(raw as AgentName);
}
