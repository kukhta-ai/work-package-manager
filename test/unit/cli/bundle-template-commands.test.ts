import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { buildProgram, type CliDeps, COMPLETION_SPECS, run } from "../../../src/cli.js";
import { completeArgv } from "../../../src/completion/complete.js";
import { defaultRegistry } from "../../../src/completion/registry.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";

/**
 * Acceptance tests for the `bundle template` fixed subgroup — `bundle template show` (task-55, read-only) and
 * `bundle template set <name>` (task-56, mutation), driven through `run()` in-process over in-memory ports. The
 * subgroup operates on the project's DEFAULT bundle SCAFFOLD at `bundles/bundle-template/` (distinct from the
 * top-level `wpm template` registry group). The fixture seeds a built-in `bundle/default` template (a `template.yml`
 * + a `files/` tree) so `set default` has files to copy, plus a `project/minimal` template to prove a
 * project-scope name is rejected as a bundle template (AC56#2 wrong-scope).
 */

const BUILTIN = "/builtin";
const PROJ = "/proj";

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

/** Seed a MemoryFileSystem with a project at /proj and built-in templates (a bundle `default` + a project `minimal`). */
function seed(): MemoryFileSystem {
  const fs = new MemoryFileSystem();

  fs.write(
    `${PROJ}/manifest.yml`,
    "project:\n  name: demo\n  version: 1.0.0\ntargets: []\nbundles: []\n",
  );

  // A built-in BUNDLE template `default` with a descriptor + a files/ tree (the content `set` copies verbatim).
  fs.write(
    `${BUILTIN}/bundle/default/template.yml`,
    [
      "name: default",
      "scope: bundle",
      "description: The default bundle scaffold.",
      "parameters:",
      "  - name: bundle-id",
      "    description: The bundle's id.",
      "",
    ].join("\n"),
  );
  fs.write(`${BUILTIN}/bundle/default/files/AGENTS.md.tmpl`, "# {{bundle-id}}\n");
  fs.write(
    `${BUILTIN}/bundle/default/files/install-backlog/config.yml.tmpl`,
    'task_prefix: "{{bundle-id}}"\n',
  );
  fs.write(`${BUILTIN}/bundle/default/files/payload/files/.keep`, "");

  // A built-in PROJECT template `minimal` (for the wrong-scope rejection — it is NOT a bundle template).
  fs.write(`${BUILTIN}/project/minimal/template.yml`, "name: minimal\nscope: project\n");
  fs.write(`${BUILTIN}/project/minimal/files/manifest.yml.tmpl`, "project:\n  name: x\n");

  return fs;
}

function deps(fs: MemoryFileSystem, cwd = "/elsewhere"): CliDeps {
  return {
    fs,
    backlog: new FakeBacklog(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new FakeEnvironment({ cwd }),
    builtinTemplatesRoot: BUILTIN,
  };
}

function complete(fs: MemoryFileSystem, words: readonly string[]): readonly string[] {
  const d = deps(fs, PROJ);
  return completeArgv(buildProgram(d, io()), words, {
    fs: d.fs,
    env: d.env,
    builtinTemplatesRoot: d.builtinTemplatesRoot,
    registry: defaultRegistry(),
    specs: COMPLETION_SPECS,
  });
}

/** The relative file paths present under bundles/bundle-template/ in the project. */
function scaffoldFiles(fs: MemoryFileSystem): string[] {
  const base = `${PROJ}/bundles/bundle-template`;
  const out: string[] = [];
  const walk = (dir: string): void => {
    if (!fs.exists(dir)) return;
    for (const e of fs.list(dir)) {
      const child = `${dir}/${e.name}`;
      if (e.kind === "directory") walk(child);
      else out.push(child.slice(base.length + 1));
    }
  };
  walk(base);
  return out.sort();
}

describe("bundle template set (task-56)", () => {
  it("AC#1 — `set default` populates bundles/bundle-template/ from the template's files tree (verbatim, exit 0)", async () => {
    const fs = seed();
    const i = io();
    expect(await run(["bundle", "template", "set", "default", "-C", PROJ], deps(fs), i)).toBe(0);

    // the files/ tree landed under bundles/bundle-template/:
    expect(scaffoldFiles(fs)).toEqual([
      "AGENTS.md.tmpl",
      "install-backlog/config.yml.tmpl",
      "payload/files/.keep",
    ]);
    // verbatim copy — the {{placeholders}} are NOT substituted (the scaffold keeps them for `bundle new`):
    expect(fs.read(`${PROJ}/bundles/bundle-template/AGENTS.md.tmpl`)).toBe("# {{bundle-id}}\n");
    expect(i.out.text).toMatch(/set bundle template from "default"/);
  });

  it("AC#1 — `set` REPLACES (not merges) the existing scaffold contents", async () => {
    const fs = seed();
    // a stale file already in the scaffold that is NOT part of the template:
    fs.write(`${PROJ}/bundles/bundle-template/STALE.md`, "old\n");
    expect(await run(["bundle", "template", "set", "default", "-C", PROJ], deps(fs), io())).toBe(0);
    // the stale file is gone (clear-then-copy = a true replace):
    expect(fs.exists(`${PROJ}/bundles/bundle-template/STALE.md`)).toBe(false);
    expect(fs.exists(`${PROJ}/bundles/bundle-template/AGENTS.md.tmpl`)).toBe(true);
  });

  it("AC#2 — an UNRESOLVED name fails (exit 1) changing nothing", async () => {
    const fs = seed();
    const i = io();
    expect(await run(["bundle", "template", "set", "ghost", "-C", PROJ], deps(fs), i)).toBe(1);
    expect(i.err.text).toMatch(/not found/i);
    // nothing was written:
    expect(fs.exists(`${PROJ}/bundles/bundle-template`)).toBe(false);
  });

  it("AC#2 — a PROJECT-scope name (wrong scope) fails (exit 1) changing nothing", async () => {
    const fs = seed();
    const i = io();
    // `minimal` is a project template; resolving it as a BUNDLE template must not find it.
    expect(await run(["bundle", "template", "set", "minimal", "-C", PROJ], deps(fs), i)).toBe(1);
    expect(i.err.text).toMatch(/not found/i);
    expect(fs.exists(`${PROJ}/bundles/bundle-template`)).toBe(false);
  });

  it("AC#2 — a wrong-name does not delete an EXISTING scaffold (changes nothing on failure)", async () => {
    const fs = seed();
    // an existing scaffold:
    fs.write(`${PROJ}/bundles/bundle-template/EXISTING.md`, "keep\n");
    expect(await run(["bundle", "template", "set", "ghost", "-C", PROJ], deps(fs), io())).toBe(1);
    // the resolve fails BEFORE the clear, so the existing scaffold is intact:
    expect(fs.read(`${PROJ}/bundles/bundle-template/EXISTING.md`)).toBe("keep\n");
  });

  it("AC#3 — outside any project it exits 1 naming manifest.yml + init", async () => {
    const fs = seed();
    const i = io();
    expect(await run(["bundle", "template", "set", "default"], deps(fs, "/nowhere"), i)).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
    expect(i.err.text).toContain("init");
  });

  it("AC#3 — the name positional completes from bundle-scope templates", async () => {
    const fs = seed();
    const out = complete(fs, ["bundle", "template", "set", ""]);
    expect(out).toContain("default"); // a bundle-scope template
    expect(out).not.toContain("minimal"); // a project-scope template is excluded
  });

  it("AC#4 — help is substantive (description, usage, the name positional, an example)", async () => {
    const fs = seed();
    const i = io();
    await run(["bundle", "template", "set", "--help"], deps(fs), i);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<name>");
    expect(help).toMatch(/Example/i);
  });
});

describe("bundle template show (task-55)", () => {
  it("AC#1/#2 — after `set`, `show` prints the metadata header + a tree summary (read-only, exit 0)", async () => {
    const fs = seed();
    expect(await run(["bundle", "template", "set", "default", "-C", PROJ], deps(fs), io())).toBe(0);

    const filesBefore = scaffoldFiles(fs);
    const i = io();
    expect(await run(["bundle", "template", "show", "-C", PROJ], deps(fs), i)).toBe(0);

    const out = i.out.text;
    expect(out).toContain("Bundle template: bundles/bundle-template/");
    expect(out).toContain("Files:");
    expect(out).toContain("AGENTS.md.tmpl");
    expect(out).toContain("install-backlog/config.yml.tmpl");
    // read-only: `show` changed nothing on disk:
    expect(scaffoldFiles(fs)).toEqual(filesBefore);
  });

  it("AC#1 — when a template.yml is present in the scaffold, show prints its description + parameters", async () => {
    const fs = seed();
    // place a descriptor in the scaffold dir (an author may do this):
    fs.write(
      `${PROJ}/bundles/bundle-template/template.yml`,
      "name: custom\nscope: bundle\ndescription: My custom scaffold.\nparameters:\n  - name: bundle-id\n    description: the id\n",
    );
    fs.write(`${PROJ}/bundles/bundle-template/AGENTS.md.tmpl`, "# x\n");
    const i = io();
    expect(await run(["bundle", "template", "show", "-C", PROJ], deps(fs), i)).toBe(0);
    expect(i.out.text).toContain("Description: My custom scaffold.");
    expect(i.out.text).toContain("Parameters:");
    expect(i.out.text).toContain("bundle-id");
  });

  it("AC#2/#3 — `show` on a fresh project (no bundles/bundle-template/) exits 1 naming the dir", async () => {
    const fs = seed(); // a fresh project: init ships no bundles/
    const i = io();
    expect(await run(["bundle", "template", "show", "-C", PROJ], deps(fs), i)).toBe(1);
    expect(i.err.text).toMatch(/bundle-template/);
    // and it suggests `set` to create it:
    expect(i.err.text).toMatch(/set/);
  });

  it("AC#3 — outside any project it exits 1 naming manifest.yml", async () => {
    const fs = seed();
    const i = io();
    expect(await run(["bundle", "template", "show"], deps(fs, "/nowhere"), i)).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#4 — help is substantive (description, usage, an example)", async () => {
    const fs = seed();
    const i = io();
    await run(["bundle", "template", "show", "--help"], deps(fs), i);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toMatch(/Example/i);
  });
});
