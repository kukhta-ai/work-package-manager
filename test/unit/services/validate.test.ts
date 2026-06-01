import { describe, expect, it } from "vitest";
import {
  type AgentName,
  type BundleId,
  type BundleManifest,
  type Project,
  parseAgentName,
  parseBundleId,
  parseSemVer,
  parseVersionRange,
  type VersionRange,
} from "../../../src/core/model/index.js";
import { validateProject } from "../../../src/core/services/validate.js";

function id(s: string): BundleId {
  const r = parseBundleId(s);
  if (!r.ok) throw new Error(r.problem.message);
  return r.value;
}
function agent(s: string): AgentName {
  const r = parseAgentName(s);
  if (!r.ok) throw new Error(r.problem.message);
  return r.value;
}
function ver(s: string) {
  const r = parseSemVer(s);
  if (!r.ok) throw new Error(r.problem.message);
  return r.value;
}
function range(s: string): VersionRange {
  const r = parseVersionRange(s);
  if (!r.ok) throw new Error(r.problem.message);
  return r.value;
}

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
    summary: `${name}.`,
    confirmation: "safe",
    requires: req,
    payload: { files: [], templates: [], scripts: [] },
  };
}

/** Build a fixture Project from bundles + targets. */
function project(bundles: BundleManifest[], targets: string[]): Project {
  return {
    rootPath: "/proj",
    manifest: {
      meta: { name: "p", version: ver("1.0.0") },
      bundles: bundles.map((b) => b.id),
      targets: targets.map(agent),
    },
    bundles: new Map(bundles.map((b) => [b.id, b])),
  };
}

describe("validateProject — a valid project reports no problems (AC#2)", () => {
  it("returns { ok: true, problems: [] } for a healthy project", () => {
    const p = project(
      [bundle("core", "0.3.2"), bundle("web-handoff", "0.2.0", { core: "^0.3.0" })],
      ["claude-code"],
    );
    const report = validateProject(p, ["core", "web-handoff", "bundle-template"]);
    expect(report).toEqual({ ok: true, problems: [] });
  });

  it("is fine when an enabled bundle has no directory in the supplied list (only EXTRA dirs are orphans)", () => {
    const p = project([bundle("core", "0.3.2")], ["codex"]);
    // core is enabled but its dir isn't in the list — that is NOT an orphan (orphan = extra dir).
    const report = validateProject(p, ["bundle-template"]);
    expect(report.ok).toBe(true);
  });
});

describe("validateProject — each broken kind reports its specific problem (AC#1/#2)", () => {
  it("flags a missing dependency", () => {
    const p = project([bundle("web-handoff", "0.2.0", { "doc-handoff": "^1.0.0" })], ["codex"]);
    const report = validateProject(p, ["web-handoff", "bundle-template"]);
    expect(report.ok).toBe(false);
    const problem = report.problems.find((x) => x.field === "requires.doc-handoff");
    expect(problem?.message).toBe(
      'bundle "web-handoff" requires "doc-handoff" which is not enabled',
    );
  });

  it("flags a version-mismatch with the range and the actual version", () => {
    const p = project(
      [bundle("core", "0.4.0"), bundle("web-handoff", "0.2.0", { core: "^0.3.0" })],
      ["codex"],
    );
    const report = validateProject(p, ["core", "web-handoff", "bundle-template"]);
    expect(report.ok).toBe(false);
    const problem = report.problems.find((x) => x.field === "requires.core");
    expect(problem?.message).toContain('requires "core"@');
    expect(problem?.message).toContain('but "core" is 0.4.0');
  });

  it("flags a dependency cycle, naming the path", () => {
    const p = project(
      [bundle("a", "1.0.0", { b: "^1.0.0" }), bundle("b", "1.0.0", { a: "^1.0.0" })],
      ["codex"],
    );
    const report = validateProject(p, ["a", "b", "bundle-template"]);
    expect(report.ok).toBe(false);
    const cycle = report.problems.find((x) => x.message.startsWith("dependency cycle:"));
    expect(cycle?.field).toBe("requires");
    expect(cycle?.message).toMatch(/dependency cycle: .* -> /);
  });

  it("flags no declared target agents", () => {
    const p = project([bundle("core", "0.3.2")], []);
    const report = validateProject(p, ["core", "bundle-template"]);
    expect(report.ok).toBe(false);
    expect(report.problems).toContainEqual({
      message: "no target agents declared",
      field: "targets",
    });
  });

  it("flags an orphan bundle directory", () => {
    const p = project([bundle("core", "0.3.2")], ["codex"]);
    const report = validateProject(p, ["core", "stray", "bundle-template"]);
    expect(report.ok).toBe(false);
    expect(report.problems).toContainEqual({
      message: 'bundle directory "stray" is not listed in the manifest (orphan/disabled)',
      field: "bundles",
    });
  });

  it("does NOT flag bundle-template as an orphan", () => {
    const p = project([bundle("core", "0.3.2")], ["codex"]);
    const report = validateProject(p, ["core", "bundle-template"]);
    expect(report.problems.some((x) => x.message.includes("bundle-template"))).toBe(false);
    expect(report.ok).toBe(true);
  });
});

describe("validateProject — aggregates ALL problems (AC#2)", () => {
  it("reports every problem in a multi-broken project", () => {
    const p = project(
      [bundle("core", "0.4.0"), bundle("web-handoff", "0.2.0", { core: "^0.3.0" })],
      [], // empty targets
    );
    const report = validateProject(p, ["core", "web-handoff", "stray", "bundle-template"]);
    expect(report.ok).toBe(false);
    // version-mismatch + empty-targets + orphan-dir => at least 3 problems.
    expect(report.problems.length).toBeGreaterThanOrEqual(3);
    expect(report.problems.some((x) => x.field === "requires.core")).toBe(true);
    expect(report.problems.some((x) => x.field === "targets")).toBe(true);
    expect(report.problems.some((x) => x.field === "bundles" && x.message.includes("stray"))).toBe(
      true,
    );
  });

  it("an empty project (no bundles, but a target) with no extra dirs is valid", () => {
    const p = project([], ["claude-code"]);
    expect(validateProject(p, ["bundle-template"])).toEqual({ ok: true, problems: [] });
  });
});
