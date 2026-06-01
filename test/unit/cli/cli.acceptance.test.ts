import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { type CliDeps, run } from "../../../src/cli.js";
import { parseManifest } from "../../../src/core/services/schema/index.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";
import { parseYaml } from "../../../src/util/yaml.js";

/**
 * Acceptance test for the CLI composition root (task-27), driven through the public `run()` API as a BLACK BOX
 * — the way the `wpm` binary's entry point invokes it, but programmatically (no child process). One `describe`
 * per acceptance criterion, each narrating an author at the CLI: the groups are presented and dispatched
 * (AC#1), the injected ports reach the command (AC#2), every failure maps to the right exit code + message
 * with debug-gated detail (AC#3), and a reserved-verb bundle id is refused (AC#4). Pure and deterministic:
 * in-memory ports + collector sinks; no real fs / process / git.
 */

const ROOT = "/proj";
const BUILTIN = "/builtin-templates";

function collector(): OutputSink & { text: string } {
  return {
    text: "",
    write(chunk: string) {
      this.text += chunk;
    },
  };
}

function io(
  debug = false,
): CliIo & { out: ReturnType<typeof collector>; err: ReturnType<typeof collector> } {
  return { out: collector(), err: collector(), debug };
}

/** Seed a realistic project + fixture templates into a fresh MemoryFileSystem + FakeBacklog as CliDeps. */
function seedDeps(): CliDeps {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();

  fs.write(
    `${ROOT}/manifest.yml`,
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
  backlog.init(ROOT, { taskPrefix: "authoring" });
  fs.makeDirectories(`${ROOT}/installer-skills`);

  fs.write(
    `${BUILTIN}/project/minimal/template.yml`,
    "name: minimal\nscope: project\nparameters: []\n",
  );
  fs.write(`${BUILTIN}/project/minimal/snippets/AGENTS.md`, "# {{project-name}}\n\n{{bundles}}\n");
  fs.write(
    `${BUILTIN}/project/minimal/snippets/installer-skills/{{project-name}}-installer/SKILL.md`,
    "---\nname: {{project-name}}-installer\n---\nInstall {{project-name}}.\n",
  );
  fs.write(
    `${BUILTIN}/bundle/default/template.yml`,
    "name: default\nscope: bundle\nparameters:\n  - name: bundle-id\n  - name: version\n",
  );
  fs.write(
    `${BUILTIN}/bundle/default/files/bundle.yml`,
    "id: {{bundle-id}}\nversion: {{version}}\n",
  );
  fs.write(`${BUILTIN}/bundle/default/files/installer-skills/.keep`, "");
  fs.write(
    `${BUILTIN}/bundle/default/files/install-backlog/config.yml`,
    "task_prefix: {{bundle-id}}\n",
  );

  return {
    fs,
    backlog,
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new FakeEnvironment({ cwd: "/elsewhere" }), // -C /proj selects the project explicitly
    builtinTemplatesRoot: BUILTIN,
  };
}

describe("wpm CLI — acceptance (task-27 composition root, doc 10/12/13)", () => {
  describe("AC#1 — the program presents the top-level groups and dispatches through one registration", () => {
    it("one registration pattern, dispatched", async () => {
      const deps = seedDeps();

      // The groups are presented in help (doc 10's top-level tree):
      const helpIo = io();
      expect(await run(["--help"], deps, helpIo)).toBe(0);
      for (const group of ["init", "template", "project", "bundle", "build"]) {
        expect(helpIo.out.text).toContain(group);
      }

      // ...and dispatch reaches the registered leaf — `bundle new` actually creates the bundle:
      const runIo = io();
      expect(await run(["bundle", "new", "web", "-C", ROOT], deps, runIo)).toBe(0);
      const manifest = parseManifest(parseYaml(deps.fs.read(`${ROOT}/manifest.yml`)));
      expect(manifest.ok).toBe(true);
      if (manifest.ok) expect(manifest.value.bundles).toContain("web");
    });
  });

  describe("AC#2 — the real abstractions are assembled once and supplied to the commands", () => {
    it("dependencies injected at the entry point reach the command", async () => {
      const deps = seedDeps(); // ONE deps object
      const i = io();

      expect(await run(["bundle", "new", "web", "-C", ROOT], deps, i)).toBe(0);

      // The effects landed in the SAME injected instances — proving they were supplied, not re-constructed:
      expect(deps.fs.exists(`${ROOT}/bundles/web/bundle.yml`)).toBe(true);
      expect(deps.backlog.listTasks(ROOT).length).toBeGreaterThan(0);
      // ...and output was formatted on the injected sink (output lives in the shell, not core):
      expect(i.out.text).toContain("created bundle web");
    });
  });

  describe("AC#3 — domain failures map cleanly; unexpected failures show detail only in debug", () => {
    it("a duplicate bundle exits 1 (ConflictError) with a clean, stack-free message", async () => {
      const deps = seedDeps();
      expect(await run(["bundle", "new", "web", "-C", ROOT], deps, io())).toBe(0);

      const i = io();
      const code = await run(["bundle", "new", "web", "-C", ROOT], deps, i);
      expect(code).toBe(1);
      expect(i.err.text).toMatch(/^error: /);
      expect(i.err.text).not.toContain("at "); // no stack frames for a domain error
    });

    it("a project-bound command with no project and no -C exits 1 naming manifest.yml", async () => {
      const deps = seedDeps(); // env cwd "/elsewhere" has no manifest on its chain
      const i = io();
      const code = await run(["bundle", "new", "web"], deps, i); // no -C
      expect(code).toBe(1);
      expect(i.err.text).toContain("manifest.yml");
    });

    it("an unknown command exits 2 (usage)", async () => {
      expect(await run(["frobnicate"], seedDeps(), io())).toBe(2);
    });

    it("--version and --help exit 0", async () => {
      const deps = seedDeps();
      expect(await run(["--version"], deps, io())).toBe(0);
      expect(await run(["--help"], deps, io())).toBe(0);
    });

    it("an unexpected error exits 1, with the stack shown ONLY in debug mode", async () => {
      // A malformed bundle template.yml makes the resolver throw a plain Error (a template-authoring bug, per
      // the task-17 convention) — an UNEXPECTED (non-domain) failure reached entirely through run().
      const broken = seedDeps();
      broken.fs.write(`${BUILTIN}/bundle/default/template.yml`, "name: default\nparameters: []\n"); // no scope

      const plainIo = io(false);
      const plainCode = await run(["bundle", "new", "web", "-C", ROOT], broken, plainIo);
      expect(plainCode).toBe(1); // general error
      expect(plainIo.err.text).not.toContain("at "); // no stack without debug

      const broken2 = seedDeps();
      broken2.fs.write(`${BUILTIN}/bundle/default/template.yml`, "name: default\nparameters: []\n");
      const debugIo = io(true);
      const debugCode = await run(["bundle", "new", "web", "-C", ROOT], broken2, debugIo);
      expect(debugCode).toBe(1);
      expect(debugIo.err.text.length).toBeGreaterThan(plainIo.err.text.length); // stack appended in debug
    });
  });

  describe("AC#4 — a bundle id colliding with a reserved command verb is refused", () => {
    it.each([
      "new",
      "enable",
      "list",
      "template",
    ])("the grammar guard refuses the reserved verb '%s' (usage exit 2)", async (verb) => {
      const deps = seedDeps();
      const i = io();
      const code = await run(["bundle", "new", verb, "-C", ROOT], deps, i);
      expect(code).toBe(2);
      expect(i.err.text).toContain(verb);
      expect(i.err.text).toContain("reserved command verb");
    });

    it("a normal id keeps bundle <id> unambiguous and succeeds", async () => {
      const deps = seedDeps();
      expect(await run(["bundle", "new", "web", "-C", ROOT], deps, io())).toBe(0);
      expect(deps.fs.exists(`${ROOT}/bundles/web/bundle.yml`)).toBe(true);
    });
  });
});
