import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { editSourceText } from "../../../src/vnext/core/source-text.js";

describe("vNext source editing", () => {
  it("preserves unchanged authored nodes and comments while updating only changed values", () => {
    const text =
      "# Package context\nname: brief # selected name\nwork:\n  # Existing operation context\n  - operation: brief\n    task: operation-1 # native identity\ngroups: {}\n";
    const before: unknown = parse(text);
    const after = {
      name: "brief",
      work: [
        { operation: "brief", task: "operation-1" },
        { operation: "review", task: "operation-2" },
      ],
      groups: { review: { operations: ["review"], groups: [] } },
    };
    const edited = editSourceText(text, before, after);
    expect(parse(edited) as unknown).toEqual(after);
    expect(edited).toContain("# Package context");
    expect(edited).toContain("# selected name");
    expect(edited).toContain("# Existing operation context");
    expect(edited).toContain("# native identity");
    expect(editSourceText(text, before, before)).toBe(text);
  });
  it("deletes removed map/sequence entries and patches existing collection values", () => {
    const before = { retain: { value: 1, remove: true }, items: [{ id: 1 }, { id: 2 }, { id: 3 }] };
    const after = { retain: { value: 2 }, items: [{ id: 4 }] };
    expect(parse(editSourceText(stringify(before), before, after)) as unknown).toEqual(after);
    expect(() => editSourceText("[unclosed", {}, {})).toThrow("malformed source YAML");
  });
  it("roundtrips arbitrary JSON source transitions without changing their meaning", () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.jsonValue(), (before, after) => {
        expect(parse(editSourceText(stringify(before), before, after)) as unknown).toEqual(after);
      }),
      { numRuns: 120 },
    );
  });
});
