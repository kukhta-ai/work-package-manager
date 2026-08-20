import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { buildProgram, type CliDeps, run } from "../../../src/cli.js";
import { completeArgv } from "../../../src/completion/complete.js";
import { defaultRegistry } from "../../../src/completion/registry.js";
import { parseManifest } from "../../../src/core/services/schema/index.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";
import { parseYaml } from "../../../src/util/yaml.js";

/**
 * Acceptance tests for the `project targets` add/list/remove family (tasks 42/43/44 — the list-management
 * exemplar), driven through `run()` in-process over in-memory ports. The fixture is a realistic project at
 * `/proj` (manifest + a bundle + an existing `installer-skills/` so created scope aliases are NON-broken — the
 * task-25/27 lesson) with the built-in `minimal` project template snippets mirrored so the lifecycle's
 * `makeArtefactDeriver` resolves the front-door + orchestrator. Mirrors `cli.acceptance.test.ts`'s harness.
 */

const PROJ = "/proj";
const BUILTIN = "/builtin-templates";
/**
 * The authoring backlog is its own Backlog.md root at `<project>/.authoring-backlog` (doc 10 step 6) — where
 * the lifecycle's ⑤ MATERIALISE writes the per-bundle verify tasks, NOT the project root. The fake is
 * initialised there and the materialise assertions read there (the fake-parity discipline that catches the real
 * "No Backlog.md project found" failure of `targets add`).
 */
const AUTHORING = `${PROJ}/.authoring-backlog`;

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

/** Seed a project at /proj with the given targets + one enabled bundle, plus the deriver's template snippets. */
function seed(targets: readonly string[] = ["claude-code"]): {
  fs: MemoryFileSystem;
  backlog: FakeBacklog;
} {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();

  const targetLines = targets.length > 0 ? targets.map((t) => `  - ${t}`).join("\n") : "  []";
  fs.write(
    `${PROJ}/manifest.yml`,
    [
      "project:",
      "  name: demo",
      "  version: 1.0.0",
      "targets:",
      targetLines,
      "bundles:",
      "  - web",
      "",
    ].join("\n"),
  );
  // an enabled bundle so loadProject succeeds + materialise has a bundle (full schema: id/version/summary/
  // confirmation/requires — parseBundleManifest requires them):
  fs.write(
    `${PROJ}/bundles/web/bundle.yml`,
    "id: web\nversion: 0.1.0\nsummary: web bundle\nconfirmation: safe\nrequires: {}\n",
  );
  // the root alias TARGET dir exists, so a created scope alias is non-broken:
  fs.makeDirectories(`${PROJ}/installer-skills`);
  // the authoring backlog the materialiser writes the per-bundle verify tasks into (init makes it at
  // <project>/.authoring-backlog, its own Backlog.md root — NOT the project root):
  backlog.init(AUTHORING, { taskPrefix: "authoring" });

  // The built-in minimal project template snippets the deriver resolves (front-door + orchestrator):
  fs.write(`${BUILTIN}/project/minimal/template.yml`, "name: minimal\nscope: project\n");
  fs.write(`${BUILTIN}/project/minimal/snippets/AGENTS.md`, "# {{project-name}}\n\n{{bundles}}\n");
  fs.write(
    `${BUILTIN}/project/minimal/snippets/installer-skills/{{project-name}}-installer/SKILL.md`,
    "---\nname: {{project-name}}-installer\n---\nInstall {{project-name}}.\n",
  );

  return { fs, backlog };
}

/** CliDeps with cwd outside /proj (so `-C /proj` selects the project). */
function deps(fs: MemoryFileSystem, backlog: FakeBacklog, cwd = "/elsewhere"): CliDeps {
  return {
    fs,
    backlog,
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new FakeEnvironment({ cwd }),
    builtinTemplatesRoot: BUILTIN,
  };
}

/** The targets array parsed from the manifest on disk. */
function manifestTargets(fs: MemoryFileSystem): readonly string[] {
  const m = parseManifest(parseYaml(fs.read(`${PROJ}/manifest.yml`)));
  if (!m.ok) throw new Error("manifest did not parse");
  return m.value.targets;
}

describe("project targets add (task-42)", () => {
  it("AC#1 — a known agent is recorded AND its scope-alias is created non-broken; exit 0", async () => {
    const { fs, backlog } = seed(["claude-code"]);
    const i = io();
    expect(
      await run(["project", "targets", "add", "codex", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);

    // recorded in the manifest:
    expect(manifestTargets(fs)).toContain("codex");
    // codex's alias path is `.agents/skills` (ALIAS_PATHS); it exists + points at installer-skills (non-broken):
    expect(fs.exists(`${PROJ}/.agents/skills`)).toBe(true);
    expect(fs.aliasTarget(`${PROJ}/.agents/skills`)).toBe(`${PROJ}/installer-skills`);
  });

  it("AC#3 — re-renders the front-door AND materialises a per-bundle verify task for the agent", async () => {
    const { fs, backlog } = seed(["claude-code"]);
    expect(
      await run(["project", "targets", "add", "codex", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);

    // the front-door was re-rendered (it exists after the rerender):
    expect(fs.exists(`${PROJ}/AGENTS.md`)).toBe(true);
    // a per-bundle "Verify web's install-backlog works on codex" authoring task was materialised:
    const titles = backlog.listTasks(AUTHORING).map((t) => t.title);
    expect(titles).toContain("Verify web's install-backlog works on codex");
  });

  it("AC#2 — an UNKNOWN agent is still recorded, no alias is created, and a warning is emitted", async () => {
    const { fs, backlog } = seed(["claude-code"]);
    const i = io();
    expect(
      await run(["project", "targets", "add", "my-custom-agent", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);

    // still recorded:
    expect(manifestTargets(fs)).toContain("my-custom-agent");
    // no alias dir was created for it (it has no built-in path); the known root scopes for it don't appear:
    expect(fs.exists(`${PROJ}/.my-custom-agent`)).toBe(false);
    // and a warning surfaced on stderr:
    expect(i.err.text).toMatch(/warning:.*my-custom-agent.*alias/i);
  });

  it("AC#4 — adding an agent already present is a no-op conflict (exit 1), changing nothing", async () => {
    const { fs, backlog } = seed(["claude-code"]);
    const before = fs.read(`${PROJ}/manifest.yml`);
    const i = io();
    const code = await run(
      ["project", "targets", "add", "claude-code", "-C", PROJ],
      deps(fs, backlog),
      i,
    );
    expect(code).toBe(1);
    expect(i.err.text).toMatch(/^error: /);
    expect(fs.read(`${PROJ}/manifest.yml`)).toBe(before); // unchanged
  });

  it("AC#5 — outside any project, exits non-zero naming manifest.yml and suggesting init", async () => {
    const { fs, backlog } = seed();
    const i = io();
    const code = await run(["project", "targets", "add", "codex"], deps(fs, backlog), i); // no -C
    expect(code).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
    expect(i.err.text).toContain("init");
  });

  it("a malformed agent name is a usage error (exit 2)", async () => {
    const { fs, backlog } = seed();
    expect(
      await run(["project", "targets", "add", "Bad Name", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(2);
  });

  it("AC#6 — help is substantive (description, usage, <agent>, example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "targets", "add", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<agent>");
    expect(help).toContain("Example:");
  });
});

describe("project targets list (task-43)", () => {
  it("AC#1/#2 — prints the targets, read-only, exit 0", async () => {
    const { fs, backlog } = seed(["claude-code", "codex"]);
    const before = JSON.stringify([
      ...((fs as unknown as { files: Map<string, string> }).files ?? []),
    ]);
    const i = io();
    expect(await run(["project", "targets", "list", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text).toContain("claude-code");
    expect(i.out.text).toContain("codex");
    // no manifest change (read-only):
    expect(manifestTargets(fs)).toEqual(["claude-code", "codex"]);
    void before;
  });

  it("AC#3 — outside any project, exits non-zero naming manifest.yml", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "targets", "list"], deps(fs, backlog), i)).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#4 — help is substantive (description, usage, example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "targets", "list", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("Example:");
  });
});

describe("project targets remove (task-44)", () => {
  it("AC#1 — removes the target AND deletes its scope-alias; exit 0", async () => {
    const { fs, backlog } = seed(["claude-code", "codex"]);
    // create codex's alias (as `add` would have):
    fs.ensureAlias(`${PROJ}/installer-skills`, `${PROJ}/.agents/skills`);
    // and claude-code's alias (a DIFFERENT path) so we can prove only codex's is removed:
    fs.ensureAlias(`${PROJ}/installer-skills`, `${PROJ}/.claude/skills`);

    const i = io();
    expect(
      await run(["project", "targets", "remove", "codex", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);

    expect(manifestTargets(fs)).not.toContain("codex");
    expect(manifestTargets(fs)).toContain("claude-code");
    // codex's alias is gone; claude-code's survives (different path):
    expect(fs.exists(`${PROJ}/.agents/skills`)).toBe(false);
    expect(fs.exists(`${PROJ}/.claude/skills`)).toBe(true);
  });

  it("AC#1 warn-if-missing — removing a target whose alias does not exist warns (exit 0)", async () => {
    const { fs, backlog } = seed(["claude-code", "codex"]);
    // codex is a target but its alias was never created:
    const i = io();
    expect(
      await run(["project", "targets", "remove", "codex", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(i.err.text).toMatch(/warning:.*alias.*did not exist/i);
  });

  it("AC#3 — removing the LAST target prints a warning", async () => {
    const { fs, backlog } = seed(["claude-code"]);
    const i = io();
    expect(
      await run(["project", "targets", "remove", "claude-code", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(manifestTargets(fs)).toEqual([]);
    expect(i.err.text).toMatch(/warning:.*last target/i);
  });

  it("AC#4 — removing a non-target fails with a NotFoundError (exit 1)", async () => {
    const { fs, backlog } = seed(["claude-code"]);
    const i = io();
    const code = await run(
      ["project", "targets", "remove", "codex", "-C", PROJ],
      deps(fs, backlog),
      i,
    );
    expect(code).toBe(1);
    expect(i.err.text).toMatch(/^error: /);
    expect(i.err.text).not.toContain("at "); // no stack for a domain error
  });

  it("AC#2 — the front-door is re-rendered (in the changed paths) without the removed agent", async () => {
    const { fs, backlog } = seed(["claude-code", "codex"]);
    const i = io();
    expect(
      await run(["project", "targets", "remove", "codex", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    // the rerender ran (the front-door exists) and the manifest is the source of truth (no codex):
    expect(fs.exists(`${PROJ}/AGENTS.md`)).toBe(true);
    expect(manifestTargets(fs)).not.toContain("codex");
  });

  it("AC#5 — outside any project, exits non-zero naming manifest.yml", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "targets", "remove", "codex"], deps(fs, backlog), i)).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#6 — help is substantive (description, usage, <agent>, example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "targets", "remove", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<agent>");
    expect(help).toContain("Example:");
  });
});

describe("targets completion (task-42/44 AC#6 — the completion half)", () => {
  const SPECS = {
    "project targets add": { args: ["target-names"] },
    "project targets remove": { args: ["installed-target-names"] },
  };
  function complete(fs: MemoryFileSystem, backlog: FakeBacklog, words: string[]): string[] {
    const d = deps(fs, backlog, PROJ); // cwd = /proj so installed-target-names resolves the project
    return completeArgv(buildProgram(d, io()), words, {
      fs: d.fs,
      env: d.env,
      builtinTemplatesRoot: d.builtinTemplatesRoot,
      registry: defaultRegistry(),
      specs: SPECS,
    });
  }

  it("AC#6 add — `project targets add <tab>` completes from the built-in well-known agents", () => {
    const { fs, backlog } = seed(["claude-code"]);
    expect(complete(fs, backlog, ["project", "targets", "add", ""])).toEqual(
      expect.arrayContaining(["claude-code", "codex", "hermes", "openclaw"]),
    );
  });

  it("AC#6 remove — `project targets remove <tab>` completes from the CURRENT manifest targets", () => {
    const { fs, backlog } = seed(["claude-code", "codex"]);
    expect(complete(fs, backlog, ["project", "targets", "remove", ""]).sort()).toEqual([
      "claude-code",
      "codex",
    ]);
  });
});
