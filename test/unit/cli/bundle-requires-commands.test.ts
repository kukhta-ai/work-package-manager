import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { buildProgram, type CliDeps, COMPLETION_SPECS, run } from "../../../src/cli.js";
import { completeArgv } from "../../../src/completion/complete.js";
import { defaultRegistry } from "../../../src/completion/registry.js";
import { parseBundleManifest } from "../../../src/core/services/schema/index.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";
import { parseYaml } from "../../../src/util/yaml.js";

/**
 * Acceptance tests for the per-bundle REQUIRES family — `bundle <id> requires add` / `list` / `remove`
 * (tasks 62/63/64), the bundle-`<id>` analogue of the project-targets LIST-MGMT pattern operating on
 * `bundles/<id>/bundle.yml`'s `requires` map. Driven through `run()` in-process over in-memory ports, against a
 * realistic project at `/proj` with THREE bundles `a`, `b`, `c` (so add/remove/cycle/multi-requires are all
 * exercisable). Each `bundle.yml` carries a leading COMMENT + a known key order so the comment+order
 * preservation across an `editYaml` write is testable. The project template snippets are seeded so ④ RERENDER
 * resolves. Mirrors `bundle-version-commands.test.ts`.
 */

const PROJ = "/proj";
const BUILTIN = "/builtin-templates";
const AUTHORING = `${PROJ}/.authoring-backlog`;

/** A bundle.yml with a leading comment + a known key order — to test comment/order preservation across writes. */
function bundleYmlFor(id: string, requiresBlock = "requires: {}"): string {
  return [
    `# bundle ${id} — its requires map is edited via \`wpm bundle ${id} requires …\``,
    `id: ${id}`,
    "version: 0.1.0",
    `summary: bundle ${id}`,
    "confirmation: safe",
    requiresBlock,
    "",
  ].join("\n");
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
 * Seed a project at /proj with the bundles named in `opts.bundles` (default `a`, `b`, `c`). `opts.requires` maps
 * a bundle id → its `requires:` YAML block (so a test can pre-wire an edge, e.g. `b` requiring `a` for a cycle).
 */
function seed(opts: { bundles?: string[]; requires?: Record<string, string> } = {}): {
  fs: MemoryFileSystem;
  backlog: FakeBacklog;
} {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();
  const bundles = opts.bundles ?? ["a", "b", "c"];

  fs.write(
    `${PROJ}/manifest.yml`,
    `project:\n  name: demo\n  version: 1.0.0\ntargets:\n  - claude-code\nbundles:\n${bundles
      .map((b) => `  - ${b}`)
      .join("\n")}\n`,
  );
  for (const b of bundles) {
    const requiresBlock = opts.requires?.[b];
    fs.write(`${PROJ}/bundles/${b}/bundle.yml`, bundleYmlFor(b, requiresBlock));
  }
  fs.makeDirectories(`${PROJ}/installer-skills`);
  backlog.init(AUTHORING, { taskPrefix: "authoring" });

  // Project template snippets so ④ RERENDER resolves (same set bundle-version-commands.test.ts seeds).
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

/**
 * The PARSED `requires` map of `<id>`'s bundle.yml on disk, as a plain record of dep-id → range string. NOTE:
 * `parseBundleManifest` NORMALIZES the npm range (the committed convention — see `test/unit/schema/bundle.test.ts`:
 * `^0.3.0` parses to `>=0.3.0 <0.4.0-0`), so values here are the normalized comparator form. The RAW caret the
 * CLI writes to bundle.yml is asserted separately against `fs.read(...)` text.
 */
function requiresOf(fs: MemoryFileSystem, id: string): Record<string, string> {
  const parsed = parseBundleManifest(parseYaml(fs.read(`${PROJ}/bundles/${id}/bundle.yml`)));
  if (!parsed.ok) throw new Error(`bundle ${id} did not parse`);
  const out: Record<string, string> = {};
  for (const [dep, range] of parsed.value.requires) {
    out[dep as string] = range as string;
  }
  return out;
}

/** The npm-normalized comparator form of a caret/tilde range (what `parseBundleManifest` stores, and `list` prints). */
function normalizedRange(raw: string): string {
  // Re-derive via the same path the model uses, so the test asserts the real stored form, not a hand-typed one.
  const parsed = parseBundleManifest({
    id: "x",
    version: "0.0.0",
    summary: "s",
    confirmation: "safe",
    requires: { dep: raw },
  });
  if (!parsed.ok) throw new Error(`could not normalize range ${raw}`);
  return parsed.value.requires.get("dep" as never) as string;
}

/** The titles of the tasks the FakeBacklog holds in the authoring backlog. */
function authoringTitles(backlog: FakeBacklog): string[] {
  return backlog.listTasks(AUTHORING).map((t) => t.title);
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> requires add (task-62 — a MUTATION + MATERIALISE)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> requires add (task-62)", () => {
  it("AC#1 — adds an entry with the given constraint; comment + key order preserved", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(
        ["bundle", "a", "requires", "add", "b", "^0.3.0", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(0);
    expect(requiresOf(fs, "a")).toEqual({ b: normalizedRange("^0.3.0") });
    const text = fs.read(`${PROJ}/bundles/a/bundle.yml`);
    expect(text).toMatch(/b:\s*\^0\.3\.0/); // the RAW caret is written verbatim to bundle.yml
    expect(text).toContain("# bundle a —"); // leading comment survived
    const keyOrder = text
      .split("\n")
      .map((l) => l.match(/^([a-z_]+):/)?.[1])
      .filter((k): k is string => k !== undefined);
    expect(keyOrder).toEqual(["id", "version", "summary", "confirmation", "requires"]);
  });

  it("AC#1 — the caret default is the LITERAL ^<dep-version>, not a normalized comparator", async () => {
    const { fs, backlog } = seed(); // every bundle is version 0.1.0
    expect(
      await run(["bundle", "a", "requires", "add", "b", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    // the raw bundle.yml carries the literal caret (NOT `>=0.1.0 <0.2.0`):
    const raw = fs.read(`${PROJ}/bundles/a/bundle.yml`);
    expect(raw).toMatch(/b:\s*\^0\.1\.0/);
    expect(raw).not.toContain(">=0.1.0");
    // parsed (the model normalizes the stored caret — the committed convention):
    expect(requiresOf(fs, "a")).toEqual({ b: normalizedRange("^0.1.0") });
  });

  it("AC#1 — adding the same dep twice OVERWRITES the constraint (one key, latest range)", async () => {
    const { fs, backlog } = seed();
    const d = (): CliDeps => deps(fs, backlog);
    expect(
      await run(["bundle", "a", "requires", "add", "b", "^0.1.0", "-C", PROJ], d(), io()),
    ).toBe(0);
    expect(
      await run(["bundle", "a", "requires", "add", "b", "^0.3.0", "-C", PROJ], d(), io()),
    ).toBe(0);
    expect(fs.read(`${PROJ}/bundles/a/bundle.yml`)).toMatch(/b:\s*\^0\.3\.0/); // latest caret on disk
    expect(requiresOf(fs, "a")).toEqual({ b: normalizedRange("^0.3.0") }); // one key, overwritten
  });

  it("AC#2 — closing a 2-cycle (a→b with b→a already) WARNS but still writes the edge, exit 0", async () => {
    // b already requires a; adding a→b closes the cycle a→b→a.
    const { fs, backlog } = seed({ requires: { b: "requires:\n  a: ^0.1.0" } });
    const i = io();
    expect(
      await run(["bundle", "a", "requires", "add", "b", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0); // exit 0 (warn, not reject)
    expect(requiresOf(fs, "a")).toEqual({ b: normalizedRange("^0.1.0") }); // the edge WAS written
    expect(i.err.text).toMatch(/cycle/i); // a cycle warning on stderr
    expect(i.err.text).toContain("a"); // names the cycle path
    expect(i.err.text).toContain("b");
  });

  it("AC#2 — a self-require (a→a) is a cycle: warns, still writes, exit 0", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["bundle", "a", "requires", "add", "a", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(requiresOf(fs, "a")).toEqual({ a: normalizedRange("^0.1.0") });
    expect(i.err.text).toMatch(/cycle/i);
  });

  it("AC#2 negative — a non-cyclic add emits NO warning", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["bundle", "a", "requires", "add", "b", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(i.err.text).toBe(""); // no warning
  });

  it("AC#3 — materialises 'Adapt a's install-backlog and payload to use b' once (idempotent by title)", async () => {
    const { fs, backlog } = seed();
    const d = (): CliDeps => deps(fs, backlog);
    const i = io();
    expect(await run(["bundle", "a", "requires", "add", "b", "-C", PROJ], d(), i)).toBe(0);
    expect(authoringTitles(backlog)).toContain("Adapt a's install-backlog and payload to use b");
    expect(i.out.text).toMatch(/materialised: 1 authoring task\(s\)/);
    // re-running the add (overwrite) does NOT duplicate the task (idempotent by title):
    expect(
      await run(["bundle", "a", "requires", "add", "b", "^0.2.0", "-C", PROJ], d(), io()),
    ).toBe(0);
    expect(
      authoringTitles(backlog).filter(
        (t) => t === "Adapt a's install-backlog and payload to use b",
      ),
    ).toHaveLength(1);
  });

  it("AC#4 — a dependency that is NOT an enabled bundle fails with NotFound (exit 1), changing nothing", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/bundles/a/bundle.yml`);
    const i = io();
    expect(
      await run(["bundle", "a", "requires", "add", "ghost", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(1);
    expect(i.err.text).toContain("ghost"); // names the missing dependency
    expect(fs.read(`${PROJ}/bundles/a/bundle.yml`)).toBe(before); // byte-for-byte unchanged
    expect(authoringTitles(backlog)).toHaveLength(0); // no task materialised
  });

  it("AC#1 — a bad constraint RANGE is a usage error (exit 2), changing nothing", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/bundles/a/bundle.yml`);
    expect(
      await run(
        ["bundle", "a", "requires", "add", "b", "not-a-range!", "-C", PROJ],
        deps(fs, backlog),
        io(),
      ),
    ).toBe(2);
    expect(fs.read(`${PROJ}/bundles/a/bundle.yml`)).toBe(before);
  });

  it("AC#5 — outside any project, exits 1 naming manifest.yml and suggesting init", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["bundle", "a", "requires", "add", "b"], deps(fs, backlog, "/nowhere"), i),
    ).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
    expect(i.err.text).toContain("init");
  });

  it("AC#5 — the dependency position completes from enabled bundles", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["__complete", "bundle", "a", "requires", "add", ""], deps(fs, backlog, PROJ), i),
    ).toBe(0);
    const suggestions = i.out.text.split("\n").filter(Boolean);
    expect(suggestions).toContain("a");
    expect(suggestions).toContain("b");
    expect(suggestions).toContain("c");
  });

  it("AC#6 — help is substantive (usage, the dep + constraint positionals, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "requires", "add", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<dep-bundle-id>");
    expect(help).toContain("constraint");
    expect(help).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> requires list (task-63 — a READ)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> requires list (task-63)", () => {
  it("AC#1/#2 — prints each entry as 'dep-id range', one per line, read-only, exit 0", async () => {
    const { fs, backlog } = seed({ requires: { a: "requires:\n  b: ^0.1.0\n  c: ^0.2.0" } });
    const manifestBefore = fs.read(`${PROJ}/manifest.yml`);
    const aBefore = fs.read(`${PROJ}/bundles/a/bundle.yml`);
    const i = io();
    expect(await run(["bundle", "a", "requires", "list", "-C", PROJ], deps(fs, backlog), i)).toBe(
      0,
    );
    // declaration order, one "dep-id range" per line (the range is the model's normalized form):
    expect(i.out.text).toBe(`b ${normalizedRange("^0.1.0")}\nc ${normalizedRange("^0.2.0")}\n`);
    // read-only — nothing on disk changed:
    expect(fs.read(`${PROJ}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.read(`${PROJ}/bundles/a/bundle.yml`)).toBe(aBefore);
  });

  it("AC#1 — an empty requires map prints a clear marker, exit 0", async () => {
    const { fs, backlog } = seed(); // a's requires is {}
    const i = io();
    expect(await run(["bundle", "a", "requires", "list", "-C", PROJ], deps(fs, backlog), i)).toBe(
      0,
    );
    expect(i.out.text).toBe("(no requires)\n");
  });

  it("AC#3 — outside any project, exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "requires", "list"], deps(fs, backlog, "/nowhere"), i)).toBe(
      1,
    );
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#3 — the id position completes from enabled bundles", async () => {
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
    expect(out).toContain("b");
    expect(out).toContain("new"); // a fixed verb at the same position
  });

  it("AC#4 — help is substantive (usage, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "requires", "list", "--help"], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text).toMatch(/Usage:/);
    expect(i.out.text).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> requires remove (task-64 — a MUTATION + MATERIALISE)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> requires remove (task-64)", () => {
  it("AC#1 — removes the named entry; other entries + comment survive; exit 0", async () => {
    const { fs, backlog } = seed({ requires: { a: "requires:\n  b: ^0.1.0\n  c: ^0.2.0" } });
    const i = io();
    expect(
      await run(["bundle", "a", "requires", "remove", "b", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(requiresOf(fs, "a")).toEqual({ c: normalizedRange("^0.2.0") }); // b gone, c kept
    expect(fs.read(`${PROJ}/bundles/a/bundle.yml`)).toMatch(/c:\s*\^0\.2\.0/); // c's caret intact on disk
    expect(fs.read(`${PROJ}/bundles/a/bundle.yml`)).toContain("# bundle a —"); // comment survived
  });

  it("AC#2 — materialises 'Verify a no longer references b' once (idempotent by title)", async () => {
    const { fs, backlog } = seed({ requires: { a: "requires:\n  b: ^0.1.0\n  c: ^0.2.0" } });
    const i = io();
    expect(
      await run(["bundle", "a", "requires", "remove", "b", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(authoringTitles(backlog)).toContain("Verify a no longer references b");
    expect(i.out.text).toMatch(/materialised: 1 authoring task\(s\)/);
  });

  it("AC#3 — removing a dependency NOT present fails with NotFound (exit 1), changing nothing", async () => {
    const { fs, backlog } = seed({ requires: { a: "requires:\n  b: ^0.1.0" } });
    const before = fs.read(`${PROJ}/bundles/a/bundle.yml`);
    const i = io();
    expect(
      await run(["bundle", "a", "requires", "remove", "ghost", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(1);
    expect(i.err.text).toContain("ghost");
    expect(fs.read(`${PROJ}/bundles/a/bundle.yml`)).toBe(before); // unchanged
    expect(authoringTitles(backlog)).toHaveLength(0);
  });

  it("AC#4 — outside any project, exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed({ requires: { a: "requires:\n  b: ^0.1.0" } });
    const i = io();
    expect(
      await run(["bundle", "a", "requires", "remove", "b"], deps(fs, backlog, "/nowhere"), i),
    ).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#4 — the dependency position completes from THIS bundle's current requires entries", async () => {
    // a requires b and c; the remove completion offers exactly those (NOT all enabled bundles).
    const { fs, backlog } = seed({ requires: { a: "requires:\n  b: ^0.1.0\n  c: ^0.2.0" } });
    const i = io();
    expect(
      await run(
        ["__complete", "bundle", "a", "requires", "remove", ""],
        deps(fs, backlog, PROJ),
        i,
      ),
    ).toBe(0);
    const suggestions = i.out.text.split("\n").filter(Boolean).sort();
    expect(suggestions).toEqual(["b", "c"]); // this bundle's current requires, not the whole enabled set
  });

  it("AC#5 — help is substantive (usage, the dep positional, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "requires", "remove", "--help"], deps(fs, backlog), i)).toBe(
      0,
    );
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<dep-bundle-id>");
    expect(help).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// end-to-end author workflow (add → list → remove → list) + rerender
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> requires — end-to-end author workflow", () => {
  it("add → list shows it → remove → list gone; bundle.yml is the single source of truth", async () => {
    const { fs, backlog } = seed();
    const d = (): CliDeps => deps(fs, backlog);

    expect(
      await run(["bundle", "a", "requires", "add", "b", "^0.1.0", "-C", PROJ], d(), io()),
    ).toBe(0);
    let i = io();
    expect(await run(["bundle", "a", "requires", "list", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text).toBe(`b ${normalizedRange("^0.1.0")}\n`);

    expect(await run(["bundle", "a", "requires", "remove", "b", "-C", PROJ], d(), io())).toBe(0);
    i = io();
    expect(await run(["bundle", "a", "requires", "list", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text).toBe("(no requires)\n");

    // the author's hand-written comment survived every write:
    expect(fs.read(`${PROJ}/bundles/a/bundle.yml`)).toContain("# bundle a —");
  });

  it("rerender — after add, the front-door is re-rendered (it exists)", async () => {
    const { fs, backlog } = seed();
    expect(
      await run(["bundle", "a", "requires", "add", "b", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    expect(fs.exists(`${PROJ}/AGENTS.md`)).toBe(true);
  });

  it("the requires group help lists the add/list/remove subcommands", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "requires", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("add");
    expect(help).toContain("list");
    expect(help).toContain("remove");
  });
});
