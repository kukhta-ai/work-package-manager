import { describe, expect, it } from "vitest";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import type { AgentName, BundleId } from "../../../src/core/model/index.js";
import { parseAgentName, parseBundleId } from "../../../src/core/model/index.js";
import {
  computeBuildPlan,
  computeFrontDoorTransforms,
  computeScopeAliasTransforms,
  shippableFiles,
} from "../../../src/core/operations/build.js";
import { loadProject } from "../../../src/core/operations/lifecycle.js";
import {
  buildLockfile,
  serializeLockfile,
  type VendoredArtifact,
} from "../../../src/core/services/integrity.js";

/**
 * Unit tests for the PURE build plan (task-82, Part A): `computeBuildPlan` + `shippableFiles` over an in-memory
 * {@link MemoryFileSystem}. They cover the three pure reads the plan composes — validate (AC82#1), the
 * frozen-lockfile check (AC82#2, incl. the fresh-project trivial pass and drift detection), and the prune-aware
 * shippable enumeration (AC82#3) — entirely in memory, with no real disk or subprocess.
 */

const PROJ = "/proj";

/** A bundle directory name → its `bundles/<id>/` directory listing. */
function bundleDirNames(fs: MemoryFileSystem): string[] {
  const base = `${PROJ}/bundles`;
  if (!fs.exists(base)) return [];
  return fs
    .list(base)
    .filter((e) => e.kind === "directory")
    .map((e) => e.name);
}

/** Compute the plan from a seeded fs, loading the project via the canonical loader (as the shell does). */
function plan(fs: MemoryFileSystem) {
  const project = loadProject(fs, PROJ);
  return computeBuildPlan(fs, PROJ, {
    project,
    bundleDirectoryNames: bundleDirNames(fs),
  });
}

/** Enumerate through the same loaded project model production build uses. */
function ship(fs: MemoryFileSystem): string[] {
  return shippableFiles(fs, PROJ, loadProject(fs, PROJ));
}

/**
 * Seed a coherent, buildable project at /proj: a manifest with one target + one enabled bundle, the bundle's
 * `bundle.yml`, plus the front-door / installer-skill / authoring-backlog the real `init` would leave. A coherent
 * project (target present, no orphan dirs) so validate passes; no `wpm.lock` (vendors nothing) so the lock check
 * passes trivially.
 */
function seedBuildable(): MemoryFileSystem {
  const fs = new MemoryFileSystem();
  fs.write(
    `${PROJ}/manifest.yml`,
    "project:\n  name: demo\n  version: 1.2.3\ntargets:\n  - claude-code\nbundles:\n  - core\n",
  );
  fs.write(
    `${PROJ}/bundles/core/bundle.yml`,
    "id: core\nversion: 0.1.0\nsummary: the core bundle\nconfirmation: safe\nrequires: {}\n",
  );
  // The shippable skeleton (doc 06).
  fs.write(`${PROJ}/AGENTS.md`, "# demo front door\n");
  fs.write(`${PROJ}/README.md`, "# demo\n");
  fs.write(`${PROJ}/installer-skills/demo-installer/SKILL.md`, "# installer\n");
  // Builder-time working state that must NOT ship.
  fs.write(`${PROJ}/.authoring-backlog/config.yml`, "task_prefix: authoring\n");
  fs.write(`${PROJ}/.authoring-backlog/tasks/authoring-1.md`, "# a task\n");
  fs.write(`${PROJ}/.gitignore`, ".authoring-backlog/\n");
  return fs;
}

describe("computeBuildPlan — validate gate (AC82#1)", () => {
  it("a coherent project is ok (validation passes)", () => {
    const p = plan(seedBuildable());
    expect(p.validation.ok).toBe(true);
    expect(p.ok).toBe(true);
    expect(p.name).toBe("demo");
    expect(p.version).toBe("1.2.3");
  });

  it("a project with NO targets fails validation (and the plan is not ok)", () => {
    const fs = seedBuildable();
    // Rewrite the manifest with empty targets — validateProject flags "no target agents declared".
    fs.write(
      `${PROJ}/manifest.yml`,
      "project:\n  name: demo\n  version: 1.2.3\ntargets: []\nbundles:\n  - core\n",
    );
    const p = plan(fs);
    expect(p.validation.ok).toBe(false);
    expect(p.ok).toBe(false);
    expect(p.validation.problems.some((pr) => /target/i.test(pr.message))).toBe(true);
  });

  it("an ORPHAN bundle directory (not in the manifest, not bundle-template/) fails validation", () => {
    const fs = seedBuildable();
    // A bundle dir on disk that the manifest does not list ⇒ orphan finding.
    fs.write(`${PROJ}/bundles/ghost/bundle.yml`, "id: ghost\nversion: 0.1.0\nsummary: x\n");
    const p = plan(fs);
    expect(p.validation.ok).toBe(false);
    expect(p.ok).toBe(false);
  });
});

describe("computeBuildPlan — frozen-lockfile (AC82#2)", () => {
  it("a fresh project with NO wpm.lock passes trivially (present:false, ok)", () => {
    const p = plan(seedBuildable());
    expect(p.lock.present).toBe(false);
    expect(p.lock.ok).toBe(true);
    expect(p.lock.drifted).toEqual([]);
    expect(p.lock.missing).toEqual([]);
    expect(p.vendored).toEqual([]);
  });

  it("a matching wpm.lock over vendored content passes, and the vendored summary carries version+source", () => {
    const fs = seedBuildable();
    // Vendor a third-party discipline skill under installer-skills/ and pin it.
    fs.write(`${PROJ}/installer-skills/tdd/SKILL.md`, "# tdd\nred-green-refactor\n");
    fs.write(`${PROJ}/installer-skills/tdd/references/cycle.md`, "the cycle\n");
    const artifact: VendoredArtifact = {
      name: "tdd",
      source: "obra/superpowers@v1.0",
      version: "1.0.0",
      files: [
        { path: "SKILL.md", content: "# tdd\nred-green-refactor\n" },
        { path: "references/cycle.md", content: "the cycle\n" },
      ],
    };
    fs.write(`${PROJ}/wpm.lock`, serializeLockfile(buildLockfile([artifact])));

    const p = plan(fs);
    expect(p.lock.present).toBe(true);
    expect(p.lock.ok).toBe(true);
    expect(p.ok).toBe(true);
    expect(p.vendored).toEqual([
      { name: "tdd", source: "obra/superpowers@v1.0", version: "1.0.0" },
    ]);
  });

  it("DRIFT: a vendored file changed since it was pinned ⇒ lock fails (the plan is not ok)", () => {
    const fs = seedBuildable();
    fs.write(`${PROJ}/installer-skills/tdd/SKILL.md`, "# tdd\noriginal\n");
    const artifact: VendoredArtifact = {
      name: "tdd",
      source: "obra/superpowers@v1.0",
      version: "1.0.0",
      files: [{ path: "SKILL.md", content: "# tdd\noriginal\n" }],
    };
    fs.write(`${PROJ}/wpm.lock`, serializeLockfile(buildLockfile([artifact])));
    // Tamper with the vendored content AFTER pinning.
    fs.write(`${PROJ}/installer-skills/tdd/SKILL.md`, "# tdd\nTAMPERED\n");

    const p = plan(fs);
    expect(p.lock.present).toBe(true);
    expect(p.lock.ok).toBe(false);
    expect(p.lock.drifted).toEqual(["tdd"]);
    expect(p.ok).toBe(false);
  });

  it("MISSING: a pinned artifact absent on disk ⇒ lock fails", () => {
    const fs = seedBuildable();
    const artifact: VendoredArtifact = {
      name: "ralph",
      source: "snarktank/ralph@v2",
      version: "2.0.0",
      files: [{ path: "ralph.sh", content: "#!/bin/sh\n" }],
    };
    fs.write(`${PROJ}/wpm.lock`, serializeLockfile(buildLockfile([artifact])));
    // Note: installer-skills/ralph/ is NOT created on disk.
    const p = plan(fs);
    expect(p.lock.ok).toBe(false);
    expect(p.lock.missing).toEqual(["ralph"]);
    expect(p.ok).toBe(false);
  });

  it("an authored (un-pinned) installer skill on disk is NOT flagged as extra/drift", () => {
    const fs = seedBuildable();
    // The authored main installer skill is already on disk (from seedBuildable); pin only a vendored artifact.
    fs.write(`${PROJ}/installer-skills/tdd/SKILL.md`, "# tdd\n");
    const artifact: VendoredArtifact = {
      name: "tdd",
      source: "x@1",
      version: "1.0.0",
      files: [{ path: "SKILL.md", content: "# tdd\n" }],
    };
    fs.write(`${PROJ}/wpm.lock`, serializeLockfile(buildLockfile([artifact])));
    const p = plan(fs);
    // demo-installer is on disk but un-pinned — it must NOT appear as `extra` (only pinned names are checked).
    expect(p.lock.extra).toEqual([]);
    expect(p.lock.ok).toBe(true);
  });
});

describe("shippableFiles — the prune-aware ship set (AC82#3)", () => {
  it("includes the skeleton and EXCLUDES .authoring-backlog/", () => {
    const fs = seedBuildable();
    const files = ship(fs);
    expect(files).toContain("manifest.yml");
    expect(files).toContain("AGENTS.md");
    expect(files).toContain("README.md");
    expect(files).toContain("installer-skills/demo-installer/SKILL.md");
    expect(files).toContain("bundles/core/bundle.yml");
    expect(files).toContain(".gitignore");
    // .authoring-backlog/ is builder-time state — never ships:
    expect(files.some((f) => f.startsWith(".authoring-backlog"))).toBe(false);
  });

  it("EXCLUDES .git/, node_modules/, dist/", () => {
    const fs = seedBuildable();
    fs.write(`${PROJ}/.git/HEAD`, "ref: refs/heads/main\n");
    fs.write(`${PROJ}/node_modules/dep/index.js`, "module.exports={}\n");
    fs.write(`${PROJ}/dist/cli.js`, "#!/usr/bin/env node\n");
    const files = ship(fs);
    expect(files.some((f) => f.startsWith(".git/"))).toBe(false);
    expect(files.some((f) => f.startsWith("node_modules/"))).toBe(false);
    expect(files.some((f) => f.startsWith("dist/"))).toBe(false);
  });

  it("EXCLUDES disabled bundles, the authoring-only bundle-template scaffold, and unresolved builder templates", () => {
    const fs = seedBuildable();
    // A disabled bundle dir (on disk, NOT in the project manifest), a file-like direct child that models how the
    // real adapter reports a symlink, the authoring-only scaffold, and a stray builder-template source. A real
    // nested payload template remains shippable because its `.tmpl` suffix is part of the runtime payload
    // contract, not an unresolved builder placeholder.
    fs.write(`${PROJ}/bundles/disabled-one/bundle.yml`, "id: disabled-one\nversion: 0.1.0\n");
    fs.write(`${PROJ}/bundles/orphan-link`, "../outside-bundle");
    fs.write(`${PROJ}/bundles/bundle-template/AGENTS.md.tmpl`, "# {{bundle-id}}\n");
    fs.write(`${PROJ}/README.md.tmpl`, "# unresolved builder source\n");
    fs.write(`${PROJ}/bundles/core/payload/templates/nested/runtime.conf.tmpl`, "port={{port}}\n");
    const files = ship(fs);
    // the enabled bundle ships:
    expect(files).toContain("bundles/core/bundle.yml");
    expect(files).toContain("bundles/core/payload/templates/nested/runtime.conf.tmpl");
    // authoring scaffolds and unresolved builder-template sources never ship:
    expect(files.some((f) => f.startsWith("bundles/bundle-template/"))).toBe(false);
    expect(files).not.toContain("README.md.tmpl");
    // the disabled dir does NOT ship (doc 06: "the build never includes it"):
    expect(files.some((f) => f.startsWith("bundles/disabled-one/"))).toBe(false);
    expect(files).not.toContain("bundles/orphan-link");
  });

  it("returns a SORTED list (deterministic)", () => {
    const fs = seedBuildable();
    const files = ship(fs);
    expect([...files]).toEqual([...files].sort());
  });

  it("TASK-105 — ships only exact registered payload-skill roots, preserving complete conventional and custom packages", () => {
    const fs = seedBuildable();
    fs.write(
      `${PROJ}/bundles/core/bundle.yml`,
      [
        "id: core",
        "version: 0.1.0",
        "summary: the core bundle",
        "confirmation: safe",
        "requires: {}",
        "payload:",
        "  skills:",
        "    - name: kept",
        "      path: payload/agent-skills/kept/SKILL.md",
        "    - name: moved",
        "      path: custom/moved-skill/entry.md",
        "    - name: nested",
        "      path: payload/agent-skills/group/nested/SKILL.md",
        "",
      ].join("\n"),
    );

    fs.write(
      `${PROJ}/bundles/core/payload/agent-skills/kept/SKILL.md`,
      "---\nname: kept\ndescription: Keep this skill.\n---\n# kept\n",
    );
    fs.write(`${PROJ}/bundles/core/payload/agent-skills/kept/references/guide.md`, "guide\n");
    fs.write(`${PROJ}/bundles/core/payload/agent-skills/kept/assets/prompt.tmpl`, "{{value}}\n");
    fs.write(`${PROJ}/bundles/core/payload/agent-skills/kept-extra/SKILL.md`, "# prefix leak\n");
    fs.write(`${PROJ}/bundles/core/payload/agent-skills/orphan/SKILL.md`, "# orphan\n");
    fs.write(
      `${PROJ}/bundles/core/payload/agent-skills/group/ancestor-leak.txt`,
      "must not ship\n",
    );
    fs.write(`${PROJ}/bundles/core/payload/agent-skills/group/sibling/SKILL.md`, "# sibling\n");
    fs.write(
      `${PROJ}/bundles/core/payload/agent-skills/group/nested/SKILL.md`,
      "---\nname: nested\ndescription: Keep this nested skill.\n---\n# nested\n",
    );
    fs.write(`${PROJ}/bundles/core/payload/agent-skills/group/nested/assets/kept.txt`, "kept\n");
    fs.write(
      `${PROJ}/bundles/core/custom/moved-skill/entry.md`,
      "---\nname: moved\ndescription: Keep this moved skill.\n---\n# moved\n",
    );
    fs.write(`${PROJ}/bundles/core/custom/moved-skill/assets/icon.svg`, "<svg/>\n");
    fs.write(
      `${PROJ}/bundles/core/custom/moved-skill-sibling/SKILL.md`,
      "---\nname: moved-sibling\ndescription: not registered\n---\n# sibling\n",
    );
    fs.write(
      `${PROJ}/bundles/core/custom/unregistered/entry.md`,
      "---\nname: unregistered\ndescription: not registered\n---\n# unregistered custom\n",
    );

    // Non-payload-skill controls: installer skills and other payload categories retain their existing semantics.
    const skillLikeDocument =
      "---\nname: ordinary-doc\ndescription: Valid-looking frontmatter that is not a payload skill.\n---\n# ordinary\n";
    fs.write(`${PROJ}/bundles/core/installer-skills/helper/SKILL.md`, skillLikeDocument);
    fs.write(`${PROJ}/bundles/core/installer-scripts/manual/info.md`, skillLikeDocument);
    fs.write(`${PROJ}/bundles/core/payload/files/manual/info.md`, skillLikeDocument);
    fs.write(`${PROJ}/bundles/core/payload/templates/manual/info.md.tmpl`, skillLikeDocument);
    fs.write(`${PROJ}/bundles/core/docs/manual/info.md`, skillLikeDocument);
    fs.write(`${PROJ}/bundles/core/install-backlog/notes/info.md`, skillLikeDocument);
    fs.write(`${PROJ}/bundles/core/uninstall-backlog/notes/info.md`, skillLikeDocument);
    fs.write(`${PROJ}/bundles/core/backlog/notes/info.md`, skillLikeDocument);
    for (const scope of [".agents", ".claude", ".openclaw", ".cursor", ".gemini"]) {
      fs.write(`${PROJ}/bundles/core/${scope}/skills/info.md`, skillLikeDocument);
    }

    const files = plan(fs).shippable;
    expect(files).toEqual(
      expect.arrayContaining([
        "bundles/core/payload/agent-skills/kept/SKILL.md",
        "bundles/core/payload/agent-skills/kept/references/guide.md",
        "bundles/core/payload/agent-skills/kept/assets/prompt.tmpl",
        "bundles/core/custom/moved-skill/entry.md",
        "bundles/core/custom/moved-skill/assets/icon.svg",
        "bundles/core/payload/agent-skills/group/nested/SKILL.md",
        "bundles/core/payload/agent-skills/group/nested/assets/kept.txt",
        "bundles/core/installer-skills/helper/SKILL.md",
        "bundles/core/installer-scripts/manual/info.md",
        "bundles/core/payload/files/manual/info.md",
        "bundles/core/payload/templates/manual/info.md.tmpl",
        "bundles/core/docs/manual/info.md",
        "bundles/core/install-backlog/notes/info.md",
        "bundles/core/uninstall-backlog/notes/info.md",
        "bundles/core/backlog",
        "bundles/core/.claude/skills",
      ]),
    );
    expect(
      files.some((path) => path.startsWith("bundles/core/payload/agent-skills/kept-extra/")),
    ).toBe(false);
    expect(files.some((path) => path.startsWith("bundles/core/payload/agent-skills/orphan/"))).toBe(
      false,
    );
    expect(files).not.toContain("bundles/core/payload/agent-skills/group/ancestor-leak.txt");
    expect(
      files.some((path) => path.startsWith("bundles/core/payload/agent-skills/group/sibling/")),
    ).toBe(false);
    expect(files.some((path) => path.startsWith("bundles/core/custom/moved-skill-sibling/"))).toBe(
      false,
    );
    expect(files.some((path) => path.startsWith("bundles/core/custom/unregistered/"))).toBe(false);
    expect(files.some((path) => path.endsWith("/skills/info.md"))).toBe(false);
  });

  it("TASK-105 — payload-skill registration is isolated per enabled bundle", () => {
    const fs = seedBuildable();
    fs.write(
      `${PROJ}/manifest.yml`,
      "project:\n  name: demo\n  version: 1.2.3\ntargets:\n  - claude-code\nbundles:\n  - core\n  - other\n",
    );
    fs.write(
      `${PROJ}/bundles/core/bundle.yml`,
      "id: core\nversion: 0.1.0\nsummary: core\nconfirmation: safe\nrequires: {}\npayload:\n  skills:\n    - name: shared\n      path: payload/agent-skills/shared/SKILL.md\n",
    );
    fs.write(
      `${PROJ}/bundles/other/bundle.yml`,
      "id: other\nversion: 0.1.0\nsummary: other\nconfirmation: safe\nrequires: {}\n",
    );
    fs.write(
      `${PROJ}/bundles/core/payload/agent-skills/shared/SKILL.md`,
      "---\nname: shared\ndescription: Keep this shared skill.\n---\n# registered\n",
    );
    fs.write(
      `${PROJ}/bundles/other/payload/agent-skills/shared/SKILL.md`,
      "# same path, not registered\n",
    );

    const files = plan(fs).shippable;
    expect(files).toContain("bundles/core/payload/agent-skills/shared/SKILL.md");
    expect(files).not.toContain("bundles/other/payload/agent-skills/shared/SKILL.md");
  });

  it("TASK-105 — missing and invalid registered documents fail validation and authorize no package", () => {
    const fs = seedBuildable();
    fs.write(
      `${PROJ}/bundles/core/bundle.yml`,
      "id: core\nversion: 0.1.0\nsummary: core\nconfirmation: safe\nrequires: {}\npayload:\n  skills:\n    - name: missing\n      path: custom/missing/entry.md\n    - name: invalid\n      path: custom/invalid/entry.md\n",
    );
    fs.write(`${PROJ}/bundles/core/custom/missing/assets/leak.txt`, "must not ship\n");
    fs.write(`${PROJ}/bundles/core/custom/invalid/entry.md`, "# no frontmatter\n");
    fs.write(`${PROJ}/bundles/core/custom/invalid/assets/leak.txt`, "must not ship\n");

    const result = plan(fs);
    expect(result.ok).toBe(false);
    const messages = result.validation.problems.map((problem) => problem.message).join("\n");
    expect(messages).toContain('registered payload skill "missing" is missing');
    expect(messages).toContain('registered payload skill "invalid" is invalid');
    expect(result.shippable.some((path) => path.startsWith("bundles/core/custom/missing/"))).toBe(
      false,
    );
    expect(result.shippable.some((path) => path.startsWith("bundles/core/custom/invalid/"))).toBe(
      false,
    );
  });
});

/** Build an `AgentName[]` from raw kebab strings (the model's only constructor). */
function agents(...names: string[]): AgentName[] {
  return names.map((n) => {
    const parsed = parseAgentName(n);
    if (!parsed.ok) throw new Error(`bad test agent name: ${n}`);
    return parsed.value;
  });
}

/** Build branded bundle ids through the model's public parser. */
function bundles(...ids: string[]): BundleId[] {
  return ids.map((id) => {
    const parsed = parseBundleId(id);
    if (!parsed.ok) throw new Error(`bad test bundle id: ${id}`);
    return parsed.value;
  });
}

describe("computeFrontDoorTransforms (pure front-door strip policy — task-90)", () => {
  it("strips the ROOT `_AGENTS.md` to `AGENTS.md` and adds the CLAUDE.md alias for claude-code", () => {
    const transforms = computeFrontDoorTransforms(
      ["_AGENTS.md", "manifest.yml", "README.md"],
      agents("claude-code"),
    );
    expect(transforms).toEqual([{ from: "_AGENTS.md", to: "AGENTS.md", aliases: ["CLAUDE.md"] }]);
  });

  it("handles the per-bundle front door too (root + each bundle), in shippable order", () => {
    const transforms = computeFrontDoorTransforms(
      ["_AGENTS.md", "bundles/core/_AGENTS.md", "bundles/web/_AGENTS.md", "manifest.yml"],
      agents("claude-code"),
    );
    expect(transforms).toEqual([
      { from: "_AGENTS.md", to: "AGENTS.md", aliases: ["CLAUDE.md"] },
      {
        from: "bundles/core/_AGENTS.md",
        to: "bundles/core/AGENTS.md",
        aliases: ["bundles/core/CLAUDE.md"],
      },
      {
        from: "bundles/web/_AGENTS.md",
        to: "bundles/web/AGENTS.md",
        aliases: ["bundles/web/CLAUDE.md"],
      },
    ]);
  });

  it("maps each target to its front-door filename (claude-code→CLAUDE.md, gemini→GEMINI.md), de-duplicated", () => {
    const transforms = computeFrontDoorTransforms(
      ["_AGENTS.md"],
      agents("claude-code", "gemini", "claude-code"),
    );
    expect(transforms).toEqual([
      { from: "_AGENTS.md", to: "AGENTS.md", aliases: ["CLAUDE.md", "GEMINI.md"] },
    ]);
  });

  it("creates NO alias for agents that read AGENTS.md natively (codex/hermes/openclaw)", () => {
    const transforms = computeFrontDoorTransforms(
      ["_AGENTS.md"],
      agents("codex", "hermes", "openclaw"),
    );
    expect(transforms).toEqual([{ from: "_AGENTS.md", to: "AGENTS.md", aliases: [] }]);
  });

  it("matches ONLY the exact `_AGENTS.md` basename — never `_AGENTS.md.tmpl` or a canonical `AGENTS.md`", () => {
    const transforms = computeFrontDoorTransforms(
      [
        "AGENTS.md", // canonical (not reserved) — left alone
        "bundles/bundle-template/_AGENTS.md.tmpl", // the scaffold template — not a front door
        "docs/_AGENTS.md.extra", // not the exact basename
        "manifest.yml",
      ],
      agents("claude-code"),
    );
    expect(transforms).toEqual([]);
  });

  it("returns nothing when there are no front doors to transform", () => {
    expect(computeFrontDoorTransforms(["manifest.yml"], agents("claude-code"))).toEqual([]);
  });
});

describe("computeScopeAliasTransforms (TASK-128 portable release aliases)", () => {
  it("projects exact root and enabled-bundle paths from targets and de-duplicates shared scopes", () => {
    expect(
      computeScopeAliasTransforms(agents("codex", "hermes", "claude-code"), bundles("core", "web")),
    ).toEqual([
      { linkPath: ".agents/skills", aliasTo: "installer-skills" },
      { linkPath: "bundles/core/.agents/skills", aliasTo: "bundles/core/installer-skills" },
      { linkPath: "bundles/web/.agents/skills", aliasTo: "bundles/web/installer-skills" },
      { linkPath: ".claude/skills", aliasTo: "installer-skills" },
      { linkPath: "bundles/core/.claude/skills", aliasTo: "bundles/core/installer-skills" },
      { linkPath: "bundles/web/.claude/skills", aliasTo: "bundles/web/installer-skills" },
    ]);
  });

  it("adds only manifest-target aliases to the final dry-run layout and prunes stale source scopes", () => {
    const fs = seedBuildable();
    const stale = [
      ".agents/skills/stale.md",
      ".openclaw/skills/stale.md",
      "bundles/core/.agents/skills/stale.md",
      "bundles/disabled/.claude/skills/stale.md",
    ];
    for (const path of stale) fs.write(`${PROJ}/${path}`, "absolute-authoring-source-sentinel\n");

    const result = plan(fs);
    expect(result.scopeAliases).toEqual([
      { linkPath: ".claude/skills", aliasTo: "installer-skills" },
      { linkPath: "bundles/core/.claude/skills", aliasTo: "bundles/core/installer-skills" },
    ]);
    expect(result.shippable).toEqual(
      expect.arrayContaining([".claude/skills", "bundles/core/.claude/skills"]),
    );
    expect(result.shippable.filter((path) => path.includes("/skills/"))).toEqual([]);
    expect(result.shippable.some((path) => path.includes("bundles/disabled"))).toBe(false);
    expect(result.shippable.some((path) => path.startsWith(".agents"))).toBe(false);
    expect(result.shippable.some((path) => path.startsWith(".openclaw"))).toBe(false);
  });
});
