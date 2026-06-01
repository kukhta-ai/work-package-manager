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
 * Acceptance tests for the per-bundle FILES family — `bundle <id> files add` / `list` / `remove` (tasks
 * 65/66/67), riding the GENERIC descriptor-driven payload-reference operation. Driven through `run()` in-process
 * over in-memory ports, against a project at `/proj` with bundle `a` whose `bundle.yml` carries a leading COMMENT
 * + a known key order (so comment+order preservation across an `editYaml` write is testable). REAL files are
 * placed under `${PROJ}/bundles/a/payload/files/` in the MemoryFileSystem so the on-disk existence check + the
 * registration / deregistration are exercisable. Template snippets are seeded so ④ RERENDER resolves. Mirrors
 * `bundle-requires-commands.test.ts`.
 */

const PROJ = "/proj";
const BUILTIN = "/builtin-templates";
const AUTHORING = `${PROJ}/.authoring-backlog`;

/** A bundle.yml with a leading comment + a known key order (NO payload key — the old-bundle.yml shape). */
function bundleYmlFor(id: string): string {
  return [
    `# bundle ${id} — payload references are edited via \`wpm bundle ${id} files …\``,
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
 * `bundles/a/payload/files/`. `opts.aYml` overrides `a`'s bundle.yml (e.g. to pre-register references).
 */
function seed(opts: { placed?: string[]; aYml?: string } = {}): {
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
    fs.write(`${PROJ}/bundles/a/payload/files/${rel}`, `content of ${rel}\n`);
  }
  fs.makeDirectories(`${PROJ}/installer-skills`);
  // Every mutation rides the ⑤ MATERIALISE beat (which lists the authoring backlog), so it must be initialised
  // even though the files family materialises NO task — exactly as `wpm init` creates `.authoring-backlog`.
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

/** The parsed `payload.files` list of `<id>`'s bundle.yml on disk. */
function payloadFilesOf(fs: MemoryFileSystem, id: string): readonly string[] {
  const parsed = parseBundleManifest(parseYaml(fs.read(`${PROJ}/bundles/${id}/bundle.yml`)));
  if (!parsed.ok) throw new Error(`bundle ${id} did not parse`);
  return parsed.value.payload.files;
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> files add (task-65 — a MUTATION; structure-not-content)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> files add (task-65)", () => {
  it("AC#1 — registers an existing path; NO file content written; comment + key order preserved; exit 0", async () => {
    const { fs, backlog } = seed({ placed: ["agents.md"] });
    const fileBefore = fs.read(`${PROJ}/bundles/a/payload/files/agents.md`);
    const i = io();
    expect(
      await run(["bundle", "a", "files", "add", "agents.md", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(payloadFilesOf(fs, "a")).toEqual(["agents.md"]);
    // structure-not-content: the placed file's bytes are unchanged.
    expect(fs.read(`${PROJ}/bundles/a/payload/files/agents.md`)).toBe(fileBefore);
    const text = fs.read(`${PROJ}/bundles/a/bundle.yml`);
    expect(text).toContain("# bundle a —"); // comment survived
    const keyOrder = text
      .split("\n")
      .map((l) => l.match(/^([a-z_]+):/)?.[1])
      .filter((k): k is string => k !== undefined);
    expect(keyOrder).toEqual(["id", "version", "summary", "confirmation", "requires", "payload"]);
  });

  it("AC#1 — adding the same path twice is set-like (no duplicate entry)", async () => {
    const { fs, backlog } = seed({ placed: ["agents.md"] });
    const d = (): CliDeps => deps(fs, backlog);
    expect(await run(["bundle", "a", "files", "add", "agents.md", "-C", PROJ], d(), io())).toBe(0);
    expect(await run(["bundle", "a", "files", "add", "agents.md", "-C", PROJ], d(), io())).toBe(0);
    expect(payloadFilesOf(fs, "a")).toEqual(["agents.md"]); // not duplicated
  });

  it("AC#1 — a nested path registers and lists in registration order", async () => {
    const { fs, backlog } = seed({ placed: ["agents.md", "sub/x.json"] });
    const d = (): CliDeps => deps(fs, backlog);
    expect(await run(["bundle", "a", "files", "add", "agents.md", "-C", PROJ], d(), io())).toBe(0);
    expect(await run(["bundle", "a", "files", "add", "sub/x.json", "-C", PROJ], d(), io())).toBe(0);
    expect(payloadFilesOf(fs, "a")).toEqual(["agents.md", "sub/x.json"]);
  });

  it("AC#2 — registering a path NOT on disk fails (exit 1), registering nothing", async () => {
    const { fs, backlog } = seed(); // no files placed
    const before = fs.read(`${PROJ}/bundles/a/bundle.yml`);
    const i = io();
    expect(
      await run(["bundle", "a", "files", "add", "ghost.md", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(1);
    expect(i.err.text).toContain("ghost.md"); // names the missing path
    expect(fs.read(`${PROJ}/bundles/a/bundle.yml`)).toBe(before); // nothing registered (byte-identical)
  });

  it("AC#3 — outside any project, exits 1 naming manifest.yml and suggesting init", async () => {
    const { fs, backlog } = seed({ placed: ["agents.md"] });
    const i = io();
    expect(
      await run(["bundle", "a", "files", "add", "agents.md"], deps(fs, backlog, "/nowhere"), i),
    ).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
    expect(i.err.text).toContain("init");
  });

  it("AC#3 — the path completes from files present under payload/files", async () => {
    const { fs, backlog } = seed({ placed: ["agents.md", "sub/x.json"] });
    const i = io();
    expect(
      await run(["__complete", "bundle", "a", "files", "add", ""], deps(fs, backlog, PROJ), i),
    ).toBe(0);
    const suggestions = i.out.text.split("\n").filter(Boolean).sort();
    expect(suggestions).toEqual(["agents.md", "sub/x.json"]);
  });

  it("AC#4 — help is substantive (usage, the path positional, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "files", "add", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<path>");
    expect(help).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> files list (task-66 — a READ)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> files list (task-66)", () => {
  it("AC#1/#2 — enumerates registered files one per line, read-only, exit 0", async () => {
    const { fs, backlog } = seed({
      aYml: "# bundle a comment\nid: a\nversion: 0.1.0\nsummary: bundle a\nconfirmation: safe\nrequires: {}\npayload:\n  files:\n    - agents.md\n    - sub/x.json\n",
    });
    const manifestBefore = fs.read(`${PROJ}/manifest.yml`);
    const aBefore = fs.read(`${PROJ}/bundles/a/bundle.yml`);
    const i = io();
    expect(await run(["bundle", "a", "files", "list", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text).toBe("agents.md\nsub/x.json\n");
    // read-only — nothing on disk changed:
    expect(fs.read(`${PROJ}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.read(`${PROJ}/bundles/a/bundle.yml`)).toBe(aBefore);
  });

  it("AC#1 — an empty/absent payload prints a clear marker, exit 0", async () => {
    const { fs, backlog } = seed(); // a's bundle.yml has NO payload key
    const i = io();
    expect(await run(["bundle", "a", "files", "list", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text).toBe("(no files)\n");
  });

  it("AC#3 — outside any project, exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "files", "list"], deps(fs, backlog, "/nowhere"), i)).toBe(1);
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
    expect(await run(["bundle", "a", "files", "list", "--help"], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text).toMatch(/Usage:/);
    expect(i.out.text).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> files remove (task-67 — a MUTATION; deregister-not-delete)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> files remove (task-67)", () => {
  /** A bundle.yml pre-registering agents.md + sub/x.json. */
  const A_YML_WITH_REFS =
    "# bundle a comment\nid: a\nversion: 0.1.0\nsummary: bundle a\nconfirmation: safe\nrequires: {}\npayload:\n  files:\n    - agents.md\n    - sub/x.json\n";

  it("AC#1 — deregisters the entry AND prints it was left at payload/files/<path>; exit 0", async () => {
    const { fs, backlog } = seed({ placed: ["agents.md", "sub/x.json"], aYml: A_YML_WITH_REFS });
    const i = io();
    expect(
      await run(["bundle", "a", "files", "remove", "agents.md", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(payloadFilesOf(fs, "a")).toEqual(["sub/x.json"]); // agents.md gone, the other kept
    expect(i.out.text).toContain("left at payload/files/agents.md"); // doc-10:167 message
  });

  it("AC#2 — the file content is LEFT on disk (deregister, not delete)", async () => {
    const { fs, backlog } = seed({ placed: ["agents.md", "sub/x.json"], aYml: A_YML_WITH_REFS });
    const contentBefore = fs.read(`${PROJ}/bundles/a/payload/files/agents.md`);
    expect(
      await run(
        ["bundle", "a", "files", "remove", "agents.md", "-C", PROJ],
        deps(fs, backlog),
        io(),
      ),
    ).toBe(0);
    // the file is still on disk with its content unchanged:
    expect(fs.exists(`${PROJ}/bundles/a/payload/files/agents.md`)).toBe(true);
    expect(fs.read(`${PROJ}/bundles/a/payload/files/agents.md`)).toBe(contentBefore);
  });

  it("AC#3 — deregistering a path NOT registered fails with NotFound (exit 1), nothing changed", async () => {
    const { fs, backlog } = seed({ placed: ["agents.md"], aYml: A_YML_WITH_REFS });
    const before = fs.read(`${PROJ}/bundles/a/bundle.yml`);
    const i = io();
    expect(
      await run(
        ["bundle", "a", "files", "remove", "not-there.md", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(1);
    expect(i.err.text).toContain("not-there.md");
    expect(fs.read(`${PROJ}/bundles/a/bundle.yml`)).toBe(before); // unchanged
  });

  it("AC#4 — outside any project, exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed({ aYml: A_YML_WITH_REFS });
    const i = io();
    expect(
      await run(["bundle", "a", "files", "remove", "agents.md"], deps(fs, backlog, "/nowhere"), i),
    ).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#4 — the path completes from the REGISTERED payload files", async () => {
    const { fs, backlog } = seed({ aYml: A_YML_WITH_REFS });
    const i = io();
    expect(
      await run(["__complete", "bundle", "a", "files", "remove", ""], deps(fs, backlog, PROJ), i),
    ).toBe(0);
    const suggestions = i.out.text.split("\n").filter(Boolean).sort();
    expect(suggestions).toEqual(["agents.md", "sub/x.json"]); // the registered refs, not the on-disk set
  });

  it("AC#5 — help is substantive (usage, the path positional, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "files", "remove", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<path>");
    expect(help).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// end-to-end author workflow (add → list → remove → list) + rerender
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> files — end-to-end author workflow", () => {
  it("add → list shows it → remove → list gone; the file stays on disk; comment survives", async () => {
    const { fs, backlog } = seed({ placed: ["agents.md"] });
    const d = (): CliDeps => deps(fs, backlog);

    expect(await run(["bundle", "a", "files", "add", "agents.md", "-C", PROJ], d(), io())).toBe(0);
    let i = io();
    expect(await run(["bundle", "a", "files", "list", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text).toBe("agents.md\n");

    expect(await run(["bundle", "a", "files", "remove", "agents.md", "-C", PROJ], d(), io())).toBe(
      0,
    );
    i = io();
    expect(await run(["bundle", "a", "files", "list", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text).toBe("(no files)\n");

    // the file is still on disk (deregister-not-delete) and the author's comment survived every write:
    expect(fs.exists(`${PROJ}/bundles/a/payload/files/agents.md`)).toBe(true);
    expect(fs.read(`${PROJ}/bundles/a/bundle.yml`)).toContain("# bundle a —");
  });

  it("rerender — after add, the front-door is re-rendered (it exists)", async () => {
    const { fs, backlog } = seed({ placed: ["agents.md"] });
    expect(
      await run(["bundle", "a", "files", "add", "agents.md", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    expect(fs.exists(`${PROJ}/AGENTS.md`)).toBe(true);
  });

  it("the files group help lists the add/list/remove subcommands", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "files", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("add");
    expect(help).toContain("list");
    expect(help).toContain("remove");
  });
});
