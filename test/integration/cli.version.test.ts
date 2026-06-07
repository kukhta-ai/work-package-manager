import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
 * Through-the-edges (integration) test for the `project version` family (tasks 39/40/41): drives `run()` against
 * a REAL {@link NodeFileSystem} in a real tmpdir, with a fixture project + project-template snippets on disk (the
 * way `init` would leave them). It proves the framework path — DI → resolveContext → runRead/runMutation →
 * comment-preserving manifest write → ④ RERENDER → format → exit — touches real files end-to-end. The backlog is
 * the in-memory fake (version bump/set materialise nothing, so no real `backlog` CLI is required).
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

/** A hand-written manifest comment that must survive the bump/set on real disk. */
const COMMENT = "# author note: release version is CLI-managed";

/** Write a fixture project + the minimal project-template snippets into `dir` on the real filesystem. */
function seedOnDisk(dir: string): void {
  mkdirSync(join(dir, "wip"), { recursive: true });
  const builtin = join(dir, "builtin-templates");

  writeFileSync(
    join(dir, "wip", "manifest.yml"),
    [
      "project:",
      "  name: demo",
      "  version: 1.2.3",
      COMMENT,
      "targets:",
      "  - claude-code",
      "bundles: []",
      "",
    ].join("\n"),
  );
  mkdirSync(join(dir, "wip", "installer-skills"), { recursive: true });

  mkdirSync(
    join(
      builtin,
      "project",
      "minimal",
      "snippets",
      "installer-skills",
      "{{project-name}}-installer",
    ),
    { recursive: true },
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
}

/** Build CliDeps over real ports, the fake backlog initialised at the project's `.authoring-backlog` root. */
function realDeps(dir: string): CliDeps {
  const backlog = new FakeBacklog();
  backlog.init(join(dir, ".authoring-backlog"), { taskPrefix: "authoring" });
  return {
    fs: new NodeFileSystem(),
    backlog,
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new ProcessEnvironment(),
    builtinTemplatesRoot: join(dir, "builtin-templates"),
  };
}

/** The `project.version` parsed off the real manifest. */
function diskVersion(dir: string): string {
  const m = parseManifest(parseYaml(readFileSync(join(dir, "wip", "manifest.yml"), "utf8")));
  if (!m.ok) throw new Error("manifest did not parse");
  return m.value.meta.version;
}

describe("cli `project version` over a real filesystem (tasks 39/40/41)", () => {
  it("reads the version, then bump minor advances it on disk (comment preserved), exit 0", async () => {
    await withTempDir(async (dir) => {
      seedOnDisk(dir);

      // READ (39): prints 1.2.3, exits 0.
      const readIo = io();
      expect(await run(["project", "version", "-C", dir], realDeps(dir), readIo)).toBe(0);
      expect(readIo.out.text.trim()).toBe("1.2.3");

      // BUMP minor (40): 1.2.3 → 1.3.0, written to the real manifest, prints the new version.
      const bumpIo = io();
      expect(
        await run(["project", "version", "bump", "minor", "-C", dir], realDeps(dir), bumpIo),
      ).toBe(0);
      expect(bumpIo.out.text).toContain("1.3.0");
      expect(diskVersion(dir)).toBe("1.3.0");
      // the hand-written comment survived, and the orchestrator was re-rendered (the executor front door is
      // author-owned and is NOT re-rendered on a mutation — task-88):
      expect(readFileSync(join(dir, "wip", "manifest.yml"), "utf8")).toContain(COMMENT);
      expect(
        readFileSync(join(dir, "wip", "installer-skills", "demo-installer", "SKILL.md"), "utf8"),
      ).toContain("Install demo.");
      expect(existsSync(join(dir, "wip", "AGENTS.md"))).toBe(false);
    });
  });

  it("set pins an explicit version on disk; a bad semver is exit 2 and leaves the file unchanged", async () => {
    await withTempDir(async (dir) => {
      seedOnDisk(dir);

      // SET (41): 1.2.3 → 3.0.0.
      expect(
        await run(["project", "version", "set", "3.0.0", "-C", dir], realDeps(dir), io()),
      ).toBe(0);
      expect(diskVersion(dir)).toBe("3.0.0");

      // A bad semver → exit 2, manifest unchanged.
      const before = readFileSync(join(dir, "wip", "manifest.yml"), "utf8");
      const i = io();
      expect(await run(["project", "version", "set", "nope", "-C", dir], realDeps(dir), i)).toBe(2);
      expect(readFileSync(join(dir, "wip", "manifest.yml"), "utf8")).toBe(before);
    });
  });
});
