import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { type CliDeps, run } from "../../../src/cli.js";
import { parseManifest } from "../../../src/core/services/schema/index.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";
import { parseYaml } from "../../../src/util/yaml.js";

/**
 * Acceptance tests for `project meta` (task-38) — the project-BOUND command that edits `manifest.yml`'s `project:`
 * descriptive metadata (`--name`/`--description`/`--license`/`--repository`/`--author`). Driven through `run()`
 * in-process over in-memory ports against a realistic project at `/proj` whose `manifest.yml` carries a LEADING
 * COMMENT, a known `project:` key order, and the optional fields PARTIALLY present (name + version + description,
 * but NO license/repository/author) — so both "update an existing field" and "introduce an absent field" are
 * covered. The project template snippets (AGENTS.md + the `{{project-name}}-installer` SKILL.md) are seeded so the
 * ④ RERENDER on `--name` resolves. Mirrors `version-commands.test.ts` / `bundle-version-commands.test.ts`.
 */

const PROJ = "/proj";
const BUILTIN = "/builtin-templates";
const AUTHORING = `${PROJ}/.authoring-backlog`;

/** `manifest.yml` with a leading comment + a known `project:` key order + partial optionals (no license/repo/author). */
const MANIFEST_YML = [
  "# demo project — metadata edited via `wpm project meta`",
  "project:",
  "  name: demo",
  "  version: 1.0.0",
  "  description: the original description",
  "targets:",
  "  - claude-code",
  "bundles: []",
  "",
].join("\n");

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

/** Seed a project at /proj with the commented manifest, the authoring backlog, and the template snippets. */
function seed(manifest = MANIFEST_YML): { fs: MemoryFileSystem; backlog: FakeBacklog } {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();
  fs.write(`${PROJ}/manifest.yml`, manifest);
  fs.makeDirectories(`${PROJ}/installer-skills`);
  backlog.init(AUTHORING, { taskPrefix: "authoring" });

  // The front-door + orchestrator snippets the ④ RERENDER renders (project-name feeds both).
  fs.write(`${BUILTIN}/project/minimal/template.yml`, "name: minimal\nscope: project\n");
  fs.write(`${BUILTIN}/project/minimal/snippets/AGENTS.md`, "# {{project-name}}\n\n{{bundles}}\n");
  fs.write(
    `${BUILTIN}/project/minimal/snippets/installer-skills/{{project-name}}-installer/SKILL.md`,
    "---\nname: {{project-name}}-installer\n---\nInstall {{project-name}}.\n",
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

/** The parsed `manifest.yml` on disk (throws if it does not parse). */
function manifestMeta(fs: MemoryFileSystem) {
  const parsed = parseManifest(parseYaml(fs.read(`${PROJ}/manifest.yml`)));
  if (!parsed.ok) throw new Error(`manifest did not parse: ${parsed.problem.message}`);
  return parsed.value.meta;
}

/** The ordered `project:` sub-keys of the manifest on disk (for key-order preservation assertions). */
function projectKeyOrder(text: string): string[] {
  const out: string[] = [];
  let inProject = false;
  for (const line of text.split("\n")) {
    if (/^project:/.test(line)) {
      inProject = true;
      continue;
    }
    if (inProject) {
      const m = line.match(/^ {2}([a-z_]+):/);
      if (m?.[1] !== undefined) {
        out.push(m[1]);
      } else if (/^\S/.test(line)) {
        break; // left the project: block
      }
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// AC38#1 — each provided flag updates its field; omitted untouched
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("project meta — AC38#1 (each flag updates its field; omitted untouched)", () => {
  it.each([
    ["--name", "name", "renamed-installer"],
    ["--description", "description", "a brand new description"],
    ["--license", "license", "MIT"],
    ["--repository", "repository", "https://example.com/repo"],
    ["--author", "author", "Jane Q. Author"],
  ])("`project meta %s <value>` sets project.%s and leaves the others", async (flag, field, value) => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "meta", flag, value, "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    const meta = manifestMeta(fs);
    // the targeted field is the new value:
    expect((meta as unknown as Record<string, unknown>)[field]).toBe(value);
    // name + version (the always-present fields) survive unless they were the target:
    if (field !== "name") expect(meta.name).toBe("demo");
    expect(meta.version).toBe("1.0.0"); // version is never touched by `project meta`
  });

  it("omitted fields are byte-untouched — only --description changes (name/version/comment intact)", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/manifest.yml`);
    expect(
      await run(
        ["project", "meta", "--description", "new desc", "-C", PROJ],
        deps(fs, backlog),
        io(),
      ),
    ).toBe(0);
    const after = fs.read(`${PROJ}/manifest.yml`);
    const meta = manifestMeta(fs);
    expect(meta.description).toBe("new desc");
    expect(meta.name).toBe("demo"); // untouched
    expect(meta.version).toBe("1.0.0"); // untouched
    // the only changed line mentions the description; name/version lines are byte-identical.
    expect(after).toContain("name: demo");
    expect(after).toContain("version: 1.0.0");
    expect(before).not.toBe(after); // it DID change (the description)
  });

  it("a multi-flag call updates ALL the named fields and leaves the rest", async () => {
    const { fs, backlog } = seed();
    expect(
      await run(
        ["project", "meta", "--name", "acme", "--license", "Apache-2.0", "-C", PROJ],
        deps(fs, backlog),
        io(),
      ),
    ).toBe(0);
    const meta = manifestMeta(fs);
    expect(meta.name).toBe("acme");
    expect(meta.license).toBe("Apache-2.0");
    expect(meta.description).toBe("the original description"); // untouched
    expect(meta.version).toBe("1.0.0"); // untouched
  });

  it("introduces an ABSENT optional field (author) comment-preservingly", async () => {
    const { fs, backlog } = seed();
    // the seed has NO author.
    expect(manifestMeta(fs).author).toBeUndefined();
    expect(
      await run(["project", "meta", "--author", "Jane", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    expect(manifestMeta(fs).author).toBe("Jane");
    // the leading comment + the pre-existing fields survive the introduction:
    const text = fs.read(`${PROJ}/manifest.yml`);
    expect(text).toContain("# demo project —");
    expect(text).toContain("description: the original description");
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// AC38#2 — comment + key order preserved
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("project meta — AC38#2 (comment + key order preserved)", () => {
  it("the leading comment AND the project: key order survive an edit", async () => {
    const { fs, backlog } = seed();
    const orderBefore = projectKeyOrder(fs.read(`${PROJ}/manifest.yml`));
    expect(orderBefore).toEqual(["name", "version", "description"]);

    expect(
      await run(
        ["project", "meta", "--description", "edited", "-C", PROJ],
        deps(fs, backlog),
        io(),
      ),
    ).toBe(0);

    const text = fs.read(`${PROJ}/manifest.yml`);
    expect(text).toContain("# demo project — metadata edited via `wpm project meta`");
    expect(projectKeyOrder(text)).toEqual(orderBefore); // key order is stable across the edit
    expect(text).toMatch(/description:\s*edited/);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// AC38#3 — no-flag no-op
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("project meta — AC38#3 (no-flag no-op)", () => {
  it("with NO flags, makes no change, reports nothing updated, exits 0 — and does NOT enter the lifecycle", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/manifest.yml`);
    const i = io();
    expect(await run(["project", "meta", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text).toMatch(/nothing to update/);
    // the manifest is BYTE-IDENTICAL:
    expect(fs.read(`${PROJ}/manifest.yml`)).toBe(before);
    // the harness was NEVER entered — so ④ RERENDER did not run and AGENTS.md was NOT written (the seed has none).
    expect(fs.exists(`${PROJ}/AGENTS.md`)).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// AC38#4 — outside-project + -C honoured
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("project meta — AC38#4 (outside-project + -C)", () => {
  it("outside any project, exits 1 with ONE message naming manifest.yml and suggesting init", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "meta", "--name", "x"], deps(fs, backlog, "/nowhere"), i)).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
    expect(i.err.text).toContain("init");
  });

  it("a -C path is honoured (resolves the project elsewhere) — the name is updated", async () => {
    const { fs, backlog } = seed();
    // cwd is /nowhere; -C points at /proj.
    expect(
      await run(
        ["project", "meta", "--name", "via-flag", "-C", PROJ],
        deps(fs, backlog, "/nowhere"),
        io(),
      ),
    ).toBe(0);
    expect(manifestMeta(fs).name).toBe("via-flag");
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// AC38#5 — help
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("project meta — AC38#5 (help)", () => {
  it("help is substantive: Usage, every flag with its effect, an example; exit 0", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "meta", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    // every flag is documented:
    expect(help).toContain("--name");
    expect(help).toContain("--description");
    expect(help).toContain("--license");
    expect(help).toContain("--repository");
    expect(help).toContain("--author");
    expect(help).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// the ④ RERENDER on --name
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("project meta — the ④ RERENDER on --name (doc-10:34)", () => {
  it("a --name change re-renders AGENTS.md (with the new name) + the installer skill at the name-derived path", async () => {
    const { fs, backlog } = seed();
    expect(
      await run(["project", "meta", "--name", "renamed", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    // the front-door re-rendered with the new name:
    expect(fs.exists(`${PROJ}/AGENTS.md`)).toBe(true);
    expect(fs.read(`${PROJ}/AGENTS.md`)).toContain("renamed");
    // the orchestrator snippet path carries {{project-name}} → the installer SKILL.md is at the NEW name's path:
    expect(fs.exists(`${PROJ}/installer-skills/renamed-installer/SKILL.md`)).toBe(true);
  });

  it("a --description-only edit still re-renders, but AGENTS.md keeps the ORIGINAL name", async () => {
    const { fs, backlog } = seed();
    expect(
      await run(["project", "meta", "--description", "d", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    expect(fs.exists(`${PROJ}/AGENTS.md`)).toBe(true);
    expect(fs.read(`${PROJ}/AGENTS.md`)).toContain("demo"); // the name was not changed
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// end-to-end author workflow (meta → show reflects it)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("project meta — end-to-end (meta → project show reflects each edit)", () => {
  it("successive edits are reflected by `project show`; the leading comment survives every write", async () => {
    const { fs, backlog } = seed();
    const d = (): CliDeps => deps(fs, backlog);

    expect(await run(["project", "meta", "--name", "alpha", "-C", PROJ], d(), io())).toBe(0);
    let i = io();
    expect(await run(["project", "show", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text).toContain("name:        alpha");

    expect(
      await run(["project", "meta", "--description", "beta desc", "-C", PROJ], d(), io()),
    ).toBe(0);
    i = io();
    expect(await run(["project", "show", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text).toContain("name:        alpha"); // still alpha
    expect(i.out.text).toContain("description: beta desc"); // and the new description

    // the author's hand-written comment survived every write:
    expect(fs.read(`${PROJ}/manifest.yml`)).toContain("# demo project —");
  });
});
