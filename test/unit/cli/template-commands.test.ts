import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { buildProgram, type CliDeps, run } from "../../../src/cli.js";
import { completeArgv } from "../../../src/completion/complete.js";
import { defaultRegistry } from "../../../src/completion/registry.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";

/**
 * Acceptance tests for the `template` command family (tasks 35 `template list` + 36 `template show`), driven
 * through the public `run()` API in-process (no child process) over in-memory ports. The template roots are
 * just directories seeded into a `MemoryFileSystem` (built-in `/builtin` + a project at `/proj` with its own
 * `templates/`), so the assertions are pure + deterministic. Both commands are READ-only: a "no change on
 * disk" assertion (the file set is unchanged) proves it. Mirrors `cli.acceptance.test.ts`'s harness.
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

/**
 * Seed a MemoryFileSystem with a built-in template root and a project (`/proj`) whose `templates/` shadows one
 * built-in (`project/single-bundle`) and adds a bundle template (`bundle/adopts-tool`). A `name-clash` template
 * exists at BOTH project scopes (project + bundle) to exercise `template show`'s `--scope` disambiguation.
 */
function seed(): MemoryFileSystem {
  const fs = new MemoryFileSystem();

  // Built-ins:
  fs.write(
    `${BUILTIN}/project/minimal/template.yml`,
    [
      "name: minimal",
      "scope: project",
      "description: A minimal bundle-project root.",
      "parameters:",
      "  - name: project-name",
      "    description: The project's name (kebab-case).",
      "",
    ].join("\n"),
  );
  fs.write(
    `${BUILTIN}/project/minimal/files/manifest.yml.tmpl`,
    "project:\n  name: {{project-name}}\n",
  );
  fs.write(`${BUILTIN}/project/minimal/files/AGENTS.md.tmpl`, "# {{project-name}}\n");
  fs.write(
    `${BUILTIN}/project/single-bundle/template.yml`,
    "name: single-bundle\nscope: project\n",
  );
  fs.write(`${BUILTIN}/bundle/default/template.yml`, "name: default\nscope: bundle\n");

  // Project at /proj with a manifest + project-local templates/:
  fs.write(
    `${PROJ}/wip/manifest.yml`,
    "project:\n  name: demo\n  version: 1.0.0\ntargets: []\nbundles: []\n",
  );
  // shadows the built-in project/single-bundle, with a distinguishing description:
  fs.write(
    `${PROJ}/wip/templates/project/single-bundle/template.yml`,
    "name: single-bundle\nscope: project\ndescription: PROJECT-LOCAL single-bundle.\n",
  );
  fs.write(
    `${PROJ}/wip/templates/project/single-bundle/files/manifest.yml.tmpl`,
    "project:\n  name: x\n",
  );
  // a project-only bundle template:
  fs.write(
    `${PROJ}/wip/templates/bundle/adopts-tool/template.yml`,
    "name: adopts-tool\nscope: bundle\n",
  );
  // a name that exists at BOTH project + bundle scope (for `show --scope` disambiguation):
  fs.write(`${PROJ}/wip/templates/project/clash/template.yml`, "name: clash\nscope: project\n");
  fs.write(`${PROJ}/wip/templates/bundle/clash/template.yml`, "name: clash\nscope: bundle\n");

  return fs;
}

/** Deps with the project's cwd outside /proj (so `-C /proj` is what selects the project). */
function deps(fs: MemoryFileSystem, cwd = "/elsewhere"): CliDeps {
  return {
    fs,
    backlog: new FakeBacklog(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new FakeEnvironment({ cwd }),
    builtinTemplatesRoot: BUILTIN,
  };
}

/** A snapshot of every file path + content in the MemoryFileSystem (to prove read-only). */
function snapshot(fs: MemoryFileSystem, roots: string[]): string {
  const out: string[] = [];
  const walk = (dir: string): void => {
    if (!fs.exists(dir)) return;
    for (const entry of fs.list(dir)) {
      const child = `${dir}/${entry.name}`;
      if (entry.kind === "directory") walk(child);
      else out.push(`${child}=${fs.read(child)}`);
    }
  };
  for (const r of roots) walk(r);
  return out.sort().join("\n");
}

describe("template list (task-35)", () => {
  it("AC#1 — inside a project, lists BOTH project-local templates and built-ins; exit 0", async () => {
    const fs = seed();
    const i = io();
    expect(await run(["template", "list", "-C", PROJ], deps(fs), i)).toBe(0);
    const out = i.out.text;
    // built-ins:
    expect(out).toContain("minimal");
    expect(out).toContain("default");
    // project-local:
    expect(out).toContain("adopts-tool");
    expect(out).toContain("single-bundle");
  });

  it("AC#1 — OUTSIDE any project, lists built-ins ONLY (no project group); exit 0", async () => {
    const fs = seed();
    const i = io();
    // cwd /elsewhere has no manifest; no -C → no project resolves.
    expect(await run(["template", "list"], deps(fs), i)).toBe(0);
    const out = i.out.text;
    expect(out).toContain("minimal");
    expect(out).toContain("default");
    // the project-only template must NOT appear:
    expect(out).not.toContain("adopts-tool");
  });

  it("AC#2 — a project-local template sharing a name with a built-in is shown shadowing it", async () => {
    const fs = seed();
    const i = io();
    expect(await run(["template", "list", "-C", PROJ], deps(fs), i)).toBe(0);
    const out = i.out.text.toLowerCase();
    // `single-bundle` exists in both → the output marks the shadowing relationship:
    expect(out).toContain("shadow");
  });

  it("AC#3 — --scope bundle filters to bundle templates only", async () => {
    const fs = seed();
    const i = io();
    expect(await run(["template", "list", "--scope", "bundle", "-C", PROJ], deps(fs), i)).toBe(0);
    const out = i.out.text;
    expect(out).toContain("default"); // bundle
    expect(out).toContain("adopts-tool"); // bundle
    expect(out).not.toContain("minimal"); // project — filtered out
  });

  it("AC#3 — --scope project filters to project templates only", async () => {
    const fs = seed();
    const i = io();
    expect(await run(["template", "list", "--scope", "project", "-C", PROJ], deps(fs), i)).toBe(0);
    const out = i.out.text;
    expect(out).toContain("minimal"); // project
    expect(out).not.toContain("default"); // bundle — filtered out
    expect(out).not.toContain("adopts-tool"); // bundle — filtered out
  });

  it("a bad --scope value is a usage error (exit 2)", async () => {
    const fs = seed();
    expect(await run(["template", "list", "--scope", "nonsense", "-C", PROJ], deps(fs), io())).toBe(
      2,
    );
  });

  it("AC#4 — read-only: nothing changes on disk; exit 0", async () => {
    const fs = seed();
    const before = snapshot(fs, [BUILTIN, PROJ]);
    expect(await run(["template", "list", "-C", PROJ], deps(fs), io())).toBe(0);
    expect(snapshot(fs, [BUILTIN, PROJ])).toBe(before);
  });

  it("AC#5 — help is substantive: description, usage, --scope, an example", async () => {
    const fs = seed();
    const i = io();
    expect(await run(["template", "list", "--help"], deps(fs), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help.toLowerCase()).toContain("template");
    expect(help).toContain("--scope");
    expect(help).toContain("Example:");
  });
});

describe("template show (task-36)", () => {
  it("AC#1 — prints metadata (incl. the template description) + the files tree; exit 0", async () => {
    const fs = seed();
    const i = io();
    expect(await run(["template", "show", "minimal", "-C", PROJ], deps(fs), i)).toBe(0);
    const out = i.out.text;
    expect(out).toContain("minimal"); // name
    expect(out.toLowerCase()).toContain("project"); // scope
    // the top-level template description (doc-10 "print metadata"):
    expect(out).toContain("Description:");
    expect(out).toContain("A minimal bundle-project root.");
    expect(out).toContain("project-name"); // the declared parameter
    expect(out).toContain("manifest.yml.tmpl"); // a files/ path (the tree summary)
  });

  it("AC#1 — a template WITHOUT a description shows cleanly (no `Description:` line, no crash); exit 0", async () => {
    const fs = seed(); // the `default` bundle fixture has no top-level description
    const i = io();
    expect(await run(["template", "show", "default", "-C", PROJ], deps(fs), i)).toBe(0);
    const out = i.out.text;
    expect(out).toContain("default"); // name
    expect(out).not.toContain("Description:"); // no empty description line
  });

  it("AC#1 — resolves the PROJECT-local template over the built-in of the same name", async () => {
    const fs = seed();
    const i = io();
    expect(await run(["template", "show", "single-bundle", "-C", PROJ], deps(fs), i)).toBe(0);
    // `single-bundle` exists in BOTH roots; project-local priority means the shown source is project-local,
    // and its files come from the project fixture (which ships a manifest.yml.tmpl the built-in fixture lacks):
    expect(i.out.text).toContain("project-local");
    expect(i.out.text).toContain("manifest.yml.tmpl");
  });

  it("AC#2 — --scope disambiguates a name that exists at both project and bundle scope", async () => {
    const fs = seed();
    // Without --scope, `clash` exists at both scopes → a usage error asking to disambiguate (exit 2):
    expect(await run(["template", "show", "clash", "-C", PROJ], deps(fs), io())).toBe(2);
    // With --scope, each resolves the right one (exit 0):
    const ip = io();
    expect(
      await run(["template", "show", "clash", "--scope", "project", "-C", PROJ], deps(fs), ip),
    ).toBe(0);
    expect(ip.out.text.toLowerCase()).toContain("project");
    const ib = io();
    expect(
      await run(["template", "show", "clash", "--scope", "bundle", "-C", PROJ], deps(fs), ib),
    ).toBe(0);
    expect(ib.out.text.toLowerCase()).toContain("bundle");
  });

  it("AC#3 — a name matching nothing → NotFoundError, exit 1, clean message", async () => {
    const fs = seed();
    const i = io();
    const code = await run(["template", "show", "does-not-exist", "-C", PROJ], deps(fs), i);
    expect(code).toBe(1);
    expect(i.err.text).toMatch(/^error: /);
    expect(i.err.text).not.toContain("at "); // no stack for a domain error
  });

  it("AC#4 — read-only: nothing changes on disk; exit 0 on a hit", async () => {
    const fs = seed();
    const before = snapshot(fs, [BUILTIN, PROJ]);
    expect(await run(["template", "show", "minimal", "-C", PROJ], deps(fs), io())).toBe(0);
    expect(snapshot(fs, [BUILTIN, PROJ])).toBe(before);
  });

  it("AC#5 — help is substantive: description, usage, <name>, --scope, an example", async () => {
    const fs = seed();
    const i = io();
    expect(await run(["template", "show", "--help"], deps(fs), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<name>");
    expect(help).toContain("--scope");
    expect(help).toContain("Example:");
  });

  it("an explicit --scope that does NOT match the name → NotFoundError, exit 1", async () => {
    const fs = seed();
    // `minimal` is a PROJECT template; asking for it as a bundle template finds nothing:
    expect(
      await run(["template", "show", "minimal", "--scope", "bundle", "-C", PROJ], deps(fs), io()),
    ).toBe(1);
  });
});

describe("template completion (task-35/36 AC#5 — the completion half)", () => {
  // The CLI's COMPLETION_SPECS aren't exported; re-declare the template specs here for the dispatch — they must
  // match `src/cli.ts` exactly. (`template-scopes` + `template-names` are the existing task-29 sources.)
  const SPECS = {
    "template list": { options: { "--scope": "template-scopes" } },
    "template show": { options: { "--scope": "template-scopes" }, args: ["template-names"] },
  };

  function complete(fs: MemoryFileSystem, words: string[]): string[] {
    const d = deps(fs, PROJ); // cwd = /proj so state-dependent sources resolve the project
    return completeArgv(buildProgram(d, io()), words, {
      fs: d.fs,
      env: d.env,
      builtinTemplatesRoot: d.builtinTemplatesRoot,
      registry: defaultRegistry(),
      specs: SPECS,
    });
  }

  it("AC#5 — `template list --scope <tab>` completes to [project, bundle]", () => {
    expect(complete(seed(), ["template", "list", "--scope", ""])).toEqual(["project", "bundle"]);
  });

  it("AC#5 — `template show --scope <tab>` completes to [project, bundle]", () => {
    expect(complete(seed(), ["template", "show", "--scope", ""])).toEqual(["project", "bundle"]);
  });

  it("AC#5 — `template show <tab>` (the positional) completes from the available template names", () => {
    // The minimal-project fixture seeds project/minimal etc.; the names come from template-names.
    const names = complete(seed(), ["template", "show", ""]).sort();
    // built-in + project template names (de-duplicated by the source); a representative subset:
    expect(names).toEqual(expect.arrayContaining(["minimal", "default", "adopts-tool"]));
  });
});
