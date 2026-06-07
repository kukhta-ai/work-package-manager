import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { type CliDeps, run } from "../../../src/cli.js";
import { AUTHORING_SKILL_NAME } from "../../../src/core/operations/install-authoring-skill.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";

/**
 * Acceptance tests for `wpm skill install` (task-91), driven through `run()` in-process over in-memory ports,
 * with HOME pinned via a FakeEnvironment. Covers the CLI wiring of AC#1/#2/#3/#5 and the exit-code contract.
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

function seed(configDirs: readonly string[]): MemoryFileSystem {
  const fs = new MemoryFileSystem();
  fs.write(`${PKG}/${AUTHORING_SKILL_NAME}/SKILL.md`, "---\nname: installer-builder\n---\n");
  for (const dir of configDirs) fs.makeDirectories(`${HOME}/${dir}`);
  return fs;
}

describe("`wpm skill install` (task-91)", () => {
  it("AC#1/#5: installs into the detected scope, prints the scope, exits 0", async () => {
    const fs = seed([".claude"]);
    const i = io();
    expect(await run(["skill", "install"], deps(fs, HOME), i)).toBe(0);
    expect(fs.exists(`${HOME}/.claude/skills/${AUTHORING_SKILL_NAME}`)).toBe(true);
    expect(i.out.text).toContain(`${HOME}/.claude/skills/${AUTHORING_SKILL_NAME}`);
    expect(i.out.text).toContain("installed");
  });

  it("AC#2: re-running reports 'updated' and still exits 0", async () => {
    const fs = seed([".claude"]);
    expect(await run(["skill", "install"], deps(fs, HOME), io())).toBe(0);
    const i = io();
    expect(await run(["skill", "install"], deps(fs, HOME), i)).toBe(0);
    expect(i.out.text).toContain("updated");
  });

  it("AC#3: with no agent scope detected, exits non-zero (2) and writes nothing", async () => {
    const fs = seed([]);
    const i = io();
    expect(await run(["skill", "install"], deps(fs, HOME), i)).toBe(2);
    expect(i.err.text).toMatch(/no supported agent skill scope/i);
    expect(fs.exists(`${HOME}/.claude/skills/${AUTHORING_SKILL_NAME}`)).toBe(false);
  });

  it("`skill install --help` is self-sufficient (description + usage)", async () => {
    const fs = seed([".claude"]);
    const i = io();
    expect(await run(["skill", "install", "--help"], deps(fs, HOME), i)).toBe(0);
    expect(i.out.text).toMatch(/Usage:/);
    expect(i.out.text.toLowerCase()).toContain("installer-builder");
  });
});

const REAL_TEMPLATES = fileURLToPath(new URL("../../../templates", import.meta.url));
const BUILTIN = "/builtin-templates";

/** Recursively mirror `srcDir` (real fs) into `fs` (MemoryFileSystem) under `destDir`. */
function mirror(fs: MemoryFileSystem, srcDir: string, destDir: string): void {
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcChild = join(srcDir, entry.name);
    const destChild = `${destDir}/${entry.name}`;
    if (entry.isDirectory()) mirror(fs, srcChild, destChild);
    else fs.write(destChild, readFileSync(srcChild, "utf8"));
  }
}

/** CliDeps with the REAL templates mirrored at {@link BUILTIN}, a pinned cwd + HOME, for an in-memory `init`. */
function initDeps(fs: MemoryFileSystem): CliDeps {
  return {
    fs,
    backlog: new FakeBacklog(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new FakeEnvironment({ cwd: "/work", env: { HOME: HOME } }),
    builtinTemplatesRoot: BUILTIN,
    bundledSkillsRoot: PKG,
  };
}

describe("`wpm init` surfaces how to install the authoring skill (task-91 AC#4)", () => {
  it("prints the `wpm skill install` tip when the skill is absent from the detected agent scope", async () => {
    const fs = new MemoryFileSystem();
    mirror(fs, REAL_TEMPLATES, BUILTIN);
    fs.makeDirectories(`${HOME}/.claude`); // agent detected, but no installer-builder skill yet

    const i = io();
    expect(await run(["init", "demo"], initDeps(fs), i)).toBe(0);
    expect(i.out.text).toContain("wpm skill install");
    expect(i.out.text).toContain(AUTHORING_SKILL_NAME);
  });

  it("stays quiet when the skill is already present in every detected scope", async () => {
    const fs = new MemoryFileSystem();
    mirror(fs, REAL_TEMPLATES, BUILTIN);
    fs.makeDirectories(`${HOME}/.claude`);
    fs.write(
      `${HOME}/.claude/skills/${AUTHORING_SKILL_NAME}/SKILL.md`,
      "---\nname: installer-builder\n---\n",
    );

    const i = io();
    expect(await run(["init", "demo"], initDeps(fs), i)).toBe(0);
    expect(i.out.text).not.toContain("wpm skill install");
  });

  it("the authoring front door itself documents `wpm skill install` (durable AC#4 surface)", async () => {
    const fs = new MemoryFileSystem();
    mirror(fs, REAL_TEMPLATES, BUILTIN);
    fs.makeDirectories(`${HOME}/.claude`);

    expect(await run(["init", "demo"], initDeps(fs), io())).toBe(0);
    const frontDoor = fs.read("/work/demo/AGENTS.md");
    // The snippet wraps "run `wpm skill install`" across a line break, so assert the load-bearing fragment.
    expect(frontDoor).toContain("skill install");
    expect(frontDoor).toContain(".claude/skills");
  });
});
