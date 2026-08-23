import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseYaml } from "../../../src/util/yaml.js";

const SKILL_MD = fileURLToPath(
  new URL("../../../agent-skills/wpm-review-package/SKILL.md", import.meta.url),
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

describe("wpm-review-package workspace skill", () => {
  it("is one portable skill with a focused read-only package-review discovery contract", () => {
    expect(existsSync(SKILL_MD)).toBe(true);
    const { frontmatter } = splitFrontmatter(readSkill());
    const metadata = parseYaml(frontmatter) as Record<string, unknown>;

    expect(metadata).toEqual({
      name: "wpm-review-package",
      description: expect.any(String),
    });
    const description = String(metadata.description).toLowerCase();
    expect(description).toMatch(/review|inspect|assess/);
    expect(description).toMatch(/work package|wpm package|package.*handoff/);
    expect(description).toMatch(/read-only|without changing|does not fix/);
    expect(description).toMatch(/not .*publish|leave .*publication|does not authorize/);
    expect(readdirSync(SKILL_DIR).sort()).toEqual(["SKILL.md"]);
  });

  it("defines the complete bounded FR49 catalog as exactly seven named categories", () => {
    const body = normalizedBody();
    const categories = [
      "package structure",
      "references",
      "registrations",
      "version constraints",
      "context-less executor simulation",
      "build non-leakage",
      "release readiness",
    ];

    for (const category of categories) expect(body, category).toContain(category);
    expect(body).toMatch(/seven.*categor|7.*categor/);
    expect(body).toMatch(/complete.*boundary|whole.*boundary|finite.*catalog/);
    expect(body).toMatch(/do not .*expand|outside .*catalog|no .*general.*review/);
  });

  it("derives the review from durable artifacts without hidden conversation or another WPM skill", () => {
    const body = readSkill();
    const normalized = body.toLowerCase().replace(/\s+/g, " ");

    for (const surface of [
      "wpm project show --json",
      "wpm bundle list",
      "wpm bundle <id> show",
      "wpm project validate",
      "manifest.yml",
      "bundle.yml",
      "wpm.lock",
    ]) {
      expect(body, surface).toContain(surface);
    }
    expect(normalized).toMatch(/without .*prior|no .*prior|fresh context/);
    expect(normalized).toMatch(/without another wpm skill|do not .*another wpm skill/);
    expect(normalized).toMatch(/durable.*artifact|artifact.*durable/);
    expect(normalized).toMatch(/missing.*decision.*unresolved|unresolved.*missing.*decision/);
  });

  it("aggregates all detected coherence defects with their artifact or relationship", () => {
    const body = normalizedBody();

    expect(body).toMatch(/all .*defect|every .*defect|aggregate/);
    for (const category of ["package structure", "reference", "registration", "version"]) {
      expect(body, category).toContain(category);
    }
    expect(body).toMatch(/affected artifact|artifact.*relationship|relationship.*evidence/);
    expect(body).toMatch(/owning.*manifest\.yml|manifest\.yml.*authoritative/);
    expect(body).toMatch(/owning.*bundle\.yml|bundle\.yml.*authoritative/);
    expect(body).toMatch(/disk.*not.*registration|orientation.*not.*registration/);
    expect(body).toMatch(/project validate.*not.*whole|not .*stop.*project validate/);
    expect(body).toMatch(/blocked.*dependent.*independent|independent.*continue/);
  });

  it("does not invent defects for WPM convention-owned scaffolds, roles, or native aliases", () => {
    const body = normalizedBody();

    expect(body).toMatch(/bundle-template.*not.*(?:orphan|enabled bundle|defect)/);
    expect(body).toMatch(/disabled.*not.*defect|not.*defect.*disabled/);
    expect(body).toMatch(/main.*installer.*not.*registr|not.*registr.*main.*installer/);
    expect(body).toMatch(/advisor.*not.*registr|not.*registr.*advisor/);
    expect(body).toMatch(/absolute.*scope alias.*not.*defect|not.*defect.*absolute.*scope alias/);
    expect(body).toMatch(/archive.*relative.*bounded|relative.*bounded.*archive/);
  });

  it("simulates fresh install and evidenced transitions from a context-less executor view", () => {
    const body = normalizedBody();

    expect(body).toMatch(/fresh install/);
    expect(body).toMatch(/version transition|update|migration/);
    expect(body).toMatch(/context-less executor/);
    for (const defect of [
      "unstated prerequisite",
      "ambiguous outcome",
      "unresolved reference",
      "undeclared coupling",
      "missing verification",
      "usage guidance",
    ]) {
      expect(body, defect).toContain(defect);
    }
    expect(body).toMatch(/state.*migration|migration.*from-version|durable.*transition/);
  });

  it("obtains real build evidence only from a symlink-preserving disposable copy", () => {
    const body = readSkill();
    const normalized = body.toLowerCase().replace(/\s+/g, " ");

    expect(body).toContain("wpm build dry-run");
    expect(body).toContain("wpm build package");
    expect(normalized).toMatch(/disposable.*copy/);
    expect(normalized).toMatch(/preserv.*symlink|symlink-preserving/);
    expect(normalized).toMatch(/snapshot.*file.*bytes|file.*bytes.*snapshot/);
    expect(normalized).toMatch(/snapshot.*symlink.*target|symlink.*target.*snapshot/);
    expect(normalized).toMatch(/original.*unchanged|unchanged.*original/);
    expect(normalized).toMatch(/dry-run.*not.*enough|dry-run.*alone.*not.*evidence/);
    expect(normalized).toMatch(/missing.*archive.*not ready|cannot .*archive.*not-ready/);
    expect(normalized).toMatch(/copy.*outside.*source git worktree/);
    expect(normalized).toMatch(/git discovery.*cannot resolve.*original/);
    expect(normalized).toMatch(/remove.*copy's `builds\/`.*empty/);
    expect(normalized).toMatch(/expected output.*absent.*before.*builder/);
    expect(normalized).toContain("wpm build package --format tarball");
    expect(normalized).toContain("wpm build package --format git");
    expect(normalized).toMatch(/--format zip.*platform tools.*available/);
  });

  it("orders the immutable baseline before copy proof, disposable markers, and fresh builds", () => {
    const normalized = readSkill().toLowerCase().replace(/\s+/g, " ");
    const originalBaseline = normalized.indexOf("snapshot the original workspace");
    const copyEquivalence = normalized.indexOf("unmodified-copy equivalence checks");
    const disposableMarker = normalized.indexOf("plant a unique review marker");
    const freshBuild = normalized.indexOf("fresh real `wpm build package");

    expect(originalBaseline).toBeGreaterThan(-1);
    expect(copyEquivalence).toBeGreaterThan(originalBaseline);
    expect(disposableMarker).toBeGreaterThan(copyEquivalence);
    expect(freshBuild).toBeGreaterThan(disposableMarker);
    expect(normalized).toMatch(/never plant the marker in the original workspace/);
  });

  it("blocks readiness on authoring leakage while preserving legitimate executor front doors", () => {
    const body = normalizedBody();

    expect(body).toContain("wpm-review-package");
    expect(body).toContain(".agents/skills");
    expect(body).toContain(".claude/skills");
    expect(body).toMatch(/unique.*marker|planted.*marker/);
    expect(body).toMatch(/authoring.*leak.*block|block.*authoring.*leak/);
    expect(body).toMatch(/executor.*agents\.md.*legitimate|allow.*executor.*agents\.md/);
    expect(body).toMatch(/archive.*path.*content|paths.*link.*content/);
  });

  it("joins coherence, simulation, and build evidence before local readiness", () => {
    const body = normalizedBody();

    expect(body).toMatch(/coherence.*simulation.*build/);
    expect(body).toMatch(/all seven.*complete|every .*categor.*complete/);
    expect(body).toMatch(/ready.*not-ready|not-ready.*ready/);
    expect(body).toMatch(/unresolved.*not-ready|blocked.*not-ready/);
    expect(body).toMatch(/local.*handoff.*not.*publication|not .*publication authorization/);
    expect(body).toMatch(/successful.*not.*erase|one .*success.*not.*erase/);
  });

  it("keeps the review subject unchanged and never takes fix or publication authority", () => {
    const body = normalizedBody();

    expect(body).toMatch(/read-only/);
    expect(body).toMatch(/do not .*fix|never .*repair|does not .*rewrite/);
    expect(body).toMatch(/do not .*check off|never .*close.*task|do not .*task.*status/);
    expect(body).toMatch(/do not .*build publish|never .*build publish/);
    expect(body).toMatch(/do not .*tag|never .*tag/);
    expect(body).toMatch(/do not .*npm|never .*npm/);
    expect(body).toMatch(/separate.*authori|separately authorized/);
  });

  it("returns one stable inspectable result with all evidence and blocked boundaries", () => {
    const body = normalizedBody();

    for (const field of [
      "workspace",
      "prospective archive",
      "catalog",
      "findings",
      "blocked",
      "unresolved",
      "simulation",
      "build",
      "unchanged",
      "release readiness",
    ]) {
      expect(body, field).toContain(field);
    }
    expect(body).toMatch(/sort|stable order|deterministic/);
  });

  it("uses identical source-free bytes at Codex and Claude Code native paths", () => {
    const root = mkdtempSync(join(tmpdir(), "wpm-review-skill-native-"));
    try {
      const codexSkill = join(root, ".agents", "skills", "wpm-review-package");
      const claudeSkill = join(root, ".claude", "skills", "wpm-review-package");
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
      expect(basename(codexSkill)).toBe("wpm-review-package");
      expect(basename(claudeSkill)).toBe("wpm-review-package");
      expect(codexMetadata.name).toBe("wpm-review-package");
      expect(claudeMetadata.name).toBe("wpm-review-package");
      expect(String(codexMetadata.description)).toBe(String(claudeMetadata.description));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("contains no checkout-specific path, template placeholder, or local resource dependency", () => {
    const text = readSkill();

    expect(text).not.toMatch(/\/workspace\/|\/home\/agent\/|file:\/\//);
    expect(text).not.toMatch(/\{\{[^}]+\}\}/);
    expect(text).not.toMatch(/\]\((?:\.\.?\/|references\/|scripts\/|assets\/)/);
    expect(basename(SKILL_DIR)).toBe("wpm-review-package");
  });
});
