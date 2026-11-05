import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkArtifacts,
  checkIndex,
  doctor,
  generateArtifacts,
  managedSkills,
} from "../../scripts/agents.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "wpm-native-agents-"));
  roots.push(root);
  cpSync(join(repository, ".agents"), join(root, ".agents"), { recursive: true });
  mkdirSync(join(root, ".claude/skills"), { recursive: true });
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "AGENTS.md"), "# Fixture repository\n");
  writeFileSync(join(root, "CLAUDE.md"), "@AGENTS.md\n");
  for (const file of ["development.md", "vnext.md", "task-writing-conventions.md"]) {
    writeFileSync(join(root, "docs", file), "# Fixture contract\n");
  }
  generateArtifacts(root);
  return root;
}

function append(root: string, file: string, content: string) {
  const path = join(root, file);
  writeFileSync(path, readFileSync(path, "utf8") + content);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("repository native agent artifacts", () => {
  it("checks frozen staged bytes independently of a repaired or corrupted working tree", () => {
    const root = fixture();
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout;
    };
    git(["init", "--quiet"]);
    git(["add", "--", "."]);
    const file = join(root, ".claude/skills/wpm-repo-test/SKILL.md");
    const correct = readFileSync(file, "utf8");
    append(root, ".claude/skills/wpm-repo-test/SKILL.md", "\nCorrupt working tree.\n");
    expect(checkArtifacts(root).join("\n")).toContain("Stale Claude projection");
    expect(checkIndex(root)).toEqual([]);
    git(["add", "--", ".claude/skills/wpm-repo-test/SKILL.md"]);
    const tree = git(["write-tree"]);
    writeFileSync(file, correct);
    expect(checkArtifacts(root)).toEqual([]);
    expect(checkIndex(root).join("\n")).toContain("Stale Claude projection");
    expect(git(["write-tree"])).toBe(tree);
    expect(readFileSync(file, "utf8")).toBe(correct);
  });

  it("generates discoverable projections, preserves unrelated skills, and checks without mutation", () => {
    const root = fixture();
    const unrelated = join(root, ".claude/skills/personal-helper");
    mkdirSync(unrelated);
    writeFileSync(join(unrelated, "SKILL.md"), "User-owned helper\n");
    const before = managedSkills.map((name) =>
      readFileSync(join(root, ".claude/skills", name, "SKILL.md"), "utf8"),
    );
    expect(checkArtifacts(root)).toEqual([]);
    generateArtifacts(root);
    expect(
      managedSkills.map((name) =>
        readFileSync(join(root, ".claude/skills", name, "SKILL.md"), "utf8"),
      ),
    ).toEqual(before);
    expect(readFileSync(join(unrelated, "SKILL.md"), "utf8")).toBe("User-owned helper\n");
  });

  it("rejects stale body projections and repairs only through generation", () => {
    const root = fixture();
    append(root, ".agents/skills/wpm-repo-test/SKILL.md", "\nAdditional accepted test guidance.\n");
    expect(checkArtifacts(root).join("\n")).toContain("Stale Claude projection");
    generateArtifacts(root);
    expect(checkArtifacts(root)).toEqual([]);
  });

  it.each([
    ["missing", "[contract](../../../docs/missing.md)"],
    ["escape", "[secret](../../../../outside.md)"],
    ["private", "[secret](../../../.env)"],
    ["global", "[global](file:///home/user/.codex/config.toml)"],
    ["reference syntax", "[contract][missing]\n\n[missing]: ../../../docs/missing.md"],
  ])("rejects %s references", (_name, text) => {
    const root = fixture();
    writeFileSync(join(root, ".env"), "PRIVATE_FIXTURE\n");
    append(root, ".agents/skills/wpm-repo-dev/SKILL.md", `\n${text}\n`);
    generateArtifacts(root);
    expect(checkArtifacts(root).length).toBeGreaterThan(0);
  });

  it.each([
    ".quality/private.md",
    ".QUALITY/private.md",
    ".ENV",
    ".ENV.EXAMPLE",
    ".Git/config",
    "NODE_MODULES/private.md",
    "DIST/generated.md",
    "builds/archive.md",
    "coverage/report.md",
    "test-results/current.md",
    ".wpm-apm/private.md",
    ".WPM-PENDING-setup.json",
    ".wpm/ownership.json",
    "_BMAD-OUTPUT/story.md",
    "SKILLS-RESULTS/session.md",
    ".BMAD/LOCAL/session.md",
    ".BMAD/ARCHIVE-STAGING/session.md",
    ".SSH/config",
    ".AWS/credentials",
    ".REMEMBER/state.json",
    ".OMC/state.md",
    ".SERENA/memory.md",
  ])("rejects regular private/generated references independent of symlinks: %s", (path) => {
    const root = fixture();
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "PRIVATE_NATIVE_FIXTURE\n");
    append(root, ".agents/skills/wpm-repo-dev/SKILL.md", `\n[private state](../../../${path})\n`);
    generateArtifacts(root);
    expect(checkArtifacts(root).join("\n")).toContain(
      "Reference enters private or generated state",
    );
  });

  it("rejects unsupported native metadata instead of silently dropping it", () => {
    const root = fixture();
    const file = join(root, ".claude/skills/wpm-repo-dev/SKILL.md");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "name: wpm-repo-dev",
        "name: wpm-repo-dev\nunknown-permission: true",
      ),
    );
    expect(checkArtifacts(root).join("\n")).toContain("Unsupported skill metadata");
  });

  it("requires explicit release invocation policy in both clients", () => {
    const root = fixture();
    const claude = join(root, ".claude/skills/wpm-repo-release/SKILL.md");
    writeFileSync(
      claude,
      readFileSync(claude, "utf8").replace(
        "disable-model-invocation: true",
        "disable-model-invocation: false",
      ),
    );
    expect(checkArtifacts(root).join("\n")).toContain("Claude release skill");
    generateArtifacts(root);
    const codex = join(root, ".agents/skills/wpm-repo-release/agents/openai.yaml");
    writeFileSync(
      codex,
      readFileSync(codex, "utf8").replace(
        "allow_implicit_invocation: false",
        "allow_implicit_invocation: true",
      ),
    );
    expect(checkArtifacts(root).join("\n")).toContain("Codex release skill");
  });

  it("rejects empty scope, extra managed skills, and floating client pins", () => {
    const root = fixture();
    const manifest = join(root, ".agents/manifest.json");
    const original = readFileSync(manifest, "utf8");
    writeFileSync(manifest, original.replace('"0.166.0"', '"latest"'));
    expect(checkArtifacts(root).join("\n")).toContain("exact client version pin");
    writeFileSync(manifest, original.replace('"wpm-repo-dev",', ""));
    expect(checkArtifacts(root).join("\n")).toContain("incomplete managed skill scope");
    writeFileSync(manifest, original);
    mkdirSync(join(root, ".agents/skills/wpm-repo-forgotten"));
    expect(checkArtifacts(root).join("\n")).toContain("Unmanaged repository skill");
  });

  it("requires explicit executable paths and checks versions without using PATH", () => {
    const root = fixture();
    expect(doctor(root, [])).toEqual([]);
    expect(doctor(root, ["--clients"]).join("\n")).toContain("no PATH/global fallback");
    expect(
      doctor(root, [
        "--clients",
        "--codex-bin",
        process.execPath,
        "--claude-bin",
        process.execPath,
      ]).join("\n"),
    ).toContain("does not match pinned version");
  });

  it.skipIf(process.platform === "win32")(
    "rejects symlink discovery and prevents writes through a projection escape",
    () => {
      const root = fixture();
      const outside = mkdtempSync(join(tmpdir(), "wpm-agent-outside-"));
      roots.push(outside);
      const projection = join(root, ".claude/skills/wpm-repo-dev");
      rmSync(projection, { recursive: true });
      symlinkSync(outside, projection);
      expect(checkArtifacts(root).join("\n")).toContain("Unsafe agent directory");
      expect(() => generateArtifacts(root)).toThrow("Unsafe agent directory");
      expect(() => readFileSync(join(outside, "SKILL.md"))).toThrow();
    },
  );

  it("keeps root policy a native import and rejects duplicated Claude policy", () => {
    const root = fixture();
    writeFileSync(join(root, "CLAUDE.md"), "@AGENTS.md\nExtra mutable policy\n");
    expect(checkArtifacts(root).join("\n")).toContain("must import @AGENTS.md");
  });
});
