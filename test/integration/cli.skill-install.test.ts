import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../src/adapters/fake-env.js";
import { FixedClock } from "../../src/adapters/fixed-clock.js";
import { NodeFileSystem } from "../../src/adapters/node-fs.js";
import { type CliDeps, run } from "../../src/cli.js";
import { AUTHORING_SKILL_NAME } from "../../src/core/operations/install-authoring-skill.js";
import type { CliIo, OutputSink } from "../../src/util/exit.js";
import { toPosix } from "../../src/util/posix-path.js";
import { withTempDir } from "../helpers/tmpdir.js";

/**
 * Through-the-edges (integration) test for `wpm skill install` (task-91): one real invocation copies the REAL
 * bundled `agent-skills/installer-builder/` from the package onto disk, into a HOME pinned inside a tmpdir,
 * through every layer (commander → `installAuthoringSkill` → the real `NodeFileSystem.copyTree`). It exercises
 * the production `run()` path over real file I/O — the integration counterpart to the in-memory unit tests.
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

function deps(home: string): CliDeps {
  return {
    fs: new NodeFileSystem(),
    backlog: new FakeBacklog(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new FakeEnvironment({ env: { HOME: home } }),
    builtinTemplatesRoot: fileURLToPath(new URL("../../templates", import.meta.url)),
    bundledSkillsRoot: BUNDLED_SKILLS,
  };
}

describe("wpm skill install over a real filesystem (task-91)", () => {
  it("copies the real bundled installer-builder skill into a detected agent's user scope, exit 0", async () => {
    await withTempDir(async (home) => {
      mkdirSync(join(home, ".claude"), { recursive: true }); // detected agent

      const i = io();
      expect(await run(["skill", "install"], deps(home), i)).toBe(0);

      const dest = join(home, ".claude", "skills", AUTHORING_SKILL_NAME);
      expect(existsSync(join(dest, "SKILL.md"))).toBe(true);
      expect(existsSync(join(dest, "references"))).toBe(true);
      expect(i.out.text).toContain(toPosix(dest));
    });
  });

  it("with no agent scope under HOME, exits 2 and writes nothing", async () => {
    await withTempDir(async (home) => {
      const i = io();
      expect(await run(["skill", "install"], deps(home), i)).toBe(2);
      expect(existsSync(join(home, ".claude"))).toBe(false);
      expect(i.err.text).toMatch(/no supported agent skill scope/i);
    });
  });
});
