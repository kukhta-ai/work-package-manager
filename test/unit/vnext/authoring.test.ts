import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import type { TaskRecord } from "../../../src/core/ports/backlog.js";
import {
  changeGroup,
  draftLabel,
  editAuthoringSourceText,
  nextVersion,
  operationProblems,
} from "../../../src/vnext/core/authoring.js";
import { emptyPackage } from "../../../src/vnext/core/model.js";

const task: TaskRecord = {
  id: "operation-1",
  title: "Brief",
  status: "To Do",
  ordinal: 1000,
  description: "Produce a readable brief",
  acceptanceCriteria: [{ text: "Brief exists", checked: false }],
  definitionOfDone: [],
  dependencies: [],
  labels: ["wpm-operation:brief"],
  extraMetadata: [],
  extraSections: [],
};
describe("authoring decisions", () => {
  it("distinguishes authored readiness from recipient execution", () => {
    expect(draftLabel).toBe("wpm-authoring:draft");
    expect(operationProblems(task, "brief", true)).toEqual([]);
    expect(operationProblems({ ...task, description: "   " }, "brief", true)).toEqual([
      "missing instructions",
    ]);
    expect(
      operationProblems(
        {
          ...task,
          acceptanceCriteria: [
            { text: "Valid", checked: false },
            { text: " ", checked: false },
          ],
        },
        "brief",
      ),
    ).toEqual(["missing acceptance criteria"]);
    expect(
      operationProblems(
        { ...task, labels: [], title: " ", description: null, acceptanceCriteria: [] },
        "brief",
        true,
      ),
    ).toEqual([
      "missing stable operation identity",
      "missing title",
      "missing instructions",
      "missing acceptance criteria",
    ]);
    expect(operationProblems({ ...task, description: null }, "brief")).toEqual([]);
    expect(
      operationProblems({ ...task, acceptanceCriteria: [{ text: " ", checked: true }] }, "brief"),
    ).toEqual(["missing acceptance criteria"]);
  });
  it("changes direct group membership without inventing prerequisites", () => {
    const source = {
      ...emptyPackage("brief"),
      work: [{ operation: "brief", task: "operation-1" }],
      groups: {
        all: { operations: [], groups: [] },
        review: { operations: ["brief"], groups: [] },
      },
    };
    expect(changeGroup(source, "all", ["brief", "brief"], ["review"], "add").groups.all).toEqual({
      operations: ["brief"],
      groups: ["review"],
    });
    expect(changeGroup(source, "review", ["brief"], [], "remove").groups.review).toEqual({
      operations: [],
      groups: [],
    });
    expect(() => changeGroup(source, "absent", [], [], "add")).toThrow("unknown group");
    expect(() => changeGroup(source, "all", ["absent"], [], "add")).toThrow("unknown operation");
    expect(() => changeGroup(source, "all", [], ["absent"], "remove")).toThrow("unknown group");
    expect(() => changeGroup(source, "all", [], ["all"], "add")).toThrow();
    expect(() => changeGroup(source, "all", ["absent"], [], "remove")).toThrow("unknown operation");
    const multiple = {
      ...source,
      work: [...source.work, { operation: "other", task: "operation-2" }],
      groups: { ...source.groups, review: { operations: ["brief", "other"], groups: [] } },
    };
    expect(changeGroup(multiple, "all", ["brief"], [], "add").groups.all?.operations).toEqual([
      "brief",
    ]);
    expect(
      changeGroup(multiple, "review", ["brief"], [], "remove").groups.review?.operations,
    ).toEqual(["other"]);
  });
  it.each([
    ["major", "1.0.0"],
    ["minor", "0.2.0"],
    ["patch", "0.1.1"],
    ["premajor", "1.0.0-0"],
    ["preminor", "0.2.0-0"],
    ["prepatch", "0.1.1-0"],
    ["prerelease", "0.1.1-0"],
    ["2.3.4", "2.3.4"],
    ["1.2.3+build", "1.2.3+build"],
    ["1.2.3-beta+foo", "1.2.3-beta+foo"],
    ["1.2.3+foo.bar", "1.2.3+foo.bar"],
  ])("resolves %s", (value, expected) => expect(nextVersion("0.1.0", value)).toBe(expected));
  it("validates exact versions and prerelease identifiers", () => {
    expect(nextVersion("1.0.0", "prerelease", "beta")).toBe("1.0.1-beta.0");
    for (const value of ["v1.2.3", "1.2", "nope", "1.02.3"])
      expect(() => nextVersion("1.0.0", value)).toThrow(
        `invalid semantic version or increment: ${value}`,
      );
    const message = "--preid requires a prerelease increment and valid identifier";
    expect(() => nextVersion("1.0.0", "patch", "beta")).toThrow(message);
    expect(() => nextVersion("1.0.0", "1.2.3", "beta")).toThrow(message);
    for (const preid of ["bad id", "!beta", "beta!", "beta..rc"])
      expect(() => nextVersion("1.0.0", "prerelease", preid)).toThrow(message);
    expect(nextVersion("1.0.0", "prerelease", "beta.preview")).toBe("1.0.1-beta.preview.0");
  });
  it("increments arbitrary valid patch versions exactly once", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (n) => {
        expect(nextVersion(`1.2.${n}`, "patch")).toBe(`1.2.${n + 1}`);
      }),
    );
  });
  it("retains comments on the surviving operation and direct group members", () => {
    const before = {
      ...emptyPackage("comments"),
      work: [
        { operation: "first", task: "operation-1" },
        { operation: "second", task: "operation-2" },
      ],
      groups: { delivery: { operations: ["first", "second"], groups: [] } },
    };
    const text = stringify(before)
      .replace("operation: first", "operation: first # FIRST operation")
      .replace("operation: second", "operation: second # SECOND operation")
      .replace("- first\n", "- first # FIRST member\n")
      .replace("- second\n", "- second # SECOND member\n");
    const after = {
      ...before,
      work: before.work.slice(1),
      groups: { delivery: { operations: ["second"], groups: [] } },
    };
    const edited = editAuthoringSourceText(text, before, after);
    expect(parse(edited)).toEqual(after);
    expect(edited).toContain("operation: second # SECOND operation");
    expect(edited).toContain("second # SECOND member");
    expect(edited).not.toContain("FIRST");
  });
  it("keeps group-reference comments and handles deleted definitions", () => {
    const before = {
      ...emptyPackage("groups"),
      groups: {
        delivery: { operations: [], groups: ["first", "second"] },
        first: { operations: [], groups: [] },
        second: { operations: [], groups: [] },
      },
    };
    const text = stringify(before)
      .replace("- first\n", "- first # FIRST group\n")
      .replace("- second\n", "- second # SECOND group\n");
    const after = {
      ...before,
      groups: { ...before.groups, delivery: { operations: [], groups: ["second"] } },
    };
    const edited = editAuthoringSourceText(text, before, after);
    expect(parse(edited)).toEqual(after);
    expect(edited).toContain("second # SECOND group");
    expect(edited).not.toContain("FIRST group");
    expect(parse(editAuthoringSourceText(text, before, { ...before, groups: {} }))).toEqual({
      ...before,
      groups: {},
    });
    expect(() => editAuthoringSourceText("[unclosed", before, after)).toThrow(
      "malformed authoring YAML",
    );
  });
  it("rejects coupled alias changes instead of silently changing unrelated source", () => {
    const text = stringify({
      ...emptyPackage("comments"),
      work: [
        { operation: "first", task: "operation-1" },
        { operation: "second", task: "operation-2" },
      ],
      workerSetup: {
        default: "first",
        setups: { first: { source: "worker-setup/first", backend: "plain" } },
      },
    })
      .replace("operation: first", "operation: &setup first")
      .replace("default: first", "default: *setup");
    const before = parse(text) as ReturnType<typeof emptyPackage>;
    expect(() =>
      editAuthoringSourceText(text, before, { ...before, work: before.work.slice(1) }),
    ).toThrow("alias");
    expect(editAuthoringSourceText(text, before, before)).toBe(text);
  });
  it("roundtrips removals, replacement and reordering without changing declared meaning", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 10 })),
        fc.uniqueArray(fc.integer({ min: 0, max: 10 })),
        (a, b) => {
          const operations = (values: number[]) =>
            values.map((n) => ({ operation: `op-${n}`, task: `operation-${n + 1}` }));
          const before = { ...emptyPackage("property"), work: operations(a) };
          const after = { ...before, work: operations(b) };
          expect(parse(editAuthoringSourceText(stringify(before), before, after))).toEqual(after);
        },
      ),
      { numRuns: 80 },
    );
  });
  it("rejects alias rebinding and deletes prototype-named group definitions safely", () => {
    const source = {
      ...emptyPackage("first"),
      workerSetup: {
        default: "first",
        setups: { first: { source: "worker-setup/first", backend: "plain" as const } },
      },
    };
    const text = stringify(source)
      .replace("name: first", "name: &shared first")
      .replace("default: first", "default: *shared");
    expect(() => editAuthoringSourceText(text, source, { ...source, name: "renamed" })).toThrow(
      "authored YAML aliases conflict",
    );
    const before = {
      ...emptyPackage("prototype"),
      groups: { constructor: { operations: [], groups: [] } },
    };
    const after = { ...before, groups: {} };
    expect(parse(editAuthoringSourceText(stringify(before), before, after))).toEqual(after);
  });
  it("retains comments when updating, reordering and replacing stable identities", () => {
    const before = {
      ...emptyPackage("identity"),
      work: [
        { operation: "first", task: "operation-1" },
        { operation: "second", task: "operation-2" },
      ],
      groups: { delivery: { operations: ["first", "second"], groups: [] } },
    };
    const text = stringify(before)
      .replace("operation: first", "operation: first # FIRST operation")
      .replace("operation: second", "operation: second # SECOND operation")
      .replace("- first\n", "- first # FIRST member\n")
      .replace("- second\n", "- second # SECOND member\n");
    const after = {
      ...before,
      work: [
        { ...before.work[1], operation: "second", task: "operation-2", setup: null },
        { operation: "first", task: "operation-1" },
      ],
    };
    const edited = editAuthoringSourceText(text, before, after);
    expect(parse(edited)).toEqual(after);
    expect(edited).toContain("operation: second # SECOND operation");
    expect(edited).toContain("operation: first # FIRST operation");
    const replacement = { ...before, groups: { delivery: { operations: ["second"], groups: [] } } };
    expect(editAuthoringSourceText(text, before, replacement)).toContain("second # SECOND member");
  });
  it("preserves unchanged sequence aliases and rejects direct alias selection edits", () => {
    const before = {
      ...emptyPackage("aliases"),
      work: [{ operation: "first", task: "operation-1" }],
      groups: {
        one: { operations: ["first"], groups: [] },
        two: { operations: ["first"], groups: [] },
      },
    };
    const text = stringify(before)
      .replace("operations:\n      - first", "operations: &members\n      - first")
      .replace("two:\n    operations:\n      - first", "two:\n    operations: *members");
    const after = { ...before, version: "0.2.0" };
    expect(parse(editAuthoringSourceText(text, before, after))).toEqual(after);
    expect(() =>
      editAuthoringSourceText(text, before, {
        ...before,
        groups: { ...before.groups, two: { operations: [], groups: [] } },
      }),
    ).toThrow("resolve source sequence alias");
  });
  it("leaves byte-identical authored formatting on semantic no-op requests", () => {
    const before = emptyPackage("unchanged");
    const text = stringify(before).replace("name: unchanged", "name: unchanged  ");
    const after = { ...before, groups: { ...before.groups } };
    expect(editAuthoringSourceText(text, before, after)).toBe(text);
  });
});
