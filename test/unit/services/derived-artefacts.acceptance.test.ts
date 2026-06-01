import { describe, expect, it } from "vitest";
import {
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
} from "../../../src/core/services/derived-artefacts.js";

/**
 * Acceptance test for the derived-artefacts service: the §5 RERENDER lifecycle step end-to-end — derive the
 * desired artefacts from a realistic `Project` (built from real task-10 `BundleManifest`s + targets), then
 * run the full idempotency cycle the mutating operation will: derive → first `planChanges` against an empty
 * state writes everything → apply → second `planChanges` against the now-current state is EMPTY. Pure (no
 * I/O); the operation supplies the on-disk state as data.
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
function bundle(name: string, version: string, summary: string): BundleManifest {
  return {
    id: id(name),
    version: ver(version),
    summary,
    confirmation: "safe",
    requires: new Map(),
    payload: { files: [], templates: [], scripts: [] },
  };
}

const SNIPPETS: ArtefactSnippets = {
  frontDoor: {
    path: "AGENTS.md.tmpl",
    content: "# {{project-name}}\n\nThis project installs:\n{{bundles}}\n",
  },
  orchestrator: {
    path: "installer-skills/{{project-name}}-installer/SKILL.md.tmpl",
    content: "# {{project-name}} installer\nWorks the install of:\n{{bundles}}\n",
  },
};

/** A realistic loaded Project. */
function buildProject(): Project {
  const bundles = [
    bundle("core", "0.3.2", "The shared foundation every bundle builds on."),
    bundle("web-handoff", "0.2.0", "Hand a website project off to another agent."),
  ];
  return {
    rootPath: "/work/hermes-handoff",
    manifest: {
      meta: { name: "hermes-handoff", version: ver("1.0.0") },
      bundles: bundles.map((b) => b.id),
      targets: [parseAgentNameOrThrow("claude-code"), parseAgentNameOrThrow("codex")],
    },
    bundles: new Map(bundles.map((b) => [b.id, b])),
  };
}

function parseAgentNameOrThrow(s: string) {
  const r = parseAgentName(s);
  if (!r.ok) throw new Error(r.problem.message);
  return r.value;
}

describe("derived-artefacts — acceptance (the RERENDER lifecycle round)", () => {
  it("derives the front-door + orchestrator and the full alias plan (AC#1/#2)", () => {
    const desired = deriveArtefacts(buildProject(), SNIPPETS);

    // AC#1: front-door + orchestrator rendered with the project name and bundle summaries.
    const front = desired.files.find((f) => f.path === "AGENTS.md");
    expect(front?.content).toContain("# hermes-handoff");
    expect(front?.content).toContain("- The shared foundation every bundle builds on.");
    expect(front?.content).toContain("- Hand a website project off to another agent.");
    const orch = desired.files.find((f) => f.path.endsWith("SKILL.md"));
    expect(orch?.path).toBe("installer-skills/hermes-handoff-installer/SKILL.md");

    // AC#2: alias plan has root + per-bundle entries for both targets (2 targets × [root + 2 bundles] = 6).
    expect(desired.aliasPlan.unknownTargets).toEqual([]);
    expect(desired.aliasPlan.aliases).toHaveLength(6);
    const linkPaths = desired.aliasPlan.aliases.map((a) => a.linkPath).sort();
    expect(linkPaths).toEqual(
      [
        ".agents/skills",
        ".claude/skills",
        "bundles/core/.agents/skills",
        "bundles/core/.claude/skills",
        "bundles/web-handoff/.agents/skills",
        "bundles/web-handoff/.claude/skills",
      ].sort(),
    );
  });

  it("is deterministic: deriving twice is deep-equal", () => {
    expect(deriveArtefacts(buildProject(), SNIPPETS)).toEqual(
      deriveArtefacts(buildProject(), SNIPPETS),
    );
  });

  it("first apply writes everything; re-deriving onto the now-current project changes nothing (AC#3)", () => {
    const desired = deriveArtefacts(buildProject(), SNIPPETS);

    // 1) Fresh project: nothing on disk → planChanges writes every file and every alias.
    const empty: CurrentState = { files: new Map(), aliases: new Set() };
    const firstPass = planChanges(desired, empty);
    expect(firstPass.filesToWrite).toHaveLength(desired.files.length);
    expect(firstPass.aliasesToCreate).toHaveLength(desired.aliasPlan.aliases.length);

    // 2) Simulate the operation applying that change set, producing the now-current on-disk state.
    const current: CurrentState = {
      files: new Map(firstPass.filesToWrite.map((f) => [f.path, f.content])),
      aliases: new Set(firstPass.aliasesToCreate.map((a) => a.linkPath)),
    };

    // 3) Re-derive + diff against the now-current state → EMPTY change set (a true no-op).
    const secondPass = planChanges(deriveArtefacts(buildProject(), SNIPPETS), current);
    expect(secondPass).toEqual({ filesToWrite: [], aliasesToCreate: [] });
  });
});
