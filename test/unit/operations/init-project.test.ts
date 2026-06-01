import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { ConflictError, NotFoundError } from "../../../src/core/errors.js";
import { makeArtefactDeriver } from "../../../src/core/operations/derive-artefacts-capability.js";
import { initProject } from "../../../src/core/operations/init-project.js";
import { parseManifest } from "../../../src/core/services/schema/index.js";
import { parseYaml } from "../../../src/util/yaml.js";

/**
 * Unit test for the `initProject` bootstrap operation (task-33) over the IN-MEMORY ports — the pure-core half of
 * the walking skeleton. It mirrors the REAL `templates/` tree into a `MemoryFileSystem` (so it runs against the
 * genuine authored minimal template, post single-source collapse) and a `FakeBacklog`, then drives `initProject`
 * directly (no commander, no real fs). The real-disk end-to-end is `test/integration/cli.init.test.ts`.
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

describe("initProject — the bootstrap operation (task-33; doc 10 init steps 1–4 + 8)", () => {
  it("produces a working project: manifest + the copied files + the derived front-door & orchestrator", () => {
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
    // The DERIVED artefacts, rendered from snippets/ (the single source) and written by step 4:
    expect(fs.exists(`${TARGET}/AGENTS.md`)).toBe(true);
    expect(fs.exists(`${TARGET}/installer-skills/hermes-handoff-installer/SKILL.md`)).toBe(true);

    // The manifest parses with the substituted name + empty lists:
    const manifest = parseManifest(parseYaml(fs.read(`${TARGET}/manifest.yml`)));
    expect(manifest.ok).toBe(true);
    if (manifest.ok) {
      expect(manifest.value.meta.name).toBe("hermes-handoff");
      expect(manifest.value.bundles).toEqual([]);
      expect(manifest.value.targets).toEqual([]);
    }

    // The result is observable: summary + changed paths (incl. AGENTS.md + the .authoring-backlog root):
    expect(result.summary).toBe(`created project hermes-handoff at ${TARGET}`);
    expect(result.changedPaths).toContain(`${TARGET}/AGENTS.md`);
    expect(result.changedPaths).toContain(`${TARGET}/.authoring-backlog`);
    expect(result.materialisedTaskTitles).toEqual([]);
  });

  it("the front-door + orchestrator are fully substituted ({{project-name}} → the name; no markers)", () => {
    const fs = seedTemplates();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "hermes-handoff" });

    const frontDoor = fs.read(`${TARGET}/AGENTS.md`);
    expect(frontDoor).toContain("hermes-handoff"); // {{project-name}} substituted
    expect(frontDoor.toLowerCase()).toContain("install"); // the doc-07 recognition reframing
    const orchestrator = fs.read(`${TARGET}/installer-skills/hermes-handoff-installer/SKILL.md`);
    expect(orchestrator).toContain("hermes-handoff-installer");

    // No file under the project has an unresolved {{…}} marker (path or content):
    for (const path of filesUnder(fs, TARGET)) {
      expect(path, `marker in produced path ${path}`).not.toMatch(/\{\{[^}]*\}\}/);
      expect(fs.read(path), `marker in produced file ${path}`).not.toMatch(/\{\{[^}]*\}\}/);
    }
  });

  it("exercises the BacklogMd port: it initialises the .authoring-backlog/ root with task_prefix=authoring", () => {
    const fs = seedTemplates();
    const backlog = new FakeBacklog();
    initProject(deps(fs, backlog), { targetDir: TARGET, name: "hermes-handoff" });

    // The fake recorded an init at the authoring-backlog root; a created task gets the authoring- prefix:
    const created = backlog.createTask(`${TARGET}/.authoring-backlog`, { title: "probe" });
    expect(created.id).toBe("authoring-1");
  });

  it("AC#2 — it is the SMALLEST slice: no bundles/ scaffold (that is the full init)", () => {
    const fs = seedTemplates();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "hermes-handoff" });
    expect(fs.exists(`${TARGET}/bundles`)).toBe(false);
  });

  it("refuses to overwrite an existing project (ConflictError), and a re-run does not change the manifest", () => {
    const fs = seedTemplates();
    const backlog = new FakeBacklog();
    initProject(deps(fs, backlog), { targetDir: TARGET, name: "hermes-handoff" });
    const manifestBefore = fs.read(`${TARGET}/manifest.yml`);

    expect(() => initProject(deps(fs, backlog), { targetDir: TARGET, name: "other" })).toThrow(
      ConflictError,
    );
    expect(fs.read(`${TARGET}/manifest.yml`)).toBe(manifestBefore); // unchanged
  });

  it("raises NotFoundError when the minimal template is missing", () => {
    const fs = new MemoryFileSystem(); // no templates seeded
    expect(() =>
      initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "x" }),
    ).toThrow(NotFoundError);
  });

  it("changedPaths lists every produced path (the observability contract the command's formatResult uses)", () => {
    const fs = seedTemplates();
    const result = initProject(deps(fs, new FakeBacklog()), {
      targetDir: TARGET,
      name: "hermes-handoff",
    });
    // Every produced file the operation wrote is listed (so the command can report a count) — and each really
    // exists on the (in-memory) fs:
    const expected = [
      `${TARGET}/manifest.yml`,
      `${TARGET}/README.md`,
      `${TARGET}/RALPH-LOOP.md`,
      `${TARGET}/AGENTS.md`,
      `${TARGET}/installer-skills/hermes-handoff-installer/SKILL.md`,
      `${TARGET}/installer-skills/hermes-handoff-installer/references/journaling.md`,
      `${TARGET}/.authoring-backlog`,
    ];
    for (const path of expected) {
      expect(result.changedPaths, `changedPaths must list ${path}`).toContain(path);
    }
    // No path is listed twice (the AGENTS.md de-dup guard in step 4):
    expect(new Set(result.changedPaths).size).toBe(result.changedPaths.length);
  });

  it("single-source: the front-door `init` writes is byte-identical to the task-26 deriver's output", () => {
    // The collapse's whole point: `init` and every later mutation render the front-door + orchestrator from the
    // SAME snippets/ source via the deriver. So what `init` writes must equal what `makeArtefactDeriver` yields.
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
      },
      bundles: new Map(),
    });
    const derivedFrontDoor = desired.files.find((f) => f.path === "AGENTS.md");
    const derivedOrch = desired.files.find((f) => f.path.endsWith("-installer/SKILL.md"));
    expect(derivedFrontDoor).toBeDefined();
    expect(derivedOrch).toBeDefined();
    // Byte-identical to what init wrote to disk:
    expect(fs.read(`${TARGET}/AGENTS.md`)).toBe(derivedFrontDoor?.content);
    expect(fs.read(`${TARGET}/installer-skills/hermes-handoff-installer/SKILL.md`)).toBe(
      derivedOrch?.content,
    );
  });
});
