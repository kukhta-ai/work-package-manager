import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { type CliDeps, run } from "../../../src/cli.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";

/**
 * Acceptance tests for the read-only `project show` / `project root` / `project validate` family (tasks
 * 37/49/48), driven through `run()` in-process over in-memory ports. The fixture is a realistic project at
 * `/proj` (manifest with name/version/description + two targets + two enabled bundles, each with its own
 * `bundle.yml`, plus `installer-skills/` and an `.authoring-backlog` root). Reads change nothing, so the harness
 * mainly asserts stdout + the exit code + that the manifest on disk is byte-unchanged. Mirrors
 * `targets-commands.test.ts`. `project validate` backs the task-20 `validateProject` service.
 */

const PROJ = "/proj";
const BUILTIN = "/builtin-templates";

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

/** Write a bundle.yml under `bundles/<id>/` with the given version/summary/requires. */
function writeBundle(
  fs: MemoryFileSystem,
  id: string,
  version: string,
  summary: string,
  requires: Record<string, string> = {},
): void {
  const requiresBlock =
    Object.keys(requires).length === 0
      ? "requires: {}"
      : ["requires:", ...Object.entries(requires).map(([k, v]) => `  ${k}: ${v}`)].join("\n");
  fs.write(
    `${PROJ}/wip/bundles/${id}/bundle.yml`,
    `id: ${id}\nversion: ${version}\nsummary: ${summary}\nconfirmation: safe\n${requiresBlock}\n`,
  );
}

/**
 * Seed a coherent project at /proj: name/version/description, two targets, two enabled bundles each with its own
 * bundle.yml (distinct versions + summaries), the root alias target dir, an authoring backlog, and the minimal
 * project-template snippets (harmless for reads). Returns the ports.
 */
function seed(): { fs: MemoryFileSystem; backlog: FakeBacklog } {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();

  fs.write(
    `${PROJ}/wip/manifest.yml`,
    [
      "project:",
      "  name: demo",
      "  version: 1.2.0",
      "  description: a demo installer project",
      "targets:",
      "  - claude-code",
      "  - codex",
      "bundles:",
      "  - web",
      "  - docs",
      "",
    ].join("\n"),
  );
  writeBundle(fs, "web", "0.5.0", "the web onboarding bundle");
  writeBundle(fs, "docs", "1.0.0", "the docs bundle", { web: "^0.5.0" });
  fs.makeDirectories(`${PROJ}/wip/installer-skills`);
  backlog.init(`${PROJ}/.authoring-backlog`, { taskPrefix: "authoring" });

  fs.write(`${BUILTIN}/project/minimal/template.yml`, "name: minimal\nscope: project\n");
  fs.write(`${BUILTIN}/project/minimal/snippets/AGENTS.md`, "# {{project-name}}\n\n{{bundles}}\n");

  return { fs, backlog };
}

/** CliDeps with cwd outside /proj (so `-C /proj` selects the project, exercising the override). */
function deps(fs: MemoryFileSystem, backlog: FakeBacklog, cwd = "/elsewhere"): CliDeps {
  return {
    fs,
    backlog,
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new FakeEnvironment({ cwd }),
    builtinTemplatesRoot: BUILTIN,
  };
}

describe("project show (task-37 — a READ)", () => {
  it("AC#1 — prints name, version, description, root, targets, and each enabled bundle with its bundle.yml version", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "show", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    const out = i.out.text;
    expect(out).toContain("demo"); // name
    expect(out).toContain("1.2.0"); // version
    expect(out).toContain("a demo installer project"); // description
    expect(out).toContain(PROJ); // resolved root path
    expect(out).toContain("claude-code"); // target
    expect(out).toContain("codex"); // target
    // each enabled bundle WITH the version read from its bundle.yml:
    expect(out).toContain("web 0.5.0");
    expect(out).toContain("docs 1.0.0");
    expect(out).toContain("the web onboarding bundle"); // the summary too
  });

  it("AC#2 — --json emits the same orientation as valid machine-readable JSON (incl bundle versions)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "show", "--json", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    const parsed = JSON.parse(i.out.text) as {
      name: string;
      version: string;
      description?: string;
      root: string;
      targets: string[];
      bundles: { id: string; version: string; summary: string }[];
    };
    expect(parsed.name).toBe("demo");
    expect(parsed.version).toBe("1.2.0");
    expect(parsed.description).toBe("a demo installer project");
    expect(parsed.root).toBe(`${PROJ}/wip`); // the DELIVERABLE root (doc 10: project show/root print wip/)
    expect(parsed.targets).toEqual(["claude-code", "codex"]);
    // the bundle versions are read from each bundle.yml and present in the JSON:
    expect(parsed.bundles).toEqual([
      { id: "web", version: "0.5.0", summary: "the web onboarding bundle" },
      { id: "docs", version: "1.0.0", summary: "the docs bundle" },
    ]);
  });

  it("AC#3 — reads only, no change on disk, exit 0", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/wip/manifest.yml`);
    const i = io();
    expect(await run(["project", "show", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(fs.read(`${PROJ}/wip/manifest.yml`)).toBe(before);
  });

  it("AC#4 — outside any project, exits 1 naming manifest.yml + init; a -C path is honoured", async () => {
    const { fs, backlog } = seed();
    // no -C, cwd has no manifest on its chain → exit 1
    const noProj = io();
    expect(await run(["project", "show"], deps(fs, backlog), noProj)).toBe(1);
    expect(noProj.err.text).toContain("manifest.yml");
    expect(noProj.err.text).toContain("init");
    // -C honoured: same fixture resolves and succeeds
    const withC = io();
    expect(await run(["project", "show", "-C", PROJ], deps(fs, backlog), withC)).toBe(0);
  });

  it("AC#5 — help is substantive (usage, the --json flag, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "show", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("--json");
    expect(help).toContain("Example:");
  });
});

describe("project show — text and --json render the SAME orientation (one projection, two forms)", () => {
  it("every field shown in text appears in the JSON (they cannot diverge)", async () => {
    const { fs, backlog } = seed();
    const textIo = io();
    const jsonIo = io();
    expect(await run(["project", "show", "-C", PROJ], deps(fs, backlog), textIo)).toBe(0);
    expect(await run(["project", "show", "--json", "-C", PROJ], deps(fs, backlog), jsonIo)).toBe(0);

    const json = JSON.parse(jsonIo.out.text) as {
      name: string;
      version: string;
      description?: string;
      root: string;
      targets: string[];
      bundles: { id: string; version: string }[];
    };
    const text = textIo.out.text;
    // The text rendering contains every datum the JSON carries:
    expect(text).toContain(json.name);
    expect(text).toContain(json.version);
    expect(text).toContain(json.description ?? "");
    expect(text).toContain(json.root);
    for (const t of json.targets) expect(text).toContain(t);
    for (const b of json.bundles) expect(text).toContain(`${b.id} ${b.version}`);
  });
});

describe("project root (task-49 — a READ)", () => {
  it("AC#1/#2 — prints the resolved root on a single line with NO padding, read-only, exit 0", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/wip/manifest.yml`);
    const i = io();
    expect(await run(["project", "root", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    // exactly the DELIVERABLE path (the workspace's wip/) + a single trailing newline — composable in $(...):
    // no decoration, no padding (doc 10: `project root` prints the wip/ path).
    expect(i.out.text).toBe(`${PROJ}/wip\n`);
    expect(fs.read(`${PROJ}/wip/manifest.yml`)).toBe(before); // read-only
  });

  it("AC#1 — walks up from cwd INSIDE the workspace (no -C) and prints the deliverable root", async () => {
    const { fs, backlog } = seed();
    // cwd is a nested dir inside the deliverable; resolveContext walks up to the workspace /proj.
    const i = io();
    expect(await run(["project", "root"], deps(fs, backlog, `${PROJ}/wip/bundles/web`), i)).toBe(0);
    expect(i.out.text).toBe(`${PROJ}/wip\n`);
  });

  it("AC#3 — outside any project, exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "root"], deps(fs, backlog), i)).toBe(1); // cwd /elsewhere, no -C
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#4 — help is substantive (usage, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "root", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("Example:");
  });
});

describe("project validate (task-48 — a READ that reports)", () => {
  it("AC#1/#4 — a coherent project reports a pass and exits 0, changing nothing", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/wip/manifest.yml`);
    const i = io();
    expect(await run(["project", "validate", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text.toLowerCase()).toContain("coherent");
    expect(fs.read(`${PROJ}/wip/manifest.yml`)).toBe(before); // AC#3: no side effects
  });

  it("AC#2/#4 — an incoherent project reports ALL findings in one pass and exits 1", async () => {
    const { fs, backlog } = seed();
    // Make it incoherent in THREE distinct ways at once:
    //  (a) empty targets, (b) web requires a missing bundle 'core', (c) an orphan bundles/stray dir.
    fs.write(
      `${PROJ}/wip/manifest.yml`,
      [
        "project:",
        "  name: demo",
        "  version: 1.2.0",
        "targets: []",
        "bundles:",
        "  - web",
        "  - docs",
        "",
      ].join("\n"),
    );
    writeBundle(fs, "web", "0.5.0", "web", { core: "^2.0.0" }); // requires missing 'core'
    fs.write(`${PROJ}/wip/bundles/stray/note.txt`, "orphan dir, not a bundle"); // orphan directory

    const i = io();
    const code = await run(["project", "validate", "-C", PROJ], deps(fs, backlog), i);
    expect(code).toBe(1); // ANY finding → exit 1

    const out = i.out.text;
    // all three distinct findings are reported in ONE pass, each naming its location:
    expect(out).toContain('bundle "web" requires "core"'); // (b) missing dependency
    expect(out).toContain("no target agents declared"); // (a) empty targets
    expect(out).toContain('bundle directory "stray"'); // (c) orphan dir
    // the three are separate lines:
    expect(out.split("\n").filter((l) => l.startsWith("- ")).length).toBeGreaterThanOrEqual(3);
  });

  it("AC#3 — changes nothing even when it finds problems", async () => {
    const { fs, backlog } = seed();
    // a single, simple incoherence (orphan dir); assert the manifest + bundle.yml are untouched after validate.
    fs.write(`${PROJ}/wip/bundles/stray/note.txt`, "orphan");
    const manifestBefore = fs.read(`${PROJ}/wip/manifest.yml`);
    const webBefore = fs.read(`${PROJ}/wip/bundles/web/bundle.yml`);

    const code = await run(["project", "validate", "-C", PROJ], deps(fs, backlog), io());
    expect(code).toBe(1);
    expect(fs.read(`${PROJ}/wip/manifest.yml`)).toBe(manifestBefore);
    expect(fs.read(`${PROJ}/wip/bundles/web/bundle.yml`)).toBe(webBefore);
  });

  it("AC#4 — the error message is a clean domain error (no stack frames)", async () => {
    const { fs, backlog } = seed();
    fs.write(`${PROJ}/wip/bundles/stray/note.txt`, "orphan");
    const i = io();
    expect(await run(["project", "validate", "-C", PROJ], deps(fs, backlog), i)).toBe(1);
    expect(i.err.text).toMatch(/^error: /);
    expect(i.err.text).not.toContain("at "); // no stack for a domain error
  });

  it("AC#5 — outside any project, exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "validate"], deps(fs, backlog), i)).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#6 — help is substantive (usage, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "validate", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("Example:");
  });

  it("validate handles a project with no bundles/ directory (no orphans) — coherent, exit 0", async () => {
    // A minimal project: a target, no bundles, and no bundles/ directory at all (an init'd project) — the
    // `bundleDirectoryNames` helper returns [] so there are no orphans to flag.
    const backlog = new FakeBacklog();
    const fs2 = new MemoryFileSystem();
    fs2.write(
      `${PROJ}/wip/manifest.yml`,
      [
        "project:",
        "  name: solo",
        "  version: 0.1.0",
        "targets:",
        "  - claude-code",
        "bundles: []",
        "",
      ].join("\n"),
    );
    const i = io();
    expect(await run(["project", "validate", "-C", PROJ], deps(fs2, backlog), i)).toBe(0);
    expect(i.out.text.toLowerCase()).toContain("coherent");
  });
});
