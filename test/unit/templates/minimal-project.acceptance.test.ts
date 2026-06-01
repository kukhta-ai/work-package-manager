import { readdirSync, readFileSync } from "node:fs";
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
 * Acceptance test for the REAL shipped `templates/project/minimal/` template (task-30), exercised through the
 * public resolver + render path as a BLACK BOX — the way `init` will instantiate it and the task-26 deriver
 * resolves its snippets. It mirrors the actual on-disk template into a `MemoryFileSystem` (so the assertions
 * run against the genuine authored content, not a copy) and narrates an agent standing up a fresh project from
 * `minimal`. One `describe` per acceptance criterion. Pure and deterministic: no `init` command, no real
 * process/git. (No repo-root `AGENTS.md` is touched — the template's own front door under `templates/` is the
 * deliverable.)
 */

const REAL_TEMPLATES = fileURLToPath(new URL("../../../templates", import.meta.url));
const BUILTIN = "/builtin-templates";
const ROOT = "/my-installer";

/** Recursively mirror `srcDir` (real fs) into `fs` (MemoryFileSystem) under `destDir`. */
function mirror(fs: MemoryFileSystem, srcDir: string, destDir: string): void {
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcChild = join(srcDir, entry.name);
    const destChild = `${destDir}/${entry.name}`;
    if (entry.isDirectory()) mirror(fs, srcChild, destChild);
    else fs.write(destChild, readFileSync(srcChild, "utf8"));
  }
}

/** A MemoryFileSystem seeded with the real `templates/` tree at {@link BUILTIN}. */
function seedTemplates(): MemoryFileSystem {
  const fs = new MemoryFileSystem();
  mirror(fs, REAL_TEMPLATES, BUILTIN);
  return fs;
}

/** The params a fresh `init` supplies for a no-bundle project. */
function freshParams(name = "hermes-handoff"): Map<string, string> {
  return new Map([
    ["project-name", name],
    ["bundles", "  (none yet — add bundles with `wpm bundle new <id>`)"],
  ]);
}

/**
 * Instantiate the minimal template into `ROOT` exactly as `init` does (task-33): copy the `files/` tree with
 * substitution, AND render the two DERIVED artefacts (front-door `AGENTS.md` + the orchestrator `SKILL.md`) from
 * the `snippets/` tree — the single source after the task-33 collapse (they are no longer in `files/`). Returns
 * the produced relative paths.
 */
function instantiate(fs: MemoryFileSystem, params: Map<string, string>): string[] {
  const res = resolveTemplate("minimal", "project", { fs, builtinTemplatesRoot: BUILTIN });
  if (!res.found) throw new Error("minimal template not found");
  const produced: string[] = [];
  for (const file of renderTree(res.template.files, params)) {
    fs.write(join(ROOT, file.path), file.content);
    produced.push(file.path);
  }
  // The derived artefacts come from snippets/ (front-door = `AGENTS.md`; orchestrator = `…-installer/SKILL.md`):
  for (const snippet of res.template.snippets) {
    if (snippet.path === "AGENTS.md" || snippet.path.endsWith("-installer/SKILL.md")) {
      const r = renderSnippet(snippet, params);
      fs.write(join(ROOT, r.path), r.content);
      produced.push(r.path);
    }
  }
  return produced;
}

describe("minimal project template — acceptance (doc 06/07)", () => {
  describe("AC#1 — instantiating the minimal template produces a working project", () => {
    it("a fresh project root, ready to install into", () => {
      const fs = seedTemplates();
      instantiate(fs, freshParams("hermes-handoff"));

      // The manifest parses with the substituted identity and empty bundle/target lists:
      const manifest = parseManifest(parseYaml(fs.read(`${ROOT}/manifest.yml`)));
      expect(manifest.ok).toBe(true);
      if (manifest.ok) {
        expect(manifest.value.meta.name).toBe("hermes-handoff");
        expect(manifest.value.meta.version).toBe("0.1.0");
        expect(manifest.value.bundles).toEqual([]);
        expect(manifest.value.targets).toEqual([]);
      }

      // The always-read front door, the unattended-loop prompt, the entry README, and the orchestrator skill:
      expect(fs.exists(`${ROOT}/AGENTS.md`)).toBe(true);
      expect(fs.exists(`${ROOT}/RALPH-LOOP.md`)).toBe(true);
      expect(fs.exists(`${ROOT}/README.md`)).toBe(true);
      expect(fs.exists(`${ROOT}/installer-skills/hermes-handoff-installer/SKILL.md`)).toBe(true);
      expect(
        fs.exists(`${ROOT}/installer-skills/hermes-handoff-installer/references/journaling.md`),
      ).toBe(true);
    });
  });

  describe("AC#2 — the front door carries the three doc-07 elements", () => {
    it("the front door states policy; the orchestrator supplies procedure", () => {
      const fs = seedTemplates();
      instantiate(fs, freshParams("hermes-handoff"));
      const fd = fs.read(`${ROOT}/AGENTS.md`);
      const lc = fd.toLowerCase();

      // Recognition & kickoff: the install reframing + the entry points.
      expect(lc).toContain("install"); // reframing from "edit" to "install"
      expect(lc).toContain("recognition");
      expect(fd).toContain("hermes-handoff-installer"); // the installer-skill entry point
      expect(fd).toContain("RALPH-LOOP.md"); // unattended-run entry point
      expect(lc).toContain("goal"); // the /goal kickoff

      // The install shape: manifest orient → menu → detect → requires → per-task loop → resume.
      expect(fd).toContain("manifest.yml");
      expect(lc).toContain("menu");
      expect(lc).toContain("detect");
      expect(fd).toContain("requires");
      expect(lc).toContain("verify");
      expect(lc).toContain("record");
      expect(lc).toContain("resume");

      // The standing rules.
      expect(lc).toContain("standing rules");
      expect(lc).toContain("reverse"); // only reverse what you installed
      expect(lc).toContain("checksum"); // checksum before overwrite
      expect(lc).toContain("confirmation"); // pause at confirmation points

      // Mechanics deferred to the orchestrator's references — NOT inlined in the front door:
      expect(fd).toContain("references/journaling.md");
    });
  });

  describe("AC#3 — on-demand skill stubs are available for later use", () => {
    it("the three rendered-skill shapes, scaffolded and ready", () => {
      const fs = seedTemplates();
      const res = resolveTemplate("minimal", "project", { fs, builtinTemplatesRoot: BUILTIN });
      expect(res.found).toBe(true);
      if (!res.found) return;

      const find = (suffix: string) => res.template.snippets.find((s) => s.path.endsWith(suffix));
      const advisor = find("advisor.SKILL.md.tmpl");
      const installer = find("installer-skill.SKILL.md.tmpl");
      const payload = find("payload-skill.SKILL.md.tmpl");
      expect(advisor).toBeDefined();
      expect(installer).toBeDefined();
      expect(payload).toBeDefined();

      // Advisor: triggers on the user's NEED, names the bundle.
      if (advisor) {
        const r = renderSnippet(advisor, new Map([["bundle-id", "web-handoff"]]));
        expect(r.content).toContain("name: web-handoff-advisor");
        expect(r.content.toLowerCase()).toContain("need");
        expect(r.content).not.toMatch(/\{\{[^}]*\}\}/);
      }
      // Install-time helper.
      if (installer) {
        const r = renderSnippet(installer, new Map([["skill-name", "detect-os"]]));
        expect(r.content).toContain("name: detect-os");
        expect(r.content).not.toMatch(/\{\{[^}]*\}\}/);
      }
      // Payload: triggers on RUNTIME use, never install.
      if (payload) {
        const r = renderSnippet(payload, new Map([["skill-name", "handoff-web"]]));
        expect(r.content).toContain("name: handoff-web");
        expect(r.content.toLowerCase()).toContain("runtime");
        expect(r.content).not.toMatch(/\{\{[^}]*\}\}/);
      }
    });
  });

  describe("AC#4 — no placeholder survives instantiation", () => {
    it("every marker resolved; the deriver closes the loop with task-26/27", () => {
      const fs = seedTemplates();
      const produced = instantiate(fs, freshParams("hermes-handoff"));

      // Every produced file's content AND path is marker-free:
      for (const rel of produced) {
        expect(rel, `marker in produced path ${rel}`).not.toMatch(/\{\{[^}]*\}\}/);
        expect(fs.read(join(ROOT, rel)), `marker in produced file ${rel}`).not.toMatch(
          /\{\{[^}]*\}\}/,
        );
      }

      // Loop closure: the task-26 deriver resolves + renders the front-door + orchestrator from this template.
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
      const desired = deriver(project);
      const frontDoor = desired.files.find((f) => f.path === "AGENTS.md");
      const orchestrator = desired.files.find((f) => f.path.endsWith("-installer/SKILL.md"));
      expect(frontDoor).toBeDefined();
      expect(orchestrator).toBeDefined();
      expect(frontDoor?.content).toContain("hermes-handoff");
      expect(frontDoor?.content.toLowerCase()).toContain("install");
      expect(frontDoor?.content).not.toMatch(/\{\{[^}]*\}\}/);
      expect(orchestrator?.content).not.toMatch(/\{\{[^}]*\}\}/);
    });
  });
});
