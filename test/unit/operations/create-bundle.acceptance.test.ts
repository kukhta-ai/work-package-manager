import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import {
  createBundleSpec,
  perBundleAuthoringTasks,
} from "../../../src/core/operations/create-bundle.js";
import { makeArtefactDeriver } from "../../../src/core/operations/derive-artefacts-capability.js";
import { type LifecycleDeps, runMutation } from "../../../src/core/operations/lifecycle.js";
import { parseBundleManifest, parseManifest } from "../../../src/core/services/schema/index.js";
import { parseYaml } from "../../../src/util/yaml.js";

/**
 * Acceptance test for `createBundle` (the `bundle new` use case) as the COMPOSITION PROOF (task-26; doc 13 §5):
 * one real state-changing operation ridden through the task-25 lifecycle harness, observed end-to-end as if an
 * author ran `bundle new web-handoff` — but straight through the operation, with NO command-line surface in the
 * loop (that absence is AC#2 itself). One `describe` per acceptance criterion, each narrating the scenario.
 * Pure and deterministic: an in-memory filesystem + backlog + fixture templates stand in for the real disk,
 * Backlog.md, and the (tasks-30/31) real templates — no real fs / process / git. (No commander / cli.ts is
 * imported anywhere in this file.)
 */

const ROOT = "/hermes-handoff";
const BUILTIN = "/builtin-templates";
const MANIFEST_COMMENT = "# author note: handoff bundles are appended below";
/**
 * The authoring backlog is its own Backlog.md root at `<project>/.authoring-backlog` (doc 10 step 6), not the
 * project root — the lifecycle's ⑤ MATERIALISE writes there. The fake is initialised there and the materialise
 * assertions read there (the fake-parity discipline: initialising at the project root used to hide the real
 * "No Backlog.md project found" failure of every materialising command).
 */
const AUTHORING = `${ROOT}/.authoring-backlog`;

/** Stand up a realistic project the way `init` leaves it, plus the fixture project + bundle templates. */
function setUpProject(): { fs: MemoryFileSystem; backlog: FakeBacklog } {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();

  fs.write(
    `${ROOT}/manifest.yml`,
    [
      "project:",
      "  name: hermes-handoff",
      "  version: 3.0.0",
      "targets:",
      "  - claude-code", // the agent->alias map keys on `claude-code` (not `claude`)
      MANIFEST_COMMENT,
      "bundles: []",
      "",
    ].join("\n"),
  );
  backlog.init(AUTHORING, { taskPrefix: "authoring" });
  fs.makeDirectories(`${ROOT}/installer-skills`); // the root alias target (non-broken)

  // Fixture project template (front-door + orchestrator snippets).
  fs.write(
    `${BUILTIN}/project/minimal/template.yml`,
    "name: minimal\nscope: project\nparameters: []\n",
  );
  fs.write(
    `${BUILTIN}/project/minimal/snippets/AGENTS.md`,
    "# {{project-name}}\n\nMenu:\n{{bundles}}\n",
  );
  fs.write(
    `${BUILTIN}/project/minimal/snippets/installer-skills/{{project-name}}-installer/SKILL.md`,
    "---\nname: {{project-name}}-installer\n---\nInstall {{project-name}}.\n",
  );

  // Fixture bundle template (the scaffolded dir tree, incl. the per-bundle alias target).
  fs.write(
    `${BUILTIN}/bundle/default/template.yml`,
    "name: default\nscope: bundle\nparameters:\n  - name: bundle-id\n  - name: version\n",
  );
  fs.write(
    `${BUILTIN}/bundle/default/files/bundle.yml`,
    "id: {{bundle-id}}\nversion: {{version}}\n",
  );
  fs.write(`${BUILTIN}/bundle/default/files/installer-skills/.keep`, "");
  fs.write(
    `${BUILTIN}/bundle/default/files/install-backlog/config.yml`,
    "task_prefix: {{bundle-id}}\n",
  );

  return { fs, backlog };
}

/** Harness deps with the REAL artefact deriver (task-19, via the fixture project template). */
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

function spec() {
  return createBundleSpec({ builtinTemplatesRoot: BUILTIN, bundleTemplateName: "default" });
}

describe("createBundle — acceptance (composition proof; doc 13 §5, doc 10 bundle new)", () => {
  describe("AC#1 — one operation runs end to end through the shared six-beat sequence", () => {
    it("the bundle-new use case validates, scaffolds from a template, records, re-derives, and materialises", () => {
      const { fs, backlog } = setUpProject();

      const result = runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), {
        id: "web-handoff",
      });

      // (validate) the id passed CHECK and the operation proceeded.
      // (template→files) bundles/web-handoff/ produced from the bundle template:
      const bundle = parseBundleManifest(
        parseYaml(fs.read(`${ROOT}/bundles/web-handoff/bundle.yml`)),
      );
      expect(bundle.ok).toBe(true);
      if (bundle.ok) expect(bundle.value.id).toBe("web-handoff");
      expect(fs.exists(`${ROOT}/bundles/web-handoff/install-backlog/config.yml`)).toBe(true);

      // (record-in-project) the manifest now lists the bundle, and the author's comment survived:
      const manifestText = fs.read(`${ROOT}/manifest.yml`);
      expect(manifestText).toContain(MANIFEST_COMMENT);
      const manifest = parseManifest(parseYaml(manifestText));
      expect(manifest.ok).toBe(true);
      if (manifest.ok) expect(manifest.value.bundles).toContain("web-handoff");

      // (re-derive) the front-door reflects the new bundle in its menu:
      expect(fs.read(`${ROOT}/AGENTS.md`)).toContain("- web-handoff bundle");

      // (materialise) the doc-11 per-bundle authoring tasks are in the authoring backlog:
      const titles = backlog.listTasks(AUTHORING).map((t) => t.title);
      expect(titles).toContain("Plan bundle web-handoff");
      expect(titles).toContain("Simulate fresh-install executor for web-handoff");
      expect(result.materialisedTaskTitles).toHaveLength(12);
    });
  });

  describe("AC#2 — the result and effects are observable without the command-line surface", () => {
    it("an operation returns data; the CLI is not in the loop", () => {
      const { fs, backlog } = setUpProject();

      const result = runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), {
        id: "web-handoff",
      });

      // Everything about the outcome is readable from the returned OperationResult...
      expect(result.summary).toBe("created bundle web-handoff");
      expect(result.changedPaths).toContain(`${ROOT}/bundles/web-handoff/bundle.yml`);
      expect(result.changedPaths).toContain(`${ROOT}/manifest.yml`);
      expect(result.changedPaths).toContain(`${ROOT}/AGENTS.md`);
      expect(result.materialisedTaskTitles).toEqual(
        perBundleAuthoringTasks("web-handoff", { advisor: true }).map((t) => t.title),
      );

      // ...and from the in-memory fakes — no commander / cli.ts anywhere:
      expect(backlog.listTasks(AUTHORING).length).toBe(12);
      // The per-bundle scope alias was created NON-broken (its target dir exists):
      expect(fs.exists(`${ROOT}/bundles/web-handoff/installer-skills`)).toBe(true);
      expect(fs.exists(`${ROOT}/bundles/web-handoff/.claude/skills`)).toBe(true);
      expect(fs.aliasTarget(`${ROOT}/bundles/web-handoff/.claude/skills`)).toBe(
        `${ROOT}/bundles/web-handoff/installer-skills`,
      );
    });
  });

  describe("AC#3 — an operation composes the services correctly, ahead of any per-command work", () => {
    it("the operation is pure composition over the services; the harness wires the lifecycle", () => {
      const { fs, backlog } = setUpProject();
      const deps = lifecycleDeps(fs, backlog);

      // createBundle only declares check/apply/materialise; the harness composed task-17 (resolve) + task-16
      // (render) + task-13 (comment-preserving yaml edit) + task-19 (derive) + task-21 (materialise) around it.
      runMutation(deps, { root: ROOT }, spec(), { id: "web-handoff" });

      // task-17 + task-16: the template was resolved and rendered (scaffold present, placeholders substituted):
      expect(parseYaml(fs.read(`${ROOT}/bundles/web-handoff/bundle.yml`))).toMatchObject({
        id: "web-handoff",
      });
      // task-19: the front-door was re-derived via the REAL makeArtefactDeriver:
      expect(fs.read(`${ROOT}/AGENTS.md`)).toContain("# hermes-handoff");

      // Idempotency at the rerender layer: adding a DIFFERENT bundle leaves the first entry intact and adds
      // the new one — task-19 planChanges only writes the changed front-door, task-21 skips existing titles.
      const result2 = runMutation(deps, { root: ROOT }, spec(), { id: "doc-handoff" });
      const frontDoor = fs.read(`${ROOT}/AGENTS.md`);
      expect(frontDoor).toContain("- web-handoff bundle"); // the first bundle's entry survived
      expect(frontDoor).toContain("- doc-handoff bundle"); // the new one was added
      // The second run materialised only the new bundle's tasks (the first bundle's titles are distinct):
      expect(result2.materialisedTaskTitles).toContain("Plan bundle doc-handoff");
      expect(result2.materialisedTaskTitles).not.toContain("Plan bundle web-handoff");
    });
  });
});
