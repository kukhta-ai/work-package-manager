import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { ConflictError, NotFoundError } from "../../../src/core/errors.js";
import { perBundleAuthoringTasks } from "../../../src/core/operations/create-bundle.js";
import { makeArtefactDeriver } from "../../../src/core/operations/derive-artefacts-capability.js";
import {
  initProject,
  projectWideAuthoringTasks,
} from "../../../src/core/operations/init-project.js";
import { parseManifest } from "../../../src/core/services/schema/index.js";
import { parseYaml } from "../../../src/util/yaml.js";

/**
 * Unit test for the `initProject` operation (task-87) over the IN-MEMORY ports — the pure-core half of the
 * `wpm init` command. It mirrors the REAL `templates/` tree into a `MemoryFileSystem` (so it runs against the
 * genuine authored `minimal` project template + `default` bundle template) and a `FakeBacklog`, then drives
 * `initProject` directly (no commander, no real fs). The real-disk end-to-end is `test/integration/cli.init.test.ts`.
 *
 * Task-87 reshapes `init` to scaffold an **authoring workspace** (docs 06/10/11/12): `targetDir` is the
 * WORKSPACE ROOT (authoring front door + `.authoring-backlog/`), the deliverable skeleton nests under `wip/`,
 * and the empty build-output dir is `builds/`.
 */

const REAL_TEMPLATES = fileURLToPath(new URL("../../../templates", import.meta.url));
const BUILTIN = "/builtin-templates";
const TARGET = "/proj"; // the WORKSPACE ROOT
const WIP = `${TARGET}/wip`; // the deliverable subdir

/** Mirror the real `templates/` tree into a fresh MemoryFileSystem at {@link BUILTIN}. */
function seedTemplates(): MemoryFileSystem {
  const fs = new MemoryFileSystem();
  const mirror = (srcDir: string, destDir: string): void => {
    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
      const src = join(srcDir, entry.name);
      const dest = `${destDir}/${entry.name}`;
      if (entry.isDirectory()) mirror(src, dest);
      else fs.write(dest, readFileSync(src, "utf8"));
    }
  };
  mirror(REAL_TEMPLATES, BUILTIN);
  return fs;
}

function deps(fs: MemoryFileSystem, backlog: FakeBacklog) {
  return { fs, backlog, builtinTemplatesRoot: BUILTIN };
}

/** Collect every file path under `dir` in the MemoryFileSystem. */
function filesUnder(fs: MemoryFileSystem, dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of fs.list(d)) {
      const child = `${d}/${entry.name}`;
      if (entry.kind === "directory") walk(child);
      else out.push(child);
    }
  };
  walk(dir);
  return out;
}

describe("initProject — scaffolds an authoring workspace (task-87; docs 06/10/11/12)", () => {
  it("AC#1 — workspace root holds the authoring front door + authoring backlog; deliverable lives under wip/", () => {
    const fs = seedTemplates();
    const backlog = new FakeBacklog();
    const result = initProject(deps(fs, backlog), { targetDir: TARGET, name: "hermes-handoff" });

    // The WORKSPACE ROOT keeps only the authoring surface:
    expect(fs.exists(`${TARGET}/AGENTS.md`)).toBe(true); // authoring front door
    expect(fs.exists(`${TARGET}/.authoring-backlog`)).toBe(true); // authoring backlog

    // The DELIVERABLE skeleton nests under wip/ — the copied files/ artefacts:
    expect(fs.exists(`${WIP}/manifest.yml`)).toBe(true);
    expect(fs.exists(`${WIP}/README.md`)).toBe(true);
    expect(fs.exists(`${WIP}/RALPH-LOOP.md`)).toBe(true);
    expect(
      fs.exists(`${WIP}/installer-skills/hermes-handoff-installer/references/journaling.md`),
    ).toBe(true);

    // AC#1 — the default bundle template is materialised at wip/bundles/bundle-template/:
    expect(fs.exists(`${WIP}/bundles/bundle-template`)).toBe(true);
    expect(fs.exists(`${WIP}/bundles/bundle-template/_AGENTS.md.tmpl`)).toBe(true);
    // The scaffold keeps its placeholders (a template-of-a-template; bundle new fills them):
    expect(fs.read(`${WIP}/bundles/bundle-template/_AGENTS.md.tmpl`)).toMatch(/\{\{bundle-id\}\}/);

    // AC#1 — the empty registries exist as directories under wip/:
    expect(fs.exists(`${WIP}/installer-skills`)).toBe(true);
    expect(fs.exists(`${WIP}/templates`)).toBe(true);

    // The manifest parses with the substituted name + empty lists (minimal declares neither targets nor bundles):
    const manifest = parseManifest(parseYaml(fs.read(`${WIP}/manifest.yml`)));
    expect(manifest.ok).toBe(true);
    if (manifest.ok) {
      expect(manifest.value.meta.name).toBe("hermes-handoff");
      expect(manifest.value.bundles).toEqual([]);
      expect(manifest.value.targets).toEqual([]);
    }

    // The result is observable: summary + changed paths + the materialised project-wide set:
    expect(result.summary).toBe(
      `created authoring workspace hermes-handoff at ${TARGET} (deliverable under wip/)`,
    );
    expect(result.changedPaths).toContain(`${TARGET}/AGENTS.md`);
    expect(result.changedPaths).toContain(`${TARGET}/.authoring-backlog`);
    expect(result.materialisedTaskTitles).toHaveLength(8);
  });

  it("AC#2 — an EMPTY build-output directory (builds/) exists at the workspace root", () => {
    const fs = seedTemplates();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "hermes-handoff" });
    expect(fs.exists(`${TARGET}/builds`)).toBe(true);
    expect(fs.list(`${TARGET}/builds`)).toEqual([]); // empty
  });

  it("AC#3 — the workspace .gitignore excludes BOTH the authoring backlog AND builds/", () => {
    const fs = seedTemplates();
    const result = initProject(deps(fs, new FakeBacklog()), {
      targetDir: TARGET,
      name: "hermes-handoff",
    });
    expect(fs.exists(`${TARGET}/.gitignore`)).toBe(true);
    const gitignore = fs.read(`${TARGET}/.gitignore`);
    expect(gitignore).toMatch(/^\.authoring-backlog\/$/m);
    expect(gitignore).toMatch(/^builds\/$/m);
    expect(result.changedPaths).toContain(`${TARGET}/.gitignore`);
  });

  it("AC#4 — the authoring front door addresses the AUTHORING agent (author wip/, not install)", () => {
    const fs = seedTemplates();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "hermes-handoff" });

    const authoring = fs.read(`${TARGET}/AGENTS.md`);
    expect(authoring).toContain("hermes-handoff"); // {{project-name}} substituted
    expect(authoring.toLowerCase()).toContain("authoring agent"); // its stance
    expect(authoring).toContain("wip/"); // points at the deliverable subdir
    expect(authoring).toContain(".authoring-backlog"); // points at the authoring backlog
    // It must NOT adopt the executor's stance (that is the wip/_AGENTS.md front door's job):
    expect(authoring.toLowerCase()).not.toContain("executing agent");

    // A CLAUDE.md alias points at the authoring front door:
    expect(fs.aliasTarget(`${TARGET}/CLAUDE.md`)).toBe(`${TARGET}/AGENTS.md`);
  });

  it("AC#8 — wip/ has the rendered installer skill + the executor front door under the reserved prefix", () => {
    const fs = seedTemplates();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "hermes-handoff" });

    // The rendered per-project installer skill (substituted):
    const orchestrator = fs.read(`${WIP}/installer-skills/hermes-handoff-installer/SKILL.md`);
    expect(orchestrator).toContain("hermes-handoff-installer");

    // The executor front door is author-owned, under the reserved build-stripped prefix (NOT the canonical name):
    expect(fs.exists(`${WIP}/_AGENTS.md`)).toBe(true);
    expect(fs.exists(`${WIP}/AGENTS.md`)).toBe(false);
    const executor = fs.read(`${WIP}/_AGENTS.md`);
    expect(executor).toContain("hermes-handoff"); // {{project-name}} substituted
    expect(executor.toLowerCase()).toContain("install"); // it addresses the EXECUTOR
  });

  it("the produced files are fully substituted; only the bundle-template scaffold keeps its placeholders", () => {
    const fs = seedTemplates();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "hermes-handoff" });

    // No file OUTSIDE the bundle-template scaffold has an unresolved {{…}} marker. The scaffold at
    // wip/bundles/bundle-template/ is a template-of-a-template and DELIBERATELY keeps its placeholders.
    const scaffold = `${WIP}/bundles/bundle-template`;
    for (const path of filesUnder(fs, TARGET)) {
      if (path.startsWith(`${scaffold}/`)) continue;
      expect(path, `marker in produced path ${path}`).not.toMatch(/\{\{[^}]*\}\}/);
      expect(fs.read(path), `marker in produced file ${path}`).not.toMatch(/\{\{[^}]*\}\}/);
    }
  });

  it("AC#1 — no scope-aliases are created when the template declares no targets (minimal)", () => {
    const fs = seedTemplates();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "hermes-handoff" });
    // minimal declares `targets: []`, so the alias plan is empty — no .claude/skills etc. under wip/.
    expect(fs.exists(`${WIP}/.claude/skills`)).toBe(false);
    expect(fs.exists(`${WIP}/.agents/skills`)).toBe(false);
    expect(fs.aliasTarget(`${WIP}/.claude/skills`)).toBeUndefined();
  });

  it("AC#7 — the project-wide authoring task set (8) is materialised into the workspace-root .authoring-backlog", () => {
    const fs = seedTemplates();
    const backlog = new FakeBacklog();
    const result = initProject(deps(fs, backlog), { targetDir: TARGET, name: "hermes-handoff" });

    const titles = backlog.listTasks(`${TARGET}/.authoring-backlog`).map((t) => t.title);
    for (const spec of projectWideAuthoringTasks()) {
      expect(titles).toContain(spec.title);
    }
    expect(titles).toHaveLength(8);
    expect(result.materialisedTaskTitles).toEqual(titles);
    // minimal pre-includes no bundles, so NO per-bundle set is materialised (only the project-wide 8):
    expect(titles).not.toContain("Plan bundle ");
  });

  it("AC#7 — exercises the BacklogMd port: .authoring-backlog has task_prefix=authoring (project-wide tasks → authoring-1..8)", () => {
    const fs = seedTemplates();
    const backlog = new FakeBacklog();
    initProject(deps(fs, backlog), { targetDir: TARGET, name: "hermes-handoff" });

    // The 8 project-wide tasks consumed authoring-1..8; the NEXT created task is authoring-9 (proving the
    // task_prefix is `authoring` and the materialise really ran against this root).
    const created = backlog.createTask(`${TARGET}/.authoring-backlog`, { title: "probe" });
    expect(created.id).toBe("authoring-9");
  });

  it("AC#6 — --param values are available to placeholder substitution (extra params are harmless for minimal)", () => {
    const fs = seedTemplates();
    // minimal's files only reference {{project-name}}; an extra --param must not break the render (it is simply
    // unreferenced), proving the param map threads through renderTree.
    expect(() =>
      initProject(deps(fs, new FakeBacklog()), {
        targetDir: TARGET,
        name: "hermes-handoff",
        params: new Map([["author", "me"]]),
      }),
    ).not.toThrow();
    expect(fs.exists(`${WIP}/manifest.yml`)).toBe(true);
  });

  it("AC#5 — refuses when the target PATH already exists (ConflictError), creating nothing", () => {
    const fs = seedTemplates();
    // Pre-create the target path (not necessarily a project — any existing path triggers the refusal).
    fs.makeDirectories(TARGET);
    fs.write(`${TARGET}/some-existing-file`, "x");
    const backlog = new FakeBacklog();
    expect(() =>
      initProject(deps(fs, backlog), { targetDir: TARGET, name: "hermes-handoff" }),
    ).toThrow(ConflictError);
    // Nothing was scaffolded over the existing path:
    expect(fs.exists(`${WIP}/manifest.yml`)).toBe(false);
    expect(fs.exists(`${WIP}`)).toBe(false);
    expect(fs.exists(`${TARGET}/builds`)).toBe(false);
  });

  it("AC#5 — re-running init on an existing workspace refuses and does not change the manifest", () => {
    const fs = seedTemplates();
    const backlog = new FakeBacklog();
    initProject(deps(fs, backlog), { targetDir: TARGET, name: "hermes-handoff" });
    const manifestBefore = fs.read(`${WIP}/manifest.yml`);

    expect(() => initProject(deps(fs, backlog), { targetDir: TARGET, name: "other" })).toThrow(
      ConflictError,
    );
    expect(fs.read(`${WIP}/manifest.yml`)).toBe(manifestBefore); // unchanged
  });

  it("raises NotFoundError when the chosen project template is missing", () => {
    const fs = new MemoryFileSystem(); // no templates seeded
    expect(() =>
      initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "x" }),
    ).toThrow(NotFoundError);
  });

  it("raises NotFoundError when an explicit --template does not resolve", () => {
    const fs = seedTemplates();
    expect(() =>
      initProject(deps(fs, new FakeBacklog()), {
        targetDir: TARGET,
        name: "x",
        templateName: "does-not-exist",
      }),
    ).toThrow(NotFoundError);
    // nothing created:
    expect(fs.exists(`${WIP}/manifest.yml`)).toBe(false);
  });

  it("changedPaths lists every produced path (the observability contract the command's formatResult uses)", () => {
    const fs = seedTemplates();
    const result = initProject(deps(fs, new FakeBacklog()), {
      targetDir: TARGET,
      name: "hermes-handoff",
    });
    const expected = [
      `${WIP}/manifest.yml`,
      `${WIP}/README.md`,
      `${WIP}/RALPH-LOOP.md`,
      `${WIP}/_AGENTS.md`,
      `${WIP}/installer-skills/hermes-handoff-installer/SKILL.md`,
      `${WIP}/installer-skills/hermes-handoff-installer/references/journaling.md`,
      `${WIP}/bundles/bundle-template/_AGENTS.md.tmpl`,
      `${TARGET}/AGENTS.md`,
      `${TARGET}/CLAUDE.md`,
      `${TARGET}/builds`,
      `${TARGET}/.authoring-backlog`,
      `${TARGET}/.gitignore`,
    ];
    for (const path of expected) {
      expect(result.changedPaths, `changedPaths must list ${path}`).toContain(path);
    }
    // No path is listed twice (the de-dup guards):
    expect(new Set(result.changedPaths).size).toBe(result.changedPaths.length);
  });

  it("single-source: the executor front door `init` writes is byte-identical to the deriver's output", () => {
    // `init` and every later mutation render the executor front-door + orchestrator from the SAME snippets/
    // source via the deriver. So what `init` writes to wip/_AGENTS.md must equal what the deriver yields for
    // AGENTS.md, and the orchestrator under wip/ must equal the deriver's.
    const fs = seedTemplates();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "hermes-handoff" });

    const deriver = makeArtefactDeriver({
      fs,
      builtinTemplatesRoot: BUILTIN,
      projectTemplatesRoot: `${WIP}/templates`,
      projectTemplateName: "minimal",
    });
    const desired = deriver({
      rootPath: WIP,
      manifest: {
        meta: { name: "hermes-handoff", version: "0.1.0" as never },
        targets: [],
        bundles: [],
        installerSkills: [],
      },
      bundles: new Map(),
    });
    const derivedFrontDoor = desired.files.find((f) => f.path === "AGENTS.md");
    const derivedOrch = desired.files.find((f) => f.path.endsWith("-installer/SKILL.md"));
    expect(derivedFrontDoor).toBeDefined();
    expect(derivedOrch).toBeDefined();
    expect(fs.read(`${WIP}/_AGENTS.md`)).toBe(derivedFrontDoor?.content);
    expect(fs.read(`${WIP}/installer-skills/hermes-handoff-installer/SKILL.md`)).toBe(
      derivedOrch?.content,
    );
  });
});

describe("initProject — honors a template that DECLARES targets / pre-includes bundles (AC#1 +, AC#7 +)", () => {
  /**
   * Turn the seeded built-in `minimal` template into one that DECLARES a target (`claude-code`) and pre-includes
   * a bundle (`core`) in its rendered manifest, plus ships that bundle's `bundle.yml` under the template's
   * `files/bundles/core/`. This exercises the POSITIVE alias case (an alias per declared target, under wip/) and
   * the per-bundle authoring case (the per-bundle set for each pre-included bundle) — which `minimal` cannot,
   * since it declares neither. (No such built-in template ships today; this fixture proves the code path.)
   */
  function seedTemplateWithTargetAndBundle(): MemoryFileSystem {
    const fs = seedTemplates();
    // Overwrite the minimal manifest snippet to declare a target + a pre-included bundle.
    fs.write(
      `${BUILTIN}/project/minimal/files/manifest.yml.tmpl`,
      [
        "project:",
        "  name: {{project-name}}",
        "  version: 0.1.0",
        "targets:",
        "  - claude-code",
        "bundles:",
        "  - core",
        "",
      ].join("\n"),
    );
    // Ship the pre-included bundle's bundle.yml in the template's files/ (so buildProjection can load it). The
    // installer-skills/ dir makes the per-bundle alias target non-broken.
    fs.write(
      `${BUILTIN}/project/minimal/files/bundles/core/bundle.yml`,
      "id: core\nversion: 0.1.0\nsummary: core bundle\nconfirmation: safe\nrequires: {}\n",
    );
    fs.write(`${BUILTIN}/project/minimal/files/bundles/core/installer-skills/.keep`, "");
    return fs;
  }

  it("AC#1 + — creates one scope-alias per declared target under wip/ (root + per pre-included bundle)", () => {
    const fs = seedTemplateWithTargetAndBundle();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "demo" });

    // The root scope-alias for claude-code under wip/ (.claude/skills → installer-skills/):
    expect(fs.aliasTarget(`${WIP}/.claude/skills`)).toBe(`${WIP}/installer-skills`);
    // The per-bundle scope-alias (self-similar surface) for the pre-included bundle:
    expect(fs.aliasTarget(`${WIP}/bundles/core/.claude/skills`)).toBe(
      `${WIP}/bundles/core/installer-skills`,
    );
  });

  it("AC#7 + — materialises the project-wide set AND the per-bundle set for each pre-included bundle", () => {
    const fs = seedTemplateWithTargetAndBundle();
    const backlog = new FakeBacklog();
    const result = initProject(deps(fs, backlog), { targetDir: TARGET, name: "demo" });

    const titles = backlog.listTasks(`${TARGET}/.authoring-backlog`).map((t) => t.title);
    // The project-wide set (8) is present:
    for (const spec of projectWideAuthoringTasks()) {
      expect(titles).toContain(spec.title);
    }
    // AND the per-bundle set for `core` (12 with the advisor) is present — identities UNCHANGED:
    for (const spec of perBundleAuthoringTasks("core", { advisor: true })) {
      expect(titles).toContain(spec.title);
    }
    // 8 project-wide + 12 per-bundle = 20 materialised (titles are disjoint here):
    expect(result.materialisedTaskTitles).toHaveLength(20);
  });
});

describe("projectWideAuthoringTasks (doc 11 §3 — Materialised by `wpm init`)", () => {
  it("returns the 8 project-wide task titles, each with at least one acceptance criterion", () => {
    const tasks = projectWideAuthoringTasks();
    expect(tasks).toHaveLength(8);
    const titles = tasks.map((t) => t.title);
    expect(titles).toEqual([
      "Set project metadata",
      "Confirm target agents",
      "Verify manifest coherence",
      "Verify scope-alias symlinks",
      "Verify AGENTS.md and main installer skill are current",
      "Verify helpers and advisors registered",
      "Bump project release version",
      "Build dry-run",
    ]);
    for (const t of tasks) {
      expect(t.acceptanceCriteria.length).toBeGreaterThan(0);
    }
  });
});
