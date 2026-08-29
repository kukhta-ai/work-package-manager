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
 * Acceptance tests for the per-bundle VERSION family — `bundle <id> version` / `version bump` / `version set`
 * (tasks 59/60/61), the bundle-`<id>` analogue of the project VERSION pattern. Driven through `run()` in-process
 * over in-memory ports, against a realistic project at `/proj` with TWO bundles where bundle `b` REQUIRES bundle
 * `a` (so bumping `a` materialises the cross-bundle requirer-constraint task for `b`). Bundle `a`'s `bundle.yml`
 * carries a leading COMMENT and a known key order so the bump/set comment+order preservation is testable. The
 * project template snippets are seeded so ④ RERENDER resolves. Mirrors `bundle-id-commands.test.ts` +
 * `version-commands.test.ts`.
 */

const PROJ = "/proj";
const BUILTIN = "/builtin-templates";
const AUTHORING = `${PROJ}/.authoring-backlog`;

/** Bundle `a`'s `bundle.yml` with a leading comment + a known key order — to test comment/order preservation. */
const A_BUNDLE_YML = [
  "# bundle a — version is bumped via `wpm bundle a version bump`",
  "id: a",
  "version: 0.1.0",
  "summary: bundle a",
  "confirmation: safe",
  "requires: {}",
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

/**
 * Seed a project at /proj. By default: bundle `a` (version 0.1.0, the commented fixture) + bundle `b` which
 * REQUIRES `a` (`requires: { a: ^0.1.0 }`). `opts.requirers=false` seeds `a` alone (no bundle requires it), to
 * test the negative case (no requirer-constraint task). `opts.aYml` overrides `a`'s bundle.yml.
 */
function seed(opts: { requirers?: boolean; aYml?: string } = {}): {
  fs: MemoryFileSystem;
  backlog: FakeBacklog;
} {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();
  const withRequirer = opts.requirers ?? true;
  const enabled = withRequirer ? ["a", "b"] : ["a"];

  fs.write(
    `${PROJ}/wip/manifest.yml`,
    `project:\n  name: demo\n  version: 1.0.0\ntargets:\n  - claude-code\nbundles:\n${enabled
      .map((b) => `  - ${b}`)
      .join("\n")}\n`,
  );
  fs.write(`${PROJ}/wip/bundles/a/bundle.yml`, opts.aYml ?? A_BUNDLE_YML);
  if (withRequirer) {
    // bundle `b` REQUIRES `a` — so bumping `a` materialises the requirer-constraint task FOR `b`.
    fs.write(
      `${PROJ}/wip/bundles/b/bundle.yml`,
      "id: b\nversion: 0.1.0\nsummary: bundle b\nconfirmation: safe\nrequires:\n  a: ^0.1.0\n",
    );
  }
  fs.makeDirectories(`${PROJ}/wip/installer-skills`);
  backlog.init(AUTHORING, { taskPrefix: "authoring" });

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

/** The parsed `bundle.yml` of `<id>` on disk. */
function bundleYml(fs: MemoryFileSystem, id: string) {
  return parseBundleManifest(parseYaml(fs.read(`${PROJ}/wip/bundles/${id}/bundle.yml`)));
}

/** The `version` field of `<id>`'s bundle.yml on disk. */
function bundleVersion(fs: MemoryFileSystem, id: string): string {
  const b = bundleYml(fs, id);
  if (!b.ok) throw new Error(`bundle ${id} did not parse`);
  return b.value.version;
}

/** The titles of the tasks the FakeBacklog holds in the authoring backlog. */
function authoringTitles(backlog: FakeBacklog): string[] {
  return backlog.listTasks(AUTHORING).map((t) => t.title);
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> version (task-59 — a READ)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> version (task-59 — a READ)", () => {
  it("AC#1/#2 — prints the bundle's bundle.yml version to stdout, read-only, exit 0", async () => {
    const { fs, backlog } = seed();
    const manifestBefore = fs.read(`${PROJ}/wip/manifest.yml`);
    const aBefore = fs.read(`${PROJ}/wip/bundles/a/bundle.yml`);
    const i = io();
    expect(await run(["bundle", "a", "version", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text.trim()).toBe("0.1.0");
    // read-only: nothing on disk changed.
    expect(fs.read(`${PROJ}/wip/manifest.yml`)).toBe(manifestBefore);
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toBe(aBefore);
  });

  it("AC#3 — outside any project, exits 1 naming manifest.yml and suggesting init", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "version"], deps(fs, backlog, "/nowhere"), i)).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
    expect(i.err.text).toContain("init");
  });

  it("AC#3 — the id position completes from enabled bundles", async () => {
    const { fs, backlog } = seed();
    // `bundle <tab>` offers the enabled ids (resolved by the per-bundle routing) ∪ the fixed verbs.
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

  it("AC#4 — help is substantive and documents the bump and set subcommands", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "version", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toMatch(/Example/i);
    // commander lists the subcommands under "Commands:" — both bump and set are documented:
    expect(help).toContain("bump");
    expect(help).toContain("set");
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> version bump (task-60 — a MUTATION + MATERIALISE)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> version bump (task-60 — a MUTATION)", () => {
  it.each([
    ["patch", "0.1.0", "0.1.1"],
    ["minor", "0.1.0", "0.2.0"],
    ["major", "0.1.0", "1.0.0"],
    ["minor", "0.0.3", "0.1.0"], // a 0.x line behaves the same
  ])("AC#1 — bump %s of %s computes %s, writes it (comment preserved), and prints it", async (level, from, expected) => {
    const { fs, backlog } = seed({
      aYml: `# bundle a comment\nid: a\nversion: ${from}\nsummary: bundle a\nconfirmation: safe\nrequires: {}\n`,
    });
    const i = io();
    expect(
      await run(["bundle", "a", "version", "bump", level, "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    // printed the NEW version (the summary line):
    expect(i.out.text).toContain(expected);
    // written to the bundle.yml on disk:
    expect(bundleVersion(fs, "a")).toBe(expected);
    // the leading comment SURVIVED (task-13 comment preservation):
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toContain("# bundle a comment");
  });

  it("AC#1 — comment AND key order are preserved across the bump", async () => {
    const { fs, backlog } = seed();
    expect(
      await run(["bundle", "a", "version", "bump", "minor", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    const text = fs.read(`${PROJ}/wip/bundles/a/bundle.yml`);
    expect(text).toContain("# bundle a — version is bumped via `wpm bundle a version bump`");
    const keyOrder = text
      .split("\n")
      .map((l) => l.match(/^([a-z_]+):/)?.[1])
      .filter((k): k is string => k !== undefined);
    expect(keyOrder).toEqual(["id", "version", "summary", "confirmation", "requires"]);
    expect(text).toContain("version: 0.2.0");
  });

  it("AC#2 — materialises the 3 per-bundle review tasks AND the cross-bundle requirer-constraint task", async () => {
    const { fs, backlog } = seed(); // b requires a
    const i = io();
    expect(
      await run(["bundle", "a", "version", "bump", "minor", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0); // 0.1.0 → 0.2.0
    const titles = authoringTitles(backlog);
    expect(titles).toContain("Review state-tasks for a at 0.2.0");
    expect(titles).toContain("Consider migration tasks for a 0.1.0→0.2.0");
    expect(titles).toContain("Simulate upgrade for a from 0.1.0 to 0.2.0");
    // the cross-bundle requirer-constraint task (b requires a) — keyed on <id>+<new>, not on b:
    expect(titles).toContain("Review version constraint on a at 0.2.0");
    // the result reports them (formatResult prints a `materialised: N` line):
    expect(i.out.text).toMatch(/materialised: 4 authoring task\(s\)/);
  });

  it("AC#2 — the materialise is idempotent by title (a re-bump to the same version creates no duplicates)", async () => {
    const { fs, backlog } = seed();
    const d = (): CliDeps => deps(fs, backlog);
    // bump 0.1.0 → 0.2.0 (materialises the 4 tasks for 0.2.0):
    expect(await run(["bundle", "a", "version", "bump", "minor", "-C", PROJ], d(), io())).toBe(0);
    // SET back to 0.1.0 (no materialise), then bump minor again → SAME titles at 0.2.0:
    expect(await run(["bundle", "a", "version", "set", "0.1.0", "-C", PROJ], d(), io())).toBe(0);
    expect(await run(["bundle", "a", "version", "bump", "minor", "-C", PROJ], d(), io())).toBe(0);
    // each title appears exactly once (de-duplicated by title):
    const titles = authoringTitles(backlog);
    for (const title of [
      "Review state-tasks for a at 0.2.0",
      "Consider migration tasks for a 0.1.0→0.2.0",
      "Simulate upgrade for a from 0.1.0 to 0.2.0",
      "Review version constraint on a at 0.2.0",
    ]) {
      expect(titles.filter((t) => t === title)).toHaveLength(1);
    }
  });

  it("AC#2 negative — bumping a bundle NOTHING requires materialises only the 3 per-bundle tasks (no constraint task)", async () => {
    const { fs, backlog } = seed({ requirers: false }); // `a` alone; nothing requires it
    const i = io();
    expect(
      await run(["bundle", "a", "version", "bump", "minor", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    const titles = authoringTitles(backlog);
    expect(titles).toContain("Review state-tasks for a at 0.2.0");
    expect(titles).toContain("Consider migration tasks for a 0.1.0→0.2.0");
    expect(titles).toContain("Simulate upgrade for a from 0.1.0 to 0.2.0");
    expect(titles).not.toContain("Review version constraint on a at 0.2.0");
    expect(i.out.text).toMatch(/materialised: 3 authoring task\(s\)/);
  });

  it("AC#2 no self-constraint — bumping `b` (which requires `a`) does NOT materialise a constraint task for b about b", async () => {
    const { fs, backlog } = seed(); // a + b (b requires a)
    expect(
      await run(["bundle", "b", "version", "bump", "minor", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    const titles = authoringTitles(backlog);
    // the 3 per-bundle tasks for b:
    expect(titles).toContain("Review state-tasks for b at 0.2.0");
    // b does not depend on itself, and a does not require b — so NO requirer-constraint task at all:
    expect(titles).not.toContain("Review version constraint on b at 0.2.0");
  });

  it("AC#3 — an INVALID level is a usage error (exit 2) changing nothing", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/wip/bundles/a/bundle.yml`);
    const i = io();
    expect(
      await run(["bundle", "a", "version", "bump", "sideways", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(2);
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toBe(before);
  });

  it("AC#3 — a MISSING level is a usage error (exit 2) changing nothing", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/wip/bundles/a/bundle.yml`);
    expect(await run(["bundle", "a", "version", "bump", "-C", PROJ], deps(fs, backlog), io())).toBe(
      2,
    );
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toBe(before);
  });

  it("AC#4 — outside any project, exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["bundle", "a", "version", "bump", "minor"], deps(fs, backlog, "/nowhere"), i),
    ).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("rerender — after a bump, the front-door is re-rendered (it exists)", async () => {
    const { fs, backlog } = seed();
    expect(
      await run(["bundle", "a", "version", "bump", "minor", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    expect(fs.exists(`${PROJ}/wip/installer-skills/demo-installer/SKILL.md`)).toBe(true);
  });

  it("AC#5 — help is substantive (usage, the level positional + its values, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "version", "bump", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<level>");
    expect(help).toContain("major");
    expect(help).toContain("minor");
    expect(help).toContain("patch");
    expect(help).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> version set (task-61 — a MUTATION)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> version set (task-61 — a MUTATION)", () => {
  it("AC#1 — a valid semver is written (comment preserved), re-rendered, and printed; exit 0", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["bundle", "a", "version", "set", "2.5.0", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(i.out.text).toContain("2.5.0");
    expect(bundleVersion(fs, "a")).toBe("2.5.0");
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toContain("# bundle a —");
    expect(fs.exists(`${PROJ}/wip/installer-skills/demo-installer/SKILL.md`)).toBe(true); // ④ re-rendered
  });

  it("AC#1 — set does NOT materialise authoring tasks", async () => {
    const { fs, backlog } = seed();
    expect(
      await run(["bundle", "a", "version", "set", "2.5.0", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    expect(authoringTitles(backlog)).toHaveLength(0);
  });

  it("AC#2 — a NON-semver value is a usage error (exit 2) changing nothing", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/wip/bundles/a/bundle.yml`);
    const i = io();
    expect(
      await run(
        ["bundle", "a", "version", "set", "not-a-version", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(2);
    expect(i.err.text).toMatch(/semantic version/i);
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toBe(before);
  });

  it("AC#2 — a PARTIAL version (1.2) is rejected as a usage error (exit 2) changing nothing", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/wip/bundles/a/bundle.yml`);
    expect(
      await run(["bundle", "a", "version", "set", "1.2", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(2);
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toBe(before);
  });

  it("AC#3 — outside any project, exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["bundle", "a", "version", "set", "2.0.0"], deps(fs, backlog, "/nowhere"), i),
    ).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#4 — help is substantive (usage, the version positional, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "version", "set", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<version>");
    expect(help).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// end-to-end author workflow + completion (the version pattern end-to-end on a bundle)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> version — end-to-end author workflow (read → bump → read → set → read)", () => {
  it("read reflects each successive bump and set — the bundle.yml is the single source of truth", async () => {
    const { fs, backlog } = seed();
    const d = (): CliDeps => deps(fs, backlog);

    let i = io();
    expect(await run(["bundle", "a", "version", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text.trim()).toBe("0.1.0");

    expect(await run(["bundle", "a", "version", "bump", "major", "-C", PROJ], d(), io())).toBe(0);
    i = io();
    expect(await run(["bundle", "a", "version", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text.trim()).toBe("1.0.0");

    expect(await run(["bundle", "a", "version", "set", "5.6.7", "-C", PROJ], d(), io())).toBe(0);
    i = io();
    expect(await run(["bundle", "a", "version", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text.trim()).toBe("5.6.7");

    // the author's hand-written comment survived every write:
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toContain("# bundle a —");
    // bundle b (the requirer) was never touched:
    expect(bundleVersion(fs, "b")).toBe("0.1.0");
  });
});

describe("bundle <id> version bump completion (task-60 AC#4 — the <level> enum)", () => {
  it("AC#4 — `bundle <id> version bump <tab>` completes from major/minor/patch (via the real dispatch)", async () => {
    // Drive the PUBLIC `run()` completion entry point (`__complete …`), so the per-bundle recursion + the REAL
    // `PER_BUNDLE_COMPLETION_SPECS` resolve exactly as a shell <tab> would — no private symbol imports. cwd=PROJ
    // so the per-bundle id resolves without `-C`.
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["__complete", "bundle", "a", "version", "bump", ""], deps(fs, backlog, PROJ), i),
    ).toBe(0);
    const suggestions = i.out.text.split("\n").filter(Boolean).sort();
    expect(suggestions).toEqual(["major", "minor", "patch"]);
  });
});
