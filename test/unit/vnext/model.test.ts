import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  assertSourcePath,
  effectiveSetup,
  emptyPackage,
  parsePackage,
  removeSetups,
  selectOperations,
  stableJson,
} from "../../../src/vnext/core/model.js";

function fixture() {
  const source = emptyPackage("demo");
  source.workerSetup = {
    default: "research",
    setups: {
      research: { source: "worker-setup/research", backend: "plain" },
      review: { source: "worker-setup/review", backend: "plain" },
    },
  };
  source.work = [
    { operation: "brief", task: "operation-1" },
    { operation: "review", task: "operation-2", setup: "review" },
    { operation: "collect", task: "operation-3", setup: null },
  ];
  source.groups = {
    first: { operations: ["brief"], groups: [] },
    all: { operations: ["review", "collect"], groups: ["first"] },
  };
  return source;
}

describe("vNext pure contract", () => {
  it("keeps explicit null distinct from default inheritance", () => {
    const source = parsePackage(fixture());
    expect(source.work.map((work) => effectiveSetup(source, work))).toEqual([
      "research",
      "review",
      null,
    ]);
    const namedOnly = { ...source, workerSetup: { setups: source.workerSetup.setups } };
    const inherited = source.work[0];
    if (!inherited) throw new Error("fixture lacks inherited operation");
    expect(effectiveSetup(namedOnly, inherited)).toBeNull();
  });
  it("expands selections without adding prerequisites or changing the source", () => {
    const source = fixture();
    const before = stableJson(source);
    expect(selectOperations(source, "all")).toEqual(["brief", "collect", "review"]);
    expect(stableJson(source)).toBe(before);
    source.groups.first?.groups.push("all");
    expect(() => parsePackage(source)).toThrow("cyclic group");
  });
  it("preflights removals including inherited references", () => {
    const source = fixture();
    source.workerSetup.setups.spare = { source: "worker-setup/spare", backend: "plain" };
    const before = stableJson(source);
    expect(() => removeSetups(source, ["spare", "research"])).toThrow("referenced");
    expect(stableJson(source)).toBe(before);
    expect(() => removeSetups(source, ["spare", "missing"])).toThrow("unknown");
    source.work = [];
    const result = removeSetups(source, ["research"]);
    expect(result.workerSetup.default).toBeUndefined();
    expect(result.workerSetup.setups.research).toBeUndefined();
    expect(source.workerSetup.default).toBe("research");
  });
  it.each([
    "../secret",
    "/absolute",
    "C:/secret",
    "payload\\secret",
    "payload/../secret",
    "payload/.agents/x",
    "payload/wpm-repo-release/SKILL.md",
    "payload/CON.txt",
    "payload/nul",
    "payload/ending.",
    "payload/new\nline",
    "payload//empty",
    "payload/.wpm-source/x",
    "payload/.bmad/local/session.json",
    "payload/.quality/evidence.json",
    "payload/nested/.QUALITY/cache.bin",
    ".quality/worker-context",
    "shared/.QuAlItY/worker-context",
    "payload/.wpm-transactions/request/preimage",
    "payload/.wpm-pending-setup.json",
    "payload/.env",
    "payload/.env.local",
    "payload/.npmrc",
    "payload/.Agents/dev/SKILL.md",
    "payload/Node_Modules/secret",
    "payload/.GIT/config",
    "payload/question?.txt",
    "payload/star*.txt",
    "payload/angle<.txt",
    "payload/pipe|.txt",
    'payload/quote".txt',
    "payload/control\t.txt",
  ])("rejects unsafe portable path %s", (path) => {
    expect(() => assertSourcePath(path)).toThrow();
  });
  it.each([
    "payload/quality/evidence.json",
    "payload/.quality-example/evidence.json",
    "payload/.quality.json",
    "shared/.quality-context/WORKER.md",
    "payload/dist/public.txt",
    "payload/coverage/example.json",
  ])("keeps ordinary paths distinct from the private .quality segment: %s", (path) => {
    expect(assertSourcePath(path)).toBe(path);
  });
  it("rejects duplicate IDs, unknown associations, unknown fields and invalid semver", () => {
    const source = fixture();
    expect(() => parsePackage({ ...source, surprise: true })).toThrow("invalid");
    expect(() => parsePackage({ ...source, version: "1.0.0-01" })).toThrow("semver");
    expect(() => parsePackage({ ...source, version: "v1.0.0" })).toThrow("semver");
    expect(parsePackage({ ...source, version: "1.0.0-rc.1+build.1" }).version).toBe(
      "1.0.0-rc.1+build.1",
    );
    expect(() => parsePackage({ ...source, work: [...source.work, source.work[0]] })).toThrow(
      "duplicate",
    );
    expect(() => parsePackage({ ...source, files: ["AGENTS.md"] })).toThrow("payload/");
    expect(() => parsePackage({ ...source, files: ["payload/A.txt", "payload/a.txt"] })).toThrow(
      "collision",
    );
    expect(() => parsePackage({ ...source, files: ["payload/Foo", "payload/foo/file"] })).toThrow(
      "collision",
    );
    expect(() =>
      parsePackage({ ...source, workerSetup: { ...source.workerSetup, default: "missing" } }),
    ).toThrow("unknown default");
  });
  it("roundtrips arbitrary plain source names and rejects generated traversals", () => {
    const name = fc.stringMatching(/^[a-z][a-z0-9]{0,20}$/).map((suffix) => `pkg-${suffix}`);
    fc.assert(
      fc.property(name, (slug) => {
        const source = emptyPackage(slug);
        expect(parsePackage(JSON.parse(stableJson(source)) as unknown)).toEqual(source);
        expect(() => assertSourcePath(`payload/${slug}/../escape`)).toThrow();
      }),
      { numRuns: 150 },
    );
  });
  it("rejects unknown group members, duplicate native tasks and reserved operation filenames", () => {
    const source = fixture();
    expect(() => selectOperations(source, "missing")).toThrow("unknown group");
    expect(() => selectOperations(source, "constructor")).toThrow("unknown group");
    expect(() =>
      parsePackage({ ...source, groups: { invalid: { operations: ["missing"], groups: [] } } }),
    ).toThrow("unknown operation");
    expect(() =>
      parsePackage({ ...source, groups: { invalid: { operations: [], groups: ["missing"] } } }),
    ).toThrow("unknown group");
    expect(() =>
      parsePackage({
        ...source,
        work: [
          { operation: "a", task: "TASK-1" },
          { operation: "b", task: "task-1" },
        ],
      }),
    ).toThrow("multiple operations");
    expect(() => parsePackage({ ...source, work: [{ operation: "con", task: "task-1" }] })).toThrow(
      "invalid name",
    );
    expect(assertSourcePath("payload/.env.example")).toBe("payload/.env.example");
    expect(assertSourcePath("./payload/file.txt")).toBe("payload/file.txt");
  });
  it("canonical serialization ignores object insertion order", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.stringMatching(/^[a-z]{1,8}$/), fc.integer()), (input) => {
        const reordered = Object.fromEntries(Object.entries(input).reverse());
        expect(stableJson(input)).toBe(stableJson(reordered));
      }),
      { numRuns: 100 },
    );
  });
});
