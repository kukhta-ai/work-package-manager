import { describe, expect, it } from "vitest";
import {
  type BundleId,
  parseBundleId,
  parseSemVer,
  parseVersionRange,
  type SemVer,
  type VersionRange,
} from "../../../src/core/model/index.js";
import {
  type BundleNode,
  resolve,
  satisfies,
} from "../../../src/core/services/version-constraint.js";

/** Construct a branded SemVer in a test (the only way in is the parser). */
function ver(s: string): SemVer {
  const r = parseSemVer(s);
  if (!r.ok) throw new Error(`bad test version ${s}: ${r.problem.message}`);
  return r.value;
}

/** Construct a branded VersionRange in a test. */
function range(s: string): VersionRange {
  const r = parseVersionRange(s);
  if (!r.ok) throw new Error(`bad test range ${s}: ${r.problem.message}`);
  return r.value;
}

/** Construct a branded BundleId in a test. */
function id(s: string): BundleId {
  const r = parseBundleId(s);
  if (!r.ok) throw new Error(`bad test id ${s}: ${r.problem.message}`);
  return r.value;
}

/** Build a graph node from plain strings. */
function node(name: string, version: string, requires: Record<string, string> = {}): BundleNode {
  const map = new Map<BundleId, VersionRange>();
  for (const [dep, rng] of Object.entries(requires)) {
    map.set(id(dep), range(rng));
  }
  return { id: id(name), version: ver(version), requires: map };
}

describe("satisfies — across all npm-style forms (AC#1)", () => {
  it("caret ^1.2.3", () => {
    expect(satisfies(ver("1.2.3"), range("^1.2.3"))).toBe(true);
    expect(satisfies(ver("1.9.0"), range("^1.2.3"))).toBe(true);
    expect(satisfies(ver("2.0.0"), range("^1.2.3"))).toBe(false);
    expect(satisfies(ver("1.2.2"), range("^1.2.3"))).toBe(false);
  });

  it("caret on 0.x pins the minor (^0.3.0)", () => {
    expect(satisfies(ver("0.3.5"), range("^0.3.0"))).toBe(true);
    expect(satisfies(ver("0.4.0"), range("^0.3.0"))).toBe(false);
  });

  it("tilde ~1.2.0", () => {
    expect(satisfies(ver("1.2.9"), range("~1.2.0"))).toBe(true);
    expect(satisfies(ver("1.3.0"), range("~1.2.0"))).toBe(false);
  });

  it("comparator >=2.0.0 and compound >=2.0.0 <3.0.0", () => {
    expect(satisfies(ver("2.0.0"), range(">=2.0.0"))).toBe(true);
    expect(satisfies(ver("1.9.9"), range(">=2.0.0"))).toBe(false);
    expect(satisfies(ver("2.5.0"), range(">=2.0.0 <3.0.0"))).toBe(true);
    expect(satisfies(ver("3.0.0"), range(">=2.0.0 <3.0.0"))).toBe(false);
  });

  it("exact =1.2.3 and bare 1.2.3", () => {
    expect(satisfies(ver("1.2.3"), range("=1.2.3"))).toBe(true);
    expect(satisfies(ver("1.2.4"), range("=1.2.3"))).toBe(false);
    expect(satisfies(ver("1.2.3"), range("1.2.3"))).toBe(true);
    expect(satisfies(ver("1.2.4"), range("1.2.3"))).toBe(false);
  });

  it("x-range 1.x", () => {
    expect(satisfies(ver("1.5.0"), range("1.x"))).toBe(true);
    expect(satisfies(ver("2.0.0"), range("1.x"))).toBe(false);
  });

  it("prerelease (default semver semantics)", () => {
    // A prerelease does NOT satisfy a plain caret by default.
    expect(satisfies(ver("1.2.3-alpha.1"), range("^1.2.3"))).toBe(false);
    // ...but does when the range explicitly admits a prerelease at the same tuple.
    expect(satisfies(ver("1.2.3-alpha.1"), range(">=1.2.3-alpha.0 <2.0.0"))).toBe(true);
  });
});

describe("resolve — per-constraint reporting (AC#2)", () => {
  it("all-satisfied graph reports every edge satisfied, no cycles", () => {
    const report = resolve([
      node("core", "0.3.2"),
      node("web-handoff", "0.2.0", { core: "^0.3.0" }),
    ]);
    expect(report.cycles).toEqual([]);
    expect(report.constraints).toEqual([
      {
        from: "web-handoff",
        to: "core",
        range: ">=0.3.0 <0.4.0-0",
        satisfied: true,
        actualVersion: "0.3.2",
      },
    ]);
  });

  it("reports a missing dependency", () => {
    const report = resolve([node("web-handoff", "0.2.0", { "doc-handoff": "^1.0.0" })]);
    const c = report.constraints[0];
    expect(c?.satisfied).toBe(false);
    expect(c?.reason).toBe("missing");
    expect(c?.to).toBe("doc-handoff");
    expect(c?.actualVersion).toBeUndefined();
  });

  it("reports a version-mismatch with the actual version", () => {
    const report = resolve([
      node("core", "0.4.0"),
      node("web-handoff", "0.2.0", { core: "^0.3.0" }),
    ]);
    const c = report.constraints.find((x) => x.to === "core");
    expect(c?.satisfied).toBe(false);
    expect(c?.reason).toBe("version-mismatch");
    expect(c?.actualVersion).toBe("0.4.0");
  });

  it("reports a mix of satisfied / missing / mismatch correctly", () => {
    const report = resolve([
      node("core", "0.4.0"),
      node("util", "1.0.0"),
      node("web", "0.1.0", { core: "^0.3.0", util: "^1.0.0", absent: "^2.0.0" }),
    ]);
    const byTo = new Map(report.constraints.map((c) => [c.to, c]));
    expect(byTo.get(id("core"))?.reason).toBe("version-mismatch");
    expect(byTo.get(id("util"))?.satisfied).toBe(true);
    expect(byTo.get(id("absent"))?.reason).toBe("missing");
  });

  it("empty graph yields an empty report", () => {
    expect(resolve([])).toEqual({ constraints: [], cycles: [] });
  });
});

describe("resolve — cycle detection (AC#3)", () => {
  it("detects a self-loop and terminates", () => {
    const report = resolve([node("a", "1.0.0", { a: "^1.0.0" })]);
    expect(report.cycles).toHaveLength(1);
    expect(report.cycles[0]).toEqual([id("a"), id("a")]);
  });

  it("detects a 2-node cycle (a -> b -> a) and terminates", () => {
    const report = resolve([
      node("a", "1.0.0", { b: "^1.0.0" }),
      node("b", "1.0.0", { a: "^1.0.0" }),
    ]);
    expect(report.cycles).toHaveLength(1);
    // The cycle path starts and ends at the same id.
    const cycle = report.cycles[0] as BundleId[];
    expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    expect(new Set(cycle)).toEqual(new Set([id("a"), id("b")]));
  });

  it("detects a 3-node cycle (a -> b -> c -> a) and terminates", () => {
    const report = resolve([
      node("a", "1.0.0", { b: "^1.0.0" }),
      node("b", "1.0.0", { c: "^1.0.0" }),
      node("c", "1.0.0", { a: "^1.0.0" }),
    ]);
    expect(report.cycles).toHaveLength(1);
    const cycle = report.cycles[0] as BundleId[];
    expect(new Set(cycle)).toEqual(new Set([id("a"), id("b"), id("c")]));
  });

  it("does NOT flag a non-cyclic diamond DAG (a->b, a->c, b->d, c->d)", () => {
    const report = resolve([
      node("a", "1.0.0", { b: "^1.0.0", c: "^1.0.0" }),
      node("b", "1.0.0", { d: "^1.0.0" }),
      node("c", "1.0.0", { d: "^1.0.0" }),
      node("d", "1.0.0"),
    ]);
    expect(report.cycles).toEqual([]);
    // All four dependency edges are satisfied.
    expect(report.constraints.every((c) => c.satisfied)).toBe(true);
    expect(report.constraints).toHaveLength(4);
  });

  it("does not report the same multi-node cycle twice", () => {
    // Two entry points into the same a<->b cycle plus an extra dependant.
    const report = resolve([
      node("x", "1.0.0", { a: "^1.0.0" }),
      node("a", "1.0.0", { b: "^1.0.0" }),
      node("b", "1.0.0", { a: "^1.0.0" }),
    ]);
    expect(report.cycles).toHaveLength(1);
  });

  it("terminates (returns) on any cyclic input", () => {
    // If the DFS were not cycle-safe this would hang; reaching the assertion proves termination.
    const report = resolve([
      node("a", "1.0.0", { b: "^1.0.0" }),
      node("b", "1.0.0", { c: "^1.0.0" }),
      node("c", "1.0.0", { a: "^1.0.0", b: "^1.0.0" }),
    ]);
    expect(report).toBeDefined();
    expect(report.cycles.length).toBeGreaterThanOrEqual(1);
  });
});
