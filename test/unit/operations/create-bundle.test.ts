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
/**
 * The authoring backlog is its own Backlog.md root at `<project>/.authoring-backlog` (doc 10 step 6) — NOT the
 * project root. The lifecycle's ⑤ MATERIALISE writes there, so the fake must be initialised there and the
 * materialise assertions must read there, mirroring reality (the fake-parity discipline: the fake used to be
 * initialised at the project root, which hid the real `targets add`/`bundle new` "No Backlog.md project found").
 */
const AUTHORING = `${ROOT}/.authoring-backlog`;

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
  backlog.init(AUTHORING, { taskPrefix: "authoring" });
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
  // The advisor snippet `bundle new`'s auto-advisor renders (doc 10 step 6).
  fs.write(
    `${BUILTIN}/project/minimal/snippets/advisor.SKILL.md.tmpl`,
    "---\nname: {{bundle-id}}-advisor\n---\n\n# {{bundle-id}} advisor\n",
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

    // (materialise) all 12 doc-11 authoring tasks present in the authoring backlog:
    const titles = backlog.listTasks(AUTHORING).map((t) => t.title);
    for (const t of perBundleAuthoringTasks("web", { advisor: true })) {
      expect(titles).toContain(t.title);
    }
    expect(perBundleAuthoringTasks("web", { advisor: true })).toHaveLength(12);

    // the OperationResult is observable (AC#2):
    expect(result.summary).toBe("created bundle web (advisor scaffolded)");
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
    expect(backlog.listTasks(AUTHORING).length).toBeGreaterThan(0); // ⑤ ran (harness)
    expect(result.materialisedTaskTitles.length).toBe(12);
  });

  it("rejects a reserved-verb id with ValidationError, changing nothing", () => {
    const { fs, backlog } = seed();
    expect(() =>
      runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), { id: "list" }),
    ).toThrow(ValidationError);
    expect(fs.exists(`${ROOT}/bundles/list`)).toBe(false);
    expect(backlog.listTasks(AUTHORING)).toEqual([]);
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
    expect(backlog.listTasks(AUTHORING)).toEqual([]); // no tasks materialised
  });

  it("rejects a duplicate id with ConflictError, changing nothing on the second run", () => {
    const { fs, backlog } = seed();
    const deps = lifecycleDeps(fs, backlog);
    runMutation(deps, { root: ROOT }, spec(), { id: "web" });

    const manifestAfterFirst = fs.read(`${ROOT}/manifest.yml`);
    const tasksAfterFirst = backlog.listTasks(AUTHORING).map((t) => t.title);

    expect(() => runMutation(deps, { root: ROOT }, spec(), { id: "web" })).toThrow(ConflictError);

    // The failed second run changed neither the manifest nor the backlog:
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestAfterFirst);
    expect(backlog.listTasks(AUTHORING).map((t) => t.title)).toEqual(tasksAfterFirst);
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

describe("createBundle — the project bundle-template default (§4; doc 10:150 step 2)", () => {
  /** A marker file unique to the project's `bundles/bundle-template/` scaffold (NOT in the registry `default`). */
  const PROJECT_SCAFFOLD_MARKER = "PROJECT-SCAFFOLD.txt";

  /** Seed a project that ALSO has a `bundles/bundle-template/` scaffold with a distinguishing marker file. */
  function seedWithProjectScaffold(): { fs: MemoryFileSystem; backlog: FakeBacklog } {
    const { fs, backlog } = seed();
    // The project's default bundle scaffold (what `init`/`bundle template set` materialise). It carries a marker
    // file ABSENT from the registry `default`, plus a bundle.yml-less tree with placeholders kept.
    fs.write(
      `${ROOT}/bundles/bundle-template/${PROJECT_SCAFFOLD_MARKER}`,
      "from project scaffold\n",
    );
    fs.write(
      `${ROOT}/bundles/bundle-template/install-backlog/config.yml`,
      "task_prefix: {{bundle-id}}\n",
    );
    fs.write(`${ROOT}/bundles/bundle-template/installer-skills/.keep`, "");
    return { fs, backlog };
  }

  it("when no --template is given AND bundles/bundle-template/ exists, `bundle new` clones THAT scaffold", () => {
    const { fs, backlog } = seedWithProjectScaffold();
    // No bundleTemplateName ⇒ default branch ⇒ prefer the project scaffold.
    const spec = createBundleSpec({ builtinTemplatesRoot: BUILTIN });
    runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec, { id: "web" });

    // The marker from the PROJECT scaffold landed in the new bundle (proving set is now LIVE for bundle new):
    expect(fs.exists(`${ROOT}/bundles/web/${PROJECT_SCAFFOLD_MARKER}`)).toBe(true);
    expect(fs.read(`${ROOT}/bundles/web/${PROJECT_SCAFFOLD_MARKER}`)).toBe(
      "from project scaffold\n",
    );
    // And the placeholders were substituted (renderTree ran over the cloned tree):
    expect(fs.read(`${ROOT}/bundles/web/install-backlog/config.yml`)).toBe("task_prefix: web\n");
    // bundle.yml is still written by step (b) (the scaffold carries none):
    expect(fs.exists(`${ROOT}/bundles/web/bundle.yml`)).toBe(true);
  });

  it("an EXPLICIT --template still resolves from the REGISTRY even when bundles/bundle-template/ exists", () => {
    const { fs, backlog } = seedWithProjectScaffold();
    // Explicit bundleTemplateName ⇒ registry path ⇒ the project scaffold is IGNORED.
    const spec = createBundleSpec({ builtinTemplatesRoot: BUILTIN, bundleTemplateName: "default" });
    runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec, { id: "web" });

    // The registry `default` has NO project-scaffold marker, so the new bundle must NOT contain it:
    expect(fs.exists(`${ROOT}/bundles/web/${PROJECT_SCAFFOLD_MARKER}`)).toBe(false);
    // It DOES have the registry default's bundle.yml-derived tree (the fixture default ships bundle.yml):
    expect(fs.exists(`${ROOT}/bundles/web/bundle.yml`)).toBe(true);
  });

  it("with NO bundles/bundle-template/ present, `bundle new` falls back to the registry default (no regression)", () => {
    const { fs, backlog } = seed(); // the standard seed: NO bundles/bundle-template/
    const spec = createBundleSpec({ builtinTemplatesRoot: BUILTIN });
    runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec, { id: "web" });
    // Falls back to the registry `default` and still scaffolds correctly:
    expect(fs.exists(`${ROOT}/bundles/web/bundle.yml`)).toBe(true);
    expect(fs.exists(`${ROOT}/bundles/web/${PROJECT_SCAFFOLD_MARKER}`)).toBe(false);
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
        installerSkills: [],
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
            payload: { files: [], templates: [], scripts: [], skills: [] },
            installerSkills: [],
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
