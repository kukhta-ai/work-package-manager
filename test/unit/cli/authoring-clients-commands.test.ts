import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { type CliDeps, run } from "../../../src/cli.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";

const HOME = "/home/author";
const WORKSPACE = "/workspace/package";

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

function deps(): CliDeps {
  const fs = new MemoryFileSystem();
  fs.makeDirectories(`${HOME}/.agents`);
  fs.write(
    `${WORKSPACE}/wip/manifest.yml`,
    [
      "project:",
      "  name: distinct-axes",
      "  version: 1.0.0",
      "targets:",
      "  - hermes",
      "  - openclaw",
      "bundles: []",
      "",
    ].join("\n"),
  );
  return {
    fs,
    backlog: new FakeBacklog(),
    clock: new FixedClock("2026-08-22T00:00:00.000Z"),
    env: new FakeEnvironment({ cwd: WORKSPACE, env: { HOME } }),
    builtinTemplatesRoot: "/builtin-templates",
  };
}

describe("wpm authoring clients", () => {
  it("lists exactly Codex and Claude Code with current detection and native guidance as JSON", async () => {
    const i = io();
    expect(await run(["authoring", "clients", "--json"], deps(), i)).toBe(0);

    const parsed = JSON.parse(i.out.text) as { clients: Array<Record<string, unknown>> };
    expect(parsed.clients.map(({ id, displayName }) => ({ id, displayName }))).toEqual([
      { id: "codex", displayName: "Codex" },
      { id: "claude-code", displayName: "Claude Code" },
    ]);
    expect(parsed.clients[0]).toMatchObject({
      personalSkillsDirectory: "~/.agents/skills",
      workspaceSkillsDirectory: ".agents/skills",
      workspaceFrontDoor: "AGENTS.md",
      currentDetection: { status: "detected" },
      launch: { command: "codex" },
      reload: { kind: "automatic-with-restart-fallback" },
      configured: false,
    });
    expect(parsed.clients[1]).toMatchObject({
      personalSkillsDirectory: "~/.claude/skills",
      workspaceSkillsDirectory: ".claude/skills",
      workspaceFrontDoor: "CLAUDE.md",
      currentDetection: { status: "not-detected" },
      launch: { command: "claude" },
      reload: { kind: "live-watch-with-new-directory-restart" },
      configured: false,
    });
  });

  it.each([
    ["hermes", "deferred", "contract-deferred"],
    ["openclaw", "deferred", "contract-deferred"],
    ["unknown-client", "invalid", "unknown"],
  ] as const)("evaluates %s as %s without reporting configuration", async (id, status, reason) => {
    const i = io();
    expect(await run(["authoring", "clients", id, "--json"], deps(), i)).toBe(0);
    expect(JSON.parse(i.out.text)).toEqual({
      id,
      supportStatus: status,
      selectable: false,
      configured: false,
      reason,
    });
  });

  it("renders concise human inventory and self-sufficient help", async () => {
    const inventory = io();
    expect(await run(["authoring", "clients"], deps(), inventory)).toBe(0);
    expect(inventory.out.text).toContain("Codex (codex)");
    expect(inventory.out.text).toContain("Claude Code (claude-code)");
    expect(inventory.out.text).toContain("~/.agents/skills");
    expect(inventory.out.text).toContain("~/.claude/skills");
    expect(inventory.out.text.match(/configured:\s+no/g)).toHaveLength(2);
    expect(inventory.out.text).toContain("detection hint:");

    const help = io();
    expect(await run(["authoring", "clients", "--help"], deps(), help)).toBe(0);
    expect(help.out.text).toContain("Codex (codex)");
    expect(help.out.text).toContain("Claude Code (claude-code)");
    expect(help.out.text).toContain("detection is advisory");
    expect(help.out.text).toContain("manifest.yml.targets");
    expect(help.out.text).toContain("Example:");
    expect(help.out.text).not.toContain("this selection");
  });

  it("escapes caller- and environment-controlled values in human output", async () => {
    const injectedId = "unknown\n  configured: yes";
    const invalid = io();
    expect(await run(["authoring", "clients", injectedId], deps(), invalid)).toBe(0);
    expect(invalid.out.text).toContain('"unknown\\n  configured: yes"');
    expect(invalid.out.text).not.toMatch(/^\s*configured:\s+yes$/m);

    const harness = deps();
    const environment = harness.env as FakeEnvironment;
    environment.setEnv("HOME", "/home/author\n  configured: yes");
    const inventory = io();
    expect(await run(["authoring", "clients"], harness, inventory)).toBe(0);
    expect(inventory.out.text).toContain('"/home/author\\n  configured: yes/.agents"');
    expect(inventory.out.text).not.toMatch(/^\s*configured:\s+yes/m);
  });

  it("does not read authoring clients from targets or mutate either axis or any native surface", async () => {
    const harness = deps();
    const manifestPath = `${WORKSPACE}/wip/manifest.yml`;
    const manifestBefore = harness.fs.read(manifestPath);
    const i = io();

    expect(await run(["authoring", "clients", "--json"], harness, i)).toBe(0);

    expect(harness.fs.read(manifestPath)).toBe(manifestBefore);
    expect(i.out.text).not.toContain('"id":"hermes"');
    expect(i.out.text).not.toContain('"id":"openclaw"');
    expect(harness.fs.exists(`${HOME}/.agents/skills`)).toBe(false);
    expect(harness.fs.exists(`${HOME}/.claude/skills`)).toBe(false);
    expect(harness.fs.exists(`${WORKSPACE}/AGENTS.md`)).toBe(false);
    expect(harness.fs.exists(`${WORKSPACE}/CLAUDE.md`)).toBe(false);
  });
});
