import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { type CliDeps, run } from "../../../src/cli.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";

/**
 * Compatibility contract for the retired ambient personal installer. Canonical setup coverage lives in
 * `personal-authoring-setup-commands.test.ts`.
 */

const PKG = "/pkg/agent-skills";
const HOME = "/home/me";

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

function deps(fs: MemoryFileSystem, home: string | undefined): CliDeps {
  return {
    fs,
    backlog: new FakeBacklog(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new FakeEnvironment(home === undefined ? { env: {} } : { env: { HOME: home } }),
    builtinTemplatesRoot: "/builtin-templates",
    bundledSkillsRoot: PKG,
  };
}

function seed(): MemoryFileSystem {
  const fs = new MemoryFileSystem();
  fs.write(`${PKG}/installer-builder/SKILL.md`, "---\nname: installer-builder\n---\n");
  fs.makeDirectories(`${HOME}/.agents`);
  fs.makeDirectories(`${HOME}/.claude`);
  return fs;
}

describe("retired `wpm skill install` compatibility", () => {
  it("never treats detected scopes as authorization and names the replacement", async () => {
    const fs = seed();
    const i = io();
    expect(await run(["skill", "install"], deps(fs, HOME), i)).toBe(2);
    expect(i.err.text).toContain("wpm authoring setup --client codex");
    expect(fs.inspectPath(`${HOME}/.agents/skills/wpm-create-package`).kind).toBe("missing");
    expect(fs.inspectPath(`${HOME}/.claude/skills/wpm-create-package`).kind).toBe("missing");
  });

  it("`skill install --help` is self-sufficient (description + usage)", async () => {
    const fs = seed();
    const i = io();
    expect(await run(["skill", "install", "--help"], deps(fs, HOME), i)).toBe(0);
    expect(i.out.text).toMatch(/Usage:/);
    expect(i.out.text).toContain("authoring setup");
  });
});
