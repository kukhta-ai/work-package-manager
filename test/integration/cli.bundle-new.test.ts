import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import pkg from "../../package.json" with { type: "json" };
import { FakeBacklog } from "../../src/adapters/fake-backlog.js";
import { FixedClock } from "../../src/adapters/fixed-clock.js";
import { NodeFileSystem } from "../../src/adapters/node-fs.js";
import { ProcessEnvironment } from "../../src/adapters/process-env.js";
import { type CliDeps, run } from "../../src/cli.js";
import type { CliIo, OutputSink } from "../../src/util/exit.js";
import { withTempDir } from "../helpers/tmpdir.js";
import { initWorkspace } from "../helpers/workspace.js";

/**
 * Through-the-edges (integration) test for task-27's proof leaf: drives `run(["bundle","new",…])` against a
 * REAL {@link NodeFileSystem} in a real tmpdir, with a fixture project + fixture bundle template written to
 * disk (the way `init` would leave them). It proves the framework path — DI → resolveContext → runMutation →
 * format → exit — touches real files end-to-end. The backlog is the in-memory fake (no real `backlog` CLI is
 * required here); the full real-template + real-backlog slice is the task-33 walking skeleton.
 */

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

/** Write a fixture project + project/bundle templates into `dir` on the real filesystem. */
function seedOnDisk(dir: string): void {
  mkdirSync(join(dir, "wip"), { recursive: true });
  const builtin = join(dir, "builtin-templates");

  writeFileSync(
    join(dir, "wip", "manifest.yml"),
    [
      "project:",
      "  name: demo",
      "  version: 1.0.0",
      "targets:",
      "  - claude-code",
      "bundles: []",
      "",
    ].join("\n"),
  );
  mkdirSync(join(dir, "wip", "installer-skills"), { recursive: true });

  // Project template.
  mkdirSync(
    join(
      builtin,
      "project",
      "minimal",
      "snippets",
      "installer-skills",
      "{{project-name}}-installer",
    ),
    {
      recursive: true,
    },
  );
  writeFileSync(
    join(builtin, "project", "minimal", "template.yml"),
    "name: minimal\nscope: project\nparameters: []\n",
  );
  writeFileSync(
    join(builtin, "project", "minimal", "snippets", "AGENTS.md"),
    "# {{project-name}}\n\n{{bundles}}\n",
  );
  writeFileSync(
    join(
      builtin,
      "project",
      "minimal",
      "snippets",
      "installer-skills",
      "{{project-name}}-installer",
      "SKILL.md",
    ),
    "---\nname: {{project-name}}-installer\n---\nInstall {{project-name}}.\n",
  );
  // The advisor snippet `bundle new`'s auto-advisor renders (doc 10 step 6).
  writeFileSync(
    join(builtin, "project", "minimal", "snippets", "advisor.SKILL.md.tmpl"),
    "---\nname: {{bundle-id}}-advisor\n---\n\n# {{bundle-id}} advisor\n",
  );

  // Bundle template.
  mkdirSync(join(builtin, "bundle", "default", "files", "installer-skills"), { recursive: true });
  mkdirSync(join(builtin, "bundle", "default", "files", "install-backlog"), { recursive: true });
  writeFileSync(
    join(builtin, "bundle", "default", "template.yml"),
    "name: default\nscope: bundle\nparameters:\n  - name: bundle-id\n  - name: version\n",
  );
  writeFileSync(
    join(builtin, "bundle", "default", "files", "bundle.yml"),
    "id: {{bundle-id}}\nversion: {{version}}\n",
  );
  writeFileSync(join(builtin, "bundle", "default", "files", "installer-skills", ".keep"), "");
  writeFileSync(
    join(builtin, "bundle", "default", "files", "install-backlog", "config.yml"),
    "task_prefix: {{bundle-id}}\n",
  );
}

describe("cli `bundle new` over a real filesystem (task-27 proof leaf)", () => {
  it("scaffolds the bundle on disk and updates the manifest, exiting 0", async () => {
    await withTempDir(async (dir) => {
      seedOnDisk(dir);
      const backlog = new FakeBacklog();
      // The lifecycle materialises into the project's own `.authoring-backlog` root (doc 10 step 6), not the
      // project root — init the fake there so the materialiser's `listTasks` finds it (mirrors reality).
      backlog.init(join(dir, ".authoring-backlog"), { taskPrefix: "authoring" });

      const deps: CliDeps = {
        fs: new NodeFileSystem(),
        backlog,
        clock: new FixedClock("2026-01-01T00:00:00.000Z"),
        env: new ProcessEnvironment(),
        builtinTemplatesRoot: join(dir, "builtin-templates"),
      };
      const i = io();

      const code = await run(["bundle", "new", "web", "-C", dir], deps, i);

      expect(code).toBe(0);
      // The scaffold landed on the real disk:
      const bundleYml = readFileSync(join(dir, "wip", "bundles", "web", "bundle.yml"), "utf8");
      expect(bundleYml).toContain("id: web");
      // The manifest on disk now lists the bundle:
      expect(readFileSync(join(dir, "wip", "manifest.yml"), "utf8")).toContain("web");
      // The orchestrator was re-derived on disk; the executor front door is author-owned and is NOT
      // re-rendered on a mutation (task-88):
      expect(
        readFileSync(join(dir, "wip", "installer-skills", "demo-installer", "SKILL.md"), "utf8"),
      ).toContain("Install demo.");
      expect(existsSync(join(dir, "wip", "AGENTS.md"))).toBe(false);
      expect(i.out.text).toContain("created bundle web");
    });
  });
});

/**
 * Real-binary regression for the `--version` commander-shadowing bug (task-50) and a `new`→`disable`→`enable`
 * round-trip — driven through the BUILT `dist/cli.js` (the only place the bug reproduces: the in-process `run()`
 * tests passed because they never exercised the long `--version` against the program's global version option).
 * The real `backlog` CLI materialises into the real `.authoring-backlog`. Skipped (not failed) when `dist/` is
 * unbuilt, like `cli.bin.test.ts`; CI builds first, so it runs there.
 */
const builtCli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
const describeIfBuilt = existsSync(builtCli) ? describe : describe.skip;

function wpm(projectDir: string, args: readonly string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [builtCli, ...args, "-C", projectDir], {
      encoding: "utf8",
    });
    return { stdout, status: 0 };
  } catch (err) {
    // execFileSync throws on a non-zero exit; recover the captured stdout + code for assertions.
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

describeIfBuilt("bundle lifecycle via the built dist/cli.js (task-50/51/52 — real binary)", () => {
  it("`bundle new <id> --version 1.2.3` sets the BUNDLE version (not the program version); `wpm --version` still works", async () => {
    await withTempDir((dir) => {
      // A real authoring workspace; project-bound commands resolve it via -C and operate on wip/ (task-88).
      const proj = initWorkspace(builtCli, dir);

      const out = wpm(proj, ["bundle", "new", "web", "--version", "1.2.3"]);
      expect(out.status).toBe(0);
      // The bug printed the PROGRAM version and created nothing; the fix creates the bundle at 1.2.3:
      expect(out.stdout).toContain("created bundle web");
      const bundleYml = readFileSync(join(proj, "wip", "bundles", "web", "bundle.yml"), "utf8");
      expect(bundleYml).toMatch(/version:\s*1\.2\.3/);
      // The advisor stub rendered to the conventional path:
      expect(existsSync(join(proj, "wip", "installer-skills", "web-advisor", "SKILL.md"))).toBe(
        true,
      );

      // The program's OWN --version still prints the program version (kept working by the fix):
      const ver = execFileSync(process.execPath, [builtCli, "--version"], { encoding: "utf8" });
      expect(ver.trim()).toBe(pkg.version);
    });
  });

  it("TASK-102 — `backlog` inside a fresh bundle resolves its install-backlog WITHOUT a manual symlink; tasks land in install-backlog/tasks/ (AC#1/#2)", async () => {
    // The fix is a relative POSIX symlink; on Windows the adapter copies install-backlog → backlog, so a write
    // through `backlog/` does NOT reach install-backlog (the known copy-fallback degradation). Prove the
    // designed-for POSIX behaviour.
    if (process.platform === "win32") return;
    await withTempDir((dir) => {
      const proj = initWorkspace(builtCli, dir);
      expect(wpm(proj, ["bundle", "new", "web"]).status).toBe(0);

      const bundleDir = join(proj, "wip", "bundles", "web");
      // wpm shipped the link — it is a RELATIVE symlink to install-backlog (archive-portable):
      const link = join(bundleDir, "backlog");
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(readlinkSync(link)).toBe("install-backlog");

      // Run the REAL Backlog.md CLI with the bundle as cwd — NO `ln -sfn install-backlog backlog` workaround.
      // It must resolve the bundle's install-backlog (the executor's flow) and create the recipe task there.
      execFileSync(
        "backlog",
        [
          "task",
          "create",
          "ensure thing",
          "-l",
          "kind:state,step:ensure-thing",
          "-m",
          "0.1.0",
          "--ac",
          "it is present",
        ],
        { cwd: bundleDir, encoding: "utf8" },
      );

      // AC#1/#2 — the task persisted to THIS bundle's install-backlog/tasks/ (resolved through the link), not a
      // stray real `backlog/` dir and not the workspace authoring backlog. The bundle scaffold ships the
      // detect→setup→verify trio, so assert by the unique step slug we just created (the new task landed HERE):
      const tasksDir = join(bundleDir, "install-backlog", "tasks");
      const created = readdirSync(tasksDir)
        .filter((f) => f.endsWith(".md"))
        .filter((f) => readFileSync(join(tasksDir, f), "utf8").includes("step:ensure-thing"));
      expect(created).toHaveLength(1);

      // …and `backlog task list` resolves from within the bundle (AC#1):
      const listed = execFileSync("backlog", ["task", "list", "--plain"], {
        cwd: bundleDir,
        encoding: "utf8",
      });
      expect(listed).toContain("ensure thing");
    });
  });

  it("`bundle disable` then `bundle enable` round-trips manifest membership over the real backlog", async () => {
    await withTempDir((dir) => {
      // A real authoring workspace; project-bound commands resolve it via -C and operate on wip/ (task-88).
      const proj = initWorkspace(builtCli, dir);
      expect(wpm(proj, ["bundle", "new", "web"]).status).toBe(0);

      // disable: drops from the manifest, dir stays on disk.
      expect(wpm(proj, ["bundle", "disable", "web"]).status).toBe(0);
      expect(readFileSync(join(proj, "wip", "manifest.yml"), "utf8")).not.toMatch(/bundles:.*web/s);
      expect(existsSync(join(proj, "wip", "bundles", "web", "bundle.yml"))).toBe(true);

      // enable: re-appends idempotently (the per-bundle tasks already exist → a no-op materialise).
      const enabled = wpm(proj, ["bundle", "enable", "web"]);
      expect(enabled.status).toBe(0);
      expect(readFileSync(join(proj, "wip", "manifest.yml"), "utf8")).toMatch(/web/);
    });
  });
});

/**
 * The §4 reconciliation (task-34): `bundle template set` is now LIVE for `bundle new`. `init` materialises
 * `bundles/bundle-template/`; editing it (directly or via `bundle template set`) changes what `bundle new`
 * clones by default. Driven through the real `dist/cli.js`. Skipped when `dist/` is unbuilt.
 */
describeIfBuilt(
  "§4 reconciliation — `bundle new` clones the project's bundles/bundle-template/ (task-34)",
  () => {
    it("after init, an edit to bundles/bundle-template/ is reflected in the next `bundle new` scaffold", async () => {
      await withTempDir((dir) => {
        // A real authoring workspace; project-bound commands resolve it via -C and operate on wip/ (task-88).
        const proj = initWorkspace(builtCli, dir);
        // init materialised the project default bundle scaffold:
        expect(existsSync(join(proj, "wip", "bundles", "bundle-template", "_AGENTS.md.tmpl"))).toBe(
          true,
        );

        // Edit the scaffold: drop a NEW marker file in it (an author refining their default bundle shape). The
        // file name carries a placeholder so we also prove substitution runs over the cloned tree.
        writeFileSync(
          join(
            proj,
            "wip",
            "bundles",
            "bundle-template",
            "payload",
            "files",
            "MARKER-{{bundle-id}}.txt",
          ),
          "default for {{bundle-id}}\n",
        );

        // `bundle new web` (no --template) now clones the EDITED bundles/bundle-template/:
        expect(wpm(proj, ["bundle", "new", "web"]).status).toBe(0);
        const marker = join(proj, "wip", "bundles", "web", "payload", "files", "MARKER-web.txt");
        expect(existsSync(marker)).toBe(true); // the edit is reflected (set is LIVE), with the id substituted
        expect(readFileSync(marker, "utf8")).toBe("default for web\n");
      });
    });

    it("after `bundle template set default`, `bundle new` still scaffolds a working bundle", async () => {
      await withTempDir((dir) => {
        // A real authoring workspace; project-bound commands resolve it via -C and operate on wip/ (task-88).
        const proj = initWorkspace(builtCli, dir);
        // Reset the scaffold from the built-in default (the H command), then clone it:
        expect(wpm(proj, ["bundle", "template", "set", "default"]).status).toBe(0);
        expect(wpm(proj, ["bundle", "new", "web"]).status).toBe(0);
        expect(existsSync(join(proj, "wip", "bundles", "web", "bundle.yml"))).toBe(true);
        expect(readFileSync(join(proj, "wip", "bundles", "web", "bundle.yml"), "utf8")).toMatch(
          /id:\s*web/,
        );
      });
    });
  },
);
