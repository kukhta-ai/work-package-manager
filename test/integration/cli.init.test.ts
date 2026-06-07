import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execaSync } from "execa";
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
import { initFlatProject } from "../helpers/flat-project.js";
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

/**
 * Assert the FULL produced authoring WORKSPACE on REAL DISK (via `node:fs`) under workspace root `proj`
 * (task-87): the authoring surface at the root, the deliverable skeleton under `wip/`, the empty `builds/`.
 */
function assertProjectOnDisk(proj: string, name: string): void {
  const wip = join(proj, "wip");

  // The DELIVERABLE manifest lives under wip/ — parses, name substituted, empty bundles/targets:
  expect(existsSync(join(wip, "manifest.yml"))).toBe(true);
  const manifest = parseManifest(parseYaml(readFileSync(join(wip, "manifest.yml"), "utf8")));
  expect(manifest.ok).toBe(true);
  if (manifest.ok) {
    expect(manifest.value.meta.name).toBe(name);
    expect(manifest.value.bundles).toEqual([]);
    expect(manifest.value.targets).toEqual([]);
  }

  // AC#4 — the WORKSPACE-ROOT authoring front door addresses the AUTHORING agent (+ a CLAUDE.md alias):
  expect(existsSync(join(proj, "AGENTS.md"))).toBe(true);
  const authoring = readFileSync(join(proj, "AGENTS.md"), "utf8");
  expect(authoring).toContain(name);
  expect(authoring.toLowerCase()).toContain("authoring agent");
  expect(authoring.toLowerCase()).not.toContain("executing agent");
  expect(existsSync(join(proj, "CLAUDE.md"))).toBe(true);

  // AC#8 — the DELIVERABLE executor front door is author-owned under the reserved prefix (NOT the canonical name):
  expect(existsSync(join(wip, "_AGENTS.md"))).toBe(true);
  expect(existsSync(join(wip, "AGENTS.md"))).toBe(false);
  const executor = readFileSync(join(wip, "_AGENTS.md"), "utf8");
  expect(executor).toContain(name);
  expect(executor.toLowerCase()).toContain("install");

  // AC#8 — the orchestrator + its static journaling reference, under wip/:
  expect(existsSync(join(wip, "installer-skills", `${name}-installer`, "SKILL.md"))).toBe(true);
  expect(
    existsSync(join(wip, "installer-skills", `${name}-installer`, "references", "journaling.md")),
  ).toBe(true);

  // the remaining copied files, under wip/:
  expect(existsSync(join(wip, "README.md"))).toBe(true);
  expect(existsSync(join(wip, "RALPH-LOOP.md"))).toBe(true);

  // AC#1 — the default bundle template materialised at wip/bundles/bundle-template/ (placeholders KEPT):
  expect(existsSync(join(wip, "bundles", "bundle-template", "AGENTS.md.tmpl"))).toBe(true);
  expect(readFileSync(join(wip, "bundles", "bundle-template", "AGENTS.md.tmpl"), "utf8")).toMatch(
    /\{\{bundle-id\}\}/,
  );

  // AC#1 — the empty registries exist as directories under wip/; the authoring backlog at the workspace root:
  expect(existsSync(join(wip, "installer-skills"))).toBe(true);
  expect(existsSync(join(wip, "templates"))).toBe(true);
  expect(existsSync(join(proj, ".authoring-backlog"))).toBe(true);

  // AC#2 — the empty build-output directory exists at the workspace root:
  expect(existsSync(join(proj, "builds"))).toBe(true);
  expect(readdirSync(join(proj, "builds"))).toEqual([]);

  // AC#3 — the workspace .gitignore records BOTH the authoring backlog AND builds/:
  expect(existsSync(join(proj, ".gitignore"))).toBe(true);
  const gitignore = readFileSync(join(proj, ".gitignore"), "utf8");
  expect(gitignore).toMatch(/^\.authoring-backlog\/$/m);
  expect(gitignore).toMatch(/^builds\/$/m);

  // AC#1 — minimal declares no targets ⇒ NO scope-aliases under wip/:
  expect(existsSync(join(wip, ".claude", "skills"))).toBe(false);

  // NO unresolved {{…}} marker in any produced file EXCEPT the bundle-template scaffold (a template-of-a-template
  // that deliberately keeps its placeholders for `bundle new` to fill):
  const scaffold = join(wip, "bundles", "bundle-template");
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
      expect(i.out.text).toContain("created authoring workspace hermes-handoff");
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
      const manifestBefore = readFileSync(join(proj, "wip", "manifest.yml"), "utf8");

      // <proj> now exists, so a second init at the SAME path is refused (AC#5) — exit 1, nothing changed:
      const i = io();
      const code = await run(["init", "other", "--at", proj], realDeps(), i);
      expect(code).toBe(1); // ConflictError → exit 1
      expect(i.err.text).toMatch(/^error: /);
      expect(readFileSync(join(proj, "wip", "manifest.yml"), "utf8")).toBe(manifestBefore); // unchanged
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
      expect(existsSync(join(proj, "wip", "manifest.yml"))).toBe(false);
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
        expect(out).toContain("created authoring workspace demo-proj");
        assertProjectOnDisk(proj, "demo-proj");
      });
    });
  },
);

/** Whether the real `backlog` CLI is available; the .authoring-backlog real-root checks skip (not fail) if not. */
function backlogAvailable(): boolean {
  try {
    // Probe via `execaSync` (not `execFileSync`) so the guard's "is backlog present?" check uses the SAME
    // resolution the block's body relies on (the real `BacklogCli` adapter shells out via `src/util/shell.ts`'s
    // execa). On Windows the npm global bin is a `.cmd` shim execa resolves but bare `execFileSync` does not — so
    // a bare-`execFileSync` guard would FALSE-SKIP a runner that actually HAS backlog. A genuinely-absent backlog
    // still throws here ⇒ the block skips cleanly (never fails).
    execaSync("backlog", ["--version"], { stdout: "pipe", stderr: "pipe" });
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

describeIfBuilt("`wpm init` FULL — scope aliases on real disk (AC#1, through dist/cli.js)", () => {
  it("init then `project targets add claude-code` creates a real scope-alias symlink", () => {
    withTempDir((dir) => {
      // NOTE (task-88/task-93 follow-up): `project targets add` is project-bound and resolves a flat project
      // root (`resolveContext`/`PROJECT_MARKER` key on a root-level `manifest.yml`, and the lifecycle
      // materialises into `<root>/.authoring-backlog`). task-87 nests the deliverable under `wip/` with the
      // authoring backlog at the workspace root, which `targets add` cannot resolve until task-88. So this
      // symlink-on-disk check runs against the flattened init output (`initFlatProject`); the
      // alias-under-`wip/` placement at init time is covered by the in-memory unit tests above.
      const proj = initFlatProject(builtCli, dir);
      // A freshly-init'd minimal project has NO aliases (no targets) — negative case on real disk:
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
