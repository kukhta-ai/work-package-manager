import { describe, expect, it } from "vitest";
import {
  parseTemplateDescriptor,
  serializeTemplateDescriptor,
} from "../../../src/core/services/schema/index.js";

/** A well-formed template.yml descriptor (with a top-level description). */
function wellFormed() {
  return {
    name: "minimal",
    scope: "project",
    description: "A minimal bundle-project root.",
    parameters: [
      { name: "project-name", description: "The project's name." },
      { name: "license", default: "MIT" },
    ],
  };
}

describe("parseTemplateDescriptor — well-formed (AC#1, AC#2)", () => {
  it("extracts name, scope, and declared parameters", () => {
    const r = parseTemplateDescriptor(wellFormed());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("minimal");
      expect(r.value.scope).toBe("project");
      expect(r.value.parameters).toHaveLength(2);
      expect(r.value.parameters[0]?.name).toBe("project-name");
      expect(r.value.parameters[1]?.default).toBe("MIT");
    }
  });

  it("extracts the top-level description when present (doc-10 metadata)", () => {
    const r = parseTemplateDescriptor(wellFormed());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.description).toBe("A minimal bundle-project root.");
    }
  });

  it("leaves description undefined when the descriptor has none (and serialize omits the key)", () => {
    const r = parseTemplateDescriptor({ name: "bare", scope: "bundle" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.description).toBeUndefined();
      const serialized = serializeTemplateDescriptor(r.value);
      expect("description" in serialized).toBe(false);
    }
  });

  it("leaves files/snippets empty — the descriptor is not the on-disk tree (task-17 fills it)", () => {
    const r = parseTemplateDescriptor(wellFormed());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.files).toEqual([]);
      expect(r.value.snippets).toEqual([]);
    }
  });

  it("round-trips the descriptor fields (parse -> serialize -> parse equal on name/scope/params)", () => {
    const first = parseTemplateDescriptor(wellFormed());
    expect(first.ok).toBe(true);
    if (first.ok) {
      const serialized = serializeTemplateDescriptor(first.value);
      // serialize omits files/snippets (descriptor-only).
      expect("files" in serialized).toBe(false);
      expect("snippets" in serialized).toBe(false);
      const second = parseTemplateDescriptor(serialized);
      expect(second.ok).toBe(true);
      if (second.ok) {
        expect(second.value).toEqual(first.value);
      }
    }
  });

  it("accepts a descriptor with no parameters (defaults to none)", () => {
    const r = parseTemplateDescriptor({ name: "bare", scope: "bundle" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.parameters).toEqual([]);
      expect(r.value.scope).toBe("bundle");
    }
  });
});

describe("parseTemplateDescriptor — malformed (AC#3)", () => {
  it.each([
    ["not an object", 7 as unknown, "must be a mapping"],
    ["missing name", { scope: "project" }, "name"],
    ["missing scope", { name: "x" }, "scope"],
    ["bad scope", { name: "x", scope: "global" }, "scope"],
    ["parameters not an array", { name: "x", scope: "project", parameters: {} }, "parameters"],
    [
      "a parameter missing name",
      { name: "x", scope: "project", parameters: [{ description: "d" }] },
      "parameters[0].name",
    ],
    [
      "a parameter is not an object",
      { name: "x", scope: "project", parameters: ["nope"] },
      "parameters[0]",
    ],
  ])("rejects %s naming %s", (_label, data, expectedField) => {
    const r = parseTemplateDescriptor(data);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(`${r.problem.field} ${r.problem.message}`).toContain(expectedField);
    }
  });
});
