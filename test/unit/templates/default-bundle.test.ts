import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import {
  createBundleSpec,
  perBundleAuthoringTasks,
} from "../../../src/core/operations/create-bundle.js";
import { makeArtefactDeriver } from "../../../src/core/operations/derive-artefacts-capability.js";
import { type LifecycleDeps, runMutation } from "../../../src/core/operations/lifecycle.js";
import { renderTree } from "../../../src/core/services/render.js";
import { parseBundleManifest, parseManifest } from "../../../src/core/services/schema/index.js";
import { resolveTemplate } from "../../../src/core/services/template-resolver.js";
import { parseYaml } from "../../../src/util/yaml.js";

/**
 * Unit test for the REAL shipped `templates/bundle/default/` template — the one the task-26 `createBundle`
 * (`bundle new <id>`) renders into `bundles/<id>/`. It mirrors the actual on-disk `templates/` tree into a
 * `MemoryFileSystem` (reading via `node:fs`, which tests may use), seeds a project the way `init` leaves it,
 * then runs the production `createBundle` end-to-end through the task-25 lifecycle harness — so the assertions
 * run against the genuine authored template, not a fixture copy (closing the loop with task-26).
 *
 * No `init`/`bundle new` command exists yet, so the operation is driven directly via `runMutation`.
 */

/** The repo's real templates root on disk. */
const REAL_TEMPLATES = fileURLToPath(new URL("../../../templates", import.meta.url));
/** Where the templates are mirrored inside the MemoryFileSystem (the resolver's builtin root). */
const BUILTIN = "/builtin-templates";
const ROOT = "/proj";
/**
 * The authoring backlog is its own Backlog.md root at `<project>/.authoring-backlog` (doc 10 step 6), where the
 * lifecycle materialises — NOT the project root. The fake is initialised there and the materialise assertion
 * reads there (the fake-parity discipline that catches the real "No Backlog.md project found" failure).
 */
const AUTHORING = `${ROOT}/.authoring-backlog`;
/** The sample bundle id used throughout (matches the doc-06/07 worked example). */
const SAMPLE_ID = "web-handoff";

/** A YAML comment seeded into the manifest, to prove the bundle-append edit preserves comments. */
const MANIFEST_COMMENT = "# hand-written note: bundles are appended below";

/** Recursively mirror `srcDir` (real fs) into `fs` (MemoryFileSystem) under `destDir`, preserving paths. */
function mirror(fs: MemoryFileSystem, srcDir: string, destDir: string): void {
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcChild = join(srcDir, entry.name);
    const destChild = `${destDir}/${entry.name}`;
    if (entry.isDirectory()) {
      mirror(fs, srcChild, destChild);
    } else {
      fs.write(destChild, readFileSync(srcChild, "utf8"));
    }
  }
}

/**
 * Seed a realistic project the way `init` leaves it (doc 10 row `init`): the real `templates/` tree (so both
 * the bundle template the operation renders AND the project template the deriver resolves are the genuine
 * authored ones), a manifest (with a comment), an initialised authoring backlog, and the project's own ROOT
 * `installer-skills/` target dir (so the rerender's root scope alias is non-broken).
 */
function seed(): { fs: MemoryFileSystem; backlog: FakeBacklog } {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();

  // The REAL templates tree (bundle/default + project/minimal) → the resolver reads through the FS port.
  mirror(fs, REAL_TEMPLATES, BUILTIN);

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
  // The ROOT alias target a prior `init` created (doc 06): so the root rerender alias is non-broken.
  fs.makeDirectories(`${ROOT}/installer-skills`);

  return { fs, backlog };
}

/** The harness deps, wiring the REAL `makeArtefactDeriver` over the real project template. */
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

/** The createBundle spec wired to the REAL built-in bundle template. */
function spec() {
  return createBundleSpec({ builtinTemplatesRoot: BUILTIN, bundleTemplateName: "default" });
}

/** Collect every file path the operation wrote under `bundles/<id>/`, by walking the produced tree. */
function bundleFiles(fs: MemoryFileSystem, id: string): string[] {
  const base = `${ROOT}/bundles/${id}`;
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.list(dir)) {
      const child = `${dir}/${entry.name}`;
      if (entry.kind === "directory") {
        walk(child);
      } else {
        out.push(child);
      }
    }
  };
  walk(base);
  return out;
}

describe("default bundle template — createBundle end-to-end (doc 06/07/08/09)", () => {
  it("AC#1 — produces a working bundle: descriptor (bundle.yml), DoD-gated install-backlog, scope notes", () => {
    const { fs, backlog } = seed();
    const result = runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), {
      id: SAMPLE_ID,
    });

    // The descriptor (bundle.yml) — written CANONICALLY by the operation — exists and parses with id == SAMPLE_ID:
    expect(fs.exists(`${ROOT}/bundles/${SAMPLE_ID}/bundle.yml`)).toBe(true);
    const bundle = parseBundleManifest(
      parseYaml(fs.read(`${ROOT}/bundles/${SAMPLE_ID}/bundle.yml`)),
    );
    expect(bundle.ok).toBe(true);
    if (bundle.ok) {
      expect(bundle.value.id).toBe(SAMPLE_ID);
    }

    // The install-backlog config exists, parses, sets task_prefix to the id, and carries a non-empty DoD:
    expect(fs.exists(`${ROOT}/bundles/${SAMPLE_ID}/install-backlog/config.yml`)).toBe(true);
    const config = parseYaml(
      fs.read(`${ROOT}/bundles/${SAMPLE_ID}/install-backlog/config.yml`),
    ) as Record<string, unknown>;
    expect(config.task_prefix).toBe(SAMPLE_ID);
    expect(Array.isArray(config.definition_of_done)).toBe(true);
    expect((config.definition_of_done as unknown[]).length).toBeGreaterThan(0);

    // The per-bundle scope-notes front door exists and reads as bundle-scoped notes (doc 07 §Template layout):
    expect(fs.exists(`${ROOT}/bundles/${SAMPLE_ID}/AGENTS.md`)).toBe(true);
    const agents = fs.read(`${ROOT}/bundles/${SAMPLE_ID}/AGENTS.md`);
    expect(agents).toContain(SAMPLE_ID); // {{bundle-id}} substituted
    expect(agents).toContain("demo"); // {{project-name}} substituted
    expect(agents.toLowerCase()).toContain("closest"); // closest-wins scope-notes mechanic
    expect(agents).toContain("install-backlog"); // points at the recipe

    // The result is observable:
    expect(result.summary).toBe(`created bundle ${SAMPLE_ID}`);
  });

  it("AC#1 — the template ships NO bundle.yml; the operation writes it exactly once (no double-write)", () => {
    const { fs } = seed();

    // The template's files contain no bundle.yml (rendered/.tmpl-stripped) — the operation owns it:
    const resolution = resolveTemplate("default", "bundle", { fs, builtinTemplatesRoot: BUILTIN });
    expect(resolution.found).toBe(true);
    if (resolution.found) {
      const rendered = renderTree(
        resolution.template.files,
        new Map([
          ["bundle-id", SAMPLE_ID],
          ["version", "0.1.0"],
          ["project-name", "demo"],
        ]),
      );
      expect(rendered.some((f) => f.path === "bundle.yml")).toBe(false);
    }

    // And the operation lists bundle.yml in changedPaths exactly once:
    const { fs: fs2, backlog } = seed();
    const result = runMutation(lifecycleDeps(fs2, backlog), { root: ROOT }, spec(), {
      id: SAMPLE_ID,
    });
    const bundleYml = `${ROOT}/bundles/${SAMPLE_ID}/bundle.yml`;
    expect(result.changedPaths.filter((p) => p === bundleYml)).toHaveLength(1);
  });

  it("AC#1 — the per-bundle and root scope-alias TARGET dirs exist (non-broken aliases)", () => {
    const { fs, backlog } = seed();
    runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), { id: SAMPLE_ID });

    // The template ships installer-skills/.keep so the per-bundle alias target exists; the rerender's alias resolves:
    expect(fs.exists(`${ROOT}/bundles/${SAMPLE_ID}/installer-skills`)).toBe(true);
    expect(fs.exists(`${ROOT}/bundles/${SAMPLE_ID}/.claude/skills`)).toBe(true);
    expect(fs.aliasTarget(`${ROOT}/bundles/${SAMPLE_ID}/.claude/skills`)).toBe(
      `${ROOT}/bundles/${SAMPLE_ID}/installer-skills`,
    );
  });

  it("AC#1 — the payload delivery slots exist (doc 06/07)", () => {
    const { fs, backlog } = seed();
    runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), { id: SAMPLE_ID });

    expect(fs.exists(`${ROOT}/bundles/${SAMPLE_ID}/payload/files`)).toBe(true);
    expect(fs.exists(`${ROOT}/bundles/${SAMPLE_ID}/payload/templates`)).toBe(true);
    expect(fs.exists(`${ROOT}/bundles/${SAMPLE_ID}/installer-scripts`)).toBe(true);
  });

  it("AC#2 — the produced bundle carries a detect → setup → verify task scaffold (kind:state + step:<slug>)", () => {
    const { fs, backlog } = seed();
    runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), { id: SAMPLE_ID });

    const tasksDir = `${ROOT}/bundles/${SAMPLE_ID}/install-backlog/tasks`;
    const taskFiles = fs.list(tasksDir).map((e) => e.name);

    // Three task files, ids prefixed with the bundle id, named for the substituted {{bundle-id}}:
    const detect = taskFiles.find((n) => n.startsWith(`${SAMPLE_ID}-1`));
    const setup = taskFiles.find((n) => n.startsWith(`${SAMPLE_ID}-2`));
    const verify = taskFiles.find((n) => n.startsWith(`${SAMPLE_ID}-3`));
    expect(detect).toBeDefined();
    expect(setup).toBeDefined();
    expect(verify).toBeDefined();

    const detectBody = fs.read(`${tasksDir}/${detect}`);
    const setupBody = fs.read(`${tasksDir}/${setup}`);
    const verifyBody = fs.read(`${tasksDir}/${verify}`);

    // Each is a kind:state task with its own step: slug (doc 08 §Task tagging system):
    for (const body of [detectBody, setupBody, verifyBody]) {
      expect(body).toContain("kind:state");
      // valid Backlog.md task file shape: frontmatter id + AC block + DoD block (doc 07/09):
      expect(body).toContain("## Acceptance Criteria");
      expect(body).toContain("<!-- AC:BEGIN -->");
      expect(body).toContain("## Definition of Done");
      expect(body).toContain("<!-- DOD:BEGIN -->");
    }
    expect(detectBody).toContain("step:detect");
    expect(setupBody).toContain("step:setup");
    expect(verifyBody).toContain("step:verify");

    // The trio is ordered by dependency (setup needs detect, verify needs setup) — ids upper-cased on read but
    // the dependency value in the file references the prefixed id:
    expect(setupBody.toUpperCase()).toContain(`${SAMPLE_ID.toUpperCase()}-1`);
    expect(verifyBody.toUpperCase()).toContain(`${SAMPLE_ID.toUpperCase()}-2`);

    // The detect task's id is the bundle-prefixed first id:
    expect(detectBody.toUpperCase()).toContain(`${SAMPLE_ID.toUpperCase()}-1`);
  });

  it("AC#3 — every placeholder is substituted in the produced bundle (no marker in any content OR path)", () => {
    const { fs, backlog } = seed();
    runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), { id: SAMPLE_ID });

    for (const path of bundleFiles(fs, SAMPLE_ID)) {
      // The PATH carries no unresolved marker (task-16 substitutes placeholders in paths too):
      expect(path, `unresolved marker in produced path ${path}`).not.toMatch(/\{\{[^}]*\}\}/);
      // The CONTENT carries no unresolved marker:
      const content = fs.read(path);
      expect(content, `unresolved marker in produced file ${path}`).not.toMatch(/\{\{[^}]*\}\}/);
    }
  });

  it("AC#3 — rendering the raw template files leaves no marker (substitution-only holds by construction)", () => {
    const { fs } = seed();
    const resolution = resolveTemplate("default", "bundle", { fs, builtinTemplatesRoot: BUILTIN });
    expect(resolution.found).toBe(true);
    if (!resolution.found) return;

    // The three declared params resolve every marker; renderTree throws on any unconsumed {{…}} (task-16),
    // so a successful render with these params IS the proof. Assert no leftover anyway, belt-and-suspenders:
    const rendered = renderTree(
      resolution.template.files,
      new Map([
        ["bundle-id", SAMPLE_ID],
        ["version", "0.2.0"],
        ["project-name", "demo"],
      ]),
    );
    for (const f of rendered) {
      expect(f.path, `marker in rendered path ${f.path}`).not.toMatch(/\{\{[^}]*\}\}/);
      expect(f.content, `marker in rendered content ${f.path}`).not.toMatch(/\{\{[^}]*\}\}/);
    }
  });

  it("AC#1 — the new bundle is recorded in the manifest (comment preserved) and the front-door re-derived", () => {
    const { fs, backlog } = seed();
    runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), { id: SAMPLE_ID });

    const manifestText = fs.read(`${ROOT}/manifest.yml`);
    expect(manifestText).toContain(MANIFEST_COMMENT);
    const manifest = parseManifest(parseYaml(manifestText));
    expect(manifest.ok).toBe(true);
    if (manifest.ok) {
      expect(manifest.value.bundles).toContain(SAMPLE_ID);
    }

    // The harness re-derived the front-door, whose menu now lists the new bundle's summary:
    const frontDoor = fs.read(`${ROOT}/AGENTS.md`);
    expect(frontDoor).toContain(`- ${SAMPLE_ID} bundle`);
  });

  it("materialise — the 12 doc-11 authoring tasks are created (the operation's MATERIALISE plan)", () => {
    const { fs, backlog } = seed();
    const result = runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), {
      id: SAMPLE_ID,
    });

    const titles = backlog.listTasks(AUTHORING).map((t) => t.title);
    for (const t of perBundleAuthoringTasks(SAMPLE_ID, { advisor: true })) {
      expect(titles).toContain(t.title);
    }
    expect(result.materialisedTaskTitles).toHaveLength(12);
  });

  it("reusable — the ONE default template specializes per id (a second, different bundle gets its OWN scaffold)", () => {
    // The whole point of a single `bundle/default` template is that every bundle is a parameterized copy of it
    // (doc 07 §"Template layout": "every real bundle is a copy of this one"). Adding a second, differently-named
    // bundle to the same project must produce a fully id-specialized scaffold with NO leakage of the first id.
    const { fs, backlog } = seed();
    runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), { id: SAMPLE_ID });
    runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), { id: "doc-handoff" });

    // The second bundle's own scaffold exists and is specialized to ITS id:
    expect(fs.exists(`${ROOT}/bundles/doc-handoff/bundle.yml`)).toBe(true);
    const otherConfig = parseYaml(
      fs.read(`${ROOT}/bundles/doc-handoff/install-backlog/config.yml`),
    ) as Record<string, unknown>;
    expect(otherConfig.task_prefix).toBe("doc-handoff");

    // Its detect/setup/verify tasks carry the doc-handoff prefix — NOT web-handoff (no cross-id leakage):
    const otherTasks = fs
      .list(`${ROOT}/bundles/doc-handoff/install-backlog/tasks`)
      .map((e) => e.name);
    expect(otherTasks.some((n) => n.startsWith("doc-handoff-1"))).toBe(true);
    for (const name of otherTasks) {
      expect(name).not.toContain(SAMPLE_ID); // the first bundle's id never appears in the second's tasks
      const body = fs.read(`${ROOT}/bundles/doc-handoff/install-backlog/tasks/${name}`);
      expect(body).not.toContain(SAMPLE_ID);
      expect(body).not.toMatch(/\{\{[^}]*\}\}/); // and still fully substituted
    }

    // Both bundles are independently enabled in the manifest:
    const manifest = parseManifest(parseYaml(fs.read(`${ROOT}/manifest.yml`)));
    expect(manifest.ok).toBe(true);
    if (manifest.ok) {
      expect(manifest.value.bundles).toContain(SAMPLE_ID);
      expect(manifest.value.bundles).toContain("doc-handoff");
    }
  });
});

describe("default bundle template — install-backlog is a valid PRE-INITIALIZED Backlog.md (doc 07)", () => {
  it("the rendered config.yml carries every receipt fact as a DoD item (doc 07 §enforcement)", () => {
    const { fs, backlog } = seed();
    runMutation(lifecycleDeps(fs, backlog), { root: ROOT }, spec(), { id: SAMPLE_ID });

    const config = parseYaml(
      fs.read(`${ROOT}/bundles/${SAMPLE_ID}/install-backlog/config.yml`),
    ) as Record<string, unknown>;
    const dod = (config.definition_of_done as string[]).join("\n").toLowerCase();

    // The six receipt facts (doc 07 §"The enforcement — Definition of Done"): effect verified; files
    // referenced + checksummed; ownership recorded; inverse op recorded; decisions recorded; non-file effects.
    expect(dod).toContain("verif"); // effect verified
    expect(dod).toContain("ref"); // files placed/modified recorded via --ref
    expect(dod).toContain("checksum"); // checksum journaled
    expect(dod).toMatch(/adopt|ownership/); // installed-vs-adopted ownership
    expect(dod).toContain("inverse"); // the inverse op
    expect(dod).toContain("decision"); // decisions recorded
  });
});
