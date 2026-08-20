import { describe, expect, it } from "vitest";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import type { AgentName } from "../../../src/core/model/index.js";
import { parseAgentName } from "../../../src/core/model/index.js";
import {
  computeBuildPlan,
  computeFrontDoorTransforms,
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
    enabledBundleIds: project.manifest.bundles,
    bundleDirectoryNames: bundleDirNames(fs),
  });
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
    const files = shippableFiles(fs, PROJ, ["core"]);
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
    const files = shippableFiles(fs, PROJ, ["core"]);
    expect(files.some((f) => f.startsWith(".git/"))).toBe(false);
    expect(files.some((f) => f.startsWith("node_modules/"))).toBe(false);
    expect(files.some((f) => f.startsWith("dist/"))).toBe(false);
  });

  it("EXCLUDES disabled bundles, the authoring-only bundle-template scaffold, and unresolved builder templates", () => {
    const fs = seedBuildable();
    // A disabled bundle dir (on disk, NOT in enabledBundleIds), a file-like direct child that models how the
    // real adapter reports a symlink, the authoring-only scaffold, and a stray builder-template source. A real
    // nested payload template remains shippable because its `.tmpl` suffix is part of the runtime payload
    // contract, not an unresolved builder placeholder.
    fs.write(`${PROJ}/bundles/disabled-one/bundle.yml`, "id: disabled-one\nversion: 0.1.0\n");
    fs.write(`${PROJ}/bundles/orphan-link`, "../outside-bundle");
    fs.write(`${PROJ}/bundles/bundle-template/AGENTS.md.tmpl`, "# {{bundle-id}}\n");
    fs.write(`${PROJ}/README.md.tmpl`, "# unresolved builder source\n");
    fs.write(`${PROJ}/bundles/core/payload/templates/nested/runtime.conf.tmpl`, "port={{port}}\n");
    const files = shippableFiles(fs, PROJ, ["core"]);
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
    const files = shippableFiles(fs, PROJ, ["core"]);
    expect([...files]).toEqual([...files].sort());
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
