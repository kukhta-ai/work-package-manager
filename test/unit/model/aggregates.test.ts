import { describe, expect, it } from "vitest";
import type {
  AuthoringTaskSpec,
  BundleManifest,
  Manifest,
  OperationResult,
  Project,
  Template,
  ValidationReport,
} from "../../../src/core/model/index.js";
import {
  parseAgentName,
  parseBundleId,
  parseSemVer,
  parseVersionRange,
} from "../../../src/core/model/index.js";

/**
 * Tiny helper that unwraps a Parsed in a test, failing loudly if a value we expect to be valid is not.
 * Keeps the aggregate construction below readable.
 */
function unwrap<T>(p: { ok: true; value: T } | { ok: false; problem: { message: string } }): T {
  if (!p.ok) {
    throw new Error(`expected a valid value, got problem: ${p.problem.message}`);
  }
  return p.value;
}

describe("aggregates compose from parsed (branded) values — AC#1, AC#3", () => {
  it("builds a Manifest from a ProjectMeta, BundleIds, and AgentNames", () => {
    const manifest: Manifest = {
      meta: { name: "hermes-handoff", version: unwrap(parseSemVer("0.1.0")), license: "MIT" },
      bundles: [unwrap(parseBundleId("core")), unwrap(parseBundleId("web-handoff"))],
      targets: [unwrap(parseAgentName("claude-code")), unwrap(parseAgentName("codex"))],
      installerSkills: [],
    };
    expect(manifest.meta.name).toBe("hermes-handoff");
    expect(manifest.bundles).toHaveLength(2);
    expect(manifest.targets).toHaveLength(2);
  });

  it("builds a BundleManifest with a typed requires map (BundleId -> VersionRange)", () => {
    const core = unwrap(parseBundleId("core"));
    // The requires map carries a properly-branded key (BundleId) and value (VersionRange). Note the stored
    // range is the semver-NORMALIZED comparator form, not the raw input (e.g. `^0.3.0` -> `>=0.3.0 <0.4.0-0`).
    const range = unwrap(parseVersionRange("^0.3.0"));
    const requires = new Map([[core, range]]);
    const bundle: BundleManifest = {
      id: unwrap(parseBundleId("web-handoff")),
      version: unwrap(parseSemVer("0.2.0")),
      summary: "Hand a website project off to another agent.",
      confirmation: "safe",
      requires,
      payload: { files: [], templates: [], scripts: [], skills: [] },
      installerSkills: [],
    };
    expect(bundle.id).toBe("web-handoff");
    expect(bundle.requires.get(core)).toBe(range);
    expect(bundle.requires.get(core)).toBe(">=0.3.0 <0.4.0-0");
  });

  it("builds a Project projection (plain rootPath string, bundles keyed by id)", () => {
    const webId = unwrap(parseBundleId("web-handoff"));
    const bundle: BundleManifest = {
      id: webId,
      version: unwrap(parseSemVer("0.2.0")),
      summary: "Website handoff.",
      confirmation: "dangerous",
      requires: new Map(),
      payload: { files: [], templates: [], scripts: [], skills: [] },
      installerSkills: [],
    };
    const project: Project = {
      rootPath: "/tmp/some/project",
      manifest: {
        meta: { name: "p", version: unwrap(parseSemVer("1.0.0")) },
        bundles: [webId],
        targets: [unwrap(parseAgentName("hermes"))],
        installerSkills: [],
      },
      bundles: new Map([[webId, bundle]]),
    };
    expect(typeof project.rootPath).toBe("string");
    expect(project.bundles.get(webId)?.summary).toBe("Website handoff.");
  });

  it("builds the value objects: Template, AuthoringTaskSpec, ValidationReport, OperationResult", () => {
    const template: Template = {
      name: "minimal",
      scope: "project",
      parameters: [{ name: "project-name" }],
      files: [{ path: "manifest.yml", content: "name: {{project-name}}\n" }],
      snippets: [{ path: "advisor.SKILL.md", content: "# {{bundle-id}}" }],
    };
    const task: AuthoringTaskSpec = {
      title: "Write advisor content for web-handoff",
      acceptanceCriteria: ["The advisor recommends the bundle by name."],
    };
    const okReport: ValidationReport = { ok: true, problems: [] };
    const badReport: ValidationReport = {
      ok: false,
      problems: [{ message: "targets must not be empty", field: "targets" }],
    };
    const result: OperationResult = {
      summary: "Created bundle web-handoff.",
      changedPaths: ["bundles/web-handoff/bundle.yml", "manifest.yml"],
      materialisedTaskTitles: [task.title],
    };

    expect(template.scope).toBe("project");
    expect(task.acceptanceCriteria).toHaveLength(1);
    expect(okReport.ok).toBe(true);
    expect(badReport.problems[0]?.field).toBe("targets");
    expect(result.materialisedTaskTitles).toContain(task.title);
  });
});
