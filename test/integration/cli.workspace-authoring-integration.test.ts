import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../src/adapters/fake-env.js";
import { FixedClock } from "../../src/adapters/fixed-clock.js";
import { NodeFileSystem } from "../../src/adapters/node-fs.js";
import { type CliDeps, run } from "../../src/cli.js";
import {
  MANAGED_FRONT_DOOR_START,
  WORKSPACE_INTEGRATION_STATE_PATH,
  WORKSPACE_SKILL_NAMES,
} from "../../src/core/services/workspace-authoring-integration.js";
import type { CliIo, OutputSink } from "../../src/util/exit.js";
import { withTempDir } from "../helpers/tmpdir.js";

const TEMPLATES = fileURLToPath(new URL("../../templates", import.meta.url));
const SKILLS = fileURLToPath(new URL("../../agent-skills", import.meta.url));

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

class FailOnceNodeFileSystem extends NodeFileSystem {
  private armedAt: number | undefined;
  private mutations = 0;

  arm(at: number): void {
    this.armedAt = at;
    this.mutations = 0;
  }

  override write(path: string, content: string): void {
    if (this.armedAt !== undefined) {
      this.mutations += 1;
      if (this.mutations === this.armedAt) {
        this.armedAt = undefined;
        throw new Error(`injected real-fs write failure at ${path}`);
      }
    }
    super.write(path, content);
  }
}

function legacyFrontDoor(name: string): string {
  return readFileSync(
    join(TEMPLATES, "project", "minimal", "snippets", "authoring-front-door.md.tmpl"),
    "utf8",
  ).replaceAll("{{project-name}}", name);
}

function legacyHarness(
  workspace: string,
  fs: NodeFileSystem = new NodeFileSystem(),
): {
  readonly fs: NodeFileSystem;
  readonly backlog: FakeBacklog;
  readonly deps: CliDeps;
} {
  fs.write(
    join(workspace, "wip", "manifest.yml"),
    "project:\n  name: demo\n  version: 1.0.0\ntargets:\n  - hermes\nbundles: []\n",
  );
  fs.makeDirectories(join(workspace, "builds"));
  fs.write(join(workspace, "AGENTS.md"), legacyFrontDoor("demo"));
  fs.ensureAlias(join(workspace, "AGENTS.md"), join(workspace, "CLAUDE.md"));
  const backlogRoot = join(workspace, ".authoring-backlog");
  fs.makeDirectories(backlogRoot);
  const backlog = new FakeBacklog();
  backlog.init(backlogRoot, { taskPrefix: "authoring" });
  backlog.createTask(backlogRoot, { title: "Existing authoring history" });
  return {
    fs,
    backlog,
    deps: {
      fs,
      backlog,
      clock: new FixedClock("2026-01-01T00:00:00.000Z"),
      env: new FakeEnvironment({ cwd: workspace }),
      builtinTemplatesRoot: TEMPLATES,
      bundledSkillsRoot: SKILLS,
    },
  };
}

describe("`wpm authoring integrate` through real filesystem and CLI boundaries", () => {
  it("strictly adopts a legacy wrapper while preserving deliverable targets and backlog history", async () => {
    await withTempDir(async (workspace) => {
      const harness = legacyHarness(workspace);
      const manifestBefore = harness.fs.read(join(workspace, "wip", "manifest.yml"));
      const backlogRoot = join(workspace, ".authoring-backlog");
      const tasksBefore = harness.backlog.listTasks(backlogRoot);
      const streams = io();

      expect(
        await run(
          ["authoring", "integrate", "--client", "claude-code", "--client", "codex"],
          harness.deps,
          streams,
        ),
      ).toBe(0);
      expect(streams.out.text).toContain("clients: codex, claude-code");
      expect(streams.out.text).toContain("handoff prepared: no");
      for (const [scope, frontDoor, invocation] of [
        [".agents/skills", "AGENTS.md", "$wpm-author"],
        [".claude/skills", "CLAUDE.md", "/wpm-author"],
      ] as const) {
        for (const skill of WORKSPACE_SKILL_NAMES) {
          expect(harness.fs.read(join(workspace, scope, skill, "SKILL.md"))).toBe(
            readFileSync(join(SKILLS, skill, "SKILL.md"), "utf8"),
          );
        }
        expect(harness.fs.read(join(workspace, frontDoor))).toContain(invocation);
      }
      expect(harness.fs.read(join(workspace, "wip", "manifest.yml"))).toBe(manifestBefore);
      expect(harness.backlog.listTasks(backlogRoot)).toEqual(tasksBefore);
      expect(
        JSON.parse(harness.fs.read(join(workspace, WORKSPACE_INTEGRATION_STATE_PATH))),
      ).toMatchObject({ status: "complete", selectedClients: ["codex", "claude-code"] });
    });
  });

  it("reports typed partial progress at exit 1 and the identical CLI retry converges", async () => {
    await withTempDir(async (workspace) => {
      const fs = new FailOnceNodeFileSystem();
      const harness = legacyHarness(workspace, fs);
      fs.arm(3);
      const failed = io();

      expect(
        await run(
          ["authoring", "integrate", "--client", "codex", "--client", "claude-code"],
          harness.deps,
          failed,
        ),
      ).toBe(1);
      expect(failed.err.text).toMatch(/completed:\n\s+- /);
      expect(failed.err.text).toMatch(/failed: /);
      expect(failed.err.text).toMatch(/unattempted:\n\s+- /);
      expect(failed.err.text).toMatch(/recovery: .*identical/i);
      expect(JSON.parse(fs.read(join(workspace, WORKSPACE_INTEGRATION_STATE_PATH)))).toMatchObject({
        status: "applying",
      });

      const retried = io();
      expect(
        await run(
          ["authoring", "integrate", "--client", "codex", "--client", "claude-code"],
          harness.deps,
          retried,
        ),
      ).toBe(0);
      expect(JSON.parse(fs.read(join(workspace, WORKSPACE_INTEGRATION_STATE_PATH)))).toMatchObject({
        status: "complete",
      });
      expect(
        fs.read(join(workspace, "AGENTS.md")).match(new RegExp(MANAGED_FRONT_DOOR_START, "g")),
      ).toHaveLength(1);
      expect(
        fs.read(join(workspace, "CLAUDE.md")).match(new RegExp(MANAGED_FRONT_DOOR_START, "g")),
      ).toHaveLength(1);
    });
  });
});
