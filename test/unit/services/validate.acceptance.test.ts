import { describe, expect, it } from "vitest";
import {
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

/**
 * Acceptance test for the validate service: `validateProject` over a realistic `Project` built from real
 * task-10 `BundleManifest`s + targets + the supplied bundle directory names — the way the `project validate`
 * operation will call it (resolve the project, list the `bundles/` dir names via the FS port, validate).
 * Pure (no I/O).
 */

function id(s: string): BundleId {
  const r = parseBundleId(s);
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
    payload: { files: [], templates: [], scripts: [], skills: [] },
    installerSkills: [],
  };
}
function project(bundles: BundleManifest[], targets: string[]): Project {
  return {
    rootPath: "/work/hermes-handoff",
    manifest: {
      meta: { name: "hermes-handoff", version: ver("1.0.0") },
      bundles: bundles.map((b) => b.id),
      targets: targets.map((t) => {
        const r = parseAgentName(t);
        if (!r.ok) throw new Error(r.problem.message);
        return r.value;
      }),
      installerSkills: [],
    },
    bundles: new Map(bundles.map((b) => [b.id, b])),
  };
}

describe("validate — acceptance (validateProject over a real project)", () => {
  it("a healthy 3-bundle project passes all four checks → { ok: true, problems: [] } (AC#1/#2)", () => {
    const p = project(
      [
        bundle("core", "0.3.2"),
        bundle("doc-handoff", "1.2.0"),
        bundle("web-handoff", "0.2.0", { core: "^0.3.0", "doc-handoff": "~1.2.0" }),
      ],
      ["claude-code", "codex"],
    );
    const report = validateProject(p, ["core", "doc-handoff", "web-handoff", "bundle-template"]);
    expect(report).toEqual({ ok: true, problems: [] });
  });

  it("a deliberately-broken project reports each specific problem, aggregated (AC#1/#2)", () => {
    const p = project(
      [
        bundle("core", "0.4.0"), // breaks web-handoff's ^0.3.0
        bundle("doc-handoff", "1.2.0"),
        bundle("web-handoff", "0.2.0", { core: "^0.3.0", "doc-handoff": "~1.2.0" }),
      ],
      [], // no targets
    );
    const report = validateProject(p, [
      "core",
      "doc-handoff",
      "web-handoff",
      "experimental", // an orphan dir
      "bundle-template",
    ]);
    expect(report.ok).toBe(false);

    // version-mismatch on web-handoff -> core, naming the actual version.
    const mismatch = report.problems.find((x) => x.field === "requires.core");
    expect(mismatch?.message).toContain('bundle "web-handoff" requires "core"@');
    expect(mismatch?.message).toContain('but "core" is 0.4.0');

    // no target agents declared.
    expect(report.problems).toContainEqual({
      message: "no target agents declared",
      field: "targets",
    });

    // the orphan directory is flagged.
    expect(report.problems).toContainEqual({
      message: 'bundle directory "experimental" is not listed in the manifest (orphan/disabled)',
      field: "bundles",
    });

    // The doc-handoff constraint is satisfied (1.2.0 satisfies ~1.2.0) → not reported.
    expect(report.problems.some((x) => x.field === "requires.doc-handoff")).toBe(false);
  });

  it("does NOT report review-phase concerns (step-slug / DoD) — out of scope (AC#3)", () => {
    const p = project([bundle("core", "0.4.0"), bundle("web", "0.1.0", { core: "^0.3.0" })], []);
    const report = validateProject(p, ["core", "web", "bundle-template"]);
    expect(report.ok).toBe(false);
    for (const problem of report.problems) {
      const m = problem.message.toLowerCase();
      expect(m).not.toContain("step-slug");
      expect(m).not.toContain("step slug");
      expect(m).not.toContain("definition of done");
      expect(m).not.toContain("dod");
    }
  });
});
