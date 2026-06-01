import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { type CliDeps, run } from "../../../src/cli.js";
import type { SkillRef } from "../../../src/core/model/index.js";
import { parseManifest } from "../../../src/core/services/schema/index.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";
import { parseYaml } from "../../../src/util/yaml.js";

/**
 * Acceptance tests for the PROJECT-scoped INSTALLER-SKILLS family (Family F) — `project installer-skills add` /
 * `list` / `remove` (tasks 45/46/47), the project-scope TWIN of the bundle installer-skills family (P). It reuses
 * the shared skill machinery (the stub renderer + frontmatter validator + the scan-list spec), but operates at the
 * project ROOT against a NEW manifest-level `installerSkills` registry, is wired as a `project` subcommand, and
 * adds two project-only rules proven here:
 *   1. AC45#4 — a `<name>` ending in `-advisor` OR equal to `<project>-installer` is REFUSED as reserved (a
 *      UsageError, exit 2).
 *   2. AC46#1 — `list` SCANS the root `installer-skills/` but EXCLUDES the main `<project>-installer` + the
 *      `<id>-advisor` skills (and shows author-placed helpers without `add` — scan, not registry).
 * Driven through `run()` in-process over in-memory ports, against a project at `/proj` named `demo` (so the main
 * installer is `demo-installer`). The manifest carries a leading COMMENT + NO `installerSkills` key (old shape).
 * Mirrors `bundle-installer-skills-commands.test.ts`.
 */

const PROJ = "/proj";
const BUILTIN = "/builtin-templates";
const AUTHORING = `${PROJ}/.authoring-backlog`;
const INSTALLER_SKILLS = "installer-skills";

/** A manifest.yml with a leading comment + a known key order (NO installerSkills key — the old shape). */
function manifestYml(): string {
  return [
    "# demo project — install-time helpers are edited via `wpm project installer-skills …`",
    "project:",
    "  name: demo",
    "  version: 1.0.0",
    "targets:",
    "  - claude-code",
    "bundles: []",
    "",
  ].join("\n");
}

/** A valid SKILL.md (frontmatter with name + description). */
function skillMd(name: string): string {
  return `---\nname: ${name}\ndescription: Detect ${name} during install for the agent.\n---\n\n# ${name}\nbody\n`;
}

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
 * Seed a project at /proj (name `demo`, target `claude-code`, no bundles). `opts.placedHelpers` writes a valid
 * SKILL.md at the CONVENTIONAL root path for each named helper (`installer-skills/<name>/SKILL.md`).
 * `opts.placedAt` writes a SKILL.md at an arbitrary project-relative path (for `--path` cases). `opts.manifestYml`
 * overrides the manifest.
 */
function seed(
  opts: { placedHelpers?: string[]; placedAt?: Record<string, string>; manifestYml?: string } = {},
): { fs: MemoryFileSystem; backlog: FakeBacklog } {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();

  fs.write(`${PROJ}/manifest.yml`, opts.manifestYml ?? manifestYml());
  for (const name of opts.placedHelpers ?? []) {
    fs.write(`${PROJ}/${INSTALLER_SKILLS}/${name}/SKILL.md`, skillMd(name));
  }
  for (const [rel, content] of Object.entries(opts.placedAt ?? {})) {
    fs.write(`${PROJ}/${rel}`, content);
  }
  backlog.init(AUTHORING, { taskPrefix: "authoring" });

  // Project template snippets so ④ RERENDER resolves AND the SCAFFOLD branch finds the installer-skill snippet.
  fs.write(`${BUILTIN}/project/minimal/template.yml`, "name: minimal\nscope: project\n");
  fs.write(`${BUILTIN}/project/minimal/snippets/AGENTS.md`, "# {{project-name}}\n\n{{bundles}}\n");
  fs.write(
    `${BUILTIN}/project/minimal/snippets/installer-skills/{{project-name}}-installer/SKILL.md`,
    "---\nname: {{project-name}}-installer\n---\nInstall {{project-name}}.\n",
  );
  fs.write(
    `${BUILTIN}/project/minimal/snippets/installer-skill.SKILL.md.tmpl`,
    '---\nname: {{skill-name}}\ndescription: "TODO (install-time helper trigger): describe when this helper applies during install."\n---\n\n# {{skill-name}}\n\n> Stub — fill this in.\n',
  );
  return { fs, backlog };
}

function deps(fs: MemoryFileSystem, backlog: FakeBacklog, cwd = "/elsewhere"): CliDeps {
  return {
    fs,
    backlog,
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new FakeEnvironment({ cwd }),
    builtinTemplatesRoot: BUILTIN,
  };
}

/** The parsed `installerSkills` registry of the project's manifest.yml on disk. */
function installerSkillsOf(fs: MemoryFileSystem): readonly SkillRef[] {
  const parsed = parseManifest(parseYaml(fs.read(`${PROJ}/manifest.yml`)));
  if (!parsed.ok) throw new Error(`manifest did not parse: ${parsed.problem.message}`);
  return parsed.value.installerSkills;
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// project installer-skills add — the 3-way scaffold-or-attach + the reserved-name refusal (task-45)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("project installer-skills add — ATTACH branch (task-45 #1)", () => {
  it("attaches a SKILL.md present at the conventional root path: validates frontmatter, registers {name, path}, leaves the file, NO task", async () => {
    const { fs, backlog } = seed({ placedHelpers: ["detect"] });
    const before = fs.read(`${PROJ}/${INSTALLER_SKILLS}/detect/SKILL.md`);
    const i = io();
    expect(
      await run(["project", "installer-skills", "add", "detect", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(installerSkillsOf(fs)).toEqual([
      { name: "detect", path: `${INSTALLER_SKILLS}/detect/SKILL.md` },
    ]);
    expect(fs.read(`${PROJ}/${INSTALLER_SKILLS}/detect/SKILL.md`)).toBe(before); // structure-not-content
    expect(i.out.text).toContain("attached"); // 45#6: prints what it did
    expect(i.out.text).not.toContain("materialised"); // attach queues no writing
    expect(fs.read(`${PROJ}/manifest.yml`)).toContain("# demo project —"); // comment preserved
  });

  it("attaches via --path: registers the explicit (relocated) path", async () => {
    const { fs, backlog } = seed({ placedAt: { "elsewhere/SKILL.md": skillMd("d2") } });
    const i = io();
    expect(
      await run(
        ["project", "installer-skills", "add", "d2", "--path", "elsewhere/SKILL.md", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(0);
    expect(installerSkillsOf(fs)).toEqual([{ name: "d2", path: "elsewhere/SKILL.md" }]);
  });

  it("rejects an attach whose SKILL.md has invalid frontmatter (no description): exit 1, nothing registered", async () => {
    const { fs, backlog } = seed({
      placedAt: { [`${INSTALLER_SKILLS}/bad/SKILL.md`]: "---\nname: bad\n---\nno description\n" },
    });
    const before = fs.read(`${PROJ}/manifest.yml`);
    const i = io();
    expect(
      await run(["project", "installer-skills", "add", "bad", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(1);
    expect(i.err.text).toContain("description");
    expect(fs.read(`${PROJ}/manifest.yml`)).toBe(before); // byte-identical
  });
});

describe("project installer-skills add — SCAFFOLD branch (task-45 #2)", () => {
  it("scaffolds a stub (name + placeholder description, no invented prose), registers it, and materialises the writing task (NO bundle id)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["project", "installer-skills", "add", "fresh", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);

    const stubPath = `${PROJ}/${INSTALLER_SKILLS}/fresh/SKILL.md`;
    expect(fs.exists(stubPath)).toBe(true);
    const stub = fs.read(stubPath);
    expect(stub).toContain("name: fresh");
    expect(stub).toContain("TODO (install-time helper trigger)");
    expect(stub).toContain("Stub");

    expect(installerSkillsOf(fs)).toEqual([
      { name: "fresh", path: `${INSTALLER_SKILLS}/fresh/SKILL.md` },
    ]);
    expect(i.out.text).toContain("scaffolded");
    expect(i.out.text).toContain("materialised");
    // the project-scoped task has NO bundle id (contrast P's "… in <id>"):
    expect(backlog.listTasks(AUTHORING).map((t) => t.title)).toContain(
      "Write content for install-time skill fresh",
    );
  });
});

describe("project installer-skills add — ERROR + reserved-name refusal + standard reqs (task-45 #3/#4/#5/#6)", () => {
  it("AC#3 — --path given but nothing there: typed error (exit 1), nothing registered, no stub written", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/manifest.yml`);
    const i = io();
    expect(
      await run(
        [
          "project",
          "installer-skills",
          "add",
          "ghost",
          "--path",
          `${INSTALLER_SKILLS}/ghost/SKILL.md`,
          "-C",
          PROJ,
        ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(1);
    expect(i.err.text).toContain(`${INSTALLER_SKILLS}/ghost/SKILL.md`);
    expect(i.err.text).toContain("omit --path");
    expect(fs.read(`${PROJ}/manifest.yml`)).toBe(before);
    expect(fs.exists(`${PROJ}/${INSTALLER_SKILLS}/ghost/SKILL.md`)).toBe(false);
  });

  it("AC#4 — a name ending in -advisor is REFUSED as reserved (exit 2); nothing registered/scaffolded", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/manifest.yml`);
    const i = io();
    expect(
      await run(
        ["project", "installer-skills", "add", "web-advisor", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(2); // UsageError → exit 2 (distinct from the exit-1 missing-resource errors)
    expect(i.err.text).toContain("reserved");
    expect(i.err.text).toContain("advisor");
    expect(fs.read(`${PROJ}/manifest.yml`)).toBe(before); // nothing registered
    expect(fs.exists(`${PROJ}/${INSTALLER_SKILLS}/web-advisor/SKILL.md`)).toBe(false); // no stub
  });

  it("AC#4 — a name matching the main <project>-installer (demo-installer) is REFUSED as reserved (exit 2)", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/manifest.yml`);
    const i = io();
    expect(
      await run(
        ["project", "installer-skills", "add", "demo-installer", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(2);
    expect(i.err.text).toContain("reserved");
    expect(i.err.text).toContain("main installer");
    expect(fs.read(`${PROJ}/manifest.yml`)).toBe(before);
    expect(fs.exists(`${PROJ}/${INSTALLER_SKILLS}/demo-installer/SKILL.md`)).toBe(false);
  });

  it("AC#5 — outside any project, exits 1 naming manifest.yml and suggesting init", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["project", "installer-skills", "add", "detect"], deps(fs, backlog, "/nowhere"), i),
    ).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
    expect(i.err.text).toContain("init");
  });

  it("AC#5 — add completes the name from the on-disk helper folders (attachable, minus reserved)", async () => {
    // place two real helpers + a reserved advisor folder; completion offers only the non-reserved helpers.
    const { fs, backlog } = seed({ placedHelpers: ["alpha", "beta", "web-advisor"] });
    const i = io();
    expect(
      await run(
        ["__complete", "project", "installer-skills", "add", ""],
        deps(fs, backlog, PROJ),
        i,
      ),
    ).toBe(0);
    const suggestions = i.out.text.split("\n").filter(Boolean).sort();
    expect(suggestions).toEqual(["alpha", "beta"]); // web-advisor excluded (reserved)
  });

  it("AC#6 — help is substantive (usage, the name positional, --path, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "installer-skills", "add", "--help"], deps(fs, backlog), i)).toBe(
      0,
    );
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<name>");
    expect(help).toContain("--path");
    expect(help).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// project installer-skills list (task-46 — a READ, directory SCAN with EXCLUSION)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("project installer-skills list (task-46 — SCAN + EXCLUSION)", () => {
  it("AC#1 — SCANS root installer-skills/, EXCLUDING the main demo-installer + the *-advisor skills; shows author-placed helpers", async () => {
    // Seed the root installer-skills/ with the main installer, an advisor, and two real helpers (placed WITHOUT add).
    const { fs, backlog } = seed({
      placedHelpers: ["demo-installer", "web-advisor", "helper-one", "helper-two"],
    });
    const i = io();
    expect(
      await run(["project", "installer-skills", "list", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    // only the real helpers, sorted — the main installer + the advisor are excluded:
    expect(i.out.text).toBe("helper-one\nhelper-two\n");
  });

  it("AC#1 — a directory with a non-helper entry (no SKILL.md) is ignored", async () => {
    const { fs, backlog } = seed({ placedHelpers: ["real"] });
    fs.write(`${PROJ}/${INSTALLER_SKILLS}/not-a-helper/notes.md`, "stray");
    const i = io();
    expect(
      await run(["project", "installer-skills", "list", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(i.out.text).toBe("real\n");
  });

  it("AC#1 — only the main installer + an advisor present ⇒ (no installer skills)", async () => {
    const { fs, backlog } = seed({ placedHelpers: ["demo-installer", "web-advisor"] });
    const i = io();
    expect(
      await run(["project", "installer-skills", "list", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(i.out.text).toBe("(no installer skills)\n");
  });

  it("AC#2 — read-only: manifest unchanged after list", async () => {
    const { fs, backlog } = seed({ placedHelpers: ["helper-one"] });
    const before = fs.read(`${PROJ}/manifest.yml`);
    expect(
      await run(["project", "installer-skills", "list", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    expect(fs.read(`${PROJ}/manifest.yml`)).toBe(before);
  });

  it("AC#3 — outside any project, exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["project", "installer-skills", "list"], deps(fs, backlog, "/nowhere"), i),
    ).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#4 — help is substantive (usage, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "installer-skills", "list", "--help"], deps(fs, backlog), i)).toBe(
      0,
    );
    expect(i.out.text).toMatch(/Usage:/);
    expect(i.out.text).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// project installer-skills remove (task-47 — a MUTATION; deregister-not-delete)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("project installer-skills remove (task-47)", () => {
  const M_WITH_REFS = [
    "# demo project comment",
    "project:",
    "  name: demo",
    "  version: 1.0.0",
    "targets:",
    "  - claude-code",
    "bundles: []",
    "installerSkills:",
    "  - name: one",
    "    path: installer-skills/one/SKILL.md",
    "  - name: two",
    "    path: installer-skills/two/SKILL.md",
    "",
  ].join("\n");

  it("AC#1 — deregisters the entry AND prints it was left at installer-skills/<name>/; exit 0", async () => {
    const { fs, backlog } = seed({
      manifestYml: M_WITH_REFS,
      placedAt: { [`${INSTALLER_SKILLS}/one/SKILL.md`]: skillMd("one") },
    });
    const i = io();
    expect(
      await run(["project", "installer-skills", "remove", "one", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(installerSkillsOf(fs)).toEqual([
      { name: "two", path: `${INSTALLER_SKILLS}/two/SKILL.md` },
    ]);
    expect(i.out.text).toContain("left at installer-skills/one/"); // doc-10:180 message
  });

  it("AC#2 — the SKILL.md is LEFT on disk (deregister, not delete)", async () => {
    const { fs, backlog } = seed({
      manifestYml: M_WITH_REFS,
      placedAt: { [`${INSTALLER_SKILLS}/one/SKILL.md`]: skillMd("one") },
    });
    const contentBefore = fs.read(`${PROJ}/${INSTALLER_SKILLS}/one/SKILL.md`);
    expect(
      await run(
        ["project", "installer-skills", "remove", "one", "-C", PROJ],
        deps(fs, backlog),
        io(),
      ),
    ).toBe(0);
    expect(fs.exists(`${PROJ}/${INSTALLER_SKILLS}/one/SKILL.md`)).toBe(true);
    expect(fs.read(`${PROJ}/${INSTALLER_SKILLS}/one/SKILL.md`)).toBe(contentBefore);
  });

  it("AC#3 — deregistering a name NOT registered fails with NotFound (exit 1), nothing changed", async () => {
    const { fs, backlog } = seed({ manifestYml: M_WITH_REFS });
    const before = fs.read(`${PROJ}/manifest.yml`);
    const i = io();
    expect(
      await run(
        ["project", "installer-skills", "remove", "not-there", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(1);
    expect(i.err.text).toContain("not-there");
    expect(fs.read(`${PROJ}/manifest.yml`)).toBe(before);
  });

  it("AC#4 — outside any project, exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed({ manifestYml: M_WITH_REFS });
    const i = io();
    expect(
      await run(["project", "installer-skills", "remove", "one"], deps(fs, backlog, "/nowhere"), i),
    ).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#5 — the name completes from the REGISTERED project helpers", async () => {
    const { fs, backlog } = seed({ manifestYml: M_WITH_REFS });
    const i = io();
    expect(
      await run(
        ["__complete", "project", "installer-skills", "remove", ""],
        deps(fs, backlog, PROJ),
        i,
      ),
    ).toBe(0);
    const suggestions = i.out.text.split("\n").filter(Boolean).sort();
    expect(suggestions).toEqual(["one", "two"]);
  });

  it("AC#5 — help is substantive (usage, the name positional, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["project", "installer-skills", "remove", "--help"], deps(fs, backlog), i),
    ).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<name>");
    expect(help).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// end-to-end author workflow — scan-vs-registry divergence (same as P)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("project installer-skills — end-to-end author workflow (scan-vs-registry)", () => {
  it("scaffold → list shows it → remove → list STILL shows it (stub left on disk; scan ≠ registry); task materialised; comment survives", async () => {
    const { fs, backlog } = seed();
    const d = (): CliDeps => deps(fs, backlog);

    expect(await run(["project", "installer-skills", "add", "fresh", "-C", PROJ], d(), io())).toBe(
      0,
    );
    let i = io();
    expect(await run(["project", "installer-skills", "list", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text).toBe("fresh\n");

    expect(
      await run(["project", "installer-skills", "remove", "fresh", "-C", PROJ], d(), io()),
    ).toBe(0);
    expect(installerSkillsOf(fs)).toEqual([]); // registry empty after remove

    // the directory SCAN still shows it (the SKILL.md is on disk) — the deliberate scan-vs-registry divergence:
    i = io();
    expect(await run(["project", "installer-skills", "list", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text).toBe("fresh\n");
    expect(fs.exists(`${PROJ}/${INSTALLER_SKILLS}/fresh/SKILL.md`)).toBe(true);

    expect(backlog.listTasks(AUTHORING).map((t) => t.title)).toContain(
      "Write content for install-time skill fresh",
    );
    expect(fs.read(`${PROJ}/manifest.yml`)).toContain("# demo project —");
  });

  it("the installer-skills group help lists the add/list/remove subcommands", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "installer-skills", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("add");
    expect(help).toContain("list");
    expect(help).toContain("remove");
  });
});
