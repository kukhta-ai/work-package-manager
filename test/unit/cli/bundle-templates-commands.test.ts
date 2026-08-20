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
 * Acceptance tests for the per-bundle TEMPLATES family — `bundle <id> templates add` / `list` / `remove` (tasks
 * 68/69/70), riding the GENERIC descriptor-driven payload-reference operation parameterised by
 * `TEMPLATES_DESCRIPTOR` (a PURE REUSE of Family L). Driven through `run()` in-process over in-memory ports,
 * against a project at `/proj` with bundle `a` whose `bundle.yml` carries a leading COMMENT + a known key order
 * (so comment+order preservation across an `editYaml` write is testable). REAL files are placed under
 * `${PROJ}/bundles/a/payload/templates/` in the MemoryFileSystem so the on-disk existence check + the
 * registration / deregistration are exercisable. Template snippets are seeded so ④ RERENDER resolves. Mirrors
 * `bundle-files-commands.test.ts`.
 */

const PROJ = "/proj";
const BUILTIN = "/builtin-templates";
const AUTHORING = `${PROJ}/.authoring-backlog`;

/** A bundle.yml with a leading comment + a known key order (NO payload key — the old-bundle.yml shape). */
function bundleYmlFor(id: string): string {
  return [
    `# bundle ${id} — payload references are edited via \`wpm bundle ${id} templates …\``,
    `id: ${id}`,
    "version: 0.1.0",
    `summary: bundle ${id}`,
    "confirmation: safe",
    "requires: {}",
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
 * Seed a project at /proj with bundle `a` and the files named in `opts.placed` placed under
 * `bundles/a/payload/templates/`. `opts.placedFiles` places files under `payload/files/` (for the
 * cross-category isolation case). `opts.aYml` overrides `a`'s bundle.yml (e.g. to pre-register references).
 */
function seed(opts: { placed?: string[]; placedFiles?: string[]; aYml?: string } = {}): {
  fs: MemoryFileSystem;
  backlog: FakeBacklog;
} {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();

  fs.write(
    `${PROJ}/manifest.yml`,
    "project:\n  name: demo\n  version: 1.0.0\ntargets:\n  - claude-code\nbundles:\n  - a\n",
  );
  fs.write(`${PROJ}/bundles/a/bundle.yml`, opts.aYml ?? bundleYmlFor("a"));
  for (const rel of opts.placed ?? []) {
    fs.write(`${PROJ}/bundles/a/payload/templates/${rel}`, `template ${rel}\n`);
  }
  for (const rel of opts.placedFiles ?? []) {
    fs.write(`${PROJ}/bundles/a/payload/files/${rel}`, `content of ${rel}\n`);
  }
  fs.makeDirectories(`${PROJ}/installer-skills`);
  // Every mutation rides the ⑤ MATERIALISE beat (which lists the authoring backlog), so it must be initialised
  // even though the templates family materialises NO task — exactly as `wpm init` creates `.authoring-backlog`.
  backlog.init(AUTHORING, { taskPrefix: "authoring" });

  // Project template snippets so ④ RERENDER resolves.
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

/** The parsed `payload.templates` list of `<id>`'s bundle.yml on disk. */
function payloadTemplatesOf(fs: MemoryFileSystem, id: string): readonly string[] {
  const parsed = parseBundleManifest(parseYaml(fs.read(`${PROJ}/bundles/${id}/bundle.yml`)));
  if (!parsed.ok) throw new Error(`bundle ${id} did not parse`);
  return parsed.value.payload.templates;
}

/** The parsed `payload.files` list of `<id>`'s bundle.yml on disk (for the cross-category isolation case). */
function payloadFilesOf(fs: MemoryFileSystem, id: string): readonly string[] {
  const parsed = parseBundleManifest(parseYaml(fs.read(`${PROJ}/bundles/${id}/bundle.yml`)));
  if (!parsed.ok) throw new Error(`bundle ${id} did not parse`);
  return parsed.value.payload.files;
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> templates add (task-68 — a MUTATION; structure-not-content)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> templates add (task-68)", () => {
  it("AC#1 — registers an existing path; NO file content written; comment + key order preserved; exit 0", async () => {
    const { fs, backlog } = seed({ placed: ["agents.md.tmpl"] });
    const fileBefore = fs.read(`${PROJ}/bundles/a/payload/templates/agents.md.tmpl`);
    const i = io();
    expect(
      await run(
        ["bundle", "a", "templates", "add", "agents.md.tmpl", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(0);
    expect(payloadTemplatesOf(fs, "a")).toEqual(["agents.md.tmpl"]);
    // structure-not-content: the placed file's bytes are unchanged.
    expect(fs.read(`${PROJ}/bundles/a/payload/templates/agents.md.tmpl`)).toBe(fileBefore);
    const text = fs.read(`${PROJ}/bundles/a/bundle.yml`);
    expect(text).toContain("# bundle a —"); // comment survived
    const keyOrder = text
      .split("\n")
      .map((l) => l.match(/^([a-z_]+):/)?.[1])
      .filter((k): k is string => k !== undefined);
    expect(keyOrder).toEqual(["id", "version", "summary", "confirmation", "requires", "payload"]);
  });

  it("AC#1 — adding the same path twice is set-like (no duplicate entry)", async () => {
    const { fs, backlog } = seed({ placed: ["agents.md.tmpl"] });
    const d = (): CliDeps => deps(fs, backlog);
    expect(
      await run(["bundle", "a", "templates", "add", "agents.md.tmpl", "-C", PROJ], d(), io()),
    ).toBe(0);
    expect(
      await run(["bundle", "a", "templates", "add", "agents.md.tmpl", "-C", PROJ], d(), io()),
    ).toBe(0);
    expect(payloadTemplatesOf(fs, "a")).toEqual(["agents.md.tmpl"]); // not duplicated
  });

  it("AC#1 — a nested path registers and lists in registration order", async () => {
    const { fs, backlog } = seed({ placed: ["agents.md.tmpl", "sub/x.json.tmpl"] });
    const d = (): CliDeps => deps(fs, backlog);
    expect(
      await run(["bundle", "a", "templates", "add", "agents.md.tmpl", "-C", PROJ], d(), io()),
    ).toBe(0);
    expect(
      await run(["bundle", "a", "templates", "add", "sub/x.json.tmpl", "-C", PROJ], d(), io()),
    ).toBe(0);
    expect(payloadTemplatesOf(fs, "a")).toEqual(["agents.md.tmpl", "sub/x.json.tmpl"]);
  });

  it("AC#2 — registering a path NOT on disk fails (exit 1), registering nothing", async () => {
    const { fs, backlog } = seed(); // no templates placed
    const before = fs.read(`${PROJ}/bundles/a/bundle.yml`);
    const i = io();
    expect(
      await run(
        ["bundle", "a", "templates", "add", "ghost.tmpl", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(1);
    expect(i.err.text).toContain("ghost.tmpl"); // names the missing path
    expect(i.err.text).toContain("payload/templates"); // names the right directory
    expect(fs.read(`${PROJ}/bundles/a/bundle.yml`)).toBe(before); // nothing registered (byte-identical)
  });

  it("AC#3 — outside any project, exits 1 naming manifest.yml and suggesting init", async () => {
    const { fs, backlog } = seed({ placed: ["agents.md.tmpl"] });
    const i = io();
    expect(
      await run(
        ["bundle", "a", "templates", "add", "agents.md.tmpl"],
        deps(fs, backlog, "/nowhere"),
        i,
      ),
    ).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
    expect(i.err.text).toContain("init");
  });

  it("AC#3 — the path completes from files present under payload/templates", async () => {
    const { fs, backlog } = seed({ placed: ["agents.md.tmpl", "sub/x.json.tmpl"] });
    const i = io();
    expect(
      await run(["__complete", "bundle", "a", "templates", "add", ""], deps(fs, backlog, PROJ), i),
    ).toBe(0);
    const suggestions = i.out.text.split("\n").filter(Boolean).sort();
    expect(suggestions).toEqual(["agents.md.tmpl", "sub/x.json.tmpl"]);
  });

  it("AC#4 — help is substantive (usage, the path positional, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "templates", "add", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<path>");
    expect(help).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> templates list (task-69 — a READ)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> templates list (task-69)", () => {
  it("AC#1/#2 — enumerates registered templates one per line, read-only, exit 0", async () => {
    const { fs, backlog } = seed({
      aYml: "# bundle a comment\nid: a\nversion: 0.1.0\nsummary: bundle a\nconfirmation: safe\nrequires: {}\npayload:\n  templates:\n    - agents.md.tmpl\n    - sub/x.json.tmpl\n",
    });
    const manifestBefore = fs.read(`${PROJ}/manifest.yml`);
    const aBefore = fs.read(`${PROJ}/bundles/a/bundle.yml`);
    const i = io();
    expect(await run(["bundle", "a", "templates", "list", "-C", PROJ], deps(fs, backlog), i)).toBe(
      0,
    );
    expect(i.out.text).toBe("agents.md.tmpl\nsub/x.json.tmpl\n");
    // read-only — nothing on disk changed:
    expect(fs.read(`${PROJ}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.read(`${PROJ}/bundles/a/bundle.yml`)).toBe(aBefore);
  });

  it("AC#1 — an empty/absent payload prints a clear marker, exit 0", async () => {
    const { fs, backlog } = seed(); // a's bundle.yml has NO payload key
    const i = io();
    expect(await run(["bundle", "a", "templates", "list", "-C", PROJ], deps(fs, backlog), i)).toBe(
      0,
    );
    expect(i.out.text).toBe("(no templates)\n");
  });

  it("AC#3 — outside any project, exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "templates", "list"], deps(fs, backlog, "/nowhere"), i)).toBe(
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
    expect(out).toContain("new"); // a fixed verb at the same position
  });

  it("AC#4 — help is substantive (usage, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "templates", "list", "--help"], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text).toMatch(/Usage:/);
    expect(i.out.text).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> templates remove (task-70 — a MUTATION; deregister-not-delete)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> templates remove (task-70)", () => {
  /** A bundle.yml pre-registering agents.md.tmpl + sub/x.json.tmpl under templates. */
  const A_YML_WITH_REFS =
    "# bundle a comment\nid: a\nversion: 0.1.0\nsummary: bundle a\nconfirmation: safe\nrequires: {}\npayload:\n  templates:\n    - agents.md.tmpl\n    - sub/x.json.tmpl\n";

  it("AC#1 — deregisters the entry AND prints it was left at payload/templates/<path>; exit 0", async () => {
    const { fs, backlog } = seed({
      placed: ["agents.md.tmpl", "sub/x.json.tmpl"],
      aYml: A_YML_WITH_REFS,
    });
    const i = io();
    expect(
      await run(
        ["bundle", "a", "templates", "remove", "agents.md.tmpl", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(0);
    expect(payloadTemplatesOf(fs, "a")).toEqual(["sub/x.json.tmpl"]); // agents.md.tmpl gone, the other kept
    expect(i.out.text).toContain("left at payload/templates/agents.md.tmpl"); // doc-10:168→167 message
  });

  it("AC#2 — the file content is LEFT on disk (deregister, not delete)", async () => {
    const { fs, backlog } = seed({
      placed: ["agents.md.tmpl", "sub/x.json.tmpl"],
      aYml: A_YML_WITH_REFS,
    });
    const contentBefore = fs.read(`${PROJ}/bundles/a/payload/templates/agents.md.tmpl`);
    expect(
      await run(
        ["bundle", "a", "templates", "remove", "agents.md.tmpl", "-C", PROJ],
        deps(fs, backlog),
        io(),
      ),
    ).toBe(0);
    // the file is still on disk with its content unchanged:
    expect(fs.exists(`${PROJ}/bundles/a/payload/templates/agents.md.tmpl`)).toBe(true);
    expect(fs.read(`${PROJ}/bundles/a/payload/templates/agents.md.tmpl`)).toBe(contentBefore);
  });

  it("AC#3 — deregistering a path NOT registered fails with NotFound (exit 1), nothing changed", async () => {
    const { fs, backlog } = seed({ placed: ["agents.md.tmpl"], aYml: A_YML_WITH_REFS });
    const before = fs.read(`${PROJ}/bundles/a/bundle.yml`);
    const i = io();
    expect(
      await run(
        ["bundle", "a", "templates", "remove", "not-there.tmpl", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(1);
    expect(i.err.text).toContain("not-there.tmpl");
    expect(fs.read(`${PROJ}/bundles/a/bundle.yml`)).toBe(before); // unchanged
  });

  it("AC#4 — outside any project, exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed({ aYml: A_YML_WITH_REFS });
    const i = io();
    expect(
      await run(
        ["bundle", "a", "templates", "remove", "agents.md.tmpl"],
        deps(fs, backlog, "/nowhere"),
        i,
      ),
    ).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#4 — the path completes from the REGISTERED payload templates", async () => {
    const { fs, backlog } = seed({ aYml: A_YML_WITH_REFS });
    const i = io();
    expect(
      await run(
        ["__complete", "bundle", "a", "templates", "remove", ""],
        deps(fs, backlog, PROJ),
        i,
      ),
    ).toBe(0);
    const suggestions = i.out.text.split("\n").filter(Boolean).sort();
    expect(suggestions).toEqual(["agents.md.tmpl", "sub/x.json.tmpl"]); // the registered refs, not the on-disk set
  });

  it("AC#5 — help is substantive (usage, the path positional, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "templates", "remove", "--help"], deps(fs, backlog), i)).toBe(
      0,
    );
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<path>");
    expect(help).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// end-to-end author workflow (add → list → remove → list) + rerender + cross-category isolation
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> templates — end-to-end author workflow", () => {
  it("add → list shows it → remove → list gone; the file stays on disk; comment survives", async () => {
    const { fs, backlog } = seed({ placed: ["agents.md.tmpl"] });
    const d = (): CliDeps => deps(fs, backlog);

    expect(
      await run(["bundle", "a", "templates", "add", "agents.md.tmpl", "-C", PROJ], d(), io()),
    ).toBe(0);
    let i = io();
    expect(await run(["bundle", "a", "templates", "list", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text).toBe("agents.md.tmpl\n");

    expect(
      await run(["bundle", "a", "templates", "remove", "agents.md.tmpl", "-C", PROJ], d(), io()),
    ).toBe(0);
    i = io();
    expect(await run(["bundle", "a", "templates", "list", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text).toBe("(no templates)\n");

    // the file is still on disk (deregister-not-delete) and the author's comment survived every write:
    expect(fs.exists(`${PROJ}/bundles/a/payload/templates/agents.md.tmpl`)).toBe(true);
    expect(fs.read(`${PROJ}/bundles/a/bundle.yml`)).toContain("# bundle a —");
  });

  it("rerender — after add, the front-door is re-rendered (it exists)", async () => {
    const { fs, backlog } = seed({ placed: ["agents.md.tmpl"] });
    expect(
      await run(
        ["bundle", "a", "templates", "add", "agents.md.tmpl", "-C", PROJ],
        deps(fs, backlog),
        io(),
      ),
    ).toBe(0);
    expect(fs.exists(`${PROJ}/AGENTS.md`)).toBe(true);
  });

  it("the templates group help lists the add/list/remove subcommands", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "templates", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("add");
    expect(help).toContain("list");
    expect(help).toContain("remove");
  });

  it("cross-category isolation — a files ref and a templates ref coexist; removing the template leaves the file ref", async () => {
    // Both categories placed on disk; register one of each, then remove the template.
    const { fs, backlog } = seed({ placed: ["t.md.tmpl"], placedFiles: ["agents.md"] });
    const d = (): CliDeps => deps(fs, backlog);

    expect(await run(["bundle", "a", "files", "add", "agents.md", "-C", PROJ], d(), io())).toBe(0);
    expect(await run(["bundle", "a", "templates", "add", "t.md.tmpl", "-C", PROJ], d(), io())).toBe(
      0,
    );
    // both categories are present in bundle.yml (the schema round-trips both — the reviewer NIT made concrete):
    expect(payloadFilesOf(fs, "a")).toEqual(["agents.md"]);
    expect(payloadTemplatesOf(fs, "a")).toEqual(["t.md.tmpl"]);

    // removing the template leaves the file reference intact:
    expect(
      await run(["bundle", "a", "templates", "remove", "t.md.tmpl", "-C", PROJ], d(), io()),
    ).toBe(0);
    expect(payloadTemplatesOf(fs, "a")).toEqual([]);
    expect(payloadFilesOf(fs, "a")).toEqual(["agents.md"]); // the OTHER category is untouched

    // and `files list` still shows the file ref:
    const i = io();
    expect(await run(["bundle", "a", "files", "list", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text).toBe("agents.md\n");
  });
});
