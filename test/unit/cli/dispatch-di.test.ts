import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { type CliDeps, run } from "../../../src/cli.js";
import { parseManifest } from "../../../src/core/services/schema/index.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";
import { parseYaml } from "../../../src/util/yaml.js";

const ROOT = "/proj";
const BUILTIN = "/builtin-templates";
/**
 * The authoring backlog is its own Backlog.md root at `<project>/.authoring-backlog` (doc 10 step 6), where the
 * lifecycle materialises — NOT the project root. The fake is initialised there and materialise assertions read
 * there (the fake-parity discipline that catches the real "No Backlog.md project found" failure).
 */
const AUTHORING = `${ROOT}/.authoring-backlog`;

/** A string-collecting {@link OutputSink}. */
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

/**
 * Seed a realistic project (the way `init` leaves it) + the fixture project/bundle templates into a fresh
 * MemoryFileSystem + FakeBacklog, and bundle them as {@link CliDeps}. Mirrors the create-bundle test fixtures
 * (targets `claude-code` so the scope aliases resolve). `builtinTemplatesRoot` points at the seeded templates.
 */
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
  backlog.init(AUTHORING, { taskPrefix: "authoring" });
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
  // The advisor snippet `bundle new`'s auto-advisor renders (doc 10 step 6).
  fs.write(
    `${BUILTIN}/project/minimal/snippets/advisor.SKILL.md.tmpl`,
    "---\nname: {{bundle-id}}-advisor\n---\n\n# {{bundle-id}} advisor\n",
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
    // cwd is somewhere unrelated; `-C /proj` selects the project explicitly (resolveContext override).
    env: new FakeEnvironment({ cwd: "/elsewhere" }),
    builtinTemplatesRoot: BUILTIN,
  };
}

describe("cli dispatch + DI + reserved-verb (task-27)", () => {
  it("AC#1/AC#2 — dispatches `bundle new` through the injected deps to the operation (exit 0)", async () => {
    const deps = seedDeps();
    const i = io();

    const code = await run(["bundle", "new", "web", "-C", ROOT], deps, i);

    expect(code).toBe(0);
    // AC#2: the SAME injected fs instance received the operation's writes (the scaffold appears in it):
    expect(deps.fs.exists(`${ROOT}/bundles/web/bundle.yml`)).toBe(true);
    // AC#1: dispatch reached the real operation — the manifest now lists the new bundle:
    const manifest = parseManifest(parseYaml(deps.fs.read(`${ROOT}/manifest.yml`)));
    expect(manifest.ok).toBe(true);
    if (manifest.ok) expect(manifest.value.bundles).toContain("web");
    // AC#2: the SAME injected backlog received the materialised tasks (in the .authoring-backlog root):
    expect(deps.backlog.listTasks(AUTHORING).length).toBeGreaterThan(0);
    // output was formatted on the out sink (not core):
    expect(i.out.text).toContain("created bundle web");
  });

  it.each([
    "new",
    "enable",
    "disable",
    "remove",
    "list",
    "template",
  ])("AC#4 — refuses the reserved verb '%s' as a bundle id with usage exit 2", async (verb) => {
    const deps = seedDeps();
    const i = io();

    const code = await run(["bundle", "new", verb, "-C", ROOT], deps, i);

    expect(code).toBe(2); // UsageError → usage exit
    expect(i.err.text).toContain(verb);
    expect(i.err.text).toContain("reserved command verb");
    // nothing was scaffolded:
    expect(deps.fs.exists(`${ROOT}/bundles/${verb}`)).toBe(false);
  });

  it("AC#4 — refuses a reserved verb with exit 2 even with NO project (grammar before context)", async () => {
    // The reserved-verb guard is pure grammar and fires BEFORE resolveContext, so a bad id is exit 2 (usage)
    // regardless of whether a project exists — NOT exit 1 (NotFoundError). cwd "/elsewhere" has no manifest
    // on its chain, and no -C is passed.
    const deps = seedDeps();
    const i = io();

    const code = await run(["bundle", "new", "new"], deps, i); // no -C, no project

    expect(code).toBe(2); // UsageError → usage exit (not NotFoundError → 1)
    expect(i.err.text).toContain("reserved command verb");
    expect(i.err.text).not.toContain("no manifest.yml"); // context resolution never ran
  });

  it("a normal id is not tripped by the reserved-verb guard", async () => {
    const deps = seedDeps();
    const i = io();
    const code = await run(["bundle", "new", "web-handoff", "-C", ROOT], deps, i);
    expect(code).toBe(0);
    expect(deps.fs.exists(`${ROOT}/bundles/web-handoff/bundle.yml`)).toBe(true);
  });

  it("AC#3 — a project-bound command outside any project maps {found:false} to a NotFoundError (exit 1)", async () => {
    // No manifest anywhere on the cwd chain, and no -C override → resolveContext yields {found:false}.
    // The seeded env's cwd ("/elsewhere") already has no manifest on its chain.
    const deps = seedDeps();
    const i = io();

    const code = await run(["bundle", "new", "web"], deps, i); // no -C
    expect(code).toBe(1); // NotFoundError → general error
    expect(i.err.text).toContain("no manifest.yml found");
  });
});
