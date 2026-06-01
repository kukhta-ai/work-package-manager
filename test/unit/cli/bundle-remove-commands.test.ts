import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { buildProgram, type CliDeps, COMPLETION_SPECS, run } from "../../../src/cli.js";
import { completeArgv } from "../../../src/completion/complete.js";
import { defaultRegistry } from "../../../src/completion/registry.js";
import { parseManifest } from "../../../src/core/services/schema/index.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";
import { parseYaml } from "../../../src/util/yaml.js";

/**
 * Acceptance tests for `bundle remove <id>` (task-53), driven through `run()` in-process over in-memory ports.
 * The fixture mirrors `bundle-lifecycle-commands.test.ts` (a realistic init'd project at /proj with the project +
 * bundle templates so the harness's ④ RERENDER resolves the front-door snippets, plus the FakeBacklog at
 * `<project>/.authoring-backlog`). The ONE new wrinkle is CONFIRMATION: the `remove` action reads `ctx.io.in` for
 * a y/N answer unless `--yes` is passed, so the I/O bundle here threads a `Readable.from([...])` as the input.
 */

const PROJ = "/proj";
const BUILTIN = "/builtin-templates";
const AUTHORING = `${PROJ}/.authoring-backlog`;

function collector(): OutputSink & { text: string } {
  return {
    text: "",
    write(chunk: string) {
      this.text += chunk;
    },
  };
}

/** Build a CliIo with an optional confirmation input stream (the new `in` field). */
function io(input?: string): CliIo & {
  out: ReturnType<typeof collector>;
  err: ReturnType<typeof collector>;
} {
  return {
    out: collector(),
    err: collector(),
    debug: false,
    ...(input !== undefined ? { in: Readable.from([input]) } : {}),
  };
}

/** Write one bundle's bundle.yml (the full schema). */
function writeBundleYml(fs: MemoryFileSystem, id: string): void {
  fs.write(
    `${PROJ}/bundles/${id}/bundle.yml`,
    `id: ${id}\nversion: 0.1.0\nsummary: ${id} bundle\nconfirmation: safe\nrequires: {}\n`,
  );
}

interface SeedOptions {
  readonly enabled?: readonly string[];
  readonly disabledDirs?: readonly string[];
}

/** Seed a project at /proj with the project + bundle templates and the given enabled/disabled bundles. */
function seed(opts: SeedOptions = {}): { fs: MemoryFileSystem; backlog: FakeBacklog } {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();
  const enabled = opts.enabled ?? [];

  const bundleLines =
    enabled.length > 0
      ? `bundles:\n${enabled.map((b) => `  - ${b}`).join("\n")}\n`
      : "bundles: []\n";
  fs.write(
    `${PROJ}/manifest.yml`,
    `project:\n  name: demo\n  version: 1.0.0\ntargets:\n  - claude-code\n${bundleLines}`,
  );
  for (const id of enabled) {
    writeBundleYml(fs, id);
  }
  for (const id of opts.disabledDirs ?? []) {
    writeBundleYml(fs, id);
  }
  fs.makeDirectories(`${PROJ}/installer-skills`);
  backlog.init(AUTHORING, { taskPrefix: "authoring" });

  // Built-in minimal project template snippets the deriver resolves on ④ RERENDER.
  fs.write(`${BUILTIN}/project/minimal/template.yml`, "name: minimal\nscope: project\n");
  fs.write(`${BUILTIN}/project/minimal/snippets/AGENTS.md`, "# {{project-name}}\n\n{{bundles}}\n");
  fs.write(
    `${BUILTIN}/project/minimal/snippets/installer-skills/{{project-name}}-installer/SKILL.md`,
    "---\nname: {{project-name}}-installer\n---\nInstall {{project-name}}.\n",
  );
  fs.write(
    `${BUILTIN}/project/minimal/snippets/advisor.SKILL.md.tmpl`,
    "---\nname: {{bundle-id}}-advisor\ndescription: TODO advise on {{bundle-id}}\n---\n\n# {{bundle-id}} advisor\n",
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

function manifestBundles(fs: MemoryFileSystem): readonly string[] {
  const m = parseManifest(parseYaml(fs.read(`${PROJ}/manifest.yml`)));
  if (!m.ok) throw new Error("manifest did not parse");
  return m.value.bundles;
}

function complete(
  fs: MemoryFileSystem,
  backlog: FakeBacklog,
  words: readonly string[],
): readonly string[] {
  const d = deps(fs, backlog, PROJ);
  return completeArgv(buildProgram(d, io()), words, {
    fs: d.fs,
    env: d.env,
    builtinTemplatesRoot: d.builtinTemplatesRoot,
    registry: defaultRegistry(),
    specs: COMPLETION_SPECS,
  });
}

/** Seed a project with `web` enabled, its advisor stub, and a couple of authoring tasks naming it. */
function seedWebWithTasks(): { fs: MemoryFileSystem; backlog: FakeBacklog } {
  const { fs, backlog } = seed({ enabled: ["web"] });
  fs.write(`${PROJ}/installer-skills/web-advisor/SKILL.md`, "---\nname: web-advisor\n---\nbody\n");
  backlog.createTask(AUTHORING, { title: "Plan bundle web" });
  backlog.createTask(AUTHORING, { title: "Write advisor content for web" });
  return { fs, backlog };
}

describe("bundle remove (task-53)", () => {
  it("AC#1/#2/#3 — with --yes: drops from manifest, deletes dir + advisor, archives tasks, re-renders, prints summary", async () => {
    const { fs, backlog } = seedWebWithTasks();
    const i = io();
    expect(await run(["bundle", "remove", "web", "--yes", "-C", PROJ], deps(fs, backlog), i)).toBe(
      0,
    );

    expect(manifestBundles(fs)).not.toContain("web"); // dropped from the manifest (AC#2)
    expect(fs.exists(`${PROJ}/bundles/web`)).toBe(false); // dir deleted (AC#2)
    expect(fs.exists(`${PROJ}/installer-skills/web-advisor`)).toBe(false); // advisor deleted (AC#2)
    expect(backlog.listTasks(AUTHORING)).toHaveLength(0); // tasks archived (AC#2)
    expect(fs.read(`${PROJ}/AGENTS.md`)).not.toContain("web"); // re-rendered out of the menu (AC#3)
    expect(i.out.text).toContain("removed bundle web"); // a summary is printed (AC#3)
    expect(i.out.text).toContain("+ advisor");
    expect(i.out.text).toContain("archived 2 authoring task(s)");
  });

  it("AC#1/#2 — an interactive `y` answer confirms and performs the teardown", async () => {
    const { fs, backlog } = seedWebWithTasks();
    const i = io("y\n"); // pipe an affirmative answer to stdin
    expect(await run(["bundle", "remove", "web", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(fs.exists(`${PROJ}/bundles/web`)).toBe(false);
    expect(i.err.text).toMatch(/remove bundle "web"\?/); // the prompt was shown on stderr
  });

  it("AC#4 — declining (`n`) makes NO change and exits 0", async () => {
    const { fs, backlog } = seedWebWithTasks();
    const before = fs.read(`${PROJ}/manifest.yml`);
    const i = io("n\n");
    expect(await run(["bundle", "remove", "web", "-C", PROJ], deps(fs, backlog), i)).toBe(0); // exit 0, NOT an error
    // nothing changed:
    expect(fs.read(`${PROJ}/manifest.yml`)).toBe(before);
    expect(fs.exists(`${PROJ}/bundles/web`)).toBe(true);
    expect(fs.exists(`${PROJ}/installer-skills/web-advisor`)).toBe(true);
    expect(backlog.listTasks(AUTHORING)).toHaveLength(2); // tasks untouched
    expect(i.out.text).toMatch(/aborted/i);
  });

  it("AC#4 — an empty answer / EOF also declines (the safe default), exit 0, no change", async () => {
    const { fs, backlog } = seedWebWithTasks();
    const i = io(""); // EOF with no input
    expect(await run(["bundle", "remove", "web", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(fs.exists(`${PROJ}/bundles/web`)).toBe(true); // unchanged
    expect(i.out.text).toMatch(/aborted/i);
  });

  it("AC#4 — with no input stream and no --yes, declines (never destroys unattended), exit 0", async () => {
    const { fs, backlog } = seedWebWithTasks();
    const i = io(); // no `in` stream at all
    expect(await run(["bundle", "remove", "web", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(fs.exists(`${PROJ}/bundles/web`)).toBe(true); // unchanged
    expect(i.out.text).toMatch(/aborted/i);
  });

  it("AC#2 — removes a DISABLED-but-present bundle dir (not in the manifest) with --yes", async () => {
    const { fs, backlog } = seed({ enabled: ["web"], disabledDirs: ["draft"] });
    expect(
      await run(["bundle", "remove", "draft", "--yes", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    expect(fs.exists(`${PROJ}/bundles/draft`)).toBe(false);
    expect(manifestBundles(fs)).toContain("web"); // the enabled bundle is untouched
  });

  it("AC#2 — PREFIX SAFETY through the binary: removing `web` archives only web's tasks, not web-extra's", async () => {
    const { fs, backlog } = seed({ enabled: ["web", "web-extra"] });
    backlog.createTask(AUTHORING, { title: "Plan bundle web" });
    backlog.createTask(AUTHORING, { title: "Plan bundle web-extra" });

    expect(
      await run(["bundle", "remove", "web", "--yes", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    expect(backlog.listTasks(AUTHORING).map((t) => t.title)).toEqual(["Plan bundle web-extra"]);
    expect(fs.exists(`${PROJ}/bundles/web-extra`)).toBe(true); // web-extra survives
  });

  it("a non-existent bundle (neither enabled nor on disk) exits 1, changing nothing, BEFORE any prompt", async () => {
    const { fs, backlog } = seed({ enabled: ["web"] });
    const before = fs.read(`${PROJ}/manifest.yml`);
    const i = io("y\n"); // even an affirmative answer must not matter — the probe fires first
    expect(await run(["bundle", "remove", "ghost", "-C", PROJ], deps(fs, backlog), i)).toBe(1);
    expect(i.err.text).toMatch(/not found/i);
    expect(fs.read(`${PROJ}/manifest.yml`)).toBe(before);
    expect(fs.exists(`${PROJ}/bundles/web`)).toBe(true);
  });

  it("AC#5 — outside any project it exits 1 naming manifest.yml + init", async () => {
    const { fs, backlog } = seed({ enabled: ["web"] });
    const i = io();
    expect(await run(["bundle", "remove", "web"], deps(fs, backlog, "/nowhere"), i)).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
    expect(i.err.text).toContain("init");
  });

  it("AC#5 — the id positional completes from current (enabled) bundles", async () => {
    const { fs, backlog } = seed({ enabled: ["web", "doc"] });
    const out = complete(fs, backlog, ["bundle", "remove", ""]);
    expect(out).toContain("web");
    expect(out).toContain("doc");
  });

  it("AC#6 — help is substantive (description, usage, the id positional, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    await run(["bundle", "remove", "--help"], deps(fs, backlog), i);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<id>");
    expect(help).toContain("--yes");
    expect(help).toMatch(/Example/i);
  });
});
