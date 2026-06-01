import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  const builtin = join(dir, "builtin-templates");

  writeFileSync(
    join(dir, "manifest.yml"),
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
  mkdirSync(join(dir, "installer-skills"), { recursive: true });

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
      const bundleYml = readFileSync(join(dir, "bundles", "web", "bundle.yml"), "utf8");
      expect(bundleYml).toContain("id: web");
      // The manifest on disk now lists the bundle:
      expect(readFileSync(join(dir, "manifest.yml"), "utf8")).toContain("web");
      // The front-door was re-derived on disk:
      expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toContain("# demo");
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
      const proj = join(dir, "demo");
      execFileSync(process.execPath, [builtCli, "init", "demo", "--at", proj], {
        encoding: "utf8",
      });

      const out = wpm(proj, ["bundle", "new", "web", "--version", "1.2.3"]);
      expect(out.status).toBe(0);
      // The bug printed the PROGRAM version and created nothing; the fix creates the bundle at 1.2.3:
      expect(out.stdout).toContain("created bundle web");
      const bundleYml = readFileSync(join(proj, "bundles", "web", "bundle.yml"), "utf8");
      expect(bundleYml).toMatch(/version:\s*1\.2\.3/);
      // The advisor stub rendered to the conventional path:
      expect(existsSync(join(proj, "installer-skills", "web-advisor", "SKILL.md"))).toBe(true);

      // The program's OWN --version still prints the program version (kept working by the fix):
      const ver = execFileSync(process.execPath, [builtCli, "--version"], { encoding: "utf8" });
      expect(ver.trim()).toBe(pkg.version);
    });
  });

  it("`bundle disable` then `bundle enable` round-trips manifest membership over the real backlog", async () => {
    await withTempDir((dir) => {
      const proj = join(dir, "demo");
      execFileSync(process.execPath, [builtCli, "init", "demo", "--at", proj], {
        encoding: "utf8",
      });
      expect(wpm(proj, ["bundle", "new", "web"]).status).toBe(0);

      // disable: drops from the manifest, dir stays on disk.
      expect(wpm(proj, ["bundle", "disable", "web"]).status).toBe(0);
      expect(readFileSync(join(proj, "manifest.yml"), "utf8")).not.toMatch(/bundles:.*web/s);
      expect(existsSync(join(proj, "bundles", "web", "bundle.yml"))).toBe(true);

      // enable: re-appends idempotently (the per-bundle tasks already exist → a no-op materialise).
      const enabled = wpm(proj, ["bundle", "enable", "web"]);
      expect(enabled.status).toBe(0);
      expect(readFileSync(join(proj, "manifest.yml"), "utf8")).toMatch(/web/);
    });
  });
});
