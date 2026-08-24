import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseYaml } from "../../../src/util/yaml.js";

const SKILL_MD = fileURLToPath(
  new URL("../../../agent-skills/wpm-author-bundle/SKILL.md", import.meta.url),
);
const SKILL_DIR = dirname(SKILL_MD);

function readSkill(): string {
  return readFileSync(SKILL_MD, "utf8");
}

function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  return match === null
    ? { frontmatter: "", body: text }
    : { frontmatter: match[1] ?? "", body: match[2] ?? "" };
}

function normalizedBody(): string {
  return splitFrontmatter(readSkill()).body.toLowerCase().replace(/\s+/g, " ");
}

describe("wpm-author-bundle workspace skill", () => {
  it("is one portable, independently discoverable skill with a focused activation description", () => {
    expect(existsSync(SKILL_MD)).toBe(true);
    const { frontmatter } = splitFrontmatter(readSkill());
    const metadata = parseYaml(frontmatter) as Record<string, unknown>;

    expect(metadata).toEqual({
      name: "wpm-author-bundle",
      description: expect.any(String),
    });
    const description = String(metadata.description).toLowerCase();
    expect(description).toMatch(/plan|change|create|revise/);
    expect(description).toContain("bundle");
    expect(description).toMatch(/wpm|work package/);
    expect(description).toMatch(/not .*recipe|not .*skill|leave .*recipe|leave .*skill/);
    expect(readdirSync(SKILL_DIR).sort()).toEqual(["SKILL.md"]);
  });

  it("establishes a bundle boundary without relying on bootstrap context or inventing decisions", () => {
    const body = normalizedBody();

    expect(body).toMatch(/without .*prior|no .*prior|self-contained/);
    expect(body).toContain("belongs");
    expect(body).toContain("external dependenc");
    expect(body).toMatch(/separate capabilit/);
    expect(body).toContain("unresolved");
    expect(body).toMatch(/do not (guess|invent|assume)|never (guess|invent|assume)/);
    expect(body).toMatch(/preserve .*wpm-managed values|wpm-managed values .*preserve/);
    expect(body).toMatch(/do not turn .*focused edit .*re-confirmation/);
  });

  it("drives existing WPM state for purpose, lifecycle, dependencies, and payload registrations", () => {
    const body = splitFrontmatter(readSkill()).body;

    for (const surface of [
      "wpm project validate",
      "wpm bundle list",
      "wpm bundle <id> show",
      "wpm bundle new",
      "wpm bundle <id> meta",
      "wpm bundle <id> requires",
      "wpm bundle <id> files",
      "wpm bundle <id> templates",
      "wpm bundle <id> scripts",
      "wpm bundle <id> skills",
    ]) {
      expect(body, surface).toContain(surface);
    }
    expect(body.toLowerCase()).toMatch(/purpose|summary/);
    expect(body.toLowerCase()).toMatch(/enable|disable|lifecycle/);
    expect(body).toMatch(/bundle\.yml|WPM-managed state/);
    expect(body.toLowerCase()).toMatch(/do not .*hand-edit|never .*hand-edit/);
  });

  it("does not mistake WPM defaults or temporary command preconditions for author decisions", () => {
    const body = normalizedBody();

    expect(body).toContain("<id> bundle");
    expect(body).toContain("0.1.0");
    expect(body).toContain("safe");
    expect(body).toMatch(/defaults? .*not .*agreement|not .*author agreement/);
    expect(body).toContain("new --disabled");
    expect(body).toMatch(/per-bundle .*enabled|enabled .*per-bundle/);
    expect(body).toMatch(/enable.*change.*disable|enable.*mutat.*disable/);
    expect(body).toMatch(/do not silently (enable|disable)|never silently (enable|disable)/);
    expect(body).not.toContain("bundle remove <id> --yes");
    expect(body).toMatch(/never .*--yes|do not .*--yes/);
    expect(body).toMatch(/project validate .*observation/);
    expect(body).toMatch(/no executor target .*must not block/);
    expect(body).toMatch(/never add or infer .*target/);
  });

  it("keeps dependency ranges explicit and distinguishes registration from pending content", () => {
    const body = normalizedBody();

    expect(body).toMatch(/dependency .*enabled|enabled .*dependency/);
    expect(body).toMatch(/self.*cycle|cycle.*self/);
    expect(body).toMatch(/constraint|version range/);
    expect(body).toMatch(/explicit range|range .*explicit/);
    expect(body).toMatch(/omitt.*range|default range/);
    expect(body).toMatch(/before .*requires add.*inspect|inspect .*before .*requires add/);
    expect(body).toMatch(/warning .*after writing|after writing .*warning/);
    expect(body).toMatch(/files.*templates.*delivered payload/);
    expect(body).toMatch(/scripts.*install-time tooling.*not delivered payload/);
    expect(body).toMatch(/skills.*delivered agent skills/);
    expect(body).toMatch(/installer-skills.*non-delivered install-time helpers/);
    expect(body).toMatch(/skills.*installer-skills.*advisor.*scaffold|scaffold.*pending content/);
    expect(body).toMatch(/registration .*not .*content|registered .*pending/);
  });

  it("keeps recipe, agent-skill/front-door, and whole-package review work explicitly pending", () => {
    const body = splitFrontmatter(readSkill()).body;

    for (const specialist of ["wpm-author-recipe", "wpm-author-skill", "wpm-review-package"]) {
      expect(body).toContain(specialist);
    }
    expect(body.toLowerCase()).toContain("pending");
    expect(body.toLowerCase()).toMatch(/independently usable|bundle result/);
    expect(body.toLowerCase()).toMatch(/name only .*actually requires/);
  });

  it("fails closed on invalid workspace, identity, or dependency and never masks unresolved work as success", () => {
    const body = normalizedBody();

    expect(body).toContain("invalid workspace");
    expect(body).toMatch(/invalid .*bundle (id|identity)|bundle (id|identity).*invalid/);
    expect(body).toMatch(/dependency .*conflict|conflicting dependenc/);
    expect(body).toMatch(/blocked|blocking/);
    expect(body).toMatch(/do not claim success|never claim success|not complete/);
    expect(body).toMatch(/successful state change.*resolved/);
    expect(body).toMatch(/do not .*init|never .*init|no auto-init/);
  });

  it("returns an inspectable result that separates resolved, unresolved, blocked, and pending boundaries", () => {
    const body = normalizedBody();

    for (const state of ["resolved", "unresolved", "blocked", "pending"]) {
      expect(body).toContain(state);
    }
    for (const field of ["bundle", "purpose", "lifecycle", "metadata", "dependencies", "payload"]) {
      expect(body).toContain(field);
    }
  });

  it("contains no checkout-specific path, template placeholder, or missing local resource", () => {
    const text = readSkill();

    expect(text).not.toMatch(/\/workspace\/|\/home\/agent\/|file:\/\//);
    expect(text).not.toMatch(/\{\{[^}]+\}\}/);
    expect(text).not.toMatch(/\]\((?:\.\.?\/|references\/|scripts\/|assets\/)/);
    expect(basename(SKILL_DIR)).toBe("wpm-author-bundle");
  });

  it("uses identical source-free bytes at Codex and Claude Code native paths", () => {
    const root = mkdtempSync(join(tmpdir(), "wpm-author-bundle-native-"));
    try {
      const source = readSkill();
      for (const nativeRoot of [
        join(root, ".agents", "skills", "wpm-author-bundle"),
        join(root, ".claude", "skills", "wpm-author-bundle"),
      ]) {
        cpSync(SKILL_DIR, nativeRoot, { recursive: true });
        const text = readFileSync(join(nativeRoot, "SKILL.md"), "utf8");
        expect(text).toBe(source);
        expect(basename(nativeRoot)).toBe("wpm-author-bundle");
        expect(
          (parseYaml(splitFrontmatter(text).frontmatter) as Record<string, unknown>).name,
        ).toBe("wpm-author-bundle");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
