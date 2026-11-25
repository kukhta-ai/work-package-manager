import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { TaskRecord } from "../../../src/core/ports/backlog.js";
import {
  changeGroup,
  draftLabel,
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
});
