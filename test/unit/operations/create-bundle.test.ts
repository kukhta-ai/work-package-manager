import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { ConflictError, ValidationError } from "../../../src/core/errors.js";
import {
  createBundleSpec,
  perBundleAuthoringTasks,
} from "../../../src/core/operations/create-bundle.js";
import { makeArtefactDeriver } from "../../../src/core/operations/derive-artefacts-capability.js";
import { type LifecycleDeps, runMutation } from "../../../src/core/operations/lifecycle.js";
import { parseBundleManifest, parseManifest } from "../../../src/core/services/schema/index.js";
import { parseYaml } from "../../../src/util/yaml.js";

const ROOT = "/proj";
const BUILTIN = "/builtin-templates";

/** A YAML comment seeded into the manifest, to prove the bundle-append edit preserves comments. */
const MANIFEST_COMMENT = "# hand-written note: bundles are appended below";

/**
 * Seed a realistic project the way `init` leaves it (doc 10 row `init`): a manifest (with a comment), an
 * initialised authoring backlog, the project's own `installer-skills/` target dir (so the ROOT scope alias the
 * rerender creates is non-broken), and the project + bundle fixture templates the operation resolves against.
 */
function seed(): { fs: MemoryFileSystem; backlog: FakeBacklog } {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();

  fs.write(
    `${ROOT}/manifest.yml`,
    [
      "project:",
      "  name: demo",
      "  version: 1.0.0",
      "targets:",
      "  - claude-code",
      MANIFEST_COMMENT,
      "bundles: []",
      "",
    ].join("\n"),
  );
  backlog.init(ROOT, { taskPrefix: "authoring" });
  // The ROOT alias target a prior `init` created (doc 06): so bundles' rerender alias is non-broken.
  fs.makeDirectories(`${ROOT}/installer-skills`);

  // Project template (built-in): the front-door + orchestrator snippets the deriver resolves.
  fs.write(
    `${BUILTIN}/project/minimal/template.yml`,
    "name: minimal\nscope: project\nparameters: []\n",
  );
  fs.write(
    `${BUILTIN}/project/minimal/snippets/AGENTS.md`,
    "# {{project-name}}\n\nBundles:\n{{bundles}}\n",
  );
  fs.write(
    `${BUILTIN}/project/minimal/snippets/installer-skills/{{project-name}}-installer/SKILL.md`,
    "---\nname: {{project-name}}-installer\n---\nInstall {{project-name}}.\n",
  );

  // Bundle template (built-in): the dir tree `bundle new` scaffolds (incl. the alias target dir).
  fs.write(
    `${BUILTIN}/bundle/default/template.yml`,
    "name: default\nscope: bundle\nparameters:\n  - name: bundle-id\n  - name: version\n",
  );
  fs.write(
    `${BUILTIN}/bundle/default/files/bundle.yml`,
    "id: {{bundle-id}}\nversion: {{version}}\n",
  );
  // `.keep` makes the per-bundle alias TARGET dir (installer-skills/) exist after scaffold.
  fs.write(`${BUILTIN}/bundle/default/files/installer-skills/.keep`, "");
  fs.write(
    `${BUILTIN}/bundle/default/files/install-backlog/config.yml`,
    "task_prefix: {{bundle-id}}\n",
  );

  return { fs, backlog };
}

/** The harness deps, wiring the REAL `makeArtefactDeriver` over the fixture project template. */
function lifecycleDeps(fs: MemoryFileSystem, backlog: FakeBacklog): LifecycleDeps {
  return {
    fs,
    backlog,
    deriveArtefacts: makeArtefactDeriver({
      fs,
      builtinTemplatesRoot: BUILTIN,
      projectTemplatesRoot: `${ROOT}/templates`,
      projectTemplateName: "minimal",
    }),
  };
}

/** The createBundle spec wired to the fixture built-in bundle template. */
function spec() {
  return createBundleSpec({ builtinTemplatesRoot: BUILTIN, bundleTemplateName: "default" });
}

describe("createBundle — end-to-end through the lifecycle (doc 13 §5; doc 10 bundle new)", () => {
  it("AC#1 — validates input, scaffolds from template, records in the manifest, re-derives, materialises", () => {
    const { fs, backlog } = seed();

    const result = runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), { id: "web" });

    // (validate-input) a good id proceeded; (template→files) bundles/web/ scaffolded from the template:
    expect(fs.exists(`${ROOT}/bundles/web/bundle.yml`)).toBe(true);
    expect(fs.exists(`${ROOT}/bundles/web/installer-skills`)).toBe(true);
    expect(fs.exists(`${ROOT}/bundles/web/install-backlog/config.yml`)).toBe(true);

    // bundle.yml parses and carries id "web":
    const bundle = parseBundleManifest(parseYaml(fs.read(`${ROOT}/bundles/web/bundle.yml`)));
    expect(bundle.ok).toBe(true);
    if (bundle.ok) {
      expect(bundle.value.id).toBe("web");
    }

    // (record-in-project) "web" appended to the manifest AND the comment survives:
    const manifestText = fs.read(`${ROOT}/manifest.yml`);
    expect(manifestText).toContain(MANIFEST_COMMENT);
    const manifest = parseManifest(parseYaml(manifestText));
    expect(manifest.ok).toBe(true);
    if (manifest.ok) {
      expect(manifest.value.bundles).toContain("web");
    }

    // (re-derive) the front-door AGENTS.md was re-rendered and lists the new bundle's summary:
    const frontDoor = fs.read(`${ROOT}/AGENTS.md`);
    expect(frontDoor).toContain("# demo"); // {{project-name}} substituted
    expect(frontDoor).toContain("- web bundle"); // {{bundles}} menu includes the new bundle

    // (materialise) all 12 doc-11 authoring tasks present in the backlog:
    const titles = backlog.listTasks(ROOT).map((t) => t.title);
    for (const t of perBundleAuthoringTasks("web", { advisor: true })) {
      expect(titles).toContain(t.title);
    }
    expect(perBundleAuthoringTasks("web", { advisor: true })).toHaveLength(12);

    // the OperationResult is observable (AC#2):
    expect(result.summary).toBe("created bundle web");
    expect(result.changedPaths).toContain(`${ROOT}/bundles/web/bundle.yml`);
    expect(result.changedPaths).toContain(`${ROOT}/manifest.yml`);
    expect(result.changedPaths).toContain(`${ROOT}/AGENTS.md`);
    expect(result.materialisedTaskTitles).toHaveLength(12);
  });

  it("AC#1 — the per-bundle and root scope aliases are created NON-broken (targets exist)", () => {
    const { fs, backlog } = seed();
    runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), { id: "web" });

    // The per-bundle alias resolves because its target bundles/web/installer-skills/ exists:
    expect(fs.exists(`${ROOT}/bundles/web/installer-skills`)).toBe(true);
    expect(fs.exists(`${ROOT}/bundles/web/.claude/skills`)).toBe(true);
    expect(fs.aliasTarget(`${ROOT}/bundles/web/.claude/skills`)).toBe(
      `${ROOT}/bundles/web/installer-skills`,
    );
    // The root alias is also non-broken (its target installer-skills/ was seeded):
    expect(fs.exists(`${ROOT}/.claude/skills`)).toBe(true);
    expect(fs.aliasTarget(`${ROOT}/.claude/skills`)).toBe(`${ROOT}/installer-skills`);
  });

  it("AC#3 — the operation composes services; the harness drove ④ rerender and ⑤ materialise, not the spec", () => {
    // The createBundleSpec's `apply` performs only structural writes; it does not import/call the derivation
    // or the materialiser — yet both happened (front-door re-derived, tasks created). This is verified by the
    // observable effects above plus: a spec built here has no deriveArtefacts/materialise machinery of its own
    // beyond returning a plan, so the harness must have arranged ④/⑤.
    const { fs, backlog } = seed();
    const result = runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), { id: "web" });
    expect(fs.exists(`${ROOT}/AGENTS.md`)).toBe(true); // ④ ran (harness)
    expect(backlog.listTasks(ROOT).length).toBeGreaterThan(0); // ⑤ ran (harness)
    expect(result.materialisedTaskTitles.length).toBe(12);
  });

  it("rejects a reserved-verb id with ValidationError, changing nothing", () => {
    const { fs, backlog } = seed();
    expect(() =>
      runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), { id: "list" }),
    ).toThrow(ValidationError);
    expect(fs.exists(`${ROOT}/bundles/list`)).toBe(false);
    expect(backlog.listTasks(ROOT)).toEqual([]);
  });

  it("rejects a non-kebab id with ValidationError", () => {
    const { fs, backlog } = seed();
    expect(() =>
      runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), { id: "a--b" }),
    ).toThrow(ValidationError);
  });

  it("rejects a bad --version with ValidationError in CHECK, changing nothing", () => {
    const { fs, backlog } = seed();
    const manifestBefore = fs.read(`${ROOT}/manifest.yml`);

    expect(() =>
      runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), {
        id: "web",
        version: "not-a-version",
      }),
    ).toThrow(ValidationError);

    // CHECK rejected the version before any effect — ③④⑤ never ran:
    expect(fs.exists(`${ROOT}/bundles/web`)).toBe(false); // no scaffold
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestBefore); // manifest untouched
    expect(backlog.listTasks(ROOT)).toEqual([]); // no tasks materialised
  });

  it("rejects a duplicate id with ConflictError, changing nothing on the second run", () => {
    const { fs, backlog } = seed();
    const deps = lifecycleDeps(fs, backlog);
    runMutation(deps, { root: ROOT }, spec(), { id: "web" });

    const manifestAfterFirst = fs.read(`${ROOT}/manifest.yml`);
    const tasksAfterFirst = backlog.listTasks(ROOT).map((t) => t.title);

    expect(() => runMutation(deps, { root: ROOT }, spec(), { id: "web" })).toThrow(ConflictError);

    // The failed second run changed neither the manifest nor the backlog:
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestAfterFirst);
    expect(backlog.listTasks(ROOT).map((t) => t.title)).toEqual(tasksAfterFirst);
  });

  it("--no-advisor materialises 11 tasks, omitting the advisor task", () => {
    const { fs, backlog } = seed();
    const result = runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), {
      id: "core",
      advisor: false,
    });
    expect(result.materialisedTaskTitles).toHaveLength(11);
    expect(result.materialisedTaskTitles).not.toContain("Write advisor content for core");
    expect(result.materialisedTaskTitles).toContain("Plan bundle core");
  });
});

describe("perBundleAuthoringTasks (doc 11 §3)", () => {
  it("returns the 12-task set with the advisor task when advisor is on", () => {
    const tasks = perBundleAuthoringTasks("web", { advisor: true });
    expect(tasks).toHaveLength(12);
    expect(tasks.map((t) => t.title)).toContain("Write advisor content for web");
    expect(tasks.map((t) => t.title)).toContain("Plan bundle web");
    expect(tasks.map((t) => t.title)).toContain("Simulate fresh-install executor for web");
  });

  it("omits the advisor task when advisor is off (11 tasks)", () => {
    const tasks = perBundleAuthoringTasks("web", { advisor: false });
    expect(tasks).toHaveLength(11);
    expect(tasks.map((t) => t.title)).not.toContain("Write advisor content for web");
  });

  it("every task carries at least one acceptance criterion", () => {
    for (const t of perBundleAuthoringTasks("web", { advisor: true })) {
      expect(t.acceptanceCriteria.length).toBeGreaterThan(0);
    }
  });
});

describe("makeArtefactDeriver (doc 13 §5 ④)", () => {
  it("resolves the project template and derives a front-door that lists the bundles", () => {
    const { fs } = seed();
    // Give the project a bundle so the menu has content, then derive directly.
    const deriver = makeArtefactDeriver({
      fs,
      builtinTemplatesRoot: BUILTIN,
      projectTemplatesRoot: `${ROOT}/templates`,
      projectTemplateName: "minimal",
    });
    const desired = deriver({
      rootPath: ROOT,
      manifest: {
        meta: {
          name: "demo",
          // a SemVer brand is required structurally; the deriver only reads meta.name + bundles here.
          version: "1.0.0" as never,
        },
        targets: ["claude-code" as never],
        bundles: ["web" as never],
      },
      bundles: new Map([
        [
          "web" as never,
          {
            id: "web" as never,
            version: "0.1.0" as never,
            summary: "web bundle",
            confirmation: "safe",
            requires: new Map(),
          },
        ],
      ]),
    });
    const frontDoor = desired.files.find((f) => f.path === "AGENTS.md");
    expect(frontDoor).toBeDefined();
    expect(frontDoor?.content).toContain("- web bundle");
    expect(frontDoor?.content).toContain("# demo");
  });
});
