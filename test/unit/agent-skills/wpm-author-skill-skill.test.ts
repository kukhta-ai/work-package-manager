import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseYaml } from "../../../src/util/yaml.js";

const SKILL_MD = fileURLToPath(
  new URL("../../../agent-skills/wpm-author-skill/SKILL.md", import.meta.url),
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

describe("wpm-author-skill workspace skill", () => {
  it("is one portable skill with a focused capability-authoring discovery contract", () => {
    expect(existsSync(SKILL_MD)).toBe(true);
    const { frontmatter } = splitFrontmatter(readSkill());
    const metadata = parseYaml(frontmatter) as Record<string, unknown>;

    expect(metadata).toEqual({
      name: "wpm-author-skill",
      description: expect.any(String),
    });
    const description = String(metadata.description).toLowerCase();
    expect(description).toMatch(/author|create|revise|change/);
    expect(description).toMatch(/advisor|installer.*helper|payload skill|front door/);
    expect(description).toMatch(/not .*bundle|leave .*bundle/);
    expect(description).toMatch(/not .*recipe|leave .*recipe/);
    expect(description).toMatch(/not .*review|leave .*review/);
    expect(readdirSync(SKILL_DIR).sort()).toEqual(["SKILL.md"]);
  });

  it("classifies all six capability roles before mutation and binds the discovery facts", () => {
    const body = normalizedBody();

    for (const role of [
      "advisor",
      "project installer helper",
      "bundle installer helper",
      "payload skill",
      "executor front door",
      "workspace front door",
    ]) {
      expect(body, role).toContain(role);
    }
    for (const fact of [
      "role",
      "intended user",
      "activation",
      "source path",
      "registration",
      "trigger",
      "discovery",
    ]) {
      expect(body, fact).toContain(fact);
    }
    expect(body).toMatch(/classif.*before.*(write|mutat|change)/);
    expect(body).toMatch(/without .*prior|no .*prior|self-contained/);
  });

  it("maps each skill-shaped role to its existing WPM path, registration, user, and activation", () => {
    const body = readSkill();
    const normalized = body.toLowerCase().replace(/\s+/g, " ");

    for (const surface of [
      "wpm project show --json",
      "wpm bundle list",
      "wpm bundle <id> show",
      "wpm bundle <id> advisor add",
      "wpm project installer-skills add",
      "wpm bundle <id> installer-skills add",
      "wpm bundle <id> skills add",
    ]) {
      expect(body, surface).toContain(surface);
    }
    for (const path of [
      "wip/installer-skills/<bundle>-advisor/SKILL.md",
      "wip/installer-skills/<name>/SKILL.md",
      "wip/bundles/<id>/installer-skills/<name>/SKILL.md",
      "wip/bundles/<id>/payload/agent-skills/<name>/SKILL.md",
    ]) {
      expect(body, path).toContain(path);
    }
    expect(normalized).toMatch(/advisor.*before install/);
    expect(normalized).toMatch(/installer helper.*during.*install/);
    expect(normalized).toMatch(/payload skill.*after delivery/);
    expect(normalized).toMatch(/advisor.*not.*registr|no .*registry.*advisor/);
  });

  it("distinguishes disk presence, registration, and complete authored discovery", () => {
    const body = normalizedBody();

    expect(body).toMatch(/disk presence|exists on disk|on-disk/);
    expect(body).toMatch(/disk.*not.*registr|registr.*not.*disk/);
    expect(body).toMatch(/registr.*not.*content|registered.*incomplete/);
    expect(body).toMatch(/todo|placeholder|scaffold/);
    expect(body).toMatch(/todo.*incomplete|placeholder.*incomplete|scaffold.*incomplete/);
    expect(body).toMatch(/frontmatter.*name/);
    expect(body).toMatch(/registry.*key/);
    expect(body).toMatch(/focused trigger/);
    expect(body).toMatch(/re-read|read back|verify after/);
  });

  it("preserves package-owned names and rejects user-authored use of the reserved WPM namespace", () => {
    const body = normalizedBody();

    expect(body).toContain("wpm-");
    expect(body).toMatch(/reserved.*wpm|wpm-owned.*wpm-/);
    expect(body).toMatch(/package-owned.*do not.*wpm|do not .*prefix.*package-owned/);
    expect(body).toContain("<project>-installer");
    expect(body).toContain("<bundle>-advisor");
    expect(body).toMatch(/conflict.*wpm-|wpm-.*conflict/);
    expect(body).toMatch(/preserve.*custom.*path|custom.*path.*preserve/);
  });

  it("enforces one portable native identity across names, paths, frontmatter, registries, and invocation", () => {
    const body = normalizedBody();

    expect(body).toMatch(/lowercase letters.*digits.*hyphens|lowercase.*digits.*single hyphens/);
    expect(body).toMatch(/64 characters/);
    expect(body).toMatch(/1,?024 characters/);
    expect(body).toMatch(/frontmatter.*name.*(requested|intended).*identity/);
    expect(body).toMatch(/registry.*key.*frontmatter.*name|frontmatter.*name.*registry.*key/);
    expect(body).toMatch(/directory.*explicit.*invocation|explicit.*invocation.*directory/);
    expect(body).toMatch(/advisor.*no registry.*directory|advisor.*directory.*frontmatter/);
    expect(body).toMatch(/custom.*document.*basename.*not.*identity|do not .*basename.*identity/);
    expect(body).toMatch(
      /a custom helper path is not discoverable unless its native package remains under the role's scanned `installer-skills` directory/,
    );
  });

  it("keeps workspace-authoring and deliverable-executor front doors in distinct contexts", () => {
    const body = readSkill();
    const normalized = body.toLowerCase().replace(/\s+/g, " ");

    expect(body).toContain("wip/_AGENTS.md");
    expect(body).toContain("wip/bundles/<id>/_AGENTS.md");
    expect(body).toContain("AGENTS.md");
    expect(body).toContain("CLAUDE.md");
    expect(normalized).toMatch(/reserved.*_agents\.md|_agents\.md.*reserved/);
    expect(normalized).toMatch(/never .*canonical.*under.*wip|do not .*agents\.md.*under.*wip/);
    expect(normalized).toMatch(/workspace.*authoring.*separate|separate.*executor/);
    expect(normalized).toMatch(/task-120|wpm-author.*integration/);
    expect(normalized).toMatch(/do not .*managed.*workspace|never .*managed.*workspace/);
    expect(normalized).toMatch(/targets.*independent|do not .*infer.*target/);
  });

  it("fails closed and aggregates ambiguity or conflicts without role conversion or placement guesses", () => {
    const body = normalizedBody();

    expect(body).toMatch(/all .*conflict|every .*conflict|aggregate/);
    expect(body).toContain("unresolved");
    expect(body).toContain("blocked");
    expect(body).toContain("incomplete");
    expect(body).toContain("ready");
    expect(body).toMatch(
      /do not (guess|invent|assume).*placement|never (guess|invent|assume).*placement/,
    );
    expect(body).toMatch(/do not .*convert.*role|never .*role conversion|do not .*move.*role/);
    expect(body).toMatch(/do not .*hand-edit.*manifest|never .*hand-edit.*manifest/);
    expect(body).toMatch(/do not .*claim.*discover|never .*claim.*discover/);
    expect(body).toMatch(/completed mutation|successful write|partial.*write/);
    expect(body).toMatch(
      /if any .*blocked.*no .*requested capability.*mutat|no .*requested capability.*mutat.*if any .*block/,
    );
  });

  it("previews each role's real removal consequence before an explicitly authorized conversion", () => {
    const body = normalizedBody();

    expect(body).toMatch(/advisor remove.*deletes.*directory/);
    expect(body).toMatch(/helper.*remove.*deregister.*leave.*source/);
    expect(body).toMatch(/remov.*registered payload.*deregister.*leave.*source/);
    expect(body).toMatch(/remov.*unregistered payload.*delete.*conventional.*directory/);
    expect(body).toMatch(
      /preview.*consequence.*explicit.*author|explicit.*author.*preview.*consequence/,
    );
  });

  it("uses registry-authoritative read-backs instead of treating orientation or disk scans as registration", () => {
    const body = normalizedBody();

    expect(body).toMatch(
      /project show.*does not.*installer.*registr|orientation.*not.*registration/,
    );
    expect(body).toMatch(/bundle.*show.*does not.*registr|bundle.*show.*tree.*not.*registration/);
    expect(body).toMatch(/manifest\.yml.*installerskills/);
    expect(body).toMatch(/bundle\.yml.*installerskills/);
    expect(body).toMatch(/bundle\.yml.*payload\.skills/);
    expect(body).toMatch(/helper.*list.*disk.*not.*registr|installer-skills list.*not.*registr/);
  });

  it("rejects unsafe source paths before a custom attach can escape or masquerade as a native skill", () => {
    const body = normalizedBody();

    expect(body).toContain(
      "require a portable relative path with forward slashes and no absolute, empty, dot, or dot-dot segments",
    );
    expect(body).toMatch(/ordinary file.*not.*symlink|reject.*symlink.*ordinary file/);
    expect(body).toMatch(/inside.*resolved.*project|inside.*selected bundle/);
  });

  it("uses identical source-free bytes at Codex and Claude Code native paths", () => {
    const root = mkdtempSync(join(tmpdir(), "wpm-skill-native-"));
    try {
      const codexSkill = join(root, ".agents", "skills", "wpm-author-skill");
      const claudeSkill = join(root, ".claude", "skills", "wpm-author-skill");
      cpSync(SKILL_DIR, codexSkill, { recursive: true });
      cpSync(SKILL_DIR, claudeSkill, { recursive: true });

      const source = readSkill();
      const codexText = readFileSync(join(codexSkill, "SKILL.md"), "utf8");
      const claudeText = readFileSync(join(claudeSkill, "SKILL.md"), "utf8");
      expect(codexText).toBe(source);
      expect(claudeText).toBe(source);

      const codexMetadata = parseYaml(splitFrontmatter(codexText).frontmatter) as Record<
        string,
        unknown
      >;
      const claudeMetadata = parseYaml(splitFrontmatter(claudeText).frontmatter) as Record<
        string,
        unknown
      >;
      expect(basename(codexSkill)).toBe("wpm-author-skill");
      expect(basename(claudeSkill)).toBe("wpm-author-skill");
      expect(codexMetadata.name).toBe("wpm-author-skill");
      expect(claudeMetadata.name).toBe("wpm-author-skill");
      expect(String(codexMetadata.description)).toBe(String(claudeMetadata.description));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("routes adjacent work without absorbing it", () => {
    const body = readSkill();

    for (const specialist of [
      "wpm-author-bundle",
      "wpm-author-recipe",
      "wpm-review-package",
      "wpm-author",
    ]) {
      expect(body).toContain(specialist);
    }
    expect(body.toLowerCase()).toMatch(/pending|separate|outside/);
  });

  it("contains no checkout-specific path, template placeholder, or local resource dependency", () => {
    const text = readSkill();

    expect(text).not.toMatch(/\/workspace\/|\/home\/agent\/|file:\/\//);
    expect(text).not.toMatch(/\{\{[^}]+\}\}/);
    expect(text).not.toMatch(/\]\((?:\.\.?\/|references\/|scripts\/|assets\/)/);
    expect(basename(SKILL_DIR)).toBe("wpm-author-skill");
  });
});
