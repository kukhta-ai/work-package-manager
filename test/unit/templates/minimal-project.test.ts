import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import type { Project } from "../../../src/core/model/index.js";
import { makeArtefactDeriver } from "../../../src/core/operations/derive-artefacts-capability.js";
import { renderSnippet, renderTree } from "../../../src/core/services/render.js";
import { parseManifest } from "../../../src/core/services/schema/index.js";
import { resolveTemplate } from "../../../src/core/services/template-resolver.js";
import { parseYaml } from "../../../src/util/yaml.js";

/**
 * Unit test for the REAL shipped `templates/project/minimal/` template — the one `init` instantiates and the
 * task-26 `makeArtefactDeriver` resolves snippets from. It mirrors the actual on-disk template into a
 * `MemoryFileSystem` (reading via `node:fs`, which tests may use), then exercises it through the production
 * task-17 resolver + task-16 render — so the assertions run against the genuine authored content, not a copy.
 * No `init` command exists yet, so the template is instantiated directly here.
 */

/** The repo's real templates root on disk. */
const REAL_TEMPLATES = fileURLToPath(new URL("../../../templates", import.meta.url));
/** Where the template is mirrored inside the MemoryFileSystem (the resolver's builtin root). */
const BUILTIN = "/builtin-templates";
const ROOT = "/proj";

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

/** Seed the real `templates/` tree into a fresh MemoryFileSystem at {@link BUILTIN}. */
function seedTemplates(): MemoryFileSystem {
  const fs = new MemoryFileSystem();
  mirror(fs, REAL_TEMPLATES, BUILTIN);
  return fs;
}

/** Resolve + render the minimal project template's `files/` into `ROOT`, returning the produced relative paths. */
function instantiate(fs: MemoryFileSystem, params: Map<string, string>): string[] {
  const resolution = resolveTemplate("minimal", "project", { fs, builtinTemplatesRoot: BUILTIN });
  if (!resolution.found) {
    throw new Error(
      `minimal project template not found (searched: ${resolution.searched.join(", ")})`,
    );
  }
  const produced: string[] = [];
  for (const file of renderTree(resolution.template.files, params)) {
    fs.write(join(ROOT, file.path), file.content);
    produced.push(file.path);
  }
  return produced;
}

/** The standard params a fresh `init` supplies. */
function params(name = "hermes-handoff"): Map<string, string> {
  return new Map([
    ["project-name", name],
    // A fresh project has no bundles; the front-door menu renders an empty placeholder.
    ["bundles", "  (none yet — add bundles with `wpm bundle new <id>`)"],
  ]);
}

describe("minimal project template — instantiation (doc 06/07)", () => {
  it("AC#1 — produces a working project: manifest, loop-instructions, README, journaling (copied from files/)", () => {
    const fs = seedTemplates();
    instantiate(fs, params("hermes-handoff"));

    // The COPIED `files/` artefacts exist. The front-door + orchestrator SKILL are NO LONGER in `files/` —
    // they are rendered from `snippets/` (the single source; see the loop-closure case + AC#4). The static
    // `references/journaling.md` IS still copied via `files/` (under the orchestrator dir).
    expect(fs.exists(`${ROOT}/manifest.yml`)).toBe(true);
    expect(fs.exists(`${ROOT}/RALPH-LOOP.md`)).toBe(true);
    expect(fs.exists(`${ROOT}/README.md`)).toBe(true);
    expect(
      fs.exists(`${ROOT}/installer-skills/hermes-handoff-installer/references/journaling.md`),
    ).toBe(true);
    // The derived artefacts are NOT copied from files/ (single-source collapse, task-33):
    expect(fs.exists(`${ROOT}/AGENTS.md`)).toBe(false);
    expect(fs.exists(`${ROOT}/installer-skills/hermes-handoff-installer/SKILL.md`)).toBe(false);

    // The manifest parses with the substituted name + version + empty lists:
    const manifest = parseManifest(parseYaml(fs.read(`${ROOT}/manifest.yml`)));
    expect(manifest.ok).toBe(true);
    if (manifest.ok) {
      expect(manifest.value.meta.name).toBe("hermes-handoff");
      expect(manifest.value.meta.version).toBe("0.1.0");
      expect(manifest.value.bundles).toEqual([]);
      expect(manifest.value.targets).toEqual([]);
    }
  });

  it("AC#2 — the front-door carries recognition-and-kickoff, the install shape, and the standing rules", () => {
    const fs = seedTemplates();
    // The front-door is now rendered from the SNIPPET (single source), not copied from files/ — render it the
    // way the task-26 deriver / `init` does.
    const resolution = resolveTemplate("minimal", "project", { fs, builtinTemplatesRoot: BUILTIN });
    if (!resolution.found) throw new Error("minimal project template not found");
    const frontDoorSnippet = resolution.template.snippets.find((s) => s.path === "AGENTS.md");
    if (frontDoorSnippet === undefined) throw new Error("front-door snippet not found");
    const frontDoor = renderSnippet(frontDoorSnippet, params("hermes-handoff")).content;

    // Recognition & kickoff (doc 07): flip stance to "install", name the entry points + RALPH-LOOP.
    expect(frontDoor).toContain("install"); // the reframing
    expect(frontDoor).toContain("hermes-handoff-installer"); // the installer-skill entry point
    expect(frontDoor).toContain("RALPH-LOOP.md"); // unattended-run pointer
    expect(frontDoor.toLowerCase()).toContain("recognition"); // the section is present

    // The install shape (doc 07): manifest → detect → bundle menu → requires → per-task loop → resume.
    expect(frontDoor).toContain("manifest.yml");
    expect(frontDoor.toLowerCase()).toContain("detect");
    expect(frontDoor).toContain("requires");
    expect(frontDoor.toLowerCase()).toContain("menu");
    expect(frontDoor.toLowerCase()).toContain("resume");
    // the per-task workflow:
    expect(frontDoor.toLowerCase()).toContain("verify");
    expect(frontDoor.toLowerCase()).toContain("record");

    // The standing rules (doc 07):
    expect(frontDoor.toLowerCase()).toContain("standing rules");
    expect(frontDoor.toLowerCase()).toContain("reverse"); // "only ever reverse what you installed"
    expect(frontDoor.toLowerCase()).toContain("checksum"); // checksum-before-overwrite
    expect(frontDoor.toLowerCase()).toContain("confirmation"); // pause at confirmation points
    // mechanics deferred to the orchestrator's references, not in the front door:
    expect(frontDoor).toContain("references/journaling.md");
  });

  it("AC#3 — on-demand advisor / install-time / payload skill stubs are resolvable and render", () => {
    const fs = seedTemplates();
    const resolution = resolveTemplate("minimal", "project", { fs, builtinTemplatesRoot: BUILTIN });
    expect(resolution.found).toBe(true);
    if (!resolution.found) return;

    const snippetByName = (suffix: string) =>
      resolution.template.snippets.find((s) => s.path.endsWith(suffix));

    const advisor = snippetByName("advisor.SKILL.md.tmpl");
    const installerSkill = snippetByName("installer-skill.SKILL.md.tmpl");
    const payload = snippetByName("payload-skill.SKILL.md.tmpl");
    expect(advisor).toBeDefined();
    expect(installerSkill).toBeDefined();
    expect(payload).toBeDefined();

    // Each renders with sample params (the add-commands supply these later) and resolves to frontmatter + body:
    if (advisor) {
      const r = renderSnippet(advisor, new Map([["bundle-id", "web-handoff"]]));
      expect(r.content).toContain("name: web-handoff-advisor");
      expect(r.content).not.toMatch(/\{\{[^}]*\}\}/);
    }
    if (installerSkill) {
      const r = renderSnippet(installerSkill, new Map([["skill-name", "detect-os"]]));
      expect(r.content).toContain("name: detect-os");
      expect(r.content).not.toMatch(/\{\{[^}]*\}\}/);
    }
    if (payload) {
      const r = renderSnippet(payload, new Map([["skill-name", "handoff-web"]]));
      expect(r.content).toContain("name: handoff-web");
      expect(r.content).not.toMatch(/\{\{[^}]*\}\}/);
    }
  });

  it("AC#4 — every placeholder in the produced project is substituted (no unresolved markers)", () => {
    const fs = seedTemplates();
    const produced = instantiate(fs, params("hermes-handoff"));

    // Scan every produced `files/` artefact:
    for (const rel of produced) {
      const content = fs.read(join(ROOT, rel));
      expect(content, `unresolved marker in produced file ${rel}`).not.toMatch(/\{\{[^}]*\}\}/);
      // ...and the path itself was substituted (no marker survives in the path):
      expect(rel, `unresolved marker in produced path ${rel}`).not.toMatch(/\{\{[^}]*\}\}/);
    }

    // ...and the deriver-rendered front-door + orchestrator snippets:
    const resolution = resolveTemplate("minimal", "project", { fs, builtinTemplatesRoot: BUILTIN });
    if (resolution.found) {
      const p = params("hermes-handoff");
      for (const snippet of resolution.template.snippets) {
        // The two deriver snippets (front-door + orchestrator) use only project-name/bundles → fully resolve.
        if (snippet.path === "AGENTS.md" || snippet.path.endsWith("-installer/SKILL.md")) {
          const r = renderSnippet(snippet, p);
          expect(r.content, `unresolved marker in snippet ${snippet.path}`).not.toMatch(
            /\{\{[^}]*\}\}/,
          );
        }
      }
    }
  });

  it("loop closure — the task-26 makeArtefactDeriver resolves the front-door + orchestrator from this template", () => {
    const fs = seedTemplates();
    const deriver = makeArtefactDeriver({
      fs,
      builtinTemplatesRoot: BUILTIN,
      projectTemplatesRoot: `${ROOT}/templates`,
      projectTemplateName: "minimal",
    });

    const project: Project = {
      rootPath: ROOT,
      manifest: {
        meta: { name: "hermes-handoff", version: "1.0.0" as never },
        targets: [],
        bundles: [],
      },
      bundles: new Map(),
    };

    // The deriver finds + renders both snippets (no throw) and the front-door carries the recognition line:
    const desired = deriver(project);
    const frontDoor = desired.files.find((f) => f.path === "AGENTS.md");
    const orchestrator = desired.files.find((f) => f.path.endsWith("-installer/SKILL.md"));
    expect(frontDoor).toBeDefined();
    expect(orchestrator).toBeDefined();
    expect(frontDoor?.content).toContain("hermes-handoff");
    expect(frontDoor?.content.toLowerCase()).toContain("install");
    expect(orchestrator?.content).toContain("hermes-handoff-installer");
    // fully substituted:
    expect(frontDoor?.content).not.toMatch(/\{\{[^}]*\}\}/);
    expect(orchestrator?.content).not.toMatch(/\{\{[^}]*\}\}/);
  });

  it("single-source — the derived artefacts live ONLY in snippets/, not files/ (task-33 collapse)", () => {
    // task-33 resolved the task-30 drift hazard: the front-door + orchestrator are the two DERIVED artefacts
    // and now have ONE source — `snippets/` (rendered by the deriver at `init` and every mutation). Their old
    // `files/` copies are removed, so `init`'s copied `files/` can never drift from the rendered snippets.
    expect(existsSync(join(REAL_TEMPLATES, "project/minimal", "files/AGENTS.md.tmpl"))).toBe(false);
    expect(
      existsSync(
        join(
          REAL_TEMPLATES,
          "project/minimal",
          "files/installer-skills/{{project-name}}-installer/SKILL.md.tmpl",
        ),
      ),
    ).toBe(false);
    // ...and they DO exist as snippets (the single source):
    expect(existsSync(join(REAL_TEMPLATES, "project/minimal", "snippets/AGENTS.md"))).toBe(true);
    expect(
      existsSync(
        join(
          REAL_TEMPLATES,
          "project/minimal",
          "snippets/installer-skills/{{project-name}}-installer/SKILL.md",
        ),
      ),
    ).toBe(true);
  });
});
