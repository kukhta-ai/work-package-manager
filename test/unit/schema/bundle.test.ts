import { describe, expect, it } from "vitest";
import {
  parseBundleManifest,
  serializeBundleManifest,
} from "../../../src/core/services/schema/index.js";

/** A well-formed bundle.yml data object with a requires map. */
function wellFormed() {
  return {
    id: "web-handoff",
    version: "0.2.0",
    summary: "Hand a website project off to another agent.",
    confirmation: "safe",
    requires: { core: "^0.3.0", "doc-handoff": "~1.2.0" },
  };
}

describe("parseBundleManifest — well-formed (AC#1, AC#2)", () => {
  it("extracts id, version, summary, confirmation, and the requires map", () => {
    const r = parseBundleManifest(wellFormed());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.id).toBe("web-handoff");
      expect(r.value.version).toBe("0.2.0");
      expect(r.value.summary).toContain("website");
      expect(r.value.confirmation).toBe("safe");
      // requires is a Map<BundleId, VersionRange> with normalized ranges.
      expect([...r.value.requires.keys()]).toEqual(["core", "doc-handoff"]);
      expect(r.value.requires.get("core" as never)).toBe(">=0.3.0 <0.4.0-0");
    }
  });

  it("round-trips: parse(serialize(parse(x))) is deep-equal (requires Map preserved)", () => {
    const first = parseBundleManifest(wellFormed());
    expect(first.ok).toBe(true);
    if (first.ok) {
      const serialized = serializeBundleManifest(first.value);
      const second = parseBundleManifest(serialized);
      expect(second.ok).toBe(true);
      if (second.ok) {
        expect(second.value.id).toBe(first.value.id);
        expect(second.value.version).toBe(first.value.version);
        expect(second.value.confirmation).toBe(first.value.confirmation);
        // Compare the requires maps as entry arrays.
        expect([...second.value.requires.entries()]).toEqual([...first.value.requires.entries()]);
      }
    }
  });

  it("accepts an empty requires map", () => {
    const r = parseBundleManifest({
      id: "core",
      version: "1.0.0",
      summary: "Core.",
      confirmation: "dangerous",
      requires: {},
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.requires.size).toBe(0);
    }
  });
});

describe("parseBundleManifest — malformed (AC#3)", () => {
  it.each([
    ["not an object", "string" as unknown, "must be a mapping"],
    ["missing id", { version: "1.0.0", summary: "s", confirmation: "safe", requires: {} }, "id"],
    [
      "missing version",
      { id: "core", summary: "s", confirmation: "safe", requires: {} },
      "version",
    ],
    [
      "missing summary",
      { id: "core", version: "1.0.0", confirmation: "safe", requires: {} },
      "summary",
    ],
    [
      "bad confirmation",
      { id: "core", version: "1.0.0", summary: "s", confirmation: "perhaps", requires: {} },
      "confirmation",
    ],
    [
      "requires not a map",
      { id: "core", version: "1.0.0", summary: "s", confirmation: "safe", requires: [] },
      "requires",
    ],
    [
      "requires value not a string",
      { id: "core", version: "1.0.0", summary: "s", confirmation: "safe", requires: { dep: 5 } },
      "requires.dep",
    ],
  ])("rejects %s naming %s", (_label, data, expectedField) => {
    const r = parseBundleManifest(data);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(`${r.problem.field} ${r.problem.message}`).toContain(expectedField);
    }
  });
});

describe("parseBundleManifest — invalid id/version/range reuse the model rules (AC#4)", () => {
  it("rejects an invalid bundle id (reserved verb)", () => {
    const r = parseBundleManifest({
      id: "new",
      version: "1.0.0",
      summary: "s",
      confirmation: "safe",
      requires: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem.message).toContain("reserved");
    }
  });

  it("rejects an invalid version", () => {
    const r = parseBundleManifest({
      id: "core",
      version: "1.2",
      summary: "s",
      confirmation: "safe",
      requires: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem.field).toBe("version");
    }
  });

  it("rejects an invalid version range in requires", () => {
    const r = parseBundleManifest({
      id: "core",
      version: "1.0.0",
      summary: "s",
      confirmation: "safe",
      requires: { dep: "garbage" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem.field).toBe("requires.dep");
    }
  });

  it("rejects an invalid bundle id used as a requires key", () => {
    const r = parseBundleManifest({
      id: "core",
      version: "1.0.0",
      summary: "s",
      confirmation: "safe",
      requires: { "Bad Id": "^1.0.0" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem.field).toBe("requires.Bad Id");
    }
  });
});
