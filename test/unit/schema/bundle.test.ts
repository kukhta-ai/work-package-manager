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

describe("parseBundleManifest — the payload reference registry (L files + M templates + N scripts + O skills)", () => {
  it("an ABSENT payload key ⇒ every category (files, templates, scripts, skills) is empty (old-bundle.yml compatibility)", () => {
    // The well-formed fixture omits `payload` entirely (as every pre-L bundle.yml does).
    const r = parseBundleManifest(wellFormed());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.payload.files).toEqual([]);
      expect(r.value.payload.templates).toEqual([]);
      expect(r.value.payload.scripts).toEqual([]);
      expect(r.value.payload.skills).toEqual([]);
    }
  });

  it("a populated payload.files parses to the list, in order (templates absent ⇒ empty)", () => {
    const r = parseBundleManifest({
      ...wellFormed(),
      payload: { files: ["agents.md", "sub/x.json"] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.payload.files).toEqual(["agents.md", "sub/x.json"]);
      expect(r.value.payload.templates).toEqual([]); // partial payload: the missing category is empty
    }
  });

  it("a populated payload.templates parses to the list, in order (files absent ⇒ empty)", () => {
    const r = parseBundleManifest({
      ...wellFormed(),
      payload: { templates: ["agents.md.tmpl", "sub/x.json.tmpl"] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.payload.templates).toEqual(["agents.md.tmpl", "sub/x.json.tmpl"]);
      expect(r.value.payload.files).toEqual([]); // partial payload: the missing category is empty
    }
  });

  it("a populated payload.scripts parses to the list, in order (files/templates absent ⇒ empty)", () => {
    const r = parseBundleManifest({
      ...wellFormed(),
      payload: { scripts: ["probe.sh", "sub/smoke.sh"] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.payload.scripts).toEqual(["probe.sh", "sub/smoke.sh"]);
      expect(r.value.payload.files).toEqual([]); // partial payload: the missing categories are empty
      expect(r.value.payload.templates).toEqual([]);
    }
  });

  it("a populated payload.skills parses to {name, path} refs, in order (other categories absent ⇒ empty)", () => {
    const r = parseBundleManifest({
      ...wellFormed(),
      payload: {
        skills: [
          { name: "one", path: "payload/agent-skills/one/SKILL.md" },
          { name: "two", path: "custom/two.md" },
        ],
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.payload.skills).toEqual([
        { name: "one", path: "payload/agent-skills/one/SKILL.md" },
        { name: "two", path: "custom/two.md" },
      ]);
      expect(r.value.payload.files).toEqual([]); // partial payload: the missing categories are empty
      expect(r.value.payload.templates).toEqual([]);
      expect(r.value.payload.scripts).toEqual([]);
    }
  });

  it("a payload with files+templates+scripts only ⇒ payload.skills is [] (partial-payload compatibility)", () => {
    const r = parseBundleManifest({
      ...wellFormed(),
      payload: { files: ["a.md"], templates: ["t.tmpl"], scripts: ["p.sh"] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.payload.skills).toEqual([]);
    }
  });

  it("all three categories populated parse independently", () => {
    const r = parseBundleManifest({
      ...wellFormed(),
      payload: { files: ["a.md"], templates: ["t.md.tmpl"], scripts: ["probe.sh"] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.payload.files).toEqual(["a.md"]);
      expect(r.value.payload.templates).toEqual(["t.md.tmpl"]);
      expect(r.value.payload.scripts).toEqual(["probe.sh"]);
    }
  });

  it("an empty payload.files / payload.templates / payload.scripts / payload.skills parses to []", () => {
    const r = parseBundleManifest({
      ...wellFormed(),
      payload: { files: [], templates: [], scripts: [], skills: [] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.payload.files).toEqual([]);
      expect(r.value.payload.templates).toEqual([]);
      expect(r.value.payload.scripts).toEqual([]);
      expect(r.value.payload.skills).toEqual([]);
    }
  });

  it("a payload mapping with no category keys ⇒ every category empty", () => {
    const r = parseBundleManifest({ ...wellFormed(), payload: {} });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.payload.files).toEqual([]);
      expect(r.value.payload.templates).toEqual([]);
      expect(r.value.payload.scripts).toEqual([]);
      expect(r.value.payload.skills).toEqual([]);
    }
  });

  it("round-trips a populated payload: parse(serialize(parse(x))) preserves files, templates, scripts AND skills", () => {
    const first = parseBundleManifest({
      ...wellFormed(),
      payload: {
        files: ["a.md", "b.json"],
        templates: ["t1.tmpl", "t2.tmpl"],
        scripts: ["probe.sh", "smoke.sh"],
        skills: [
          { name: "one", path: "payload/agent-skills/one/SKILL.md" },
          { name: "two", path: "custom/two.md" },
        ],
      },
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      const second = parseBundleManifest(serializeBundleManifest(first.value));
      expect(second.ok).toBe(true);
      if (second.ok) {
        expect(second.value.payload.files).toEqual(["a.md", "b.json"]);
        expect(second.value.payload.templates).toEqual(["t1.tmpl", "t2.tmpl"]);
        expect(second.value.payload.scripts).toEqual(["probe.sh", "smoke.sh"]);
        expect(second.value.payload.skills).toEqual([
          { name: "one", path: "payload/agent-skills/one/SKILL.md" },
          { name: "two", path: "custom/two.md" },
        ]);
      }
    }
  });

  it("serialize always emits payload.files, payload.templates, payload.scripts AND payload.skills (empty ⇒ [])", () => {
    const r = parseBundleManifest(wellFormed());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(serializeBundleManifest(r.value).payload).toEqual({
        files: [],
        templates: [],
        scripts: [],
        skills: [],
      });
    }
  });

  it.each([
    ["payload not a mapping", { ...wellFormed(), payload: "nope" }, "payload"],
    ["payload.files not a list", { ...wellFormed(), payload: { files: "a.md" } }, "payload.files"],
    [
      "payload.files entry not a string",
      { ...wellFormed(), payload: { files: ["ok", 5] } },
      "payload.files",
    ],
    [
      "payload.templates not a list",
      { ...wellFormed(), payload: { templates: "t.tmpl" } },
      "payload.templates",
    ],
    [
      "payload.templates entry not a string",
      { ...wellFormed(), payload: { templates: ["ok", 5] } },
      "payload.templates",
    ],
    [
      "payload.scripts not a list",
      { ...wellFormed(), payload: { scripts: "probe.sh" } },
      "payload.scripts",
    ],
    [
      "payload.scripts entry not a string",
      { ...wellFormed(), payload: { scripts: ["ok", 5] } },
      "payload.scripts",
    ],
    [
      "payload.skills not a list",
      { ...wellFormed(), payload: { skills: "nope" } },
      "payload.skills",
    ],
    [
      "payload.skills entry not a mapping",
      { ...wellFormed(), payload: { skills: ["just-a-string"] } },
      "payload.skills",
    ],
    [
      "payload.skills entry missing name",
      { ...wellFormed(), payload: { skills: [{ path: "p/SKILL.md" }] } },
      "payload.skills",
    ],
    [
      "payload.skills entry missing path",
      { ...wellFormed(), payload: { skills: [{ name: "x" }] } },
      "payload.skills",
    ],
    [
      "payload.skills entry name not a string",
      { ...wellFormed(), payload: { skills: [{ name: 5, path: "p" }] } },
      "payload.skills",
    ],
  ])("rejects %s naming %s", (_label, data, expectedField) => {
    const r = parseBundleManifest(data);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(`${r.problem.field} ${r.problem.message}`).toContain(expectedField);
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
