import { describe, expect, it } from "vitest";
import {
  type BundleId,
  parseAgentName,
  parseBundleId,
  RESERVED_BUNDLE_VERBS,
} from "../../../src/core/model/index.js";

describe("parseBundleId (kebab-case + reserved-verb exclusion — AC#1, AC#2)", () => {
  it.each([
    "web-handoff",
    "core",
    "a1",
    "x-y-z",
    "doc-handoff",
    "a",
    "bundle2",
    "new-bundle",
    "lister",
  ])("accepts the valid kebab id %j", (raw) => {
    const r = parseBundleId(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // The branded value is the same string at runtime.
      expect(r.value).toBe(raw);
    }
  });

  it.each([
    ["", "empty"],
    ["Web", "uppercase"],
    ["webHandoff", "camelCase"],
    ["-x", "leading hyphen"],
    ["x-", "trailing hyphen"],
    ["x--y", "double hyphen"],
    ["web_handoff", "underscore"],
    ["web handoff", "space"],
    ["web.handoff", "dot"],
    ["WEB", "all caps"],
  ])("rejects %j (%s) with a kebab/empty problem", (raw) => {
    const r = parseBundleId(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem.field).toBe("id");
      expect(r.problem.message.length).toBeGreaterThan(0);
    }
  });

  // AC#2: each reserved cross-bundle verb (docs/10) must be rejected so it can't collide with routing.
  it.each([...RESERVED_BUNDLE_VERBS])("rejects the reserved verb %j", (verb) => {
    const r = parseBundleId(verb);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem.message).toContain("reserved");
    }
  });

  it("exposes exactly the six reserved verbs from docs/10", () => {
    expect([...RESERVED_BUNDLE_VERBS].sort()).toEqual(
      ["disable", "enable", "list", "new", "remove", "template"].sort(),
    );
  });
});

describe("parseAgentName", () => {
  it.each(["claude-code", "codex", "hermes", "opencode", "agent-1"])("accepts %j", (raw) => {
    const r = parseAgentName(raw);
    expect(r.ok).toBe(true);
  });

  it.each(["", "Claude Code", "Codex", "claude_code", "claude.code", "-x"])("rejects %j", (raw) => {
    const r = parseAgentName(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem.field).toBe("agent");
    }
  });
});

describe("smart-constructor contract (AC#1 — parsers never throw)", () => {
  it("returns a failure object rather than throwing for invalid input", () => {
    // Both a clearly-invalid and a reserved value must resolve to { ok: false }, never an exception.
    expect(() => parseBundleId("not valid")).not.toThrow();
    expect(() => parseBundleId("remove")).not.toThrow();
    expect(parseBundleId("not valid").ok).toBe(false);
  });

  it("a BundleId can only originate from the parser (compile-time brand)", () => {
    const r = parseBundleId("web-handoff");
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Demonstrates the value is usable where a BundleId is required (type-level proof at compile time).
      const id: BundleId = r.value;
      expect(typeof id).toBe("string");
    }
  });
});
