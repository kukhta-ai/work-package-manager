import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseYaml } from "../../../src/util/yaml.js";

const SKILL_MD = fileURLToPath(
  new URL("../../../agent-skills/wpm-author-recipe/SKILL.md", import.meta.url),
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

describe("wpm-author-recipe workspace skill", () => {
  it("is one portable skill with a focused recipe-authoring discovery contract", () => {
    expect(existsSync(SKILL_MD)).toBe(true);
    const { frontmatter } = splitFrontmatter(readSkill());
    const metadata = parseYaml(frontmatter) as Record<string, unknown>;

    expect(metadata).toEqual({
      name: "wpm-author-recipe",
      description: expect.any(String),
    });
    const description = String(metadata.description).toLowerCase();
    expect(description).toMatch(/author|create|revise|change/);
    expect(description).toMatch(/install.*(recipe|backlog)|(recipe|backlog).*install/);
    expect(description).toMatch(/not .*bundle|leave .*bundle/);
    expect(description).toMatch(/not .*skill|leave .*skill/);
    expect(description).toMatch(/not .*review|leave .*review/);
    expect(readdirSync(SKILL_DIR).sort()).toEqual(["SKILL.md"]);
  });

  it("keeps the bundle install backlog as the only recipe source and uses current direct Backlog surfaces", () => {
    const body = splitFrontmatter(readSkill()).body;
    const normalized = body.toLowerCase().replace(/\s+/g, " ");

    for (const surface of [
      "wpm project show --json",
      "wpm bundle <id> show",
      "backlog --version",
      "backlog task create --help",
      "backlog task edit --help",
      "backlog task list --plain",
      "backlog sequence list --plain",
      "backlog config get definitionOfDone",
      "backlog task create",
      "backlog task edit",
    ]) {
      expect(body, surface).toContain(surface);
    }
    expect(body).toContain("wip/bundles/<id>");
    expect(normalized).toMatch(/backlog.*install-backlog/);
    expect(normalized).toMatch(/single recipe|only recipe|one recipe/);
    expect(normalized).toMatch(/do not hand-edit|never hand-edit/);
    expect(normalized).toMatch(/no .*wpm.*task|do not .*wpm.*task|never .*wpm.*task/);
    expect(normalized).toMatch(/do not .*auto-init|never .*auto-init|no auto-init/);
    expect(normalized).toMatch(/same canonical directory|canonical .*install-backlog/);
    expect(normalized).toMatch(/detached copy|shadow recipe/);
    expect(normalized).toMatch(
      /config set definitionofdone.*does not support|does not support .*config set/,
    );
    expect(normalized).toMatch(/interactive .*backlog config|backlog config.*interactive/);
  });

  it("turns a new installation outcome into an observable detect, setup, and verify graph", () => {
    const body = normalizedBody();

    expect(body).toMatch(/detect.*setup.*verify/);
    expect(body).toMatch(/context-less|fresh executor|without .*conversation/);
    expect(body).toMatch(/observable (acceptance )?outcome/);
    expect(body).toMatch(/outcome.*not.*(step|method|procedure)|what.*not.*how/);
    expect(body).toMatch(/already satisf|detect.*acceptance/);
    expect(body).toMatch(/verify .*separate|separate .*verify|verification outcome/);
    expect(body).toMatch(/do not (guess|invent|assume)|never (guess|invent|assume)/);
  });

  it("uses stable task identity, version, and explicit dependency edges without relying on file order", () => {
    const body = normalizedBody();

    expect(body).toContain("step:<slug>");
    expect(body).toContain("kind:state");
    expect(body).toContain("kind:migration");
    expect(body).toMatch(/milestone.*version|version.*milestone/);
    expect(body).toMatch(/one .*comma-separated.*label|single .*comma-separated.*label/);
    expect(body).toMatch(/--dep.*task id|task id.*--dep/);
    expect(body).toMatch(/execution order.*depend|depend.*execution order/);
    expect(body).toMatch(/file order.*not|not .*file order|never .*file order/);
    expect(body).toMatch(/setup depends on detect|setup .*depend.*detection/);
    expect(body).toMatch(/verification depends on every|verify .*depend.*setup/);
    expect(body).toMatch(/oldest-first.*milestone|milestone.*oldest-first/);
    expect(body).toMatch(/self-depend|missing depend|unresolved depend/);
    expect(body).toMatch(/cycle/);
    expect(body).toMatch(/--dep.*replaces.*complete dependency set/);
    expect(body).toMatch(/--ac.*--dod.*append/);
    expect(body).toMatch(
      /do not repeat.*--acceptance-criteria|--acceptance-criteria.*does not reliably/,
    );
    expect(body).toMatch(/descending index.*--remove-ac|--remove-ac.*descending index/);
    expect(body).toMatch(/--remove-ac.*--ac/);
    expect(body).toMatch(
      /dependency ids exactly.*plain task listing|plain task listing.*dependency ids/,
    );
    expect(body).toMatch(/sequence n.*dependency stage|dependency stage.*sequence n/);
    expect(body).toMatch(
      /one task in each successive stage|successive stage.*detect.*setup.*verify/,
    );
    expect(body).toMatch(
      /do not invoke .*interactive task editor|editor script.*managed task files/,
    );
  });

  it("separates current desired state from prior-state-gated immutable migrations", () => {
    const body = normalizedBody();

    expect(body).toMatch(/kind:state.*current|current.*kind:state/);
    expect(body).toMatch(/idempotent|safe to re-run|safe to rerun/);
    expect(body).toMatch(/kind:migration.*prior|prior.*kind:migration/);
    expect(body).toMatch(/from-version|installed version|prior-version/);
    expect(body).toMatch(/once|one-time/);
    expect(body).toMatch(
      /immutable|never .*edit.*shipped migration|do not .*edit.*shipped migration/,
    );
    expect(body).toMatch(/fix forward|new migration/);
    expect(body).toMatch(/ambiguous .*state|state .*ambiguous/);
    expect(body).toMatch(/ambiguous .*migration|migration .*ambiguous/);
  });

  it("makes every non-recoverable receipt fact a completion gate but never authors a receipt", () => {
    const body = normalizedBody();

    expect(body).toMatch(/definition of done|--dod/);
    for (const fact of ["effect", "checksum", "ownership", "inverse", "decision", "non-file"]) {
      expect(body, fact).toContain(fact);
    }
    expect(body).toMatch(/completion.gat|cannot .*done|before .*done/);
    expect(body).toContain("--no-dod-defaults");
    expect(body).toMatch(/reduced applicable gates.*--dod|--dod.*reduced applicable gates/);
    expect(body).toMatch(/never .*empty definition of done|do not .*empty definition of done/);
    expect(body).toMatch(/never .*write .*receipt|do not .*write .*receipt/);
    expect(body).toMatch(/executor .*receipt|receipt .*executor/);
    expect(body).toMatch(/resume.*task|completed work|already completed/);
    expect(body).toMatch(/leave .*tasks .*to do|tasks .*to do/);
    expect(body).toMatch(/checkboxes unchecked|do not .*checklist/);
    expect(body).toMatch(/authoring completion .*not installation completion/);
  });

  it("aggregates every discoverable readiness blocker and never masks it as ready", () => {
    const body = normalizedBody();

    expect(body).toMatch(/missing .*verif|without .*verif/);
    expect(body).toMatch(/ambiguous .*state|state .*ambiguous/);
    expect(body).toMatch(/ambiguous .*migration|migration .*ambiguous/);
    expect(body).toMatch(/unresolved depend|missing depend/);
    expect(body).toMatch(/cyclic|cycle/);
    expect(body).toMatch(/all .*blocker|every .*blocker|aggregate/);
    expect(body).toMatch(/not ready|never .*ready|do not .*ready/);
    expect(body).toMatch(/resolved/);
    expect(body).toMatch(/unresolved/);
    expect(body).toMatch(/blocked/);
  });

  it("routes adjacent authoring work without absorbing it", () => {
    const body = splitFrontmatter(readSkill()).body;
    const normalized = body.toLowerCase().replace(/\s+/g, " ");

    for (const specialist of ["wpm-author-bundle", "wpm-author-skill", "wpm-review-package"]) {
      expect(body).toContain(specialist);
    }
    expect(normalized).toMatch(/pending|separate|outside/);
    expect(normalized).toMatch(/name .*only when .*requires|only .*when .*required/);
  });

  it("uses identical source-free bytes at Codex and Claude Code native paths", () => {
    const root = mkdtempSync(join(tmpdir(), "wpm-recipe-native-"));
    try {
      const codexSkill = join(root, ".agents", "skills", "wpm-author-recipe");
      const claudeSkill = join(root, ".claude", "skills", "wpm-author-recipe");
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
      expect(basename(codexSkill)).toBe("wpm-author-recipe");
      expect(basename(claudeSkill)).toBe("wpm-author-recipe");
      expect(codexMetadata.name).toBe("wpm-author-recipe");
      expect(claudeMetadata.name).toBe("wpm-author-recipe");
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
    expect(basename(SKILL_DIR)).toBe("wpm-author-recipe");
  });
});
