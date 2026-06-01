import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
