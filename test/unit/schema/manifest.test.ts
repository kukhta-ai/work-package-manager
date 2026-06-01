import { describe, expect, it } from "vitest";
import { parseManifest, serializeManifest } from "../../../src/core/services/schema/index.js";

/** A well-formed manifest data object (the plain shape the YAML layer would hand us). */
function wellFormed() {
  return {
    project: {
      name: "hermes-handoff",
      version: "0.1.0",
      description: "A worked example.",
      license: "MIT",
      repository: "https://example.com/repo",
      author: "Acme",
    },
    targets: ["claude-code", "codex"],
    bundles: ["core", "web-handoff"],
  };
}

describe("parseManifest — well-formed (AC#1, AC#2)", () => {
  it("extracts release identity, targets, and the flat bundle-id list", () => {
    const r = parseManifest(wellFormed());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.meta.name).toBe("hermes-handoff");
      expect(r.value.meta.version).toBe("0.1.0");
      expect(r.value.meta.description).toBe("A worked example.");
      expect(r.value.meta.license).toBe("MIT");
      expect(r.value.meta.author).toBe("Acme");
      expect(r.value.targets).toEqual(["claude-code", "codex"]);
      expect(r.value.bundles).toEqual(["core", "web-handoff"]);
    }
  });

  it("round-trips: parse(serialize(parse(x))) is deep-equal, optionals preserved", () => {
    const first = parseManifest(wellFormed());
    expect(first.ok).toBe(true);
    if (first.ok) {
      const serialized = serializeManifest(first.value);
      const second = parseManifest(serialized);
      expect(second.ok).toBe(true);
      if (second.ok) {
        expect(second.value).toEqual(first.value);
      }
    }
  });

  it("serialize omits absent optionals (only name + version under project)", () => {
    const minimal = { project: { name: "p", version: "1.0.0" }, targets: ["hermes"], bundles: [] };
    const r = parseManifest(minimal);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = serializeManifest(r.value);
      expect(Object.keys(data.project).sort()).toEqual(["name", "version"]);
      expect(data.bundles).toEqual([]);
    }
  });
});

describe("parseManifest — malformed (AC#3)", () => {
  it.each([
    [42, "must be a mapping"],
    [{ targets: [], bundles: [] }, "project"],
    [{ project: { name: "p" }, targets: [], bundles: [] }, "project.version"],
    [
      { project: { name: "p", version: "not-a-version" }, targets: [], bundles: [] },
      "project.version",
    ],
    [{ project: { name: "p", version: "1.0.0" }, targets: "claude-code", bundles: [] }, "targets"],
    [{ project: { name: "p", version: "1.0.0" }, targets: [], bundles: "core" }, "bundles"],
    [{ project: { name: 5, version: "1.0.0" }, targets: [], bundles: [] }, "project.name"],
  ])("rejects %j naming %s", (data, expectedField) => {
    const r = parseManifest(data);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem.message.length).toBeGreaterThan(0);
      expect(`${r.problem.field} ${r.problem.message}`).toContain(expectedField);
    }
  });
});

describe("parseManifest — invalid ids/agents reuse the model rules (AC#4)", () => {
  it("rejects a reserved bundle verb in bundles", () => {
    const r = parseManifest({
      project: { name: "p", version: "1.0.0" },
      targets: ["hermes"],
      bundles: ["remove"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem.message).toContain("reserved");
      expect(r.problem.field).toBe("bundles[0]");
    }
  });

  it("rejects a non-kebab agent name in targets", () => {
    const r = parseManifest({
      project: { name: "p", version: "1.0.0" },
      targets: ["Claude Code"],
      bundles: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem.field).toBe("targets[0]");
    }
  });
});
