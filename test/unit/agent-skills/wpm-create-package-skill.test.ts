import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseYaml } from "../../../src/util/yaml.js";

const SKILL_MD = fileURLToPath(
  new URL("../../../agent-skills/wpm-create-package/SKILL.md", import.meta.url),
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

describe("wpm-create-package personal bootstrap skill", () => {
  it("is one instruction-only portable skill with focused explicit and natural activation", () => {
    expect(existsSync(SKILL_MD)).toBe(true);
    const { frontmatter } = splitFrontmatter(readSkill());
    const metadata = parseYaml(frontmatter) as Record<string, unknown>;

    expect(metadata).toEqual({
      name: "wpm-create-package",
      description: expect.any(String),
    });
    const description = String(metadata.description).toLowerCase();
    expect(description).toMatch(/create|start|bootstrap/);
    expect(description).toMatch(/wpm|work.package/);
    expect(description).toMatch(/package|authoring workspace/);
    expect(description).toMatch(/not .*continue|not .*edit|do not use.*existing/);
    expect(description).toMatch(/bundle|recipe|skill|review/);
    expect(readdirSync(SKILL_DIR).sort()).toEqual(["SKILL.md"]);
  });

  it("establishes inspectable readiness before asking only unresolved author decisions", () => {
    const body = normalizedBody();

    expect(body).toMatch(/before.*(?:write|mutat)|preflight.*first/);
    expect(body).toContain("wpm --version");
    expect(body).toContain("backlog --version");
    expect(body).toContain("wpm authoring clients --json");
    for (const decision of [
      "package intent",
      "create or adopt",
      "workspace root",
      "authoring client",
    ]) {
      expect(body, decision).toContain(decision);
    }
    expect(body).toMatch(/ask only.*unresolved|only.*unresolved.*ask/);
    expect(body).toMatch(/do not ask.*known|do not re-ask|never re-ask/);
  });

  it("requires the complete explicit supported client selection independently of targets or detection", () => {
    const body = normalizedBody();

    expect(body).toContain("codex");
    expect(body).toContain("claude-code");
    expect(body).toMatch(/non-empty|at least one/);
    expect(body).toMatch(/complete desired.*selection|entire.*selection|full.*selection/);
    expect(body).toMatch(/manifest\.yml\.targets.*not|not.*manifest\.yml\.targets/);
    expect(body).toMatch(/detection.*not.*selection|do not infer.*detect/);
    expect(body).toMatch(/unsupported|unknown|deferred/);
  });

  it("uses fresh init as one prepared operation and never appends a redundant preparation", () => {
    const body = readSkill();
    const normalized = normalizedBody();

    expect(body).toContain("wpm init <name>");
    expect(body).toContain("--authoring-client <id>");
    expect(body).toContain("--template <template>");
    expect(body).toContain("--at <target>");
    expect(normalized).toMatch(/repeat.*--authoring-client|--authoring-client.*repeat/);
    expect(normalized).toMatch(/init.*prepared handoff|prepared handoff.*init/);
    expect(normalized).toMatch(
      /do not.*handoff prepare.*after.*successful init|never.*second.*handoff prepare/,
    );
  });

  it("preflights the whole adoption request read-only before integration can mutate", () => {
    const body = readSkill();
    const normalized = normalizedBody();

    expect(body).toContain("wpm -C <root> project show --json");
    expect(body).toContain("wpm -C <root> authoring handoff verify --client <id> --json");
    expect(body).toContain(".wpm-handoff.json");
    expect(normalized).toMatch(/verify.*every.*selected client|each.*selected client.*verify/);
    expect(normalized).toMatch(/read-only.*before.*integrat|verify.*before.*first.*mutation/);
    expect(normalized).toMatch(/foreign|occupied|conflicting.*receipt|receipt.*conflict/);
    expect(normalized).toMatch(/core.*task|task plan/);
    expect(normalized).toMatch(/aggregate.*blocker|every.*blocker/);
    expect(normalized).toMatch(/empty.*manifest\.yml\.targets.*valid/);
    expect(normalized).toMatch(/manifest\.yml\.targets.*remain.*unchanged/);
    expect(normalized).toMatch(/do not use.*validation.*adoption gate/);
    expect(normalized).toMatch(/json field.*root.*resolved deliverable root/);
    expect(normalized).toMatch(/must equal.*<root>\/wip/);
    expect(normalized).toMatch(/retain.*wrapper root.*every later.*-c/);
    expect(normalized).toMatch(/never pass.*deliverable root.*workspace root/);
    expect(body.indexOf("authoring handoff verify --client <id> --json")).toBeLessThan(
      body.indexOf("authoring integrate --client <id>"),
    );
  });

  it("allows only the requested integration and receipt surfaces to proceed after adopt preflight", () => {
    const body = normalizedBody();

    expect(body).toMatch(/only.*managed integration|exact.*repairable/);
    expect(body).toMatch(/native.*selected.*surface|selected.*native.*surface/);
    expect(body).toMatch(/not-yet-prepared|missing.*receipt/);
    expect(body).toMatch(/unknown blocker.*stop|any other.*blocker.*stop|do not ignore.*blocker/);
    expect(body).toMatch(/workspace.*manifest.*backlog.*core.*task/);
    expect(body).toMatch(/before.*first.*write|without.*mutation|remain.*unchanged/);
  });

  it("routes preparing receipts only through the exact producer retry", () => {
    const body = normalizedBody();

    expect(body).toContain("init|");
    expect(body).toContain("handoff|");
    expect(body).toMatch(/init\|.*identical original.*wpm init/);
    expect(body).toMatch(/never.*integrat.*standalone prepar|never.*schedule.*integrat/);
    expect(body).toMatch(/handoff\|.*identical standalone handoff/);
    expect(body).toMatch(/handoff\|.*root.*version.*client.*managed state/);
    expect(body).toMatch(/handoff\|.*succeeds.*report only a prepared handoff.*exit adoption/);
    expect(body).toMatch(/never fall through.*integration.*another preparation/);
    expect(body).toMatch(/non-success.*stop/);
    expect(body).toMatch(/integrate and prepare.*only when no.*preparing.*branch/);
    expect(body).toMatch(/unknown.*malformed.*prefix.*blocker|unknown.*prefix.*blocker/);
    expect(body).toMatch(/do not guess.*producer|never guess.*producer/);
  });

  it("allows an exact prepared receipt to follow an explicit complete client re-selection", () => {
    const body = normalizedBody();

    expect(body).toMatch(/exact canonical.*prepared.*current.*complete managed state/);
    expect(body).toMatch(/differs only.*newly requested.*complete client selection/);
    expect(body).toMatch(/repairable re-selection.*not.*foreign conflict/);
    expect(body).toMatch(/integration.*replace.*selection.*preparation.*receipt/);
    expect(body).toMatch(/receipt bound to another root.*blocker|foreign root.*blocker/);
    expect(body).toMatch(/receipt\/state.*version.*disagreement.*blocker/);
  });

  it("allows one coherent prior-version prepared workspace to converge through integration", () => {
    const body = normalizedBody();

    expect(body).toMatch(/same.*workspace root.*prepared receipt/);
    expect(body).toMatch(/receipt.*agree.*current.*complete managed state/);
    expect(body).toMatch(/prior|older.*integration version|integration version.*prior|older/);
    expect(body).toMatch(/version difference alone.*repairable|repairable.*stale.*version/);
    expect(body).toMatch(/integration.*authoritative.*preflight.*then.*prepar/);
    expect(body).toMatch(/foreign.*root.*blocker|root.*mismatch.*blocker/);
    expect(body).toMatch(/receipt.*state.*disagree.*blocker|disagree.*receipt.*state.*blocker/);
  });

  it("integrates the complete desired set once, then prepares once, and stops on non-success", () => {
    const body = readSkill();
    const normalized = normalizedBody();

    expect(body).toContain("wpm -C <root> authoring integrate --client <id>");
    expect(body).toContain("wpm -C <root> authoring handoff prepare --json");
    expect(normalized).toMatch(/complete desired.*selection|entire.*client selection/);
    expect(normalized).toMatch(/not additive|complete replacement|omitt.*retir/);
    expect(normalized).toMatch(/integrat.*once|exactly one.*integrat/);
    expect(normalized).toMatch(/prepare.*once|exactly one.*prepar/);
    expect(normalized).toMatch(/stop.*non-success|non-success.*stop/);
    expect(normalized).toMatch(/handoff prepared: no.*not.*success|not.*bootstrap success/);
  });

  it("fails readiness with one actionable recovery and no prepared claim", () => {
    const body = normalizedBody();

    expect(body).toMatch(/one actionable recovery|exactly one.*recovery/);
    expect(body).toMatch(/wpm.*missing|missing.*wpm/);
    expect(body).toMatch(/backlog.*missing|missing.*backlog|backlog.*unavailable/);
    expect(body).toMatch(/blocked|blocker/);
    expect(body).toMatch(/do not claim.*prepared|never claim.*prepared|preparation.*did not occur/);
  });

  it("reports only the approved prepared handoff and fresh-session next actions", () => {
    const body = normalizedBody();

    expect(body).toMatch(/handoffprepared.*true|handoff prepared.*true|status.*prepared/);
    for (const fact of ["workspace root", "launch", "reload", "verification", "wpm-author"]) {
      expect(body, fact).toContain(fact);
    }
    expect(body).toMatch(/fresh session|new session/);
    expect(body).toMatch(/stop.*workspace boundary|workspace boundary.*stop/);
    expect(body).toMatch(/do not (?:spawn|start).*agent|never (?:spawn|start).*agent/);
    expect(body).toMatch(/do not authenticate|never authenticate|authentication.*not/);
    expect(body).toMatch(/do not claim.*accept|acceptance.*not claimed/);
    expect(body).toMatch(/do not.*(?:select|claim|progress).*task|task progress.*not claimed/);
  });

  it("keeps personal bootstrap separate from workspace specialists, authoring work, and setup", () => {
    const body = readSkill();
    const normalized = normalizedBody();

    for (const specialist of [
      "wpm-author",
      "wpm-author-bundle",
      "wpm-author-recipe",
      "wpm-author-skill",
      "wpm-review-package",
    ]) {
      expect(body, specialist).toContain(specialist);
    }
    expect(normalized).toMatch(/personal.*not.*workspace|not.*five.*workspace/);
    expect(normalized).toMatch(/do not install.*itself|never install.*itself|setup.*separate/);
    expect(normalized).toMatch(/do not.*author.*bundle|never.*package content|stop before.*author/);
  });

  it("uses identical source-free bytes at both supported personal-native paths", () => {
    const root = mkdtempSync(join(tmpdir(), "wpm-create-package-native-"));
    try {
      const codexSkill = join(root, ".agents", "skills", "wpm-create-package");
      const claudeSkill = join(root, ".claude", "skills", "wpm-create-package");
      cpSync(SKILL_DIR, codexSkill, { recursive: true });
      cpSync(SKILL_DIR, claudeSkill, { recursive: true });

      const source = readSkill();
      const codexText = readFileSync(join(codexSkill, "SKILL.md"), "utf8");
      const claudeText = readFileSync(join(claudeSkill, "SKILL.md"), "utf8");
      expect(codexText).toBe(source);
      expect(claudeText).toBe(source);

      for (const [path, text] of [
        [codexSkill, codexText],
        [claudeSkill, claudeText],
      ] as const) {
        const metadata = parseYaml(splitFrontmatter(text).frontmatter) as Record<string, unknown>;
        expect(basename(path)).toBe("wpm-create-package");
        expect(metadata.name).toBe("wpm-create-package");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("contains no deliverable placement, checkout-specific path, placeholder, or resource dependency", () => {
    const text = readSkill();
    const body = normalizedBody();

    expect(body).toMatch(/personal skill.*never.*deliverable|do not.*generated deliverable/);
    expect(body).toMatch(/do not.*wip\/|never.*wip\/|outside.*wip\//);
    expect(text).not.toMatch(/\/workspace\/|\/home\/agent\/|file:\/\//);
    expect(text).not.toMatch(/\{\{[^}]+\}\}/);
    expect(text).not.toMatch(/\]\((?:\.\.?\/|references\/|scripts\/|assets\/)/);
    expect(basename(SKILL_DIR)).toBe("wpm-create-package");
  });
});
