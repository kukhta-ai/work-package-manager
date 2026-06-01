import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { buildProgram, type CliDeps, COMPLETION_SPECS, run } from "../../../src/cli.js";
import { completeArgv } from "../../../src/completion/complete.js";
import { defaultRegistry } from "../../../src/completion/registry.js";
import { parseBundleManifest, parseManifest } from "../../../src/core/services/schema/index.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";
import { parseYaml } from "../../../src/util/yaml.js";

/**
 * Acceptance tests for the `bundle` membership-lifecycle family — `bundle new` / `enable` / `disable` (tasks
 * 50/51/52), driven through `run()` in-process over in-memory ports. The fixture is a realistic project at
 * `/proj` the way `init` leaves it: a `manifest.yml`, the built-in `minimal` project template snippets
 * (front-door + orchestrator + the ADVISOR snippet, so `scaffoldAdvisor` resolves it), the built-in `default`
 * bundle template (so `bundle new` scaffolds + writes a `config.yml` with `task_prefix`), an existing
 * `installer-skills/` dir (so created scope aliases are NON-broken — the task-25/27 lesson), and the FakeBacklog
 * initialised at `<project>/.authoring-backlog` (the materialise root). Mirrors `targets-commands.test.ts`.
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
function io(): CliIo & { out: ReturnType<typeof collector>; err: ReturnType<typeof collector> } {
  return { out: collector(), err: collector(), debug: false };
}

/** Options for {@link seed}: which bundles the manifest already lists, and extra bundle dirs present on disk. */
interface SeedOptions {
  /** Bundle ids already enabled (listed in `manifest.bundles`). Each gets a `bundle.yml` on disk. */
  readonly enabled?: readonly string[];
  /** Bundle ids present on disk (each gets a `bundle.yml`) but NOT listed — the disabled-but-present set. */
  readonly disabledDirs?: readonly string[];
}

/** Write one bundle's `bundle.yml` (the full schema `parseBundleManifest` requires). */
function writeBundleYml(fs: MemoryFileSystem, id: string): void {
  fs.write(
    `${PROJ}/bundles/${id}/bundle.yml`,
    `id: ${id}\nversion: 0.1.0\nsummary: ${id} bundle\nconfirmation: safe\nrequires: {}\n`,
  );
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

  // Built-in minimal project template snippets the deriver + the advisor scaffold resolve.
  fs.write(`${BUILTIN}/project/minimal/template.yml`, "name: minimal\nscope: project\n");
  fs.write(`${BUILTIN}/project/minimal/snippets/AGENTS.md`, "# {{project-name}}\n\n{{bundles}}\n");
  fs.write(
    `${BUILTIN}/project/minimal/snippets/installer-skills/{{project-name}}-installer/SKILL.md`,
    "---\nname: {{project-name}}-installer\n---\nInstall {{project-name}}.\n",
  );
  // The advisor snippet (the new part `scaffoldAdvisor` renders) — mirrors the real template's frontmatter.
  fs.write(
    `${BUILTIN}/project/minimal/snippets/advisor.SKILL.md.tmpl`,
    "---\nname: {{bundle-id}}-advisor\ndescription: TODO advise on {{bundle-id}}\n---\n\n# {{bundle-id}} advisor\n",
  );

  // Built-in default bundle template (scaffold tree; config.yml carries task_prefix; bundle.yml is written
  // canonically by the operation so the template ships everything else).
  fs.write(
    `${BUILTIN}/bundle/default/template.yml`,
    "name: default\nscope: bundle\nparameters:\n  - name: bundle-id\n  - name: version\n  - name: project-name\n",
  );
  fs.write(`${BUILTIN}/bundle/default/files/installer-skills/.keep`, "");
  fs.write(
    `${BUILTIN}/bundle/default/files/install-backlog/config.yml`,
    'task_prefix: "{{bundle-id}}"\nproject_name: "{{bundle-id}}"\n',
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

/** The bundles array parsed from the manifest on disk. */
function manifestBundles(fs: MemoryFileSystem): readonly string[] {
  const m = parseManifest(parseYaml(fs.read(`${PROJ}/manifest.yml`)));
  if (!m.ok) throw new Error("manifest did not parse");
  return m.value.bundles;
}

/**
 * Resolve completions against the project at /proj (mirrors the dispatch's real registry + the CLI's real
 * `COMPLETION_SPECS`). cwd is set to PROJ so the state-dependent sources resolve the project from the working
 * directory (the same way the targets completion test does), since a completion line carries no `-C`.
 */
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

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle new (task-50)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle new (task-50)", () => {
  it("AC#1 — a reserved cross-bundle verb id fails with exit 2, creating nothing", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "new", "list", "-C", PROJ], deps(fs, backlog), i)).toBe(2);
    expect(i.err.text).toMatch(/reserved/i);
    expect(fs.exists(`${PROJ}/bundles/list`)).toBe(false);
  });

  it("AC#1 — a non-kebab id fails non-zero, creating nothing", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "new", "Web", "-C", PROJ], deps(fs, backlog), i)).not.toBe(0);
    expect(fs.exists(`${PROJ}/bundles/Web`)).toBe(false);
  });

  it("AC#1 — a duplicate id fails (exit 1, ConflictError), manifest unchanged", async () => {
    const { fs, backlog } = seed({ enabled: ["web"] });
    const before = fs.read(`${PROJ}/manifest.yml`);
    const i = io();
    expect(await run(["bundle", "new", "web", "-C", PROJ], deps(fs, backlog), i)).toBe(1);
    expect(i.err.text).toMatch(/already exists/i);
    expect(fs.read(`${PROJ}/manifest.yml`)).toBe(before);
  });

  it("AC#2 — scaffolds bundles/<id>/ with bundle.yml + install-backlog/config.yml(task_prefix=<id>)", async () => {
    const { fs, backlog } = seed();
    expect(await run(["bundle", "new", "acme", "-C", PROJ], deps(fs, backlog), io())).toBe(0);

    const b = parseBundleManifest(parseYaml(fs.read(`${PROJ}/bundles/acme/bundle.yml`)));
    expect(b.ok).toBe(true);
    if (b.ok) {
      expect(b.value.id).toBe("acme");
      expect(b.value.version).toBe("0.1.0"); // default version
      expect(b.value.requires.size).toBe(0); // empty requires
    }
    const config = fs.read(`${PROJ}/bundles/acme/install-backlog/config.yml`);
    expect(config).toContain("task_prefix");
    expect(config).toContain("acme"); // the rendered task_prefix == the id
  });

  it("AC#2 — --version sets the BUNDLE version (the commander-shadowing bug regression, in-process)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["bundle", "new", "acme", "--version", "1.2.3", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    const b = parseBundleManifest(parseYaml(fs.read(`${PROJ}/bundles/acme/bundle.yml`)));
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.value.version).toBe("1.2.3");
    // stdout is the operation summary, NOT the program version (the bug printed the program version):
    expect(i.out.text).toContain("created bundle acme");
    expect(i.out.text).not.toMatch(/^\d+\.\d+\.\d+\s*$/m);
  });

  it("AC#3 — --disabled scaffolds the dir but does NOT append to manifest.bundles", async () => {
    const { fs, backlog } = seed();
    expect(
      await run(["bundle", "new", "draft", "--disabled", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    expect(fs.exists(`${PROJ}/bundles/draft/bundle.yml`)).toBe(true); // dir scaffolded
    expect(manifestBundles(fs)).not.toContain("draft"); // not enabled
  });

  it("AC#3 — by default the advisor stub is rendered AND its content task is materialised", async () => {
    const { fs, backlog } = seed();
    expect(await run(["bundle", "new", "acme", "-C", PROJ], deps(fs, backlog), io())).toBe(0);
    const advisor = fs.read(`${PROJ}/installer-skills/acme-advisor/SKILL.md`);
    expect(advisor).toContain("name: acme-advisor"); // rendered frontmatter
    const titles = backlog.listTasks(AUTHORING).map((t) => t.title);
    expect(titles).toContain("Write advisor content for acme");
  });

  it("AC#3 — --no-advisor skips both the stub and the content task (11 tasks, not 12)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["bundle", "new", "acme", "--no-advisor", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(fs.exists(`${PROJ}/installer-skills/acme-advisor/SKILL.md`)).toBe(false);
    const titles = backlog.listTasks(AUTHORING).map((t) => t.title);
    expect(titles).not.toContain("Write advisor content for acme");
    expect(i.out.text).toContain("materialised: 11 authoring task(s)");
  });

  it("AC#4 — materialises the 12-task set + re-renders the front-door to include the bundle", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "new", "acme", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    const titles = backlog.listTasks(AUTHORING).map((t) => t.title);
    expect(titles).toContain("Plan bundle acme");
    expect(i.out.text).toContain("materialised: 12 authoring task(s)");
    // the front-door was re-rendered to list the new bundle:
    expect(fs.read(`${PROJ}/AGENTS.md`)).toContain("acme");
  });

  it("AC#5 — the summary names the bundle, the advisor state, and the task count; exit 0", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "new", "acme", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text).toContain("created bundle acme");
    expect(i.out.text).toContain("advisor scaffolded");
    expect(i.out.text).toContain("materialised: 12 authoring task(s)");
  });

  it("AC#6 — outside any project it exits 1 naming manifest.yml + init", async () => {
    const { fs, backlog } = seed();
    const i = io();
    // cwd is /nowhere (no manifest up-tree); no -C.
    expect(await run(["bundle", "new", "acme"], deps(fs, backlog, "/nowhere"), i)).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
    expect(i.err.text).toContain("init");
  });

  it("AC#6 — --template completes from bundle-scope template names", async () => {
    const { fs, backlog } = seed();
    expect(complete(fs, backlog, ["bundle", "new", "--template", ""])).toContain("default");
  });

  it("the program's own --version still prints the program version (kept working by the fix)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["--version"], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle enable (task-51)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle enable (task-51)", () => {
  it("AC#1 — enabling a disabled-but-present dir appends it + re-renders the menu", async () => {
    const { fs, backlog } = seed({ disabledDirs: ["web"] });
    const i = io();
    expect(await run(["bundle", "enable", "web", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(manifestBundles(fs)).toContain("web");
    expect(fs.read(`${PROJ}/AGENTS.md`)).toContain("web"); // front-door re-rendered to include it
  });

  it("AC#3 — re-enabling a previously-authored bundle materialises NO duplicate tasks (no-op)", async () => {
    const { fs, backlog } = seed({ disabledDirs: ["web"] });
    expect(await run(["bundle", "enable", "web", "-C", PROJ], deps(fs, backlog), io())).toBe(0);
    const countAfterFirst = backlog.listTasks(AUTHORING).length;
    // disable then re-enable: the 2nd enable de-dupes by title (the harness ⑤ skips existing titles).
    expect(await run(["bundle", "disable", "web", "-C", PROJ], deps(fs, backlog), io())).toBe(0);
    const i = io();
    expect(await run(["bundle", "enable", "web", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(backlog.listTasks(AUTHORING).length).toBe(countAfterFirst); // no new tasks
    expect(i.out.text).not.toContain("materialised:"); // nothing materialised on re-enable
  });

  it("AC#2 — the advisor is scaffolded on enable; --no-advisor skips it; an existing advisor is not overwritten", async () => {
    // default: scaffolds
    {
      const { fs, backlog } = seed({ disabledDirs: ["web"] });
      expect(await run(["bundle", "enable", "web", "-C", PROJ], deps(fs, backlog), io())).toBe(0);
      expect(fs.exists(`${PROJ}/installer-skills/web-advisor/SKILL.md`)).toBe(true);
    }
    // --no-advisor: skips
    {
      const { fs, backlog } = seed({ disabledDirs: ["web"] });
      expect(
        await run(["bundle", "enable", "web", "--no-advisor", "-C", PROJ], deps(fs, backlog), io()),
      ).toBe(0);
      expect(fs.exists(`${PROJ}/installer-skills/web-advisor/SKILL.md`)).toBe(false);
    }
    // existing advisor: not overwritten
    {
      const { fs, backlog } = seed({ disabledDirs: ["web"] });
      fs.write(`${PROJ}/installer-skills/web-advisor/SKILL.md`, "AUTHORED CONTENT — keep me\n");
      expect(await run(["bundle", "enable", "web", "-C", PROJ], deps(fs, backlog), io())).toBe(0);
      expect(fs.read(`${PROJ}/installer-skills/web-advisor/SKILL.md`)).toBe(
        "AUTHORED CONTENT — keep me\n",
      );
    }
  });

  it("AC#4 — enabling an already-enabled id fails (exit 1), manifest unchanged", async () => {
    const { fs, backlog } = seed({ enabled: ["web"] });
    const before = fs.read(`${PROJ}/manifest.yml`);
    const i = io();
    expect(await run(["bundle", "enable", "web", "-C", PROJ], deps(fs, backlog), i)).toBe(1);
    expect(i.err.text).toMatch(/already enabled/i);
    expect(fs.read(`${PROJ}/manifest.yml`)).toBe(before);
  });

  it("AC#4 — enabling a non-existent directory fails (exit 1) naming the dir, manifest unchanged", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/manifest.yml`);
    const i = io();
    expect(await run(["bundle", "enable", "ghost", "-C", PROJ], deps(fs, backlog), i)).toBe(1);
    expect(i.err.text).toMatch(/does not exist/i);
    expect(fs.read(`${PROJ}/manifest.yml`)).toBe(before);
  });

  it("AC#5 — outside any project it exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed({ disabledDirs: ["web"] });
    const i = io();
    expect(await run(["bundle", "enable", "web"], deps(fs, backlog, "/nowhere"), i)).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#5 — the id positional completes from disabled-but-present bundle dirs (not enabled, not bundle-template)", async () => {
    const { fs, backlog } = seed({ enabled: ["web"], disabledDirs: ["doc"] });
    // also stage a bundle-template dir which must be excluded:
    fs.makeDirectories(`${PROJ}/bundles/bundle-template`);
    const out = complete(fs, backlog, ["bundle", "enable", ""]);
    expect(out).toContain("doc"); // disabled-but-present
    expect(out).not.toContain("web"); // enabled
    expect(out).not.toContain("bundle-template"); // the scaffold template dir
  });

  it("AC#6 — help is substantive (description, usage, the id positional, --no-advisor, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    await run(["bundle", "enable", "--help"], deps(fs, backlog), i);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<id>");
    expect(help).toContain("--no-advisor");
    expect(help).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle disable (task-52)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle disable (task-52)", () => {
  it("AC#1 — removes the id from manifest.bundles while the directory stays on disk", async () => {
    const { fs, backlog } = seed({ enabled: ["web"] });
    expect(await run(["bundle", "disable", "web", "-C", PROJ], deps(fs, backlog), io())).toBe(0);
    expect(manifestBundles(fs)).not.toContain("web");
    expect(fs.exists(`${PROJ}/bundles/web/bundle.yml`)).toBe(true); // dir untouched
  });

  it("AC#2 — the front-door is re-rendered so the bundle drops out of the menu", async () => {
    const { fs, backlog } = seed({ enabled: ["web", "doc"] });
    // render the front-door first (it lists web + doc) via a no-op-ish disable of doc, then disable web:
    expect(await run(["bundle", "disable", "web", "-C", PROJ], deps(fs, backlog), io())).toBe(0);
    const frontDoor = fs.read(`${PROJ}/AGENTS.md`);
    expect(frontDoor).not.toContain("web bundle"); // web's menu entry is gone
    expect(frontDoor).toContain("doc"); // doc (still enabled) remains
  });

  it("AC#3 — disabling an id not in the manifest fails with a not-found error (exit 1), manifest unchanged", async () => {
    const { fs, backlog } = seed({ enabled: ["web"] });
    const before = fs.read(`${PROJ}/manifest.yml`);
    const i = io();
    expect(await run(["bundle", "disable", "ghost", "-C", PROJ], deps(fs, backlog), i)).toBe(1);
    expect(i.err.text).toMatch(/not enabled/i);
    expect(fs.read(`${PROJ}/manifest.yml`)).toBe(before);
  });

  it("AC#4 — outside any project it exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed({ enabled: ["web"] });
    const i = io();
    expect(await run(["bundle", "disable", "web"], deps(fs, backlog, "/nowhere"), i)).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#4 — the id positional completes from the currently-enabled bundles", async () => {
    const { fs, backlog } = seed({ enabled: ["web", "doc"] });
    const out = complete(fs, backlog, ["bundle", "disable", ""]);
    expect(out).toContain("web");
    expect(out).toContain("doc");
  });

  it("AC#5 — help is substantive (description, usage, the id positional, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    await run(["bundle", "disable", "--help"], deps(fs, backlog), i);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<id>");
    expect(help).toMatch(/Example/i);
  });
});
