import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { isDomainError } from "../../../src/core/errors.js";
import {
  AUTHORING_SKILL_NAME,
  authoringSkillPresent,
  detectUserAgentScopes,
  installAuthoringSkill,
} from "../../../src/core/operations/install-authoring-skill.js";

/**
 * Unit tests for `installAuthoringSkill` (task-91), the pure `wpm skill install` operation, exercised over the
 * in-memory FileSystem fake + a FakeEnvironment with HOME pinned to a tmp path. These cover every acceptance
 * criterion that lives in the pure core: detect→copy (AC#1), idempotent re-run reporting installed/updated
 * (AC#2), no-scope→non-zero/no-writes (AC#3), scope naming (AC#5), and AC#6 (only the HOME user scope is ever
 * written — never a `wip/` or project deliverable subdir).
 */

const PKG = "/pkg/agent-skills";
const HOME = "/home/me";

/** Memory fake that also exposes the raw paths handed across the filesystem-effect boundary. */
class RecordingMemoryFileSystem extends MemoryFileSystem {
  readonly copyCalls: Array<{ from: string; to: string }> = [];

  override copyTree(from: string, to: string): void {
    this.copyCalls.push({ from, to });
    super.copyTree(from, to);
  }
}

/** Seed the bundled `agent-skills/installer-builder/` source the operation copies from. */
function seedBundledSkill(fs: MemoryFileSystem): void {
  fs.write(`${PKG}/${AUTHORING_SKILL_NAME}/SKILL.md`, "---\nname: installer-builder\n---\nbody\n");
  fs.write(`${PKG}/${AUTHORING_SKILL_NAME}/references/authoring-workflow.md`, "refs\n");
}

function setup(configDirs: readonly string[] = []): { fs: MemoryFileSystem; env: FakeEnvironment } {
  const fs = new MemoryFileSystem();
  seedBundledSkill(fs);
  for (const dir of configDirs) {
    fs.makeDirectories(`${HOME}/${dir}`);
  }
  const env = new FakeEnvironment({ env: { HOME } });
  return { fs, env };
}

describe("installAuthoringSkill (task-91)", () => {
  it("AC#1/#5: copies the bundled skill into a detected agent's user scope and names the scope", () => {
    const { fs, env } = setup([".claude"]);

    const result = installAuthoringSkill({ fs, env }, { bundledSkillsRoot: PKG });

    // The skill landed in the user (personal) scope (doc 05: ~/.claude/skills/), with its tree intact.
    const dest = `${HOME}/.claude/skills/${AUTHORING_SKILL_NAME}`;
    expect(fs.exists(dest)).toBe(true);
    expect(fs.read(`${dest}/SKILL.md`)).toContain("name: installer-builder");
    expect(fs.read(`${dest}/references/authoring-workflow.md`)).toBe("refs\n");

    // AC#5: the result names the scope written (and the agent + fresh-install status).
    expect(result.installed).toEqual([
      {
        agent: "claude-code",
        scope: `${HOME}/.claude/skills`,
        destination: dest,
        status: "installed",
      },
    ]);
    expect(result.skillName).toBe(AUTHORING_SKILL_NAME);
  });

  it("AC#1: installs into EVERY detected agent scope (claude-code + codex)", () => {
    const { fs, env } = setup([".claude", ".agents"]);

    const result = installAuthoringSkill({ fs, env }, { bundledSkillsRoot: PKG });

    const agents = result.installed.map((r) => r.agent).sort();
    expect(agents).toEqual(["claude-code", "codex"]);
    expect(fs.exists(`${HOME}/.claude/skills/${AUTHORING_SKILL_NAME}`)).toBe(true);
    expect(fs.exists(`${HOME}/.agents/skills/${AUTHORING_SKILL_NAME}`)).toBe(true);
  });

  it("AC#2: re-running is idempotent and reports updated (not installed) the second time", () => {
    const { fs, env } = setup([".claude"]);

    const first = installAuthoringSkill({ fs, env }, { bundledSkillsRoot: PKG });
    expect(first.installed[0]?.status).toBe("installed");

    const second = installAuthoringSkill({ fs, env }, { bundledSkillsRoot: PKG });
    expect(second.installed[0]?.status).toBe("updated");

    // Idempotent on disk: the re-run reproduces the identical content (no drift).
    expect(fs.read(`${HOME}/.claude/skills/${AUTHORING_SKILL_NAME}/SKILL.md`)).toContain(
      "name: installer-builder",
    );
    expect(second.changedPaths).toEqual(first.changedPaths);
  });

  it("AC#3: with NO supported agent scope detected, it raises a usage error and writes nothing", () => {
    const { fs, env } = setup([]); // no agent config dirs under HOME

    let thrown: unknown;
    try {
      installAuthoringSkill({ fs, env }, { bundledSkillsRoot: PKG });
    } catch (e) {
      thrown = e;
    }

    // Non-zero: a UsageError maps to exit 2 at the CLI boundary (doc 13 §7).
    expect(isDomainError(thrown)).toBe(true);
    expect((thrown as { category: string }).category).toBe("usage");

    // Wrote NOTHING: no skill anywhere under HOME for any supported scope.
    for (const suffix of [
      ".claude/skills",
      ".agents/skills",
      ".hermes/skills",
      ".openclaw/skills",
    ]) {
      expect(fs.exists(`${HOME}/${suffix}/${AUTHORING_SKILL_NAME}`)).toBe(false);
    }
  });

  it("AC#6: writes ONLY under the HOME user scope — never a project/wip deliverable subdir", () => {
    const { fs, env } = setup([".claude"]);
    // A project workspace with a deliverable subdir is present in the tree; the install must ignore it entirely.
    fs.write("/proj/wip/manifest.yml", "project:\n");

    const result = installAuthoringSkill({ fs, env }, { bundledSkillsRoot: PKG });

    for (const path of result.changedPaths) {
      expect(path.startsWith(`${HOME}/`)).toBe(true);
      expect(path).not.toContain("/wip/");
    }
    // The project deliverable was untouched (no skill leaked into it).
    expect(fs.exists(`/proj/wip/${AUTHORING_SKILL_NAME}`)).toBe(false);
    expect(fs.exists(`/proj/wip/skills/${AUTHORING_SKILL_NAME}`)).toBe(false);
  });

  it("raises a usage error when HOME is not set", () => {
    const fs = new MemoryFileSystem();
    seedBundledSkill(fs);
    const env = new FakeEnvironment({ env: {} }); // no HOME

    expect(() => installAuthoringSkill({ fs, env }, { bundledSkillsRoot: PKG })).toThrow(/HOME/);
  });

  it("raises a not-found error when the bundled skill source is missing (packaging defect)", () => {
    const fs = new MemoryFileSystem();
    fs.makeDirectories(`${HOME}/.claude`);
    const env = new FakeEnvironment({ env: { HOME } });

    let thrown: unknown;
    try {
      installAuthoringSkill({ fs, env }, { bundledSkillsRoot: PKG });
    } catch (e) {
      thrown = e;
    }
    expect(isDomainError(thrown)).toBe(true);
    expect((thrown as { category: string }).category).toBe("not-found");
  });
});

describe("detectUserAgentScopes / authoringSkillPresent (task-91)", () => {
  it("detects each agent whose personal config dir exists, and resolves its skills scope", () => {
    const { fs } = setup([".hermes"]);
    const scopes = detectUserAgentScopes(fs, HOME);
    expect(scopes).toEqual([
      { agent: "hermes", configDir: `${HOME}/.hermes`, scope: `${HOME}/.hermes/skills` },
    ]);
  });

  it("authoringSkillPresent is false when absent, true once installed in every detected scope", () => {
    const { fs, env } = setup([".claude"]);
    expect(authoringSkillPresent(fs, HOME)).toBe(false);
    installAuthoringSkill({ fs, env }, { bundledSkillsRoot: PKG });
    expect(authoringSkillPresent(fs, HOME)).toBe(true);
  });

  it("authoringSkillPresent is false when no agent scope is detected at all", () => {
    const { fs } = setup([]);
    expect(authoringSkillPresent(fs, HOME)).toBe(false);
  });

  it("keeps Windows-like filesystem inputs native while returning portable scope and changed-path values", () => {
    const fs = new RecordingMemoryFileSystem();
    const home = "C:\\Users\\me";
    seedBundledSkill(fs);
    fs.makeDirectories(`${home}\\.claude`);
    const env = new FakeEnvironment({ platform: "win32", env: { HOME: home } });

    const result = installAuthoringSkill({ fs, env }, { bundledSkillsRoot: PKG });
    const nativeDestination = join(home, ".claude/skills", AUTHORING_SKILL_NAME);

    expect(fs.copyCalls).toEqual([
      { from: join(PKG, AUTHORING_SKILL_NAME), to: nativeDestination },
    ]);
    expect(result.installed).toEqual([
      {
        agent: "claude-code",
        scope: "C:/Users/me/.claude/skills",
        destination: "C:/Users/me/.claude/skills/installer-builder",
        status: "installed",
      },
    ]);
    expect(result.changedPaths).toEqual([nativeDestination.replaceAll("\\", "/")]);
    expect(fs.exists("C:\\Users\\me\\.claude\\skills\\installer-builder\\SKILL.md")).toBe(true);
  });
});
