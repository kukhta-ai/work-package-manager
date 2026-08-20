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
 * Unit test for the FULL `initProject` operation (task-34) over the IN-MEMORY ports — the pure-core half of the
 * `wpm init` command. It mirrors the REAL `templates/` tree into a `MemoryFileSystem` (so it runs against the
 * genuine authored `minimal` project template + `default` bundle template) and a `FakeBacklog`, then drives
 * `initProject` directly (no commander, no real fs). The real-disk end-to-end is `test/integration/cli.init.test.ts`.
 *
 * This supersedes the task-33 walking-skeleton unit test: the skeleton deliberately did the smallest slice (no
 * `bundles/`, no aliases, no materialise, no `.gitignore`); the full command does all 12 doc-10:137 steps.
 */

const REAL_TEMPLATES = fileURLToPath(new URL("../../../templates", import.meta.url));
const BUILTIN = "/builtin-templates";
const TARGET = "/proj";

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

describe("initProject — the FULL bootstrap operation (task-34; doc 10 init steps 1–12)", () => {
  it("AC#1 — produces the project root: manifest, bundles/bundle-template/, empty dirs, derived artefacts", () => {
    const fs = seedTemplates();
    const backlog = new FakeBacklog();
    const result = initProject(deps(fs, backlog), { targetDir: TARGET, name: "hermes-handoff" });

    // The copied files/ artefacts:
    expect(fs.exists(`${TARGET}/manifest.yml`)).toBe(true);
    expect(fs.exists(`${TARGET}/README.md`)).toBe(true);
    expect(fs.exists(`${TARGET}/RALPH-LOOP.md`)).toBe(true);
    expect(
      fs.exists(`${TARGET}/installer-skills/hermes-handoff-installer/references/journaling.md`),
    ).toBe(true);
    // The DERIVED artefacts, rendered from snippets/ (the single source) and written by step 8:
    expect(fs.exists(`${TARGET}/AGENTS.md`)).toBe(true);
    expect(fs.exists(`${TARGET}/installer-skills/hermes-handoff-installer/SKILL.md`)).toBe(true);

    // AC#1 — the default bundle template is materialised at bundles/bundle-template/ (step 5):
    expect(fs.exists(`${TARGET}/bundles/bundle-template`)).toBe(true);
    expect(fs.exists(`${TARGET}/bundles/bundle-template/AGENTS.md.tmpl`)).toBe(true);
    // The scaffold keeps its placeholders (a template-of-a-template; bundle new fills them):
    expect(fs.read(`${TARGET}/bundles/bundle-template/AGENTS.md.tmpl`)).toMatch(
      /\{\{bundle-id\}\}/,
    );

    // AC#1 — the empty registries exist as directories (installer-skills/, templates/, .authoring-backlog/):
    expect(fs.exists(`${TARGET}/installer-skills`)).toBe(true);
    expect(fs.exists(`${TARGET}/templates`)).toBe(true);
    expect(fs.exists(`${TARGET}/.authoring-backlog`)).toBe(true);

    // The manifest parses with the substituted name + empty lists (minimal declares neither targets nor bundles):
    const manifest = parseManifest(parseYaml(fs.read(`${TARGET}/manifest.yml`)));
    expect(manifest.ok).toBe(true);
    if (manifest.ok) {
      expect(manifest.value.meta.name).toBe("hermes-handoff");
      expect(manifest.value.bundles).toEqual([]);
      expect(manifest.value.targets).toEqual([]);
    }

    // The result is observable: summary + changed paths + the materialised project-wide set (AC#4):
    expect(result.summary).toBe(`created project hermes-handoff at ${TARGET}`);
    expect(result.changedPaths).toContain(`${TARGET}/AGENTS.md`);
    expect(result.changedPaths).toContain(`${TARGET}/.authoring-backlog`);
    expect(result.materialisedTaskTitles).toHaveLength(8);
  });

  it("AC#2 — the front-door + orchestrator are fully substituted; the scaffold keeps its placeholders", () => {
    const fs = seedTemplates();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "hermes-handoff" });

    const frontDoor = fs.read(`${TARGET}/AGENTS.md`);
    expect(frontDoor).toContain("hermes-handoff"); // {{project-name}} substituted
    expect(frontDoor.toLowerCase()).toContain("install"); // the doc-07 recognition reframing
    const orchestrator = fs.read(`${TARGET}/installer-skills/hermes-handoff-installer/SKILL.md`);
    expect(orchestrator).toContain("hermes-handoff-installer");

    // No file OUTSIDE the bundle-template scaffold has an unresolved {{…}} marker. The scaffold at
    // bundles/bundle-template/ is a template-of-a-template and DELIBERATELY keeps its placeholders, so it is
    // excluded from the no-markers check (bundle new fills them).
    const scaffold = `${TARGET}/bundles/bundle-template`;
    for (const path of filesUnder(fs, TARGET)) {
      if (path.startsWith(`${scaffold}/`)) continue;
      expect(path, `marker in produced path ${path}`).not.toMatch(/\{\{[^}]*\}\}/);
      expect(fs.read(path), `marker in produced file ${path}`).not.toMatch(/\{\{[^}]*\}\}/);
    }
  });

  it("AC#3 — no scope-aliases are created when the template declares no targets (minimal)", () => {
    const fs = seedTemplates();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "hermes-handoff" });
    // minimal declares `targets: []`, so the alias plan is empty — no .claude/skills etc.
    expect(fs.exists(`${TARGET}/.claude/skills`)).toBe(false);
    expect(fs.exists(`${TARGET}/.agents/skills`)).toBe(false);
    expect(fs.aliasTarget(`${TARGET}/.claude/skills`)).toBeUndefined();
  });

  it("AC#4 — the project-wide authoring task set (8) is materialised into .authoring-backlog", () => {
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

  it("AC#1 — exercises the BacklogMd port: .authoring-backlog has task_prefix=authoring (project-wide tasks → authoring-1..8)", () => {
    const fs = seedTemplates();
    const backlog = new FakeBacklog();
    initProject(deps(fs, backlog), { targetDir: TARGET, name: "hermes-handoff" });

    // The 8 project-wide tasks consumed authoring-1..8; the NEXT created task is authoring-9 (proving the
    // task_prefix is `authoring` and the materialise really ran against this root).
    const created = backlog.createTask(`${TARGET}/.authoring-backlog`, { title: "probe" });
    expect(created.id).toBe("authoring-9");
  });

  it("AC#7 — .gitignore records .authoring-backlog/ and a summary is returned", () => {
    const fs = seedTemplates();
    const result = initProject(deps(fs, new FakeBacklog()), {
      targetDir: TARGET,
      name: "hermes-handoff",
    });
    expect(fs.exists(`${TARGET}/.gitignore`)).toBe(true);
    expect(fs.read(`${TARGET}/.gitignore`)).toMatch(/^\.authoring-backlog\/$/m);
    expect(result.changedPaths).toContain(`${TARGET}/.gitignore`);
    expect(result.summary).toContain("created project hermes-handoff");
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
    expect(fs.exists(`${TARGET}/manifest.yml`)).toBe(true);
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
    expect(fs.exists(`${TARGET}/manifest.yml`)).toBe(false);
    expect(fs.exists(`${TARGET}/bundles`)).toBe(false);
  });

  it("AC#5 — re-running init on an existing project refuses and does not change the manifest", () => {
    const fs = seedTemplates();
    const backlog = new FakeBacklog();
    initProject(deps(fs, backlog), { targetDir: TARGET, name: "hermes-handoff" });
    const manifestBefore = fs.read(`${TARGET}/manifest.yml`);

    expect(() => initProject(deps(fs, backlog), { targetDir: TARGET, name: "other" })).toThrow(
      ConflictError,
    );
    expect(fs.read(`${TARGET}/manifest.yml`)).toBe(manifestBefore); // unchanged
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
    expect(fs.exists(`${TARGET}/manifest.yml`)).toBe(false);
  });

  it("changedPaths lists every produced path (the observability contract the command's formatResult uses)", () => {
    const fs = seedTemplates();
    const result = initProject(deps(fs, new FakeBacklog()), {
      targetDir: TARGET,
      name: "hermes-handoff",
    });
    const expected = [
      `${TARGET}/manifest.yml`,
      `${TARGET}/README.md`,
      `${TARGET}/RALPH-LOOP.md`,
      `${TARGET}/AGENTS.md`,
      `${TARGET}/installer-skills/hermes-handoff-installer/SKILL.md`,
      `${TARGET}/installer-skills/hermes-handoff-installer/references/journaling.md`,
      `${TARGET}/bundles/bundle-template/AGENTS.md.tmpl`,
      `${TARGET}/.authoring-backlog`,
      `${TARGET}/.gitignore`,
    ];
    for (const path of expected) {
      expect(result.changedPaths, `changedPaths must list ${path}`).toContain(path);
    }
    // No path is listed twice (the de-dup guards):
    expect(new Set(result.changedPaths).size).toBe(result.changedPaths.length);
  });

  it("single-source: the front-door `init` writes is byte-identical to the deriver's output", () => {
    // `init` and every later mutation render the front-door + orchestrator from the SAME snippets/ source via
    // the deriver. So what `init` writes must equal what `makeArtefactDeriver` yields.
    const fs = seedTemplates();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "hermes-handoff" });

    const deriver = makeArtefactDeriver({
      fs,
      builtinTemplatesRoot: BUILTIN,
      projectTemplatesRoot: `${TARGET}/templates`,
      projectTemplateName: "minimal",
    });
    const desired = deriver({
      rootPath: TARGET,
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
    expect(fs.read(`${TARGET}/AGENTS.md`)).toBe(derivedFrontDoor?.content);
    expect(fs.read(`${TARGET}/installer-skills/hermes-handoff-installer/SKILL.md`)).toBe(
      derivedOrch?.content,
    );
  });
});

describe("initProject — honors a template that DECLARES targets / pre-includes bundles (AC#3 +, AC#4 +)", () => {
  /**
   * Turn the seeded built-in `minimal` template into one that DECLARES a target (`claude-code`) and pre-includes
   * a bundle (`core`) in its rendered manifest, plus ships that bundle's `bundle.yml` under the template's
   * `files/bundles/core/`. This exercises the AC#3 POSITIVE case (an alias per declared target) and the AC#4
   * per-bundle case (the per-bundle authoring set for each pre-included bundle) — which `minimal` cannot, since
   * it declares neither. (No such built-in template ships today; this fixture proves the code path generically.)
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

  it("AC#3 + — creates one scope-alias per declared target (root + per pre-included bundle)", () => {
    const fs = seedTemplateWithTargetAndBundle();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "demo" });

    // The root scope-alias for claude-code (.claude/skills → installer-skills/):
    expect(fs.aliasTarget(`${TARGET}/.claude/skills`)).toBe(`${TARGET}/installer-skills`);
    // The per-bundle scope-alias (self-similar surface) for the pre-included bundle:
    expect(fs.aliasTarget(`${TARGET}/bundles/core/.claude/skills`)).toBe(
      `${TARGET}/bundles/core/installer-skills`,
    );
  });

  it("AC#4 + — materialises the project-wide set AND the per-bundle set for each pre-included bundle", () => {
    const fs = seedTemplateWithTargetAndBundle();
    const backlog = new FakeBacklog();
    const result = initProject(deps(fs, backlog), { targetDir: TARGET, name: "demo" });

    const titles = backlog.listTasks(`${TARGET}/.authoring-backlog`).map((t) => t.title);
    // The project-wide set (8) is present:
    for (const spec of projectWideAuthoringTasks()) {
      expect(titles).toContain(spec.title);
    }
    // AND the per-bundle set for `core` (12 with the advisor) is present:
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
