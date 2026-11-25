import { describe, expect, it } from "vitest";
import { type AgentName, parseAgentName } from "../../../src/core/model/index.js";
import { ALIAS_PATHS, aliasPathFor } from "../../../src/core/services/agent-aliases.js";

function agent(s: string): AgentName {
  const r = parseAgentName(s);
  if (!r.ok) throw new Error(r.problem.message);
  return r.value;
}

describe("agent-aliases — the doc-05 scope map", () => {
  it.each([
    ["claude-code", ".claude/skills"],
    ["codex", ".agents/skills"],
    ["hermes", ".agents/skills"],
    ["openclaw", ".openclaw/skills"],
  ])("maps %s to %s (doc 05 lines 114-119)", (name, path) => {
    expect(aliasPathFor(agent(name))).toBe(path);
  });

  it("returns undefined for an agent not in the built-in map", () => {
    expect(aliasPathFor(agent("cursor"))).toBeUndefined();
    expect(aliasPathFor(agent("some-future-agent"))).toBeUndefined();
  });

  it("never maps any agent to a bare skills/ directory (doc 05 line 131)", () => {
    for (const path of Object.values(ALIAS_PATHS)) {
      expect(path).not.toBe("skills");
      expect(path).not.toMatch(/^skills\/?$/);
      // Every alias path is a dotted scope dir ending in /skills.
      expect(path).toMatch(/^\.[a-z]+\/skills$/);
    }
  });

  it("treats .agents/skills as the shared consolidating standard for codex and hermes", () => {
    expect(aliasPathFor(agent("codex"))).toBe(aliasPathFor(agent("hermes")));
  });
});
