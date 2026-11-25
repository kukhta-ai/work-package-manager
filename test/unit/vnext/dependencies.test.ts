import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type PackageCatalog,
  type PackageGraph,
  type PackageRecord,
  resolvePackageGraph,
  runtimeGraph,
  validateDependencies,
} from "../../../src/vnext/core/dependencies.js";
import { emptyPackage, parsePackage, stableJson } from "../../../src/vnext/core/model.js";

function present<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing fixture value");
  return value;
}
const dependency = (range = "*") => ({ source: "workspace", range });
function record(
  name: string,
  version = "1.0.0",
  dependencies: PackageRecord["dependencies"] = {},
): PackageRecord {
  return {
    id: `${name}-${version}`,
    locator: `${name}/${version}`,
    name,
    version,
    digest: "content",
    dependencies,
  };
}
function catalog(records: PackageRecord[]): PackageCatalog {
  return {
    workspace: records,
    archive: () => undefined,
    load: (c) => {
      const found = records.find((r) => r.locator === c.locator);
      if (!found) throw new Error("invalid selected source");
      return found;
    },
  };
}
function root(graph: PackageGraph) {
  return present(graph.nodes[graph.root]);
}
describe("local package dependency resolution", () => {
  it("pins exact canonical versions including build metadata", () => {
    const plain = record("lib");
    const built = record("lib", "1.0.0+build");
    const dotted = record("lib", "1.0.0+build.other");
    for (const selected of [plain, built, dotted]) {
      const app = record("app", "1.0.0", { lib: dependency(selected.version) });
      expect(
        root(resolvePackageGraph(app, catalog([app, plain, built, dotted]))).edges[0]?.target,
      ).toBe(selected.id);
    }
    const app = record("app", "1.0.0", { lib: dependency("1.0.0+missing") });
    expect(() => resolvePackageGraph(app, catalog([app, plain, built, dotted]))).toThrow(
      "missing lib@1.0.0+missing",
    );
  });

  it("keeps error inventories readable and never turns a required edge into optional from stale state", () => {
    const app = record("app", "1.0.0", { lib: dependency("^1") });
    expect(() =>
      resolvePackageGraph(app, catalog([app, record("lib", "2.0.0"), record("lib", "3.0.0")])),
    ).toThrow("available: 2.0.0, 3.0.0");
    const lib = record("lib");
    const previous = resolvePackageGraph(app, catalog([app, lib]));
    const edge = root(previous).edges[0];
    if (!edge) throw new Error("missing fixture edge");
    edge.omitted = "stale invalid omission";
    delete edge.target;
    expect(root(resolvePackageGraph(app, catalog([app, lib]), previous)).edges[0]?.target).toBe(
      lib.id,
    );
  });

  it("retains nested pins and preserves decisions across the root version change", () => {
    const app = record("app", "1.0.0", { child: dependency() });
    const child = record("child", "1.0.0", { lib: dependency("^1") });
    const one = record("lib");
    const next = record("lib", "1.2.0");
    const lock = resolvePackageGraph(app, catalog([app, child, one]));
    const changed = { ...app, id: "app-new", version: "2.0.0" };
    expect(
      resolvePackageGraph(changed, catalog([changed, child, one, next]), lock).nodes[child.id]
        ?.edges[0]?.target,
    ).toBe(one.id);
  });
  it("does not mistake another source or another version at a pinned path for the pin", () => {
    const app = record("app", "1.0.0", { lib: dependency("^1") });
    const one = record("lib");
    const next = record("lib", "1.2.0");
    const lock = resolvePackageGraph(app, catalog([app, one]));
    const changed = { ...record("lib", "1.1.0"), locator: one.locator };
    expect(
      root(resolvePackageGraph(app, catalog([app, changed, next]), lock)).edges[0]?.target,
    ).toBe(next.id);
    const copied = { ...one, locator: "copied-source" };
    expect(
      root(resolvePackageGraph(app, catalog([app, copied, next]), lock)).edges[0]?.target,
    ).toBe(next.id);
    const dangling: PackageGraph = JSON.parse(JSON.stringify(lock)) as PackageGraph;
    present(root(dangling).edges[0]).target = "unavailable-old-instance";
    expect(root(resolvePackageGraph(app, catalog([app, next]), dangling)).edges[0]?.target).toBe(
      next.id,
    );
  });
  it("reconsiders omitted edges after changes to name, kind, source or range", () => {
    const lib = record("lib");
    const next = record("lib", "1.2.0");
    const omitted = { ...record("app"), optionalDependencies: { lib: dependency() } };
    const lock = resolvePackageGraph(omitted, catalog([omitted]));
    const renamed = { ...record("app"), optionalDependencies: { other: dependency() } };
    expect(
      root(resolvePackageGraph(renamed, catalog([renamed, record("other")]), lock)).edges[0]
        ?.target,
    ).toBe("other-1.0.0");
    const ranged = { ...omitted, optionalDependencies: { lib: dependency("^1") } };
    expect(root(resolvePackageGraph(ranged, catalog([ranged, lib]), lock)).edges[0]?.target).toBe(
      lib.id,
    );
    const fromFile = {
      ...omitted,
      optionalDependencies: { lib: { source: "file:new.tgz", range: "*" } },
    };
    const files = catalog([fromFile]);
    files.archive = () => lib;
    files.load = (c) => (c.name === "lib" ? lib : fromFile);
    expect(root(resolvePackageGraph(fromFile, files, lock)).edges[0]?.target).toBe(lib.id);
    const available = resolvePackageGraph(omitted, catalog([omitted, lib]));
    const required = record("app", "1.0.0", { lib: dependency() });
    expect(
      root(resolvePackageGraph(required, catalog([required, lib, next]), available)).edges[0]
        ?.target,
    ).toBe(next.id);
  });

  it("reports exact declaration diagnostics and accepts nonempty archive paths", () => {
    const cases: [Parameters<typeof validateDependencies>[0], string][] = [
      [{ dependencies: { "lib!": dependency() } }, "invalid or repeated dependency: lib!"],
      [
        { dependencies: { lib: dependency() }, devDependencies: { lib: dependency() } },
        "invalid or repeated dependency: lib",
      ],
      [{ dependencies: { lib: dependency(" ") } }, "invalid dependency range: lib"],
      [{ dependencies: { lib: dependency("invalid") } }, "invalid dependency range: lib"],
      [
        { dependencies: { lib: { source: "git:test", range: "*" } } },
        "unsupported dependency source: git:test",
      ],
      [{ dependencies: { lib: { source: "file:", range: "*" } } }, "empty archive source"],
    ];
    for (const [value, message] of cases)
      expect(() => validateDependencies(value)).toThrow(message);
    expect(() =>
      validateDependencies({ dependencies: { lib: { source: "file:lib.tgz", range: " * " } } }),
    ).not.toThrow();
    for (const declarations of [
      { lib: { source: "workspace", range: "*", extra: true } },
      { lib: { source: "workspace" } },
      { lib: { range: "*" } },
      { lib: { source: "workspace", range: 7 } },
      { lib: [] },
      { lib: { source: 1, range: "*" } },
      [],
    ])
      expect(() =>
        parsePackage({ ...emptyPackage("source"), schemaVersion: 2, dependencies: declarations }),
      ).toThrow("invalid package.yml:");
    expect(() =>
      parsePackage({
        ...emptyPackage("source"),
        schemaVersion: 2,
        dependencies: { lib: dependency("bad") },
      }),
    ).toThrow("invalid dependency range");
  });
  it("selects maximum versions regardless of candidate order and diagnoses wrong names", () => {
    const app = record("app", "1.0.0", { lib: dependency("^1") });
    const one = record("lib", "1.9.0");
    const two = record("lib", "1.10.0");
    expect(root(resolvePackageGraph(app, catalog([app, one, two]))).edges[0]?.target).toBe(two.id);
    const unsuitable = record("lib", "2.0.0");
    expect(() => resolvePackageGraph(app, catalog([app, unsuitable, record("other")]))).toThrow(
      "missing lib@^1; available: 2.0.0",
    );
    const file = { ...app, dependencies: { lib: { source: "file:other.tgz", range: "*" } } };
    const c = catalog([file]);
    c.archive = () => record("other");
    expect(() => resolvePackageGraph(file, c)).toThrow("missing lib@*; available: none");
    const duplicate = { ...two, locator: "second-source" };
    expect(() => resolvePackageGraph(app, catalog([app, two, duplicate]))).toThrow(
      "ambiguous package version: lib",
    );
  });
  it("rejects every selected metadata drift and frozen root mismatch", () => {
    const app = record("app");
    for (const changed of [{ name: "other" }, { version: "2.0.0" }, { locator: "other" }]) {
      const c = catalog([app]);
      c.load = () => ({ ...app, ...changed });
      expect(() => resolvePackageGraph(app, c)).toThrow(
        "package metadata changed during resolution",
      );
    }
    const c = catalog([app]);
    c.frozen = () => ({ schemaVersion: 2, root: "missing", nodes: {} });
    expect(() => resolvePackageGraph(app, c)).toThrow("frozen root differs");
  });
  it("keeps frozen overlaps and rejects inconsistent records for the same identity", () => {
    const app = record("app", "1.0.0", { left: dependency(), right: dependency() });
    const left = record("left");
    const right = record("right");
    const shared = record("shared");
    const c = catalog([app, left, right]);
    const common = { record: shared, edges: [] };
    c.frozen = (candidate) =>
      candidate.name === "left"
        ? {
            schemaVersion: 2,
            root: left.id,
            nodes: { [left.id]: { record: left, edges: [] }, [shared.id]: common },
          }
        : candidate.name === "right"
          ? {
              schemaVersion: 2,
              root: right.id,
              nodes: { [right.id]: { record: right, edges: [] }, [shared.id]: common },
            }
          : undefined;
    expect(Object.keys(resolvePackageGraph(app, c).nodes)).toHaveLength(4);
    const previous = c.frozen;
    c.frozen = (candidate) => {
      const graph = previous?.(candidate);
      if (graph && candidate.name === "right")
        graph.nodes[shared.id] = { record: { ...shared, digest: "different" }, edges: [] };
      return graph;
    };
    expect(() => resolvePackageGraph(app, c)).toThrow(`conflicting frozen instance: ${shared.id}`);
  });
  it("retains sorted edges and optional omission paths in runtime closure", () => {
    const a = {
      ...record("app", "1.0.0", { z: dependency(), a: dependency() }),
      optionalDependencies: { extra: dependency() },
    };
    const extra = record("extra", "1.0.0", { missing: dependency() });
    const graph = resolvePackageGraph(a, catalog([a, extra, record("z"), record("a")]));
    expect(root(graph).edges.map((e) => e.name)).toEqual(["a", "z", "extra"]);
    expect(root(graph).edges[2]?.omitted).toBe(
      "app@1.0.0 -> extra@1.0.0 -> missing missing@*; available: none",
    );
    expect(root(runtimeGraph(graph)).edges[2]?.omitted).toBe(root(graph).edges[2]?.omitted);
    const invalid = { ...graph, nodes: { ...graph.nodes } };
    delete invalid.nodes["z-1.0.0"];
    expect(() => runtimeGraph(invalid)).toThrow("dangling dependency: z-1.0.0");
  });

  it("retains multiple versions, shares identical instances and terminates cycles", () => {
    const a = record("app", "1.0.0", { left: dependency(), right: dependency() });
    const left = record("left", "1.0.0", { shared: dependency("^1.0.0") });
    const right = record("right", "1.0.0", { shared: dependency("^2.0.0"), left: dependency() });
    const one = record("shared", "1.0.0", { app: dependency() });
    const two = record("shared", "2.0.0");
    const graph = resolvePackageGraph(a, catalog([two, right, one, left, a]));
    expect(Object.keys(graph.nodes)).toHaveLength(5);
    expect(graph.nodes[one.id]?.edges[0]?.target).toBe(a.id);
    expect(graph.nodes[right.id]?.edges.map((e) => e.target)).toEqual([left.id, two.id]);
    expect(runtimeGraph(graph)).toEqual({
      ...graph,
      nodes: Object.fromEntries(
        Object.entries(graph.nodes).map(([id, n]) => [
          id,
          { ...n, record: { ...n.record, devDependencies: {} } },
        ]),
      ),
    });
  });
  it("preserves matching locks and upgrades only explicitly", () => {
    const a = record("app", "1.0.0", { shared: dependency("^1.0.0") });
    const one = record("shared");
    const next = record("shared", "1.2.0");
    const lock: PackageGraph = JSON.parse(
      stableJson(resolvePackageGraph(a, catalog([a, one]))),
    ) as PackageGraph;
    expect(root(resolvePackageGraph(a, catalog([a, next, one]), lock)).edges[0]?.target).toBe(
      one.id,
    );
    expect(root(resolvePackageGraph(a, catalog([a, next, one]), lock, true)).edges[0]?.target).toBe(
      next.id,
    );
    const changed = { ...a, dependencies: { shared: dependency("^2") } };
    expect(() => resolvePackageGraph(changed, catalog([changed, one]), lock)).toThrow(
      "app@1.0.0 -> missing shared@^2",
    );
  });
  it("explains required failures and prunes whole unavailable optional branches", () => {
    const a = { ...record("app"), optionalDependencies: { extra: dependency() } };
    const extra = record("extra", "1.0.0", { missing: dependency() });
    const lock = resolvePackageGraph(a, catalog([a, extra]));
    expect(Object.keys(lock.nodes)).toEqual([a.id]);
    expect(root(lock).edges[0]?.omitted).toContain("missing@*");
    const missing = record("missing");
    expect(resolvePackageGraph(a, catalog([a, extra, missing]), lock)).toEqual(lock);
    expect(
      Object.keys(resolvePackageGraph(a, catalog([a, extra, missing]), lock, true).nodes),
    ).toHaveLength(3);
    const required = { ...a, dependencies: { extra: dependency() }, optionalDependencies: {} };
    expect(() => resolvePackageGraph(required, catalog([required, extra]))).toThrow(
      "app@1.0.0 -> extra@1.0.0 -> missing missing@*",
    );
  });
  it("does not hide invalid data inside optional dependencies", () => {
    const a = { ...record("app"), optionalDependencies: { bad: dependency() } };
    const bad = record("bad");
    const c = catalog([a, bad]);
    c.load = (candidate) => {
      if (candidate.name === "bad") throw new Error("digest mismatch");
      return a;
    };
    expect(() => resolvePackageGraph(a, c)).toThrow(/^digest mismatch$/);
  });
  it("omits root dev content from runtime and never follows transitive dev", () => {
    const a = {
      ...record("app", "1.0.0", { common: dependency() }),
      devDependencies: { tool: dependency() },
    };
    const common = { ...record("common"), devDependencies: { unavailable: dependency() } };
    const tool = record("tool");
    const graph = resolvePackageGraph(a, catalog([a, common, tool]));
    expect(Object.keys(graph.nodes)).toHaveLength(3);
    expect(Object.keys(runtimeGraph(graph).nodes).sort()).toEqual([a.id, common.id].sort());
    expect(root(runtimeGraph(graph)).edges.map((e) => e.name)).toEqual(["common"]);
  });
  it("keeps a shared required node after optional branch rollback", () => {
    const a = {
      ...record("app", "1.0.0", { common: dependency() }),
      optionalDependencies: { extra: dependency() },
    };
    const common = record("common");
    const extra = record("extra", "1.0.0", { common: dependency(), missing: dependency() });
    const graph = resolvePackageGraph(a, catalog([a, common, extra]));
    expect(Object.keys(graph.nodes).sort()).toEqual([a.id, common.id].sort());
  });
  it("uses exact file candidates and excludes prereleases unless explicitly requested", () => {
    const a = record("app", "1.0.0", { lib: { source: "file:lib.tgz", range: "^1" } });
    const lib = record("lib");
    const c = catalog([a]);
    c.archive = () => lib;
    c.load = (v) => (v.name === "lib" ? lib : a);
    expect(root(resolvePackageGraph(a, c)).edges[0]?.target).toBe(lib.id);
    c.archive = () => undefined;
    expect(() => resolvePackageGraph(a, c)).toThrow("missing lib@^1");
    const b = record("app", "1.0.0", { lib: dependency("*") });
    const beta = record("lib", "2.0.0-beta.0");
    expect(() => resolvePackageGraph(b, catalog([b, beta]))).toThrow("missing lib@*");
    b.dependencies = { lib: dependency("^2.0.0-beta.0") };
    expect(root(resolvePackageGraph(b, catalog([b, beta]))).edges[0]?.target).toBe(beta.id);
  });
  it("imports frozen graphs without resolving their declarations again", () => {
    const a = record("app", "1.0.0", { lib: { source: "file:lib.tgz", range: "*" } });
    const lib = record("lib");
    const frozen = resolvePackageGraph(lib, catalog([lib]));
    const c = catalog([a]);
    c.archive = () => lib;
    c.load = (v) => (v.name === "lib" ? lib : a);
    c.frozen = (v) => (v.name === "lib" ? frozen : undefined);
    expect(resolvePackageGraph(a, c).nodes[lib.id]).toEqual(root(frozen));
  });
  it("is deterministic across candidate registration order and finite for rings", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 15 }), (count) => {
        const records = Array.from({ length: count }, (_, i) =>
          record(`p-${i}`, "1.0.0", { [`p-${(i + 1) % count}`]: dependency() }),
        );
        const first = present(records[0]);
        const graph = resolvePackageGraph(first, catalog(records));
        expect(graph).toEqual(resolvePackageGraph(first, catalog([...records].reverse())));
        expect(Object.keys(graph.nodes)).toHaveLength(count);
      }),
    );
  });
  it("rejects malformed declarations and keeps v1 source compatibility", () => {
    const base = emptyPackage("source");
    expect(parsePackage(base)).toEqual(base);
    expect(() => parsePackage({ ...base, dependencies: { lib: dependency() } })).toThrow(
      "schemaVersion 2",
    );
    expect(
      parsePackage({ ...base, schemaVersion: 2, dependencies: { lib: dependency("^1") } })
        .schemaVersion,
    ).toBe(2);
    for (const d of [
      { dependencies: { lib: dependency("bad range") } },
      { dependencies: { lib: { source: "https://example.test", range: "*" } } },
      { dependencies: { lib: dependency() }, devDependencies: { lib: dependency() } },
      { dependencies: { Bad: dependency() } },
      { dependencies: { lib: { source: "file:", range: "*" } } },
    ])
      expect(() => validateDependencies(d)).toThrow();
  });
});
