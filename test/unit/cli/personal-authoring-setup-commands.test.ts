import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { type CliDeps, run } from "../../../src/cli.js";
import { PERSONAL_AUTHORING_STATE_PATH } from "../../../src/core/services/personal-authoring-setup.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";

const HOME = "/home/author";
const PACKAGE = "/package/agent-skills";
const SOURCE = `${PACKAGE}/wpm-create-package/SKILL.md`;
const CODEX = `${HOME}/.agents/skills/wpm-create-package/SKILL.md`;
const CLAUDE = `${HOME}/.claude/skills/wpm-create-package/SKILL.md`;
const STATE = `${HOME}/${PERSONAL_AUTHORING_STATE_PATH}`;
const SKILL = "---\nname: wpm-create-package\ndescription: bootstrap WPM\n---\n\nCreate it.\n";

function collector(): OutputSink & { text: string } {
  return {
    text: "",
    write(chunk: string) {
      this.text += chunk;
    },
  };
}

function io(input?: string): CliIo & {
  out: ReturnType<typeof collector>;
  err: ReturnType<typeof collector>;
} {
  return {
    out: collector(),
    err: collector(),
    debug: false,
    ...(input === undefined ? {} : { in: Readable.from([input]), interactive: true }),
  };
}

function seed(fs: MemoryFileSystem = new MemoryFileSystem(), home = HOME): MemoryFileSystem {
  fs.makeDirectories(home);
  fs.write(SOURCE, SKILL);
  fs.write(`${PACKAGE}/installer-builder/SKILL.md`, "legacy\n");
  fs.write(`${PACKAGE}/installer-builder/references/workflow.md`, "legacy reference\n");
  return fs;
}

function deps(fs: MemoryFileSystem, home = HOME): CliDeps {
  return {
    fs,
    backlog: new FakeBacklog(),
    clock: new FixedClock("2026-08-23T00:00:00.000Z"),
    env: new FakeEnvironment({ cwd: "/workspace", env: { HOME: home } }),
    builtinTemplatesRoot: "/package/templates",
    bundledSkillsRoot: PACKAGE,
  };
}

describe("wpm authoring setup", () => {
  it.each([
    [["codex"], [CODEX]],
    [["claude-code"], [CLAUDE]],
    [
      ["codex", "claude-code"],
      [CODEX, CLAUDE],
    ],
  ])("configures only the explicit prompt-free selection %j", async (clients, paths) => {
    const fs = seed();
    fs.makeDirectories(`${HOME}/.claude`); // advisory detection must never add Claude.
    const streams = io("this input must not be read\n");
    const argv = ["authoring", "setup", ...clients.flatMap((client) => ["--client", client])];

    expect(await run(argv, deps(fs), streams)).toBe(0);
    expect(streams.err.text).toBe("");
    for (const path of paths) expect(fs.read(path)).toBe(SKILL);
    expect(fs.inspectPath(CODEX).kind === "file").toBe(paths.includes(CODEX));
    expect(fs.inspectPath(CLAUDE).kind === "file").toBe(paths.includes(CLAUDE));
    expect(streams.out.text).toContain("workspace/handoff: not created or claimed");
  });

  it("buffers one chooser chunk across the single combined confirmation", async () => {
    const fs = seed();
    const streams = io("1,2\nyes\n");

    expect(await run(["authoring", "setup"], deps(fs), streams)).toBe(0);

    expect(streams.err.text.match(/Select personal authoring clients/g)).toHaveLength(1);
    expect(streams.err.text.match(/continue\? \[y\/N\]/g)).toHaveLength(1);
    expect(fs.read(CODEX)).toBe(SKILL);
    expect(fs.read(CLAUDE)).toBe(SKILL);
  });

  it("binds confirmation to the displayed plan and refuses a newly arrived legacy action", async () => {
    const fs = seed();
    const streams = io("codex\nyes\n");
    const originalWrite = streams.err.write.bind(streams.err);
    streams.err.write = (chunk: string) => {
      originalWrite(chunk);
      if (chunk.includes("continue? [y/N]")) {
        fs.copyTree(`${PACKAGE}/installer-builder`, `${HOME}/.agents/skills/installer-builder`);
      }
    };

    expect(await run(["authoring", "setup"], deps(fs), streams)).toBe(1);
    expect(fs.inspectPath(CODEX).kind).toBe("missing");
    expect(fs.inspectPath(`${HOME}/.agents/skills/installer-builder`).kind).toBe("directory");
  });

  it.each([
    ["blank chooser", "\n", false],
    ["declined confirmation", "codex\nno\n", true],
    ["EOF after chooser", "codex\n", true],
  ])("reports %s as a no-write cancellation", async (_label, input, previewed) => {
    const fs = seed();
    fs.write(`${HOME}/.agents/skills/user-skill/SKILL.md`, "PERSONAL USER BYTES\n");
    fs.write(`${HOME}/workspace/wip/manifest.yml`, "targets:\n  - user-target\n");
    fs.write(`${HOME}/.claude/settings.json`, "UNSELECTED CLIENT SETTINGS\n");
    const streams = io(input);
    expect(await run(["authoring", "setup"], deps(fs), streams)).toBe(0);
    expect(streams.out.text).toContain("cancelled");
    expect(fs.inspectPath(STATE).kind).toBe("missing");
    expect(fs.inspectPath(CODEX).kind).toBe("missing");
    expect(streams.err.text.includes("Authorize this complete")).toBe(previewed);
    expect(fs.read(`${HOME}/.agents/skills/user-skill/SKILL.md`)).toBe("PERSONAL USER BYTES\n");
    expect(fs.read(`${HOME}/workspace/wip/manifest.yml`)).toBe("targets:\n  - user-target\n");
    expect(fs.read(`${HOME}/.claude/settings.json`)).toBe("UNSELECTED CLIENT SETTINGS\n");
  });

  it("rejects headless and structured no-ID calls without reading input", async () => {
    const fs = seed();
    const human = io();
    expect(await run(["authoring", "setup"], deps(fs), human)).toBe(2);
    expect(human.err.text).toContain("direct interactive terminal");

    const structured = io("codex\nyes\n");
    expect(await run(["authoring", "setup", "--json"], deps(fs), structured)).toBe(2);
    expect(JSON.parse(structured.err.text)).toMatchObject({
      status: "failed",
      operation: "personal-authoring-setup",
      setupApplied: false,
      blockers: [{ code: "personal-clients-required" }],
    });
    expect(fs.inspectPath(STATE).kind).toBe("missing");
  });

  it("returns aggregate structured preflight blockers and preserves workspace bytes", async () => {
    const fs = seed();
    fs.remove(`${PACKAGE}/wpm-create-package`);
    fs.write("/workspace/wip/manifest.yml", "targets:\n  - hermes\n");
    const streams = io();

    expect(
      await run(
        ["authoring", "setup", "--client", "codex", "--client", "unknown", "--json"],
        deps(fs),
        streams,
      ),
    ).toBe(2);
    expect(JSON.parse(streams.err.text)).toMatchObject({
      status: "failed",
      setupApplied: false,
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: "personal-client-unsupported" }),
        expect.objectContaining({ code: "personal-source-invalid" }),
      ]),
    });
    expect(fs.read("/workspace/wip/manifest.yml")).toBe("targets:\n  - hermes\n");
    expect(fs.inspectPath(STATE).kind).toBe("missing");
  });

  it("prints stable structured success and only changed-client reload guidance", async () => {
    const fs = seed();
    fs.write(CODEX, SKILL);
    const streams = io();
    expect(
      await run(
        ["authoring", "setup", "--client", "codex", "--client", "claude-code", "--json"],
        deps(fs),
        streams,
      ),
    ).toBe(0);
    const result = JSON.parse(streams.out.text) as {
      setupApplied: boolean;
      clients: Array<{ id: string; outcome: string; reloadGuidance?: string }>;
    };
    expect(result.setupApplied).toBe(true);
    expect(result.clients).toEqual([
      expect.objectContaining({ id: "codex", outcome: "unchanged" }),
      expect.objectContaining({ id: "claude-code", outcome: "installed" }),
    ]);
    expect(result.clients[0]).not.toHaveProperty("reloadGuidance");
    expect(result.clients[1]).toHaveProperty("reloadGuidance");
  });

  it("keeps bidi format controls inert in human failures/success and round-trippable JSON", async () => {
    const bidi = "\u202e";
    const home = `/home/author-${bidi}gnp.exe`;
    const fs = seed(new MemoryFileSystem(), home);
    const human = io();

    expect(await run(["authoring", "setup", "--client", "codex"], deps(fs, home), human)).toBe(0);
    expect(human.out.text).toContain("\\u202e");
    expect(human.out.text).not.toContain(bidi);

    const structured = io();
    expect(
      await run(["authoring", "setup", "--client", "codex", "--json"], deps(fs, home), structured),
    ).toBe(0);
    expect(structured.out.text).not.toContain(bidi);
    expect(JSON.parse(structured.out.text)).toMatchObject({
      statePath: `${home}/${PERSONAL_AUTHORING_STATE_PATH}`,
    });

    fs.write(`${home}/${PERSONAL_AUTHORING_STATE_PATH}`, "USER MODIFIED\n");
    const failure = io();
    expect(await run(["authoring", "setup", "--client", "codex"], deps(fs, home), failure)).toBe(1);
    expect(failure.err.text).toContain("\\u202e");
    expect(failure.err.text).not.toContain(bidi);
  });
});

class FailSelectedWriteFileSystem extends MemoryFileSystem {
  armed = false;

  override write(path: string, content: string): void {
    if (this.armed && path === CODEX) {
      this.armed = false;
      throw new Error("injected selected write failure");
    }
    super.write(path, content);
  }
}

describe("wpm authoring setup typed partial and legacy route", () => {
  it("serializes typed client progress and identical-request recovery", async () => {
    const fs = seed(new FailSelectedWriteFileSystem()) as FailSelectedWriteFileSystem;
    fs.armed = true;
    const streams = io();
    expect(
      await run(["authoring", "setup", "--client", "codex", "--json"], deps(fs), streams),
    ).toBe(1);
    expect(JSON.parse(streams.err.text)).toMatchObject({
      status: "failed",
      setupApplied: false,
      failedBeat: "APPLY",
      completedClients: [],
      failedClient: { id: "codex", outcome: "installed" },
      unattemptedClients: [],
      recovery: expect.stringContaining("--client codex"),
    });
  });

  it("retires ambient skill install with actionable no-write usage", async () => {
    const fs = seed();
    fs.makeDirectories(`${HOME}/.agents`);
    fs.makeDirectories(`${HOME}/.claude`);
    const streams = io();
    expect(await run(["skill", "install"], deps(fs), streams)).toBe(2);
    expect(streams.err.text).toContain("wpm authoring setup --client codex");
    expect(fs.inspectPath(CODEX).kind).toBe("missing");
    expect(fs.inspectPath(CLAUDE).kind).toBe("missing");
    expect(fs.inspectPath(STATE).kind).toBe("missing");
  });
});
