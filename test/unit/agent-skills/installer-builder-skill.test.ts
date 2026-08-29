import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseYaml } from "../../../src/util/yaml.js";

/**
 * Acceptance test for the REAL shipped builder's own agent skill (task-32) at
 * `agent-skills/installer-builder/` — the static meta-skill (about `wpm` itself, NO `{{placeholders}}`) that
 * ships in the npm package so an agent reading it can drive the `wpm` CLI to AUTHOR a bundle-project (doc 12
 * §"BUILDER'S OWN AGENT SKILL"; doc 13 §0 principles; doc 05 progressive disclosure). This is STATIC content,
 * so the test reads the genuine authored files from disk via `node:fs` (tests may use `node:fs`) — no
 * MemoryFileSystem / resolver / subprocess ceremony. One `describe` per acceptance criterion.
 */

/** The real shipped skill directory on disk. */
const SKILL_DIR = fileURLToPath(
  new URL("../../../agent-skills/installer-builder", import.meta.url),
);
const SKILL_MD = join(SKILL_DIR, "SKILL.md");
const REFERENCES = [
  "command-reference.md",
  "authoring-workflow.md",
  "conventions.md",
  "quality-protocol.md",
  "task-conventions.md",
  "native-surfaces.md",
] as const;

/** Read a shipped skill file as UTF-8 text. */
function read(rel: string): string {
  return readFileSync(join(SKILL_DIR, rel), "utf8");
}

/**
 * Split a SKILL.md into its YAML frontmatter block and its markdown body. The frontmatter is the content
 * between the first two `---` fences (doc 05 §"Frontmatter fields": "the block must be the very first
 * content, fenced by `---`").
 */
function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (match === null) {
    return { frontmatter: "", body: text };
  }
  return { frontmatter: match[1] ?? "", body: match[2] ?? "" };
}

describe("installer-builder skill — frontmatter & activation triggers (AC#2, doc 12/05)", () => {
  it("SKILL.md exists with valid frontmatter: name `installer-builder` + a non-empty description", () => {
    expect(existsSync(SKILL_MD)).toBe(true);
    const { frontmatter } = splitFrontmatter(read("SKILL.md"));
    expect(frontmatter, "SKILL.md must open with a --- fenced frontmatter block").not.toBe("");

    const meta = parseYaml(frontmatter) as Record<string, unknown>;
    expect(meta.name).toBe("installer-builder");
    expect(typeof meta.description).toBe("string");
    expect((meta.description as string).length).toBeGreaterThan(0);
  });

  it("the description fires on the doc-12 authoring intents (author a bundle-project / build an installer)", () => {
    const { frontmatter } = splitFrontmatter(read("SKILL.md"));
    const meta = parseYaml(frontmatter) as Record<string, unknown>;
    const description = (meta.description as string).toLowerCase();

    // doc 12 §"The bundled agent skill" #1: triggers on "author a bundle-project," "build an installer," …
    expect(description).toContain("author");
    expect(description).toMatch(/bundle-project|installer/);
  });
});

describe("installer-builder skill — conveys the two doc-13 §0 principles (AC#2)", () => {
  it("the body states the thin-builder / fat-agent principle", () => {
    const body = splitFrontmatter(read("SKILL.md")).body.toLowerCase();
    // doc 13 §0: "thin builder, fat agent" — the builder authors/packages, never runs the install itself.
    expect(body).toMatch(/thin builder|thin-builder/);
    expect(body).toContain("fat agent");
    // and the load-bearing consequence: the builder never runs / installs anything.
    expect(body).toMatch(/never (runs|installs)/);
  });

  it("the body states the SDLC-agnostic principle (a workflow is vendored content, never built in)", () => {
    const body = splitFrontmatter(read("SKILL.md")).body.toLowerCase();
    // doc 13 §0: "The system is SDLC-agnostic; a workflow is vendored content, never core."
    expect(body).toContain("sdlc-agnostic");
    expect(body).toMatch(/vendor/); // a workflow is VENDORED, not built in
  });
});

describe("installer-builder skill — self-sufficient to drive the CLI (AC#1, doc 12/10/11)", () => {
  it("the body references the load-bearing CLI verbs (init, bundle new, build)", () => {
    const body = splitFrontmatter(read("SKILL.md")).body;
    expect(body).toContain("wpm init");
    expect(body).toContain("bundle new");
    expect(body).toContain("build");
  });

  it("the body teaches driving Backlog.md directly for recipe tasks (the no-mirror rule)", () => {
    const body = splitFrontmatter(read("SKILL.md")).body.toLowerCase();
    // doc 10/11 no-mirror: install-backlog task ops go through Backlog.md directly, not a wpm wrapper.
    expect(body).toContain("backlog");
    expect(body).toMatch(/install-backlog|recipe task|directly/);
  });
});

describe("installer-builder skill — progressive disclosure (AC#3, doc 05/12)", () => {
  it("all references exist and are non-trivial", () => {
    for (const ref of REFERENCES) {
      const path = join(SKILL_DIR, "references", ref);
      expect(existsSync(path), `${ref} must exist`).toBe(true);
      const content = readFileSync(path, "utf8");
      expect(content.length, `${ref} must be substantial`).toBeGreaterThan(400);
      const nonEmptyLines = content.split("\n").filter((l) => l.trim().length > 0);
      expect(nonEmptyLines.length, `${ref} must have real content`).toBeGreaterThan(15);
    }
  });

  it("the SKILL.md POINTS at each reference by filename (depth is reachable, not front-loaded)", () => {
    const skill = read("SKILL.md");
    for (const ref of REFERENCES) {
      expect(skill, `SKILL.md must name references/${ref}`).toContain(ref);
    }
  });

  it("the SKILL.md body is lean — smaller than the references combined (depth lives in references/)", () => {
    const skillBytes = Buffer.byteLength(read("SKILL.md"), "utf8");
    const referencesBytes = REFERENCES.reduce(
      (sum, ref) => sum + Buffer.byteLength(read(join("references", ref)), "utf8"),
      0,
    );
    expect(skillBytes).toBeLessThan(referencesBytes);
  });

  it("the SKILL.md does not inline a full command table (that belongs in command-reference.md)", () => {
    const body = splitFrontmatter(read("SKILL.md")).body;
    // A light heuristic: the lean body names a few verbs (init/bundle/build) but should NOT enumerate the
    // whole command surface — the deep leaf groups belong in command-reference.md.
    const groups = [
      "project meta",
      "project targets",
      "project version",
      "bundle template",
      "template list",
    ];
    const inlinedGroups = groups.filter((g) => body.includes(`wpm ${g}`));
    expect(
      inlinedGroups.length,
      "the full command table belongs in command-reference.md, not the SKILL.md",
    ).toBeLessThan(3);
  });
});

describe("installer-builder skill — static content hygiene (no placeholders)", () => {
  it("neither the SKILL.md nor any reference contains a {{placeholder}} marker", () => {
    const files = ["SKILL.md", ...REFERENCES.map((r) => join("references", r))];
    for (const file of files) {
      expect(read(file), `${file} is static content about wpm — no template markers`).not.toMatch(
        /\{\{[^}]*\}\}/,
      );
    }
  });
});

describe("installer-builder skill — references carry their promised depth (AC#1 self-sufficiency)", () => {
  // The SKILL.md POINTS at the references for depth; AC#1 (an agent can drive the CLI without external
  // instruction) only holds if that depth is actually THERE. A non-trivial-but-empty reference would pass the
  // length floors yet break the AC, so each reference is checked for its promised content.

  it("command-reference.md actually enumerates the wpm command surface (doc 10)", () => {
    const cmd = read(join("references", "command-reference.md")).toLowerCase();
    // The structural command groups + key leaves an agent needs to find here:
    for (const verb of [
      "wpm init",
      "wpm project",
      "wpm bundle new",
      "wpm bundle <id>",
      "wpm build",
    ]) {
      expect(cmd, `command-reference must document ${verb}`).toContain(verb);
    }
    // and it restates the no-mirror discipline (task ops are not wrapped):
    expect(cmd).toContain("backlog");
  });

  it("conventions.md covers V2 tagging + the Backlog.md flag rules (doc 08)", () => {
    const conv = read(join("references", "conventions.md"));
    // The three tags:
    expect(conv).toContain("kind:state");
    expect(conv).toContain("kind:migration");
    expect(conv).toContain("step:");
    expect(conv.toLowerCase()).toContain("milestone"); // the version axis
    // The flag gotchas an agent must get right:
    expect(conv.toLowerCase()).toMatch(/do not accumulate|comma-separated/); // labels in ONE -l
    expect(conv).toContain("--dep"); // dependency by id
    // and the two cross-cutting rules:
    expect(conv.toLowerCase()).toContain("no-mirror");
    expect(conv.toLowerCase()).toMatch(/structure[, ]+not[ -]content|structure-not-content/);
  });

  it("authoring-workflow.md covers the init → bundle new → fill → build arc + the authoring-backlog (doc 11)", () => {
    const wf = read(join("references", "authoring-workflow.md"));
    expect(wf).toContain("authoring-backlog");
    expect(wf).toContain("wpm init");
    expect(wf).toContain("bundle new");
    expect(wf).toContain("build dry-run");
    // it teaches filling the install-backlog via Backlog.md directly:
    expect(wf).toContain("backlog task create");
    // and self-attested completion (the CLI never auto-closes):
    expect(wf.toLowerCase()).toMatch(/self-attest|never auto-close/);
  });
});
