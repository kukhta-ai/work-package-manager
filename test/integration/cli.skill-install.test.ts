import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../src/adapters/fake-env.js";
import { FixedClock } from "../../src/adapters/fixed-clock.js";
import { NodeFileSystem } from "../../src/adapters/node-fs.js";
import { type CliDeps, run } from "../../src/cli.js";
import type {
  ConfinedQuarantine,
  ConfinedWritePrecondition,
} from "../../src/core/ports/filesystem.js";
import { PERSONAL_AUTHORING_STATE_PATH } from "../../src/core/services/personal-authoring-setup.js";
import type { CliIo, OutputSink } from "../../src/util/exit.js";
import { toPosix } from "../../src/util/posix-path.js";
import { withTempDir } from "../helpers/tmpdir.js";

/**
 * Through-the-edges personal setup proof over a disposable injected HOME and the real packaged skill bytes.
 */

/** The repo's real bundled agent-skills root (the package ships this via package.json `files`). */
const BUNDLED_SKILLS = fileURLToPath(new URL("../../agent-skills", import.meta.url));

function collector(): OutputSink & { text: string } {
  return {
    text: "",
    write(chunk: string) {
      this.text += chunk;
    },
  };
}
function io(): CliIo & { out: ReturnType<typeof collector>; err: ReturnType<typeof collector> } {
  return { out: collector(), err: collector(), debug: false };
}

function deps(
  home: string,
  bundledSkillsRoot = BUNDLED_SKILLS,
  fs: NodeFileSystem = new NodeFileSystem(),
): CliDeps {
  return {
    fs,
    backlog: new FakeBacklog(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new FakeEnvironment({ env: { HOME: home }, platform: process.platform }),
    builtinTemplatesRoot: fileURLToPath(new URL("../../templates", import.meta.url)),
    bundledSkillsRoot,
  };
}

class SwapSelectedAncestorFileSystem extends NodeFileSystem {
  private raced = false;

  constructor(
    private readonly home: string,
    private readonly outside: string,
  ) {
    super();
  }

  override writeConfined(
    confinementRoot: string,
    path: string,
    content: string,
    expected: ConfinedWritePrecondition,
    quarantine?: ConfinedQuarantine,
  ): void {
    if (!this.raced && path.includes(`${join(".agents", "skills")}`)) {
      this.raced = true;
      symlinkSync(this.outside, join(this.home, ".agents"), "dir");
    }
    super.writeConfined(confinementRoot, path, content, expected, quarantine);
  }
}

describe("wpm authoring setup over a real filesystem", () => {
  it("installs only wpm-create-package in both selected scopes and converges unchanged", async () => {
    await withTempDir(async (home) => {
      mkdirSync(join(home, ".claude"), { recursive: true });
      writeFileSync(join(home, ".claude", "settings.json"), "USER SETTINGS\n");

      const first = io();
      expect(
        await run(
          ["authoring", "setup", "--client", "codex", "--client", "claude-code"],
          deps(home),
          first,
        ),
      ).toBe(0);

      const source = readFileSync(join(BUNDLED_SKILLS, "wpm-create-package", "SKILL.md"), "utf8");
      const codex = join(home, ".agents", "skills", "wpm-create-package", "SKILL.md");
      const claude = join(home, ".claude", "skills", "wpm-create-package", "SKILL.md");
      expect(readFileSync(codex, "utf8")).toBe(source);
      expect(readFileSync(claude, "utf8")).toBe(source);
      expect(existsSync(join(home, ".agents", "skills", "installer-builder"))).toBe(false);
      expect(existsSync(join(home, ".claude", "skills", "installer-builder"))).toBe(false);
      expect(readFileSync(join(home, ".claude", "settings.json"), "utf8")).toBe("USER SETTINGS\n");
      expect(existsSync(join(home, PERSONAL_AUTHORING_STATE_PATH))).toBe(true);
      expect(first.out.text).toContain(
        toPosix(join(home, ".agents", "skills", "wpm-create-package")),
      );

      const second = io();
      expect(
        await run(
          ["authoring", "setup", "--client", "codex", "--client", "claude-code"],
          deps(home),
          second,
        ),
      ).toBe(0);
      expect(second.out.text.match(/unchanged/g)).toHaveLength(2);
    });
  });

  it("migrates only an exact selected legacy tree and preserves unselected and workspace bytes", async () => {
    await withTempDir(async (home) => {
      const codexLegacy = join(home, ".agents", "skills", "installer-builder");
      const claudeLegacy = join(home, ".claude", "skills", "installer-builder");
      const workspaceManifest = join(home, "workspace", "wip", "manifest.yml");
      cpSync(join(BUNDLED_SKILLS, "installer-builder"), codexLegacy, { recursive: true });
      mkdirSync(claudeLegacy, { recursive: true });
      writeFileSync(join(claudeLegacy, "SKILL.md"), "USER MODIFIED LEGACY\n");
      mkdirSync(join(home, "workspace", "wip"), { recursive: true });
      writeFileSync(workspaceManifest, "targets: []\n");

      const streams = io();
      expect(await run(["authoring", "setup", "--client", "codex"], deps(home), streams)).toBe(0);

      expect(streams.out.text).toContain("migrated");
      expect(existsSync(codexLegacy)).toBe(false);
      expect(readFileSync(join(claudeLegacy, "SKILL.md"), "utf8")).toBe("USER MODIFIED LEGACY\n");
      expect(existsSync(join(home, ".claude", "skills", "wpm-create-package"))).toBe(false);
      expect(readFileSync(workspaceManifest, "utf8")).toBe("targets: []\n");
    });
  });

  it.runIf(process.platform !== "win32")(
    "rejects an aliased HOME and a selected-ancestor swap without writing outside the real HOME",
    async () => {
      await withTempDir(async (dir) => {
        const realHome = join(dir, "real-home");
        const aliasHome = join(dir, "alias-home");
        const outside = join(dir, "outside");
        mkdirSync(realHome);
        mkdirSync(outside);
        symlinkSync(realHome, aliasHome, "dir");
        const aliased = io();

        expect(
          await run(["authoring", "setup", "--client", "codex"], deps(aliasHome), aliased),
        ).toBe(1);
        expect(existsSync(join(realHome, PERSONAL_AUTHORING_STATE_PATH))).toBe(false);
        expect(existsSync(join(realHome, ".agents", "skills", "wpm-create-package"))).toBe(false);

        const raced = io();
        const racingFs = new SwapSelectedAncestorFileSystem(realHome, outside);
        expect(
          await run(
            ["authoring", "setup", "--client", "codex"],
            deps(realHome, BUNDLED_SKILLS, racingFs),
            raced,
          ),
        ).toBe(1);
        expect(existsSync(join(outside, "skills", "wpm-create-package", "SKILL.md"))).toBe(false);
        expect(existsSync(join(realHome, PERSONAL_AUTHORING_STATE_PATH))).toBe(true);
      });
    },
  );

  it("rejects malformed packaged UTF-8 before creating personal state or skill bytes", async () => {
    await withTempDir(async (dir) => {
      const home = join(dir, "home");
      const packageRoot = join(dir, "package", "agent-skills");
      mkdirSync(home);
      mkdirSync(join(packageRoot, "wpm-create-package"), { recursive: true });
      writeFileSync(join(packageRoot, "wpm-create-package", "SKILL.md"), Buffer.from([0xc3, 0x28]));
      cpSync(join(BUNDLED_SKILLS, "installer-builder"), join(packageRoot, "installer-builder"), {
        recursive: true,
      });
      const streams = io();

      expect(
        await run(["authoring", "setup", "--client", "codex"], deps(home, packageRoot), streams),
      ).toBe(1);
      expect(streams.err.text).toContain("personal-source-invalid");
      expect(existsSync(join(home, PERSONAL_AUTHORING_STATE_PATH))).toBe(false);
      expect(existsSync(join(home, ".agents", "skills", "wpm-create-package"))).toBe(false);
    });
  });

  it("rejects malformed managed-state bytes without overwriting them or owned skill bytes", async () => {
    await withTempDir(async (home) => {
      const dependencies = deps(home);
      expect(await run(["authoring", "setup", "--client", "codex"], dependencies, io())).toBe(0);
      const statePath = join(home, PERSONAL_AUTHORING_STATE_PATH);
      const skillPath = join(home, ".agents", "skills", "wpm-create-package", "SKILL.md");
      const skillBefore = readFileSync(skillPath);
      const malformed = Buffer.from([0xc3, 0x28]);
      writeFileSync(statePath, malformed);
      const streams = io();

      expect(await run(["authoring", "setup", "--client", "codex"], dependencies, streams)).toBe(1);
      expect(streams.err.text).toContain("personal-state-unreadable");
      expect(readFileSync(statePath)).toEqual(malformed);
      expect(readFileSync(skillPath)).toEqual(skillBefore);
    });
  });

  it("installs BOM-bearing packaged UTF-8 with byte-exact ownership and unchanged retry", async () => {
    await withTempDir(async (dir) => {
      const home = join(dir, "home");
      const packageRoot = join(dir, "package", "agent-skills");
      const currentRoot = join(packageRoot, "wpm-create-package");
      mkdirSync(home);
      mkdirSync(currentRoot, { recursive: true });
      const bytes = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from("---\nname: wpm-create-package\n---\n\nCreate it.\n", "utf8"),
      ]);
      writeFileSync(join(currentRoot, "SKILL.md"), bytes);
      cpSync(join(BUNDLED_SKILLS, "installer-builder"), join(packageRoot, "installer-builder"), {
        recursive: true,
      });
      const dependencies = deps(home, packageRoot);

      expect(await run(["authoring", "setup", "--client", "codex"], dependencies, io())).toBe(0);
      expect(
        readFileSync(join(home, ".agents", "skills", "wpm-create-package", "SKILL.md")),
      ).toEqual(bytes);
      const repeated = io();
      expect(await run(["authoring", "setup", "--client", "codex"], dependencies, repeated)).toBe(
        0,
      );
      expect(repeated.out.text).toContain("unchanged");
    });
  });
});
