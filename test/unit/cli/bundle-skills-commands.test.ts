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
 * Acceptance tests for the per-bundle SKILLS family — `bundle <id> skills add` / `list` / `remove` (tasks
 * 74/75/76), riding the GENERIC descriptor-driven skill-reference operation parameterised by
 * `PAYLOAD_SKILLS_DESCRIPTOR`. Driven through `run()` in-process over in-memory ports, against a project at
 * `/proj` with bundle `a` whose `bundle.yml` carries a leading COMMENT + a known key order. The KEY DISTINCTION
 * from L/M/N: `add <name> [--path]` is the 3-WAY scaffold-or-attach (ATTACH an author-placed SKILL.md →
 * validate frontmatter + register; SCAFFOLD a stub + materialise the writing task; ERROR when `--path` points at
 * nothing). Template snippets — including the payload-skill snippet the SCAFFOLD branch renders — are seeded.
 * Mirrors `bundle-scripts-commands.test.ts`.
 */

const PROJ = "/proj";
const BUILTIN = "/builtin-templates";
const AUTHORING = `${PROJ}/.authoring-backlog`;
const AGENT_SKILLS = "payload/agent-skills";

/** A bundle.yml with a leading comment + a known key order (NO payload key — the old-bundle.yml shape). */
function bundleYmlFor(id: string): string {
  return [
    `# bundle ${id} — payload skills are edited via \`wpm bundle ${id} skills …\``,
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
  return `---\nname: ${name}\ndescription: Do ${name} for the user at runtime.\n---\n\n# ${name}\nbody\n`;
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
 * Seed a project at /proj with bundle `a`. `opts.placedSkills` writes a valid SKILL.md at the CONVENTIONAL path
 * for each named skill (`payload/agent-skills/<name>/SKILL.md`). `opts.placedAt` writes a SKILL.md (its content
 * given) at an arbitrary bundle-relative path (for the `--path` cases). `opts.aYml` overrides `a`'s bundle.yml.
 */
function seed(
  opts: { placedSkills?: string[]; placedAt?: Record<string, string>; aYml?: string } = {},
): { fs: MemoryFileSystem; backlog: FakeBacklog } {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();

  fs.write(
    `${PROJ}/wip/manifest.yml`,
    "project:\n  name: demo\n  version: 1.0.0\ntargets:\n  - claude-code\nbundles:\n  - a\n",
  );
  fs.write(`${PROJ}/wip/bundles/a/bundle.yml`, opts.aYml ?? bundleYmlFor("a"));
  for (const name of opts.placedSkills ?? []) {
    fs.write(`${PROJ}/wip/bundles/a/${AGENT_SKILLS}/${name}/SKILL.md`, skillMd(name));
  }
  for (const [rel, content] of Object.entries(opts.placedAt ?? {})) {
    fs.write(`${PROJ}/wip/bundles/a/${rel}`, content);
  }
  fs.makeDirectories(`${PROJ}/wip/installer-skills`);
  backlog.init(AUTHORING, { taskPrefix: "authoring" });

  // Project template snippets so ④ RERENDER resolves AND the SCAFFOLD branch finds the payload-skill snippet.
  fs.write(`${BUILTIN}/project/minimal/template.yml`, "name: minimal\nscope: project\n");
  fs.write(`${BUILTIN}/project/minimal/snippets/AGENTS.md`, "# {{project-name}}\n\n{{bundles}}\n");
  fs.write(
    `${BUILTIN}/project/minimal/snippets/installer-skills/{{project-name}}-installer/SKILL.md`,
    "---\nname: {{project-name}}-installer\n---\nInstall {{project-name}}.\n",
  );
  fs.write(
    `${BUILTIN}/project/minimal/snippets/advisor.SKILL.md.tmpl`,
    "---\nname: {{bundle-id}}-advisor\n---\n\n# {{bundle-id}} advisor\n",
  );
  // The payload-skill snippet the SCAFFOLD branch renders (mirrors the real snippet: {{skill-name}} + a
  // placeholder runtime-trigger description + a "Stub" marker — NO invented prose).
  fs.write(
    `${BUILTIN}/project/minimal/snippets/payload-skill.SKILL.md.tmpl`,
    '---\nname: {{skill-name}}\ndescription: "TODO (RUNTIME trigger): when the USER would invoke {{skill-name}}."\n---\n\n# {{skill-name}}\n\n> Stub — fill this in.\n',
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

/** The parsed `payload.skills` of `<id>`'s bundle.yml on disk. */
function skillsOf(fs: MemoryFileSystem, id: string): readonly SkillRef[] {
  const parsed = parseBundleManifest(parseYaml(fs.read(`${PROJ}/wip/bundles/${id}/bundle.yml`)));
  if (!parsed.ok) throw new Error(`bundle ${id} did not parse: ${parsed.problem.message}`);
  return parsed.value.payload.skills;
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> skills add — the 3-way scaffold-or-attach (task-74)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> skills add — ATTACH branch (task-74 #1)", () => {
  it("attaches a SKILL.md present at the conventional path: validates frontmatter, registers {name, path}, leaves the file, NO task", async () => {
    const { fs, backlog } = seed({ placedSkills: ["handoff"] });
    const before = fs.read(`${PROJ}/wip/bundles/a/${AGENT_SKILLS}/handoff/SKILL.md`);
    const i = io();
    expect(
      await run(["bundle", "a", "skills", "add", "handoff", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(skillsOf(fs, "a")).toEqual([
      { name: "handoff", path: `${AGENT_SKILLS}/handoff/SKILL.md` },
    ]);
    expect(fs.read(`${PROJ}/wip/bundles/a/${AGENT_SKILLS}/handoff/SKILL.md`)).toBe(before); // structure-not-content
    expect(i.out.text).toContain("attached"); // 74#4: prints what it did
    expect(i.out.text).not.toContain("materialised"); // attach queues no writing
    // comment + key order preserved:
    const text = fs.read(`${PROJ}/wip/bundles/a/bundle.yml`);
    expect(text).toContain("# bundle a —");
    const keyOrder = text
      .split("\n")
      .map((l) => l.match(/^([a-z_]+):/)?.[1])
      .filter((k): k is string => k !== undefined);
    expect(keyOrder).toEqual(["id", "version", "summary", "confirmation", "requires", "payload"]);
  });

  it("attaches via --path: registers the explicit (relocated) path", async () => {
    const { fs, backlog } = seed({ placedAt: { "elsewhere/SKILL.md": skillMd("s2") } });
    const i = io();
    expect(
      await run(
        ["bundle", "a", "skills", "add", "s2", "--path", "elsewhere/SKILL.md", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(0);
    expect(skillsOf(fs, "a")).toEqual([{ name: "s2", path: "elsewhere/SKILL.md" }]);
  });

  it("rejects an attach whose SKILL.md has invalid frontmatter (no description): exit 1, nothing registered", async () => {
    const { fs, backlog } = seed({
      placedAt: { [`${AGENT_SKILLS}/bad/SKILL.md`]: "---\nname: bad\n---\nno description\n" },
    });
    const before = fs.read(`${PROJ}/wip/bundles/a/bundle.yml`);
    const i = io();
    expect(
      await run(["bundle", "a", "skills", "add", "bad", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(1);
    expect(i.err.text).toContain("description"); // names the offending field
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toBe(before); // byte-identical
  });

  it("attaches the default-template sample skill (its frontmatter is valid) when present on disk", async () => {
    // Placing a SKILL.md models an author-placed payload skill (a fresh `bundle new` no longer ships a sample —
    // TASK-103); `skills add` then ATTACHES it.
    const { fs, backlog } = seed({ placedSkills: ["a-skill"] });
    const i = io();
    expect(
      await run(["bundle", "a", "skills", "add", "a-skill", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(skillsOf(fs, "a")).toEqual([
      { name: "a-skill", path: `${AGENT_SKILLS}/a-skill/SKILL.md` },
    ]);
    expect(i.out.text).not.toContain("materialised"); // ATTACH, not scaffold
  });
});

describe("bundle <id> skills add — SCAFFOLD branch (task-74 #2)", () => {
  it("scaffolds a stub (name + placeholder runtime-trigger description, no invented prose), registers it, and materialises the writing task", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["bundle", "a", "skills", "add", "fresh", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);

    const stubPath = `${PROJ}/wip/bundles/a/${AGENT_SKILLS}/fresh/SKILL.md`;
    expect(fs.exists(stubPath)).toBe(true);
    const stub = fs.read(stubPath);
    expect(stub).toContain("name: fresh"); // frontmatter name substituted
    expect(stub).toContain("TODO (RUNTIME trigger)"); // placeholder runtime-trigger description (not authored prose)
    expect(stub).toContain("Stub"); // the structural stub marker

    expect(skillsOf(fs, "a")).toEqual([{ name: "fresh", path: `${AGENT_SKILLS}/fresh/SKILL.md` }]);
    // 74#2/#4: the writing task is materialised, and the command says so.
    expect(i.out.text).toContain("scaffolded");
    expect(i.out.text).toContain("materialised");
    expect(backlog.listTasks(AUTHORING).map((t) => t.title)).toContain(
      "Write payload skill fresh for a",
    );
  });
});

describe("bundle <id> skills add — ERROR branch + standard requirements (task-74 #3/#5/#6)", () => {
  it("AC#3 — --path given but nothing there: typed error (exit 1), nothing registered, no stub written", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/wip/bundles/a/bundle.yml`);
    const i = io();
    expect(
      await run(
        [
          "bundle",
          "a",
          "skills",
          "add",
          "ghost",
          "--path",
          `${AGENT_SKILLS}/ghost/SKILL.md`,
          "-C",
          PROJ,
        ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(1);
    expect(i.err.text).toContain(`${AGENT_SKILLS}/ghost/SKILL.md`); // names the missing path
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toBe(before); // nothing registered
    expect(fs.exists(`${PROJ}/wip/bundles/a/${AGENT_SKILLS}/ghost/SKILL.md`)).toBe(false); // no stub written
  });

  it("AC#5 — outside any project, exits 1 naming manifest.yml and suggesting init", async () => {
    const { fs, backlog } = seed({ placedSkills: ["handoff"] });
    const i = io();
    expect(
      await run(["bundle", "a", "skills", "add", "handoff"], deps(fs, backlog, "/nowhere"), i),
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

  it("AC#5 — skills add completes the name from the on-disk skill folders (attachable skills)", async () => {
    const { fs, backlog } = seed({ placedSkills: ["alpha", "beta"] });
    const i = io();
    expect(
      await run(["__complete", "bundle", "a", "skills", "add", ""], deps(fs, backlog, PROJ), i),
    ).toBe(0);
    const suggestions = i.out.text.split("\n").filter(Boolean).sort();
    expect(suggestions).toEqual(["alpha", "beta"]);
  });

  it("AC#6 — help is substantive (usage, the name positional, --path, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "skills", "add", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<name>");
    expect(help).toContain("--path");
    expect(help).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> skills list (task-75 — a READ, registry-based)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> skills list (task-75)", () => {
  const A_WITH_TWO =
    "# bundle a comment\nid: a\nversion: 0.1.0\nsummary: bundle a\nconfirmation: safe\nrequires: {}\npayload:\n  skills:\n    - name: one\n      path: payload/agent-skills/one/SKILL.md\n    - name: two\n      path: custom/two.md\n";

  it("AC#1/#2 — enumerates the registered skill NAMES one per line, read-only, exit 0", async () => {
    const { fs, backlog } = seed({ aYml: A_WITH_TWO });
    const manifestBefore = fs.read(`${PROJ}/wip/manifest.yml`);
    const aBefore = fs.read(`${PROJ}/wip/bundles/a/bundle.yml`);
    const i = io();
    expect(await run(["bundle", "a", "skills", "list", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text).toBe("one\ntwo\n");
    // read-only — nothing on disk changed:
    expect(fs.read(`${PROJ}/wip/manifest.yml`)).toBe(manifestBefore);
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toBe(aBefore);
  });

  it("AC#1 — an empty/absent registry prints a clear marker, exit 0", async () => {
    const { fs, backlog } = seed(); // a's bundle.yml has NO payload key
    const i = io();
    expect(await run(["bundle", "a", "skills", "list", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text).toBe("(no payload skills)\n");
  });

  it("AC#3 — outside any project, exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "skills", "list"], deps(fs, backlog, "/nowhere"), i)).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#4 — help is substantive (usage, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "skills", "list", "--help"], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text).toMatch(/Usage:/);
    expect(i.out.text).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> skills remove (task-76 — a MUTATION; deregister-not-delete)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> skills remove (task-76)", () => {
  const A_WITH_REFS =
    "# bundle a comment\nid: a\nversion: 0.1.0\nsummary: bundle a\nconfirmation: safe\nrequires: {}\npayload:\n  skills:\n    - name: one\n      path: payload/agent-skills/one/SKILL.md\n    - name: two\n      path: payload/agent-skills/two/SKILL.md\n";

  it("AC#1 — deregisters the entry AND prints it was left at payload/agent-skills/<name>/; exit 0", async () => {
    const { fs, backlog } = seed({
      aYml: A_WITH_REFS,
      placedAt: { [`${AGENT_SKILLS}/one/SKILL.md`]: skillMd("one") },
    });
    const i = io();
    expect(
      await run(["bundle", "a", "skills", "remove", "one", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(skillsOf(fs, "a")).toEqual([{ name: "two", path: `${AGENT_SKILLS}/two/SKILL.md` }]); // one gone
    expect(i.out.text).toContain("left at payload/agent-skills/one/"); // doc-10:172 message
  });

  it("AC#2 — the SKILL.md is LEFT on disk (deregister, not delete)", async () => {
    const { fs, backlog } = seed({
      aYml: A_WITH_REFS,
      placedAt: { [`${AGENT_SKILLS}/one/SKILL.md`]: skillMd("one") },
    });
    const contentBefore = fs.read(`${PROJ}/wip/bundles/a/${AGENT_SKILLS}/one/SKILL.md`);
    expect(
      await run(["bundle", "a", "skills", "remove", "one", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    expect(fs.exists(`${PROJ}/wip/bundles/a/${AGENT_SKILLS}/one/SKILL.md`)).toBe(true);
    expect(fs.read(`${PROJ}/wip/bundles/a/${AGENT_SKILLS}/one/SKILL.md`)).toBe(contentBefore);
  });

  it("AC#3 — deregistering a name NOT registered fails with NotFound (exit 1), nothing changed", async () => {
    const { fs, backlog } = seed({ aYml: A_WITH_REFS });
    const before = fs.read(`${PROJ}/wip/bundles/a/bundle.yml`);
    const i = io();
    expect(
      await run(["bundle", "a", "skills", "remove", "not-there", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(1);
    expect(i.err.text).toContain("not-there");
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toBe(before); // unchanged
  });

  it("AC#4 — outside any project, exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed({ aYml: A_WITH_REFS });
    const i = io();
    expect(
      await run(["bundle", "a", "skills", "remove", "one"], deps(fs, backlog, "/nowhere"), i),
    ).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#4 — the name completes from the REGISTERED skills", async () => {
    const { fs, backlog } = seed({ aYml: A_WITH_REFS });
    const i = io();
    expect(
      await run(["__complete", "bundle", "a", "skills", "remove", ""], deps(fs, backlog, PROJ), i),
    ).toBe(0);
    const suggestions = i.out.text.split("\n").filter(Boolean).sort();
    expect(suggestions).toEqual(["one", "two"]); // the registered names
  });

  it("AC#5 — help is substantive (usage, the name positional, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "skills", "remove", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<name>");
    expect(help).toMatch(/Example/i);
  });

  it("TASK-103 AC#2 — an UNREGISTERED on-disk stub is DELETED through the CLI (orphan cleanup); exit 0, clear message", async () => {
    // A stub on disk that was NEVER registered (e.g. an old `bundle new` payload-skill stub): a's bundle.yml has
    // no payload key, yet payload/agent-skills/stray/SKILL.md sits on disk.
    const { fs, backlog } = seed({ placedSkills: ["stray"] });
    expect(skillsOf(fs, "a")).toEqual([]); // genuinely unregistered
    const i = io();
    expect(
      await run(["bundle", "a", "skills", "remove", "stray", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    // the stray scaffold dir is gone; the registry is still empty (there was nothing to deregister):
    expect(fs.exists(`${PROJ}/wip/bundles/a/${AGENT_SKILLS}/stray`)).toBe(false);
    expect(fs.exists(`${PROJ}/wip/bundles/a/${AGENT_SKILLS}/stray/SKILL.md`)).toBe(false);
    expect(skillsOf(fs, "a")).toEqual([]);
    expect(i.out.text).toContain("removed unregistered payload skill stray");
  });

  it("TASK-103 — `skills remove` completes an UNREGISTERED on-disk stub too (the removable union)", async () => {
    const { fs, backlog } = seed({ placedSkills: ["orphan"] }); // on disk, never registered
    const i = io();
    expect(
      await run(["__complete", "bundle", "a", "skills", "remove", ""], deps(fs, backlog, PROJ), i),
    ).toBe(0);
    expect(i.out.text.split("\n").filter(Boolean)).toContain("orphan");
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// end-to-end author workflow (scaffold → list → remove → list) + rerender + group help
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> skills — end-to-end author workflow", () => {
  it("scaffold → list shows it → remove → list gone; the stub stays on disk; the task is materialised; comment survives", async () => {
    const { fs, backlog } = seed();
    const d = (): CliDeps => deps(fs, backlog);

    expect(await run(["bundle", "a", "skills", "add", "fresh", "-C", PROJ], d(), io())).toBe(0);
    let i = io();
    expect(await run(["bundle", "a", "skills", "list", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text).toBe("fresh\n");

    expect(await run(["bundle", "a", "skills", "remove", "fresh", "-C", PROJ], d(), io())).toBe(0);
    i = io();
    expect(await run(["bundle", "a", "skills", "list", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text).toBe("(no payload skills)\n");

    // the stub SKILL.md is still on disk (deregister-not-delete), the task is materialised, the comment survived:
    expect(fs.exists(`${PROJ}/wip/bundles/a/${AGENT_SKILLS}/fresh/SKILL.md`)).toBe(true);
    expect(backlog.listTasks(AUTHORING).map((t) => t.title)).toContain(
      "Write payload skill fresh for a",
    );
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toContain("# bundle a —");
  });

  it("rerender — after add, the front-door is re-rendered (it exists)", async () => {
    const { fs, backlog } = seed({ placedSkills: ["handoff"] });
    expect(
      await run(["bundle", "a", "skills", "add", "handoff", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    expect(fs.exists(`${PROJ}/wip/installer-skills/demo-installer/SKILL.md`)).toBe(true);
  });

  it("the skills group help lists the add/list/remove subcommands", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "skills", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("add");
    expect(help).toContain("list");
    expect(help).toContain("remove");
  });
});
