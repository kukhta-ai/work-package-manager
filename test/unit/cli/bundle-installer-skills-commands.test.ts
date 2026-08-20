import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { buildProgram, type CliDeps, COMPLETION_SPECS, run } from "../../../src/cli.js";
import { completeArgv } from "../../../src/completion/complete.js";
import { defaultRegistry } from "../../../src/completion/registry.js";
import type { SkillRef } from "../../../src/core/model/index.js";
import { parseBundleManifest } from "../../../src/core/services/schema/index.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";
import { parseYaml } from "../../../src/util/yaml.js";

/**
 * Acceptance tests for the per-bundle INSTALLER-SKILLS family (Family P) — `bundle <id> installer-skills add` /
 * `list` / `remove` (tasks 77/78/79), the installer-skills TWIN of the payload-skills family (O). It rides the
 * SAME generic descriptor-driven skill-reference core (`BUNDLE_INSTALLER_SKILLS_DESCRIPTOR`) for `add`/`remove`,
 * with TWO deliberate differences from O proven here:
 *   1. `list` is a directory SCAN (doc-10:174), NOT a registry read — so an author-placed helper shows even
 *      without `add`, and a `remove`-deregistered-but-left helper STILL shows (the scan-vs-registry divergence).
 *   2. `add` ensures the bundle's installer-skills scope aliases (AC77#4) — delivered by the ④ RERENDER beat
 *      (scopePlan already plans them), so an add on a target-bearing project creates `bundles/<id>/.claude/skills`.
 * Driven through `run()` in-process over in-memory ports, against a project at `/proj` (target `claude-code`) with
 * bundle `a` whose `bundle.yml` carries a leading COMMENT + a known key order (NO `installerSkills` key — the
 * old-bundle shape). Mirrors `bundle-skills-commands.test.ts`.
 */

const PROJ = "/proj";
const BUILTIN = "/builtin-templates";
const AUTHORING = `${PROJ}/.authoring-backlog`;
const INSTALLER_SKILLS = "installer-skills";

/** A bundle.yml with a leading comment + a known key order (NO installerSkills key — the old-bundle.yml shape). */
function bundleYmlFor(id: string): string {
  return [
    `# bundle ${id} — install-time helpers are edited via \`wpm bundle ${id} installer-skills …\``,
    `id: ${id}`,
    "version: 0.1.0",
    `summary: bundle ${id}`,
    "confirmation: safe",
    "requires: {}",
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
 * Seed a project at /proj (target `claude-code`) with bundle `a`. `opts.placedHelpers` writes a valid SKILL.md at
 * the CONVENTIONAL path for each named helper (`installer-skills/<name>/SKILL.md`). `opts.placedAt` writes a
 * SKILL.md (its content given) at an arbitrary bundle-relative path (for the `--path` cases). `opts.aYml`
 * overrides `a`'s bundle.yml. `opts.noTarget` seeds a manifest with no targets (for the alias-ensure edge).
 */
function seed(
  opts: {
    placedHelpers?: string[];
    placedAt?: Record<string, string>;
    aYml?: string;
    noTarget?: boolean;
  } = {},
): { fs: MemoryFileSystem; backlog: FakeBacklog } {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();

  fs.write(
    `${PROJ}/wip/manifest.yml`,
    opts.noTarget === true
      ? "project:\n  name: demo\n  version: 1.0.0\ntargets: []\nbundles:\n  - a\n"
      : "project:\n  name: demo\n  version: 1.0.0\ntargets:\n  - claude-code\nbundles:\n  - a\n",
  );
  fs.write(`${PROJ}/wip/bundles/a/bundle.yml`, opts.aYml ?? bundleYmlFor("a"));
  for (const name of opts.placedHelpers ?? []) {
    fs.write(`${PROJ}/wip/bundles/a/${INSTALLER_SKILLS}/${name}/SKILL.md`, skillMd(name));
  }
  for (const [rel, content] of Object.entries(opts.placedAt ?? {})) {
    fs.write(`${PROJ}/wip/bundles/a/${rel}`, content);
  }
  fs.makeDirectories(`${PROJ}/wip/installer-skills`);
  backlog.init(AUTHORING, { taskPrefix: "authoring" });

  // Project template snippets so ④ RERENDER resolves AND the SCAFFOLD branch finds the installer-skill snippet.
  fs.write(`${BUILTIN}/project/minimal/template.yml`, "name: minimal\nscope: project\n");
  fs.write(`${BUILTIN}/project/minimal/snippets/AGENTS.md`, "# {{project-name}}\n\n{{bundles}}\n");
  fs.write(
    `${BUILTIN}/project/minimal/snippets/installer-skills/{{project-name}}-installer/SKILL.md`,
    "---\nname: {{project-name}}-installer\n---\nInstall {{project-name}}.\n",
  );
  // The installer-skill snippet the SCAFFOLD branch renders (mirrors the real snippet: {{skill-name}} + a
  // placeholder install-time-helper description + a "Stub" marker — NO invented prose).
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

/** The parsed `installerSkills` registry of `<id>`'s bundle.yml on disk. */
function installerSkillsOf(fs: MemoryFileSystem, id: string): readonly SkillRef[] {
  const parsed = parseBundleManifest(parseYaml(fs.read(`${PROJ}/wip/bundles/${id}/bundle.yml`)));
  if (!parsed.ok) throw new Error(`bundle ${id} did not parse: ${parsed.problem.message}`);
  return parsed.value.installerSkills;
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> installer-skills add — the 3-way scaffold-or-attach (task-77)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> installer-skills add — ATTACH branch (task-77 #1)", () => {
  it("attaches a SKILL.md present at the conventional path: validates frontmatter, registers {name, path}, leaves the file, NO task", async () => {
    const { fs, backlog } = seed({ placedHelpers: ["detect"] });
    const before = fs.read(`${PROJ}/wip/bundles/a/${INSTALLER_SKILLS}/detect/SKILL.md`);
    const i = io();
    expect(
      await run(
        ["bundle", "a", "installer-skills", "add", "detect", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(0);
    expect(installerSkillsOf(fs, "a")).toEqual([
      { name: "detect", path: `${INSTALLER_SKILLS}/detect/SKILL.md` },
    ]);
    expect(fs.read(`${PROJ}/wip/bundles/a/${INSTALLER_SKILLS}/detect/SKILL.md`)).toBe(before); // structure-not-content
    expect(i.out.text).toContain("attached"); // 77#6: prints what it did
    expect(i.out.text).not.toContain("materialised"); // attach queues no writing
    // comment + key order preserved. The old bundle.yml had NO payload key; attaching an installer-skill writes
    // ONLY the new top-level `installerSkills` registry (the two registries are independent — registering an
    // installer-skill does NOT fabricate an empty `payload` block). So `installerSkills` is appended after the
    // existing keys, and `payload` is absent (nothing wrote it).
    const text = fs.read(`${PROJ}/wip/bundles/a/bundle.yml`);
    expect(text).toContain("# bundle a —");
    const keyOrder = text
      .split("\n")
      .map((l) => l.match(/^([a-z_]+):/i)?.[1])
      .filter((k): k is string => k !== undefined);
    expect(keyOrder).toEqual([
      "id",
      "version",
      "summary",
      "confirmation",
      "requires",
      "installerSkills",
    ]);
  });

  it("attaches via --path: registers the explicit (relocated) path", async () => {
    const { fs, backlog } = seed({ placedAt: { "custom/helper.md": skillMd("d2") } });
    const i = io();
    expect(
      await run(
        ["bundle", "a", "installer-skills", "add", "d2", "--path", "custom/helper.md", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(0);
    expect(installerSkillsOf(fs, "a")).toEqual([{ name: "d2", path: "custom/helper.md" }]);
  });

  it("rejects an attach whose SKILL.md has invalid frontmatter (no description): exit 1, nothing registered", async () => {
    const { fs, backlog } = seed({
      placedAt: { [`${INSTALLER_SKILLS}/bad/SKILL.md`]: "---\nname: bad\n---\nno description\n" },
    });
    const before = fs.read(`${PROJ}/wip/bundles/a/bundle.yml`);
    const i = io();
    expect(
      await run(
        ["bundle", "a", "installer-skills", "add", "bad", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(1);
    expect(i.err.text).toContain("description"); // names the offending field
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toBe(before); // byte-identical
  });
});

describe("bundle <id> installer-skills add — SCAFFOLD branch (task-77 #2)", () => {
  it("scaffolds a stub (name + placeholder install-time-helper description, no invented prose), registers it, and materialises the writing task naming the bundle", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(
        ["bundle", "a", "installer-skills", "add", "fresh", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(0);

    const stubPath = `${PROJ}/wip/bundles/a/${INSTALLER_SKILLS}/fresh/SKILL.md`;
    expect(fs.exists(stubPath)).toBe(true);
    const stub = fs.read(stubPath);
    expect(stub).toContain("name: fresh"); // frontmatter name substituted
    expect(stub).toContain("TODO (install-time helper trigger)"); // placeholder description (not authored prose)
    expect(stub).toContain("Stub"); // the structural stub marker

    expect(installerSkillsOf(fs, "a")).toEqual([
      { name: "fresh", path: `${INSTALLER_SKILLS}/fresh/SKILL.md` },
    ]);
    // 77#2/#6: the writing task naming the bundle is materialised, and the command says so.
    expect(i.out.text).toContain("scaffolded");
    expect(i.out.text).toContain("materialised");
    expect(backlog.listTasks(AUTHORING).map((t) => t.title)).toContain(
      "Write content for install-time skill fresh in a",
    );
  });
});

describe("bundle <id> installer-skills add — ERROR branch + alias-ensure + standard reqs (task-77 #3/#4/#5/#6)", () => {
  it("AC#3 — --path given but nothing there: typed error (exit 1), nothing registered, no stub written", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/wip/bundles/a/bundle.yml`);
    const i = io();
    expect(
      await run(
        [
          "bundle",
          "a",
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
    expect(i.err.text).toContain(`${INSTALLER_SKILLS}/ghost/SKILL.md`); // names the missing path
    expect(i.err.text).toContain("omit --path"); // directs the author to scaffold (AC77#3)
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toBe(before); // nothing registered
    expect(fs.exists(`${PROJ}/wip/bundles/a/${INSTALLER_SKILLS}/ghost/SKILL.md`)).toBe(false); // no stub
  });

  it("AC#4 — after add, the bundle's installer-skills scope alias exists (ensured by ④ RERENDER's scopePlan)", async () => {
    const { fs, backlog } = seed(); // target claude-code → alias path .claude/skills
    expect(
      await run(
        ["bundle", "a", "installer-skills", "add", "fresh", "-C", PROJ],
        deps(fs, backlog),
        io(),
      ),
    ).toBe(0);
    // scopePlan plans a per-bundle alias bundles/a/.claude/skills → bundles/a/installer-skills; ④ RERENDER
    // created it via fs.ensureAlias (the memory fs records the link as existing).
    expect(fs.exists(`${PROJ}/wip/bundles/a/.claude/skills`)).toBe(true);
  });

  it("AC#4 edge — on a NO-target project, add still succeeds (registers); no alias to create", async () => {
    const { fs, backlog } = seed({ noTarget: true });
    const i = io();
    expect(
      await run(
        ["bundle", "a", "installer-skills", "add", "fresh", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(0);
    expect(installerSkillsOf(fs, "a")).toEqual([
      { name: "fresh", path: `${INSTALLER_SKILLS}/fresh/SKILL.md` },
    ]);
    // no target ⇒ scopePlan yields no aliases ⇒ none created (correct, not a violation):
    expect(fs.exists(`${PROJ}/wip/bundles/a/.claude/skills`)).toBe(false);
  });

  it("AC#5 — outside any project, exits 1 naming manifest.yml and suggesting init", async () => {
    const { fs, backlog } = seed({ placedHelpers: ["detect"] });
    const i = io();
    expect(
      await run(
        ["bundle", "a", "installer-skills", "add", "detect"],
        deps(fs, backlog, "/nowhere"),
        i,
      ),
    ).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
    expect(i.err.text).toContain("init");
  });

  it("AC#5 — the id position completes from enabled bundles", async () => {
    const { fs, backlog } = seed();
    const d = deps(fs, backlog, PROJ);
    const out = completeArgv(buildProgram(d, io()), ["bundle", ""], {
      fs: d.fs,
      env: d.env,
      builtinTemplatesRoot: d.builtinTemplatesRoot,
      registry: defaultRegistry(),
      specs: COMPLETION_SPECS,
    });
    expect(out).toContain("a");
    expect(out).toContain("new"); // a fixed verb at the same position
  });

  it("AC#5 — installer-skills add completes the name from the on-disk helper folders (attachable)", async () => {
    const { fs, backlog } = seed({ placedHelpers: ["alpha", "beta"] });
    const i = io();
    expect(
      await run(
        ["__complete", "bundle", "a", "installer-skills", "add", ""],
        deps(fs, backlog, PROJ),
        i,
      ),
    ).toBe(0);
    const suggestions = i.out.text.split("\n").filter(Boolean).sort();
    expect(suggestions).toEqual(["alpha", "beta"]);
  });

  it("AC#6 — help is substantive (usage, the name positional, --path, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["bundle", "a", "installer-skills", "add", "--help"], deps(fs, backlog), i),
    ).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<name>");
    expect(help).toContain("--path");
    expect(help).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> installer-skills list (task-78 — a READ, directory SCAN)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> installer-skills list (task-78 — SCAN)", () => {
  it("AC#1/#2 — SCANS the directory: enumerates author-placed helper folders one per line, read-only, exit 0", async () => {
    // Place TWO helper folders WITHOUT `add` — proving the SCAN sees author-placed helpers (not just registered).
    const { fs, backlog } = seed({ placedHelpers: ["one", "two"] });
    const manifestBefore = fs.read(`${PROJ}/wip/manifest.yml`);
    const aBefore = fs.read(`${PROJ}/wip/bundles/a/bundle.yml`);
    const i = io();
    expect(
      await run(["bundle", "a", "installer-skills", "list", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(i.out.text).toBe("one\ntwo\n"); // sorted, both shown despite never being `add`-registered
    // read-only — nothing on disk changed:
    expect(fs.read(`${PROJ}/wip/manifest.yml`)).toBe(manifestBefore);
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toBe(aBefore);
  });

  it("AC#1 — a directory with a non-helper entry (no SKILL.md) is ignored", async () => {
    const { fs, backlog } = seed({ placedHelpers: ["real"] });
    // a stray folder with no SKILL.md is NOT a helper:
    fs.write(`${PROJ}/wip/bundles/a/${INSTALLER_SKILLS}/not-a-helper/notes.md`, "stray");
    const i = io();
    expect(
      await run(["bundle", "a", "installer-skills", "list", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(i.out.text).toBe("real\n");
  });

  it("AC#1 — an absent installer-skills directory prints a clear marker, exit 0", async () => {
    const { fs, backlog } = seed(); // no helpers placed, no installer-skills dir in the bundle
    const i = io();
    expect(
      await run(["bundle", "a", "installer-skills", "list", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(i.out.text).toBe("(no installer skills)\n");
  });

  it("AC#3 — outside any project, exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["bundle", "a", "installer-skills", "list"], deps(fs, backlog, "/nowhere"), i),
    ).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#4 — help is substantive (usage, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["bundle", "a", "installer-skills", "list", "--help"], deps(fs, backlog), i),
    ).toBe(0);
    expect(i.out.text).toMatch(/Usage:/);
    expect(i.out.text).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> installer-skills remove (task-79 — a MUTATION; deregister-not-delete)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> installer-skills remove (task-79)", () => {
  const A_WITH_REFS =
    "# bundle a comment\nid: a\nversion: 0.1.0\nsummary: bundle a\nconfirmation: safe\nrequires: {}\ninstallerSkills:\n  - name: one\n    path: installer-skills/one/SKILL.md\n  - name: two\n    path: installer-skills/two/SKILL.md\n";

  it("AC#1 — deregisters the entry AND prints it was left at installer-skills/<name>/; exit 0", async () => {
    const { fs, backlog } = seed({
      aYml: A_WITH_REFS,
      placedAt: { [`${INSTALLER_SKILLS}/one/SKILL.md`]: skillMd("one") },
    });
    const i = io();
    expect(
      await run(
        ["bundle", "a", "installer-skills", "remove", "one", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(0);
    expect(installerSkillsOf(fs, "a")).toEqual([
      { name: "two", path: `${INSTALLER_SKILLS}/two/SKILL.md` },
    ]); // one gone
    expect(i.out.text).toContain("left at installer-skills/one/"); // doc-10:175 message
  });

  it("AC#2 — the SKILL.md is LEFT on disk (deregister, not delete)", async () => {
    const { fs, backlog } = seed({
      aYml: A_WITH_REFS,
      placedAt: { [`${INSTALLER_SKILLS}/one/SKILL.md`]: skillMd("one") },
    });
    const contentBefore = fs.read(`${PROJ}/wip/bundles/a/${INSTALLER_SKILLS}/one/SKILL.md`);
    expect(
      await run(
        ["bundle", "a", "installer-skills", "remove", "one", "-C", PROJ],
        deps(fs, backlog),
        io(),
      ),
    ).toBe(0);
    expect(fs.exists(`${PROJ}/wip/bundles/a/${INSTALLER_SKILLS}/one/SKILL.md`)).toBe(true);
    expect(fs.read(`${PROJ}/wip/bundles/a/${INSTALLER_SKILLS}/one/SKILL.md`)).toBe(contentBefore);
  });

  it("AC#3 — deregistering a name NOT registered fails with NotFound (exit 1), nothing changed", async () => {
    const { fs, backlog } = seed({ aYml: A_WITH_REFS });
    const before = fs.read(`${PROJ}/wip/bundles/a/bundle.yml`);
    const i = io();
    expect(
      await run(
        ["bundle", "a", "installer-skills", "remove", "not-there", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(1);
    expect(i.err.text).toContain("not-there");
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toBe(before); // unchanged
  });

  it("AC#4 — outside any project, exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed({ aYml: A_WITH_REFS });
    const i = io();
    expect(
      await run(
        ["bundle", "a", "installer-skills", "remove", "one"],
        deps(fs, backlog, "/nowhere"),
        i,
      ),
    ).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#4 — the name completes from the REGISTERED helpers", async () => {
    const { fs, backlog } = seed({ aYml: A_WITH_REFS });
    const i = io();
    expect(
      await run(
        ["__complete", "bundle", "a", "installer-skills", "remove", ""],
        deps(fs, backlog, PROJ),
        i,
      ),
    ).toBe(0);
    const suggestions = i.out.text.split("\n").filter(Boolean).sort();
    expect(suggestions).toEqual(["one", "two"]); // the registered names
  });

  it("AC#5 — help is substantive (usage, the name positional, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["bundle", "a", "installer-skills", "remove", "--help"], deps(fs, backlog), i),
    ).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<name>");
    expect(help).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// end-to-end author workflow — the scan-vs-registry divergence is the headline difference from O
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> installer-skills — end-to-end author workflow (scan-vs-registry)", () => {
  it("scaffold → list shows it → remove → list STILL shows it (the stub is left on disk; scan ≠ registry); task materialised; comment survives", async () => {
    const { fs, backlog } = seed();
    const d = (): CliDeps => deps(fs, backlog);

    expect(
      await run(["bundle", "a", "installer-skills", "add", "fresh", "-C", PROJ], d(), io()),
    ).toBe(0);
    let i = io();
    expect(await run(["bundle", "a", "installer-skills", "list", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text).toBe("fresh\n");

    // the registry drops `fresh`, but the SKILL.md is LEFT on disk (deregister-not-delete) …
    expect(
      await run(["bundle", "a", "installer-skills", "remove", "fresh", "-C", PROJ], d(), io()),
    ).toBe(0);
    expect(installerSkillsOf(fs, "a")).toEqual([]); // registry empty after remove

    // … so the directory SCAN still shows it (the deliberate scan-vs-registry divergence — contrast O, where
    // list-after-remove is empty because O's list reads the registry).
    i = io();
    expect(await run(["bundle", "a", "installer-skills", "list", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text).toBe("fresh\n"); // STILL shown — the SKILL.md is on disk
    expect(fs.exists(`${PROJ}/wip/bundles/a/${INSTALLER_SKILLS}/fresh/SKILL.md`)).toBe(true);

    // the task is materialised, the comment survived:
    expect(backlog.listTasks(AUTHORING).map((t) => t.title)).toContain(
      "Write content for install-time skill fresh in a",
    );
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toContain("# bundle a —");
  });

  it("rerender — after add, the front-door is re-rendered (it exists)", async () => {
    const { fs, backlog } = seed({ placedHelpers: ["detect"] });
    expect(
      await run(
        ["bundle", "a", "installer-skills", "add", "detect", "-C", PROJ],
        deps(fs, backlog),
        io(),
      ),
    ).toBe(0);
    expect(fs.exists(`${PROJ}/wip/installer-skills/demo-installer/SKILL.md`)).toBe(true);
  });

  it("the installer-skills group help lists the add/list/remove subcommands", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "installer-skills", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("add");
    expect(help).toContain("list");
    expect(help).toContain("remove");
  });
});
