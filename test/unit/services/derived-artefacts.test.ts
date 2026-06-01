import { describe, expect, it } from "vitest";
import {
  type AgentName,
  type BundleId,
  type BundleManifest,
  type Project,
  parseAgentName,
  parseBundleId,
  parseSemVer,
} from "../../../src/core/model/index.js";
import {
  type ArtefactSnippets,
  type CurrentState,
  deriveArtefacts,
  planChanges,
  scopePlan,
} from "../../../src/core/services/derived-artefacts.js";

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

/** A fixture bundle manifest. */
function bundle(name: string, summary: string): BundleManifest {
  return {
    id: id(name),
    version: ver("0.1.0"),
    summary,
    confirmation: "safe",
    requires: new Map(),
  };
}

/** A fixture Project: a manifest (name + targets + bundle order) and the loaded bundles. */
function project(name: string, bundles: BundleManifest[], targets: string[]): Project {
  const bundleMap = new Map<BundleId, BundleManifest>(bundles.map((b) => [b.id, b]));
  return {
    rootPath: "/proj",
    manifest: {
      meta: { name, version: ver("1.0.0") },
      bundles: bundles.map((b) => b.id),
      targets: targets.map(agent),
    },
    bundles: bundleMap,
  };
}

/** Fixture snippets (built-in CONTENT is tasks 30-31; these stand in with the documented placeholders). */
const SNIPPETS: ArtefactSnippets = {
  frontDoor: {
    path: "AGENTS.md.tmpl",
    content: "# {{project-name}}\n\nInstall these bundles:\n{{bundles}}\n",
  },
  orchestrator: {
    path: "installer-skills/{{project-name}}-installer/SKILL.md.tmpl",
    content: "# {{project-name}} installer\nOrchestrates the install of:\n{{bundles}}\n",
  },
};

describe("deriveArtefacts — front-door + orchestrator from the project (AC#1)", () => {
  it("renders the front-door AGENTS.md and the orchestrator skill with project params", () => {
    const p = project(
      "hermes-handoff",
      [bundle("core", "The core foundation."), bundle("web-handoff", "Hand a website off.")],
      ["claude-code"],
    );
    const desired = deriveArtefacts(p, SNIPPETS);

    const front = desired.files.find((f) => f.path === "AGENTS.md");
    expect(front?.content).toBe(
      "# hermes-handoff\n\nInstall these bundles:\n- The core foundation.\n- Hand a website off.\n",
    );

    const orch = desired.files.find((f) => f.path.endsWith("SKILL.md"));
    // The {{project-name}} in the orchestrator's PATH is substituted, and .tmpl stripped.
    expect(orch?.path).toBe("installer-skills/hermes-handoff-installer/SKILL.md");
    expect(orch?.content).toContain("# hermes-handoff installer");
    expect(orch?.content).toContain("- The core foundation.");
  });

  it("lists bundle summaries in manifest order and skips an id absent from loaded bundles", () => {
    const p = project("p", [bundle("a", "Alpha."), bundle("b", "Beta.")], ["codex"]);
    // Manually inject an extra id into the manifest order that has no loaded bundle.
    const manifest = { ...p.manifest, bundles: [id("a"), id("ghost"), id("b")] };
    const withGhost: Project = { ...p, manifest };
    const desired = deriveArtefacts(withGhost, SNIPPETS);
    const front = desired.files.find((f) => f.path === "AGENTS.md");
    // ghost contributes no line; a and b appear in order.
    expect(front?.content).toContain("- Alpha.\n- Beta.\n");
    expect(front?.content).not.toContain("ghost");
  });
});

describe("scopePlan — aliases at root and per bundle (AC#2)", () => {
  it("emits a root alias plus a per-bundle alias for each known target", () => {
    const plan = scopePlan([agent("claude-code"), agent("codex")], [id("core"), id("web-handoff")]);
    expect(plan.unknownTargets).toEqual([]);
    // claude-code: root + 2 bundles; codex: root + 2 bundles => 6 entries.
    expect(plan.aliases).toHaveLength(6);
    expect(plan.aliases).toContainEqual({
      target: "claude-code",
      linkPath: ".claude/skills",
      aliasTo: "installer-skills",
    });
    expect(plan.aliases).toContainEqual({
      target: "claude-code",
      linkPath: "bundles/core/.claude/skills",
      aliasTo: "bundles/core/installer-skills",
    });
    expect(plan.aliases).toContainEqual({
      target: "codex",
      linkPath: "bundles/web-handoff/.agents/skills",
      aliasTo: "bundles/web-handoff/installer-skills",
    });
  });

  it("surfaces an unknown agent rather than dropping it silently", () => {
    const plan = scopePlan([agent("claude-code"), agent("cursor")], [id("core")]);
    expect(plan.unknownTargets).toEqual(["cursor"]);
    // Only claude-code produced aliases (root + 1 bundle).
    expect(plan.aliases).toHaveLength(2);
    expect(plan.aliases.every((a) => a.target === "claude-code")).toBe(true);
  });

  it("emits only root aliases when there are no bundles", () => {
    const plan = scopePlan([agent("openclaw")], []);
    expect(plan.aliases).toEqual([
      { target: "openclaw", linkPath: ".openclaw/skills", aliasTo: "installer-skills" },
    ]);
  });
});

describe("idempotency: determinism + diff (AC#3)", () => {
  const p = project(
    "hermes-handoff",
    [bundle("core", "The core."), bundle("web-handoff", "Web handoff.")],
    ["claude-code", "codex"],
  );

  it("deriving twice from the same project yields deep-equal output", () => {
    expect(deriveArtefacts(p, SNIPPETS)).toEqual(deriveArtefacts(p, SNIPPETS));
  });

  it("planChanges is empty when the current state already matches the desired (no-op)", () => {
    const desired = deriveArtefacts(p, SNIPPETS);
    const current: CurrentState = {
      files: new Map(desired.files.map((f) => [f.path, f.content])),
      aliases: new Set(desired.aliasPlan.aliases.map((a) => a.linkPath)),
    };
    expect(planChanges(desired, current)).toEqual({ filesToWrite: [], aliasesToCreate: [] });
  });

  it("planChanges detects a stale file (different content)", () => {
    const desired = deriveArtefacts(p, SNIPPETS);
    const stale = new Map(desired.files.map((f) => [f.path, f.content]));
    const frontPath = desired.files[0]?.path as string;
    stale.set(frontPath, "OUTDATED");
    const current: CurrentState = {
      files: stale,
      aliases: new Set(desired.aliasPlan.aliases.map((a) => a.linkPath)),
    };
    const change = planChanges(desired, current);
    expect(change.filesToWrite.map((f) => f.path)).toEqual([frontPath]);
    expect(change.aliasesToCreate).toEqual([]);
  });

  it("planChanges detects a missing file (not on disk)", () => {
    const desired = deriveArtefacts(p, SNIPPETS);
    const current: CurrentState = {
      files: new Map(), // nothing on disk
      aliases: new Set(desired.aliasPlan.aliases.map((a) => a.linkPath)),
    };
    expect(planChanges(desired, current).filesToWrite).toHaveLength(desired.files.length);
  });

  it("planChanges detects missing aliases", () => {
    const desired = deriveArtefacts(p, SNIPPETS);
    const current: CurrentState = {
      files: new Map(desired.files.map((f) => [f.path, f.content])),
      aliases: new Set([desired.aliasPlan.aliases[0]?.linkPath as string]), // only the first exists
    };
    const change = planChanges(desired, current);
    expect(change.filesToWrite).toEqual([]);
    expect(change.aliasesToCreate).toHaveLength(desired.aliasPlan.aliases.length - 1);
  });
});
