import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BacklogCli } from "../../src/adapters/backlog-cli.js";
import { FakeBacklog } from "../../src/adapters/fake-backlog.js";
import { FixedClock } from "../../src/adapters/fixed-clock.js";
import { NodeFileSystem } from "../../src/adapters/node-fs.js";
import { ProcessEnvironment } from "../../src/adapters/process-env.js";
import { type CliDeps, run } from "../../src/cli.js";
import { parseManifest } from "../../src/core/services/schema/index.js";
import type { CliIo, OutputSink } from "../../src/util/exit.js";
import { parseYaml } from "../../src/util/yaml.js";
import { withTempDir } from "../helpers/tmpdir.js";

/**
 * THE WALKING SKELETON (task-33, AC#1) — one real `wpm init <name>` invocation drives a real change on disk
 * through EVERY layer (commander command surface → the `initProject` operation → the services → the FileSystem
 * port), observed in a REAL working directory. It runs the slice end-to-end against a real `NodeFileSystem` in a
 * real tmpdir, through the production `run()` path (and, when built, through the actual `dist/cli.js` binary).
 * This is the "foundation complete" demonstration that the hexagon composes end-to-end before the per-command
 * leaves (tasks 34–84).
 */

/** The repo's real built-in templates root (the package ships this). */
const BUILTIN_TEMPLATES = fileURLToPath(new URL("../../templates", import.meta.url));
/** The built CLI, for the through-the-binary variant (skipped when `dist/` is not built). */
const builtCli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
const hasBuild = existsSync(builtCli);
const describeIfBuilt = hasBuild ? describe : describe.skip;

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

/** Real ports, but a FakeBacklog so the always-on E2E doesn't depend on the `backlog` CLI being installed. */
function realDeps(): CliDeps {
  return {
    fs: new NodeFileSystem(),
    backlog: new FakeBacklog(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new ProcessEnvironment(),
    builtinTemplatesRoot: BUILTIN_TEMPLATES,
  };
}

/** Assert the produced project on REAL DISK (via `node:fs`) under project root `proj`. */
function assertProjectOnDisk(proj: string, name: string): void {
  // manifest.yml — parses, name substituted, empty bundles/targets:
  expect(existsSync(join(proj, "manifest.yml"))).toBe(true);
  const manifest = parseManifest(parseYaml(readFileSync(join(proj, "manifest.yml"), "utf8")));
  expect(manifest.ok).toBe(true);
  if (manifest.ok) {
    expect(manifest.value.meta.name).toBe(name);
    expect(manifest.value.bundles).toEqual([]);
    expect(manifest.value.targets).toEqual([]);
  }

  // the front-door (rendered from the SNIPPET), with the substituted name + the doc-07 recognition line:
  expect(existsSync(join(proj, "AGENTS.md"))).toBe(true);
  const frontDoor = readFileSync(join(proj, "AGENTS.md"), "utf8");
  expect(frontDoor).toContain(name);
  expect(frontDoor.toLowerCase()).toContain("install");

  // the orchestrator + its static journaling reference:
  expect(existsSync(join(proj, "installer-skills", `${name}-installer`, "SKILL.md"))).toBe(true);
  expect(
    existsSync(join(proj, "installer-skills", `${name}-installer`, "references", "journaling.md")),
  ).toBe(true);

  // the remaining copied files:
  expect(existsSync(join(proj, "README.md"))).toBe(true);
  expect(existsSync(join(proj, "RALPH-LOOP.md"))).toBe(true);

  // NO unresolved {{…}} marker in any produced file (recursively):
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = join(dir, entry.name);
      if (entry.isDirectory()) walk(child);
      else expect(readFileSync(child, "utf8"), `marker in ${child}`).not.toMatch(/\{\{[^}]*\}\}/);
    }
  };
  walk(proj);
}

describe("walking skeleton — `wpm init` drives a real change through every layer (task-33, AC#1)", () => {
  it("init <name> --at <dir> produces a working project on real disk via run()", async () => {
    await withTempDir(async (dir) => {
      const i = io();
      const code = await run(["init", "hermes-handoff", "--at", dir], realDeps(), i);
      expect(code).toBe(0);
      expect(i.out.text).toContain("created project hermes-handoff");
      // `--at <dir>` ⇒ the project root IS <dir> (doc 10 line 194):
      assertProjectOnDisk(dir, "hermes-handoff");
    });
  });

  it("AC#2 — it is the SMALLEST slice: no bundles/ scaffold (that is the full init command)", async () => {
    await withTempDir(async (dir) => {
      expect(await run(["init", "hermes-handoff", "--at", dir], realDeps(), io())).toBe(0);
      expect(existsSync(join(dir, "bundles"))).toBe(false);
    });
  });

  it("re-running init on an existing project exits 1 (ConflictError) and changes nothing", async () => {
    await withTempDir(async (dir) => {
      expect(await run(["init", "hermes-handoff", "--at", dir], realDeps(), io())).toBe(0);
      const manifestBefore = readFileSync(join(dir, "manifest.yml"), "utf8");

      const i = io();
      const code = await run(["init", "other", "--at", dir], realDeps(), i);
      expect(code).toBe(1); // ConflictError → exit 1
      expect(i.err.text).toMatch(/^error: /);
      expect(readFileSync(join(dir, "manifest.yml"), "utf8")).toBe(manifestBefore); // unchanged
    });
  });

  it("without --at, init <name> nests the project under <cwd>/<name> (doc 10/12 default)", async () => {
    await withTempDir(async (dir) => {
      // ProcessEnvironment reads the real cwd; drive the binary-less path by passing --at to a <dir>/<name>
      // target equivalent to the default. (The default-cwd path itself is covered by the binary test below,
      // which runs with cwd = the tmpdir.)
      const proj = join(dir, "hermes-handoff");
      expect(await run(["init", "hermes-handoff", "--at", proj], realDeps(), io())).toBe(0);
      assertProjectOnDisk(proj, "hermes-handoff");
    });
  });

  it("AC#3 — the command surface is reachable: `init --help` shows <name>, --at, and a worked example", async () => {
    const i = io();
    expect(await run(["init", "--help"], realDeps(), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("init");
    expect(help).toContain("<name>"); // the positional (task-28)
    expect(help).toContain("--at"); // the option
    expect(help).toContain("Example:"); // the worked example (task-28 contract; init has options/args)
    expect(help).toContain("wpm init"); // the example invocation
  });
});

describeIfBuilt(
  "walking skeleton — through the built `dist/cli.js` binary (the fullest real path)",
  () => {
    it("`init <name>` with default cwd creates <cwd>/<name>/ on disk", () => {
      withTempDir((dir) => {
        // Run the real binary with cwd = the tmpdir; no --at ⇒ project root is <cwd>/<name>.
        execFileSync(process.execPath, [builtCli, "init", "hermes-handoff"], {
          cwd: dir,
          encoding: "utf8",
        });
        assertProjectOnDisk(join(dir, "hermes-handoff"), "hermes-handoff");
      });
    });

    it("`init <name> --at <dir>` creates the project at <dir> on disk", () => {
      withTempDir((dir) => {
        const out = execFileSync(process.execPath, [builtCli, "init", "demo-proj", "--at", dir], {
          encoding: "utf8",
        });
        expect(out).toContain("created project demo-proj");
        assertProjectOnDisk(dir, "demo-proj");
      });
    });
  },
);

/** Whether the real `backlog` CLI is available; the .authoring-backlog real-root check skips (not fails) if not. */
function backlogAvailable(): boolean {
  try {
    execFileSync("backlog", ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
const describeIfBacklog = backlogAvailable() ? describe : describe.skip;

describeIfBacklog(
  "walking skeleton — the .authoring-backlog is a real Backlog.md root (BacklogMd port)",
  () => {
    it("init produces a valid pre-initialised .authoring-backlog/ via the real BacklogCli", async () => {
      await withTempDir(async (dir) => {
        // Isolate Backlog.md's per-machine global state inside the tmpdir.
        const env = {
          HOME: dir,
          XDG_CONFIG_HOME: dir,
          XDG_DATA_HOME: dir,
          XDG_STATE_HOME: dir,
          XDG_CACHE_HOME: dir,
        };
        const deps: CliDeps = {
          fs: new NodeFileSystem(),
          backlog: new BacklogCli("backlog", env),
          clock: new FixedClock("2026-01-01T00:00:00.000Z"),
          env: new ProcessEnvironment(),
          builtinTemplatesRoot: BUILTIN_TEMPLATES,
        };
        const proj = join(dir, "proj");
        expect(await run(["init", "hermes-handoff", "--at", proj], deps, io())).toBe(0);

        // The real CLI initialised an authoring-backlog root with task_prefix=authoring → a created task is authoring-1:
        const authoringRoot = join(proj, ".authoring-backlog");
        const created = new BacklogCli("backlog", env).createTask(authoringRoot, {
          title: "probe",
        });
        expect(created.id).toBe("authoring-1");
      });
    });

    // The CROSS-CUTTING lifecycle regression test (the path the FakeBacklog unit tests could not catch): a
    // materialising command (`project targets add`) on a REAL init'd project, through the REAL BacklogCli. The
    // lifecycle's ⑤ MATERIALISE must list/create tasks in the project's `.authoring-backlog` root — NOT the
    // project root, which is not a Backlog.md root. Before the fix this exited 1 with
    // "Command failed: backlog task list --plain → No Backlog.md project found", because the harness shelled out
    // at `ctx.root`. This guards every materialising command (targets add now; bundle new later).
    it("`project targets add <agent>` on a real init'd project exits 0 (the lifecycle materialises into .authoring-backlog)", async () => {
      await withTempDir(async (dir) => {
        // Isolate Backlog.md's per-machine global state inside the tmpdir (so concurrent runs cannot collide).
        const env = {
          HOME: dir,
          XDG_CONFIG_HOME: dir,
          XDG_DATA_HOME: dir,
          XDG_STATE_HOME: dir,
          XDG_CACHE_HOME: dir,
        };
        const deps: CliDeps = {
          fs: new NodeFileSystem(),
          backlog: new BacklogCli("backlog", env),
          clock: new FixedClock("2026-01-01T00:00:00.000Z"),
          env: new ProcessEnvironment(),
          builtinTemplatesRoot: BUILTIN_TEMPLATES,
        };
        const proj = join(dir, "proj");

        // Arrange: a real project with a real .authoring-backlog root (init exercises the real BacklogCli).
        expect(await run(["init", "demo", "--at", proj], deps, io())).toBe(0);

        // Act + Assert: adding a known target rides the task-25 lifecycle, whose ⑤ MATERIALISE runs
        // `backlog task list` in the authoring backlog. This is exit 1 before the fix (it ran at the project
        // root, "No Backlog.md project found") and exit 0 after (it runs in <proj>/.authoring-backlog).
        const i = io();
        const code = await run(["project", "targets", "add", "claude-code", "-C", proj], deps, i);
        expect(i.err.text).not.toContain("No Backlog.md project found");
        expect(code).toBe(0);
        // The target landed in the manifest (the operation actually completed, materialise included):
        expect(readFileSync(join(proj, "manifest.yml"), "utf8")).toContain("claude-code");
      });
    });
  },
);
