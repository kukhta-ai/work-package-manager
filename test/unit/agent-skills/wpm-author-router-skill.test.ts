import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseYaml } from "../../../src/util/yaml.js";

const SKILL_MD = fileURLToPath(
  new URL("../../../agent-skills/wpm-author/SKILL.md", import.meta.url),
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

describe("wpm-author workspace router skill", () => {
  it("is one portable independently discoverable router with a focused activation contract", () => {
    expect(existsSync(SKILL_MD)).toBe(true);
    const { frontmatter } = splitFrontmatter(readSkill());
    const metadata = parseYaml(frontmatter) as Record<string, unknown>;

    expect(metadata).toEqual({
      name: "wpm-author",
      description: expect.any(String),
    });
    const description = String(metadata.description).toLowerCase();
    expect(description).toMatch(/continue|resume|claim|select/);
    expect(description).toMatch(/wpm.*authoring.*workspace|authoring workspace.*wpm/);
    expect(description).toMatch(/route|specialist/);
    expect(description).toMatch(/not .*execut|do not use .*execut|prepared workspace/);
    expect(readdirSync(SKILL_DIR).sort()).toEqual(["SKILL.md"]);
  });

  it("orients only at the candidate root and distinguishes all four workspace regions", () => {
    const body = readSkill();
    const normalized = normalizedBody();

    for (const surface of ["workspace root", "wip/", "builds/", ".authoring-backlog/"]) {
      expect(body, surface).toContain(surface);
    }
    expect(body).toContain("wip/manifest.yml");
    expect(normalized).toMatch(
      /current directory.*workspace root|workspace root.*current directory/,
    );
    expect(normalized).toMatch(/do not walk upward|never walk upward|no upward search/);
    expect(normalized).toMatch(/do not .*init|never .*init|no auto-init/);
    expect(normalized).toMatch(/within .*declared root|(?:stay|remain).*inside.*root/);
  });

  it("keeps root authoring instructions separate from executor sources and build output", () => {
    const body = readSkill();
    const normalized = normalizedBody();

    for (const frontDoor of ["AGENTS.md", "CLAUDE.md", "wip/_AGENTS.md"]) {
      expect(body, frontDoor).toContain(frontDoor);
    }
    expect(normalized).toMatch(/root.*authoring front door|authoring front door.*root/);
    expect(normalized).toMatch(/wip\/_agents\.md.*executor|executor.*wip\/_agents\.md/);
    expect(normalized).toMatch(/builds\/.*output|output.*builds\//);
    expect(normalized).toMatch(/never treat .*instructions|do not interpret .*instructions/);
    expect(normalized).toMatch(
      /manifest\.targets.*not.*authoring|authoring.*not.*manifest\.targets/,
    );
    expect(normalized).toMatch(
      /workspace.*front door.*workspace integration|workspace integration.*workspace.*front door/,
    );
    expect(normalized).toMatch(
      /executor.*front door.*wpm-author-skill|wpm-author-skill.*executor.*front door/,
    );
  });

  it("consumes only the exact front-door state pointer and the minimum read-only handshake", () => {
    const body = normalizedBody();

    expect(body).toMatch(
      /front door.*exact.*managed-state.*path|exact.*managed-state.*path.*front door/,
    );
    expect(body).toMatch(/workspace-root identity|declared workspace root/);
    expect(body).toMatch(/integration version|wpm version/);
    expect(body).toMatch(/owned.*path.*version|path.*version.*specialist/);
    expect(body).toMatch(/do not search|never search|no .*search/);
    expect(body).toMatch(/do not .*?(?:infer|guess).*filename|never .*?(?:infer|guess).*filename/);
    expect(body).toMatch(/read-only/);
    expect(body).toMatch(
      /do not (write|repair|reconcile).*state|never (write|repair|reconcile).*state/,
    );
    expect(body).toMatch(/workspace integration.*recovery|reapply.*workspace integration/);
  });

  it("takes one complete Backlog CLI snapshot and surfaces every active task before selection", () => {
    const body = readSkill();
    const normalized = normalizedBody();

    for (const command of [
      "backlog task list --plain",
      "backlog sequence list --plain",
      "backlog task <id> --plain",
    ]) {
      expect(body, command).toContain(command);
    }
    expect(normalized).toMatch(/every.*in progress|all.*in progress/);
    expect(normalized).toMatch(/before.*choos|before.*claim/);
    expect(normalized).toMatch(/do not infer.*title|title.*not.*enough|not.*title.*alone/);
    expect(normalized).toMatch(/dependencies.*done|done.*dependencies/);
    expect(normalized).toMatch(/several.*select|multiple.*select|more than one.*select/);
    expect(normalized).toMatch(/creates no task|create no task|do not create.*task|no duplicate/);
  });

  it("preflights the whole route before exactly one Backlog status mutation", () => {
    const body = readSkill();
    const normalized = normalizedBody();

    expect(body).toContain('backlog task edit <id> -s "In Progress"');
    expect(normalized).toMatch(/preflight.*before.*status mutation|before.*first.*mutation/);
    expect(normalized).toMatch(/exactly one status mutation|single.*status mutation/);
    expect(normalized).toMatch(/do not mutate a second task|never.*second task/);
    expect(normalized).toMatch(/re-read.*task|read.*again.*task/);
    expect(normalized).toMatch(/sequence order.*tie|deterministic.*order|existing order.*tie/);
    expect(normalized).toMatch(/immediately before.*(?:claim|status edit)|freshness.*barrier/);
    expect(normalized).toMatch(/re-run.*task list.*sequence|task list.*sequence.*re-read/);
    expect(normalized).toMatch(/stale|drift|changed snapshot/);
    expect(normalized).toMatch(/do not invent.*(?:lock|conditional)|no .*compare-and-set/);
    expect(normalized).toMatch(/serialized.*(?:selection|authoring)|serialize.*selection/);
    expect(normalized).toMatch(/cannot prove.*cross-session|not .*atomic multi-agent/);
    expect(normalized).toMatch(
      /concurrent selector.*stop without mutation|stop without mutation.*concurrent/,
    );
    expect(normalized).toMatch(/after.*status edit.*task list|post-edit.*task list/);
    expect(normalized).toMatch(/do not retry.*status|never retry.*edit|no second.*status edit/);
    for (const prohibitedMutation of ["task create", "--notes", "--check-ac", "--check-dod"]) {
      expect(normalized, prohibitedMutation).toContain(prohibitedMutation);
    }
  });

  it("reports no eligible work and treats contradictory backlog evidence as blocked without writes", () => {
    const body = normalizedBody();

    expect(body).toMatch(/dependency eligibility depends only on.*to do.*dependenc.*done/);
    expect(body).toMatch(/no .*dependency-eligible work|no .*eligible.*task/);
    expect(body).toMatch(/no .*backlog.*mutation|make no .*mutation|backlog remains unchanged/);
    expect(body).toMatch(/malformed.*blocked|contradictory.*blocked|do not .*malformed.*empty/);
    expect(body).toMatch(/specialist defect.*blocked.*does not mean.*no dependency-eligible/);
    expect(body).toMatch(/task markdown|task files?/);
    expect(body).toMatch(/never (read|edit).*task.*markdown|do not (read|edit).*task.*markdown/);
  });

  it("handles project work directly and maps each focused task to exactly one specialist", () => {
    const body = readSkill();
    const normalized = normalizedBody();

    expect(normalized).toMatch(/project-level.*direct|directly.*project-level/);
    for (const specialist of [
      "wpm-author-bundle",
      "wpm-author-recipe",
      "wpm-author-skill",
      "wpm-review-package",
    ]) {
      expect(body, specialist).toContain(specialist);
    }
    expect(normalized).toMatch(
      /invoke only that skill|exactly one matching|one matching specialist/,
    );
    expect(normalized).toMatch(/task record.*acceptance criteria|acceptance criteria.*task record/);
    expect(normalized).toMatch(/ambiguous.*clarif|several.*not.*guess|do not .*split/);
    expect(normalized).toMatch(/focused current task|only.*focused.*task/);
    expect(normalized).toMatch(
      /project.*(?:requires no|does not require).*specialist|specialist.*(?:not required|not applicable).*project/,
    );
    expect(normalized).toMatch(
      /specialist compatibility.*only.*specialist|only.*specialist.*compatibility/,
    );
  });

  it("fails closed when specialist compatibility is missing and never substitutes another surface", () => {
    const body = normalizedBody();

    expect(body).toMatch(/recorded.*wpm-owned|wpm-owned.*recorded/);
    expect(body).toMatch(/exact.*relative path|owned.*relative path/);
    expect(body).toMatch(/coherent version|matching version/);
    expect(body).toMatch(/skill\.md.*identity|identity.*skill\.md/);
    expect(body).toMatch(/never substitute|do not substitute|no substitution/);
    expect(body).toContain("installer-builder");
    expect(body).toMatch(/personal|global/);
    expect(body).toMatch(/reapply.*workspace integration|workspace integration.*recovery/);
  });

  it("aggregates invalid prerequisites in stable order and changes nothing", () => {
    const body = normalizedBody();

    for (const prerequisite of ["workspace layout", "managed integration", "backlog.md"]) {
      expect(body, prerequisite).toContain(prerequisite);
    }
    expect(body).toMatch(/every affected|all affected|aggregate/);
    expect(body).toMatch(/one .*recovery.*(?:group|prerequisite)|one applicable recovery/);
    expect(body).toMatch(/stable order|deterministic order/);
    expect(body).toMatch(/do not invoke.*specialist|never invoke.*specialist/);
    expect(body).toMatch(/do not change task status|never change task status/);
    expect(body).toMatch(
      /do not write (?:a )?workspace|never write (?:a )?workspace|no workspace artifact.*mutat/,
    );
  });

  it("returns one inspectable orientation, task, classification, action, and recovery result", () => {
    const body = normalizedBody();

    for (const field of [
      "workspace root",
      "integration",
      "in progress",
      "dependency",
      "classification",
      "action",
      "recovery",
    ]) {
      expect(body, field).toContain(field);
    }
    expect(body).toMatch(/selection action|selection.*resumed.*claimed/);
    expect(body).toMatch(/dispatch action|dispatch.*handled-directly.*routed/);
    for (const action of ["resumed", "claimed", "routed", "handled-directly", "none", "blocked"]) {
      expect(body, action).toContain(action);
    }
  });

  it("uses identical source-free bytes at Codex and Claude Code native paths", () => {
    const root = mkdtempSync(join(tmpdir(), "wpm-author-router-native-"));
    try {
      const codexSkill = join(root, ".agents", "skills", "wpm-author");
      const claudeSkill = join(root, ".claude", "skills", "wpm-author");
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
      expect(basename(codexSkill)).toBe("wpm-author");
      expect(basename(claudeSkill)).toBe("wpm-author");
      expect(codexMetadata.name).toBe("wpm-author");
      expect(claudeMetadata.name).toBe("wpm-author");
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
    expect(basename(SKILL_DIR)).toBe("wpm-author");
  });
});
