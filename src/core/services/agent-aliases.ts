import type { AgentName } from "../model/index.js";

/**
 * The built-in agent → scanned-scope alias-path map (doc 12 names this file `agent-aliases.ts`).
 *
 * Each target agent reads install-time skills from a specific project-relative scope; a scope alias is a
 * symlink from that scope to the project's canonical `installer-skills/` directory (the
 * AGENTS.md/CLAUDE.md-style aliasing pattern). The paths are grounded in **doc 05's scope table** (lines
 * 114–119):
 *
 * | AgentName     | scope alias path     | doc 05                                    |
 * |---------------|----------------------|-------------------------------------------|
 * | `claude-code` | `.claude/skills`     | line 116 (`.claude/skills/`)              |
 * | `codex`       | `.agents/skills`     | line 114 (`.agents/skills/`)              |
 * | `hermes`      | `.agents/skills`     | line 115 (reads `.agents/skills/`)        |
 * | `openclaw`    | `.openclaw/skills`   | line 117 (`.openclaw/skills/`)            |
 *
 * `.agents/skills/` is the consolidating cross-tool standard (read by both Codex and Hermes); `.claude/skills/`
 * and `.openclaw/skills/` are agent-specific aliases pointing at the same canonical dir (doc 05 line 119).
 * A bare `skills/` is **never** used (Hermes/tap tooling would seed it — doc 05 line 131).
 *
 * Pure data + a lookup; this lives under `src/core/services/`, so the import-boundary rule applies, but it
 * imports only the model.
 */

/** The project-relative scope-alias path each known agent reads, keyed by the agent-name string. */
export const ALIAS_PATHS: Readonly<Record<string, string>> = {
  "claude-code": ".claude/skills",
  codex: ".agents/skills",
  hermes: ".agents/skills",
  openclaw: ".openclaw/skills",
};

/**
 * The scope-alias path for an agent, or `undefined` if the agent is not in the built-in map (the caller
 * surfaces unknown agents rather than guessing a path — doc 10's `project targets add` warns on unknown
 * agents).
 *
 * @param agent - The target agent name.
 * @returns The project-relative alias path, or `undefined` when the agent is unknown.
 */
export function aliasPathFor(agent: AgentName): string | undefined {
  return ALIAS_PATHS[agent];
}
