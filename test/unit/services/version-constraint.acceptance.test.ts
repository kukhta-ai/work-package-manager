import { describe, expect, it } from "vitest";
import {
  type BundleId,
  type BundleManifest,
  parseBundleId,
  parseSemVer,
  parseVersionRange,
  type SemVer,
  type VersionRange,
} from "../../../src/core/model/index.js";
import { type BundleNode, resolve } from "../../../src/core/services/version-constraint.js";

/**
 * Acceptance test for the version-constraint service: `resolve` over a realistic project dependency graph
 * built from actual task-10 `BundleManifest`s — the shape the loaded `Project` carries — proving the service
 * consumes the real model end-to-end, exactly as the task-20 `validate` service will. Pure (no I/O).
 */

function id(s: string): BundleId {
  const r = parseBundleId(s);
  if (!r.ok) throw new Error(r.problem.message);
  return r.value;
}
function ver(s: string): SemVer {
  const r = parseSemVer(s);
  if (!r.ok) throw new Error(r.problem.message);
  return r.value;
}
function range(s: string): VersionRange {
  const r = parseVersionRange(s);
  if (!r.ok) throw new Error(r.problem.message);
  return r.value;
}

/** Build a real BundleManifest (the full task-10 model), then map to the resolver's node shape. */
function bundle(
  name: string,
  version: string,
  requires: Record<string, string> = {},
): BundleManifest {
  const req = new Map<BundleId, VersionRange>();
  for (const [dep, rng] of Object.entries(requires)) {
    req.set(id(dep), range(rng));
  }
  return {
    id: id(name),
    version: ver(version),
    summary: `${name} bundle`,
    confirmation: "safe",
    requires: req,
    payload: { files: [] },
  };
}

/** The mapping the operation/validate service performs: a Project's BundleManifests -> resolver nodes. */
function toNodes(manifests: BundleManifest[]): BundleNode[] {
  return manifests.map((m) => ({ id: m.id, version: m.version, requires: m.requires }));
}

describe("version-constraint — acceptance (resolve over a real BundleManifest graph)", () => {
  it("a healthy project resolves with all constraints satisfied and no cycles (AC#1/#2)", () => {
    const project = [
      bundle("core", "0.3.2"),
      bundle("doc-handoff", "1.2.0"),
      bundle("web-handoff", "0.2.0", { core: "^0.3.0", "doc-handoff": "~1.2.0" }),
    ];
    const report = resolve(toNodes(project));
    expect(report.cycles).toEqual([]);
    expect(report.constraints).toHaveLength(2);
    expect(report.constraints.every((c) => c.satisfied)).toBe(true);
    const coreEdge = report.constraints.find((c) => c.to === id("core"));
    expect(coreEdge?.actualVersion).toBe("0.3.2");
  });

  it("bumping a depended-upon bundle past its constraint surfaces a version-mismatch (AC#2)", () => {
    const project = [
      bundle("core", "0.4.0"), // breaking bump: ^0.3.0 no longer satisfied
      bundle("doc-handoff", "1.2.0"),
      bundle("web-handoff", "0.2.0", { core: "^0.3.0", "doc-handoff": "~1.2.0" }),
    ];
    const report = resolve(toNodes(project));
    const coreEdge = report.constraints.find(
      (c) => c.from === id("web-handoff") && c.to === id("core"),
    );
    expect(coreEdge?.satisfied).toBe(false);
    expect(coreEdge?.reason).toBe("version-mismatch");
    expect(coreEdge?.actualVersion).toBe("0.4.0");
    // The other edge (doc-handoff ~1.2.0) is still satisfied.
    const docEdge = report.constraints.find((c) => c.to === id("doc-handoff"));
    expect(docEdge?.satisfied).toBe(true);
  });

  it("a circular requires graph is reported and resolve terminates (AC#3)", () => {
    const project = [
      bundle("core", "0.3.2", { "web-handoff": "^0.2.0" }),
      bundle("web-handoff", "0.2.0", { core: "^0.3.0" }),
    ];
    const report = resolve(toNodes(project));
    expect(report.cycles).toHaveLength(1);
    const cycle = report.cycles[0] as BundleId[];
    expect(new Set(cycle)).toEqual(new Set([id("core"), id("web-handoff")]));
    // Both constraint edges still report (and are individually satisfied here).
    expect(report.constraints).toHaveLength(2);
  });
});
