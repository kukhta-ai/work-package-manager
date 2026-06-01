import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
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
 * Through-the-edges (integration) test for the FULL `wpm init <name>` command (task-34): one real invocation
 * drives a real change on disk through EVERY layer (commander command surface → the `initProject` operation → the
 * services → the FileSystem port), observed in a REAL working directory. It runs against a real `NodeFileSystem`
 * in a real tmpdir, through the production `run()` path (and, when built, through the actual `dist/cli.js`
 * binary). It supersedes the task-33 walking-skeleton assertions (which checked the deliberately-minimal slice).
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

/** Assert the FULL produced project on REAL DISK (via `node:fs`) under project root `proj`. */
function assertProjectOnDisk(proj: string, name: string): void {
  // manifest.yml — parses, name substituted, empty bundles/targets (minimal declares neither):
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

  // AC#1 — the default bundle template materialised at bundles/bundle-template/ (placeholders KEPT):
  expect(existsSync(join(proj, "bundles", "bundle-template", "AGENTS.md.tmpl"))).toBe(true);
  expect(readFileSync(join(proj, "bundles", "bundle-template", "AGENTS.md.tmpl"), "utf8")).toMatch(
    /\{\{bundle-id\}\}/,
  );

  // AC#1 — the empty registries exist as directories:
  expect(existsSync(join(proj, "installer-skills"))).toBe(true);
  expect(existsSync(join(proj, "templates"))).toBe(true);
  expect(existsSync(join(proj, ".authoring-backlog"))).toBe(true);

  // AC#7 — .gitignore records .authoring-backlog/:
  expect(existsSync(join(proj, ".gitignore"))).toBe(true);
  expect(readFileSync(join(proj, ".gitignore"), "utf8")).toMatch(/^\.authoring-backlog\/$/m);

  // AC#3 — minimal declares no targets ⇒ NO scope-aliases:
  expect(existsSync(join(proj, ".claude", "skills"))).toBe(false);

  // NO unresolved {{…}} marker in any produced file EXCEPT the bundle-template scaffold (a template-of-a-template
  // that deliberately keeps its placeholders for `bundle new` to fill):
  const scaffold = join(proj, "bundles", "bundle-template");
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = join(dir, entry.name);
      if (child === scaffold) continue;
      if (entry.isDirectory()) walk(child);
      else if (!child.startsWith(`${scaffold}/`))
        expect(readFileSync(child, "utf8"), `marker in ${child}`).not.toMatch(/\{\{[^}]*\}\}/);
    }
  };
  walk(proj);
}

describe("`wpm init` FULL — drives a real change through every layer (task-34)", () => {
  it("AC#1 — init <name> --at <dir> produces the full project on real disk via run()", async () => {
    await withTempDir(async (dir) => {
      // --at must point at a path that does NOT yet exist (AC#5 refuses an existing target), so target a fresh
      // subdir of the tmpdir rather than the tmpdir itself.
      const proj = join(dir, "proj");
      const i = io();
      const code = await run(["init", "hermes-handoff", "--at", proj], realDeps(), i);
      expect(code).toBe(0);
      expect(i.out.text).toContain("created project hermes-handoff");
      // AC#7 — the summary names the materialised-task count (8 project-wide tasks):
      expect(i.out.text).toMatch(/materialised: 8 authoring task/);
      // `--at <proj>` ⇒ the project root IS <proj> (doc 10 line 194):
      assertProjectOnDisk(proj, "hermes-handoff");
    });
  });

  it("AC#5 — re-running init on an existing path exits 1 (ConflictError) and changes nothing", async () => {
    await withTempDir(async (dir) => {
      const proj = join(dir, "proj");
      expect(await run(["init", "hermes-handoff", "--at", proj], realDeps(), io())).toBe(0);
      const manifestBefore = readFileSync(join(proj, "manifest.yml"), "utf8");

      // <proj> now exists, so a second init at the SAME path is refused (AC#5) — exit 1, nothing changed:
      const i = io();
      const code = await run(["init", "other", "--at", proj], realDeps(), i);
      expect(code).toBe(1); // ConflictError → exit 1
      expect(i.err.text).toMatch(/^error: /);
      expect(readFileSync(join(proj, "manifest.yml"), "utf8")).toBe(manifestBefore); // unchanged
    });
  });

  it("AC#6 — --list-templates prints the available project templates and creates NOTHING", async () => {
    await withTempDir(async (dir) => {
      const proj = join(dir, "should-not-exist");
      const i = io();
      const code = await run(
        ["init", "should-not-exist", "--at", proj, "--list-templates"],
        realDeps(),
        i,
      );
      expect(code).toBe(0);
      expect(i.out.text).toContain("minimal"); // the one built-in project template
      // It exited WITHOUT creating a project:
      expect(existsSync(proj)).toBe(false);
    });
  });

  it("AC#6 — --param values thread to placeholder substitution (extra params are harmless for minimal)", async () => {
    await withTempDir(async (dir) => {
      const proj = join(dir, "proj");
      const i = io();
      const code = await run(
        ["init", "demo", "--at", proj, "--param", "author=me", "--param", "license=MIT"],
        realDeps(),
        i,
      );
      expect(code).toBe(0);
      assertProjectOnDisk(proj, "demo");
    });
  });

  it("a malformed --param (no =) is a usage error (exit 2)", async () => {
    await withTempDir(async (dir) => {
      const proj = join(dir, "proj");
      const i = io();
      const code = await run(["init", "demo", "--at", proj, "--param", "bogus"], realDeps(), i);
      expect(code).toBe(2);
      expect(i.err.text).toMatch(/--param/);
      expect(existsSync(join(proj, "manifest.yml"))).toBe(false);
    });
  });

  it("without --at, init <name> nests the project under <cwd>/<name> (doc 10/12 default)", async () => {
    await withTempDir(async (dir) => {
      const proj = join(dir, "hermes-handoff");
      expect(await run(["init", "hermes-handoff", "--at", proj], realDeps(), io())).toBe(0);
      assertProjectOnDisk(proj, "hermes-handoff");
    });
  });

  it("AC#8 — `init --help` shows <name>, every flag, and a worked example", async () => {
    const i = io();
    expect(await run(["init", "--help"], realDeps(), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("init");
    expect(help).toContain("<name>"); // the positional (task-28)
    expect(help).toContain("--at");
    expect(help).toContain("--template");
    expect(help).toContain("--list-templates");
    expect(help).toContain("--param");
    expect(help).toContain("Example"); // the worked example (task-28 contract)
    expect(help).toContain("wpm init");
  });
});

describeIfBuilt(
  "`wpm init` FULL — through the built `dist/cli.js` binary (the fullest real path)",
  () => {
    it("`init <name>` with default cwd creates the full <cwd>/<name>/ on disk", () => {
      withTempDir((dir) => {
        execFileSync(process.execPath, [builtCli, "init", "hermes-handoff"], {
          cwd: dir,
          encoding: "utf8",
        });
        assertProjectOnDisk(join(dir, "hermes-handoff"), "hermes-handoff");
      });
    });

    it("`init <name> --at <dir>` creates the project at <dir> on disk", () => {
      withTempDir((dir) => {
        const proj = join(dir, "proj");
        const out = execFileSync(process.execPath, [builtCli, "init", "demo-proj", "--at", proj], {
          encoding: "utf8",
        });
        expect(out).toContain("created project demo-proj");
        assertProjectOnDisk(proj, "demo-proj");
      });
    });
  },
);

/** Whether the real `backlog` CLI is available; the .authoring-backlog real-root checks skip (not fail) if not. */
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
  "`wpm init` FULL — the .authoring-backlog is a real Backlog.md root with the project-wide tasks (BacklogMd port)",
  () => {
    /** Backlog.md per-machine global state, isolated inside `dir`. */
    function isolatedEnv(dir: string): Record<string, string> {
      return {
        HOME: dir,
        XDG_CONFIG_HOME: dir,
        XDG_DATA_HOME: dir,
        XDG_STATE_HOME: dir,
        XDG_CACHE_HOME: dir,
      };
    }

    it("AC#4 — init materialises the project-wide set into a real .authoring-backlog/ (task_prefix=authoring)", async () => {
      await withTempDir(async (dir) => {
        const env = isolatedEnv(dir);
        const deps: CliDeps = {
          fs: new NodeFileSystem(),
          backlog: new BacklogCli("backlog", env),
          clock: new FixedClock("2026-01-01T00:00:00.000Z"),
          env: new ProcessEnvironment(),
          builtinTemplatesRoot: BUILTIN_TEMPLATES,
        };
        const proj = join(dir, "proj");
        const i = io();
        expect(await run(["init", "hermes-handoff", "--at", proj], deps, i)).toBe(0);
        expect(i.out.text).toMatch(/materialised: 8 authoring task/);

        // The real CLI initialised an authoring-backlog root with task_prefix=authoring AND materialised the 8
        // project-wide tasks (authoring-1..8) → the NEXT created task is authoring-9:
        const authoringRoot = join(proj, ".authoring-backlog");
        const real = new BacklogCli("backlog", env);
        const titles = real.listTasks(authoringRoot).map((t) => t.title);
        expect(titles).toContain("Set project metadata");
        expect(titles).toContain("Build dry-run");
        expect(titles).toHaveLength(8);
        const created = real.createTask(authoringRoot, { title: "probe" });
        expect(created.id).toBe("authoring-9");
      });
    });
  },
);

describeIfBuilt("`wpm init` FULL — scope aliases on real disk (AC#3, through dist/cli.js)", () => {
  it("init then `project targets add claude-code` creates a real scope-alias symlink at .claude/skills", () => {
    withTempDir((dir) => {
      const proj = join(dir, "demo");
      execFileSync(process.execPath, [builtCli, "init", "demo", "--at", proj], {
        encoding: "utf8",
      });
      // A freshly-init'd minimal project has NO aliases (no targets) — AC#3 negative case on real disk:
      expect(existsSync(join(proj, ".claude", "skills"))).toBe(false);

      // Adding a target creates the alias (the same alias plan init would have applied for a declared target):
      execFileSync(
        process.execPath,
        [builtCli, "project", "targets", "add", "claude-code", "-C", proj],
        {
          encoding: "utf8",
        },
      );
      const alias = join(proj, ".claude", "skills");
      expect(existsSync(alias)).toBe(true);
      // It is a symlink pointing at installer-skills/ (POSIX); the real adapter uses a symlink on this platform:
      expect(lstatSync(alias).isSymbolicLink()).toBe(true);
    });
  });
});
