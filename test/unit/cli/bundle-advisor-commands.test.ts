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
 * Acceptance tests for the per-bundle ADVISOR family — `bundle <id> advisor add` / `advisor remove` (tasks
 * 80/81), the per-bundle module whose subcommands take NO positional (the advisor is the bundle's ONE pull-UX
 * skill, so no `<name>`/`list`/`--path`). Driven through `run()` in-process over in-memory ports against a
 * realistic project at `/proj` with bundle `a` (a `claude-code` target so ④ RERENDER has aliases to plan) and a
 * leading bundle.yml comment. The project template snippets are seeded — INCLUDING `advisor.SKILL.md.tmpl` — so
 * the advisor scaffold renders and the front-door re-render resolves. Mirrors `bundle-version-commands.test.ts`.
 *
 * `add` reuses the SAME `scaffoldAdvisor` + "Write advisor content for <id>" task `bundle new` step 6 runs; the
 * suite proves render (80#1), materialise + idempotency (80#2), and the no-op when present (80#3). `remove`
 * deletes the advisor dir (81#1), archives the OPEN content task — but leaves a Done one (81#2), and is a
 * no-op-with-message when absent (81#3).
 */

const PROJ = "/proj";
const BUILTIN = "/builtin-templates";
const AUTHORING = `${PROJ}/.authoring-backlog`;

/** Bundle `a`'s `bundle.yml` with a leading comment + a known key order — to test the load path is undisturbed. */
const A_BUNDLE_YML = [
  "# bundle a — its advisor is managed via `wpm bundle a advisor add|remove`",
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

/** Seed a project at /proj with bundle `a` (NO advisor yet), the authoring backlog, and the template snippets. */
function seed(): { fs: MemoryFileSystem; backlog: FakeBacklog } {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();

  fs.write(
    `${PROJ}/wip/manifest.yml`,
    "project:\n  name: demo\n  version: 1.0.0\ntargets:\n  - claude-code\nbundles:\n  - a\n",
  );
  fs.write(`${PROJ}/wip/bundles/a/bundle.yml`, A_BUNDLE_YML);
  fs.makeDirectories(`${PROJ}/wip/installer-skills`);
  backlog.init(AUTHORING, { taskPrefix: "authoring" });

  // Project template snippets: the front-door + orchestrator the ④ RERENDER needs, PLUS the advisor snippet the
  // scaffold renders from (substituting {{bundle-id}}).
  fs.write(`${BUILTIN}/project/minimal/template.yml`, "name: minimal\nscope: project\n");
  fs.write(`${BUILTIN}/project/minimal/snippets/AGENTS.md`, "# {{project-name}}\n\n{{bundles}}\n");
  fs.write(
    `${BUILTIN}/project/minimal/snippets/installer-skills/{{project-name}}-installer/SKILL.md`,
    "---\nname: {{project-name}}-installer\n---\nInstall {{project-name}}.\n",
  );
  fs.write(
    `${BUILTIN}/project/minimal/snippets/advisor.SKILL.md.tmpl`,
    "---\nname: {{bundle-id}}-advisor\n---\n\n# {{bundle-id}} advisor\n\nTODO: write the trigger description and recommendation body.\n",
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

/** The advisor stub path for bundle `<id>` under /proj. */
function advisorPath(id: string): string {
  return `${PROJ}/wip/installer-skills/${id}-advisor/SKILL.md`;
}

/** The titles of the (active, non-archived) tasks the FakeBacklog holds in the authoring backlog. */
function authoringTitles(backlog: FakeBacklog): string[] {
  return backlog.listTasks(AUTHORING).map((t) => t.title);
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> advisor add (task-80 — a MUTATION + MATERIALISE)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> advisor add (task-80 — a MUTATION)", () => {
  it("80#1 — renders the advisor stub from the template snippet (name substituted, placeholder body, no prose); exit 0", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "advisor", "add", "-C", PROJ], deps(fs, backlog), i)).toBe(0);

    // the stub exists at the conventional path with the substituted name + the snippet's placeholder body:
    expect(fs.exists(advisorPath("a"))).toBe(true);
    const stub = fs.read(advisorPath("a"));
    expect(stub).toContain("name: a-advisor"); // {{bundle-id}} substituted in frontmatter
    expect(stub).toContain("TODO"); // a placeholder, NOT invented prose
    // the result reported a change:
    expect(i.out.text).toMatch(/changed: \d+ path/);
  });

  it("80#2 — materialises the 'Write advisor content for a' task; idempotent by title on a re-run", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "advisor", "add", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    // the doc-11 content task is materialised, reported as `materialised: 1`:
    expect(authoringTitles(backlog)).toContain("Write advisor content for a");
    expect(i.out.text).toMatch(/materialised: 1 authoring task\(s\)/);

    // a SECOND add materialises NO duplicate (title-idempotent) and is reported as the no-op:
    const i2 = io();
    expect(await run(["bundle", "a", "advisor", "add", "-C", PROJ], deps(fs, backlog), i2)).toBe(0);
    expect(
      authoringTitles(backlog).filter((t) => t === "Write advisor content for a"),
    ).toHaveLength(1);
    expect(i2.out.text).toContain("already exists — nothing to do");
  });

  it("80#3 — when the advisor already exists the command is a no-op (SKILL.md bytes + task count unchanged)", async () => {
    const { fs, backlog } = seed();
    // first add scaffolds the advisor + materialises the task.
    expect(await run(["bundle", "a", "advisor", "add", "-C", PROJ], deps(fs, backlog), io())).toBe(
      0,
    );
    const stubBefore = fs.read(advisorPath("a"));
    const titlesBefore = authoringTitles(backlog);

    // second add: no-op — the stub bytes are unchanged and no new task is created.
    const i = io();
    expect(await run(["bundle", "a", "advisor", "add", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text).toContain("already exists — nothing to do");
    expect(fs.read(advisorPath("a"))).toBe(stubBefore);
    expect(authoringTitles(backlog)).toEqual(titlesBefore);
  });

  it("80#4 — outside any project, exits 1 naming manifest.yml and suggesting init", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "advisor", "add"], deps(fs, backlog, "/nowhere"), i)).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
    expect(i.err.text).toContain("init");
  });

  it("80#4 — the id position completes from enabled bundles", async () => {
    const { fs, backlog } = seed();
    const d = deps(fs, backlog, PROJ);
    const out = completeArgv(buildProgram(d, io()), ["bundle", ""], {
      fs: d.fs,
      env: d.env,
      builtinTemplatesRoot: d.builtinTemplatesRoot,
      registry: defaultRegistry(),
      specs: COMPLETION_SPECS,
    });
    expect(out).toContain("a"); // the enabled bundle id
    expect(out).toContain("new"); // a fixed verb at the same position
  });

  it("80#5 — help is substantive (usage, an example); exit 0", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "advisor", "add", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("bundle a advisor add"); // the LEAF usage, not the group's
    expect(help).toMatch(/Example/i);
  });

  it("a non-enabled id exits 1 (the routing's enabled-bundle guard)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "ghost", "advisor", "add", "-C", PROJ], deps(fs, backlog), i)).toBe(
      1,
    );
    expect(i.err.text).toMatch(/ghost/);
  });

  it("rerender — after an add, the front-door is re-rendered (it exists)", async () => {
    const { fs, backlog } = seed();
    expect(await run(["bundle", "a", "advisor", "add", "-C", PROJ], deps(fs, backlog), io())).toBe(
      0,
    );
    expect(fs.exists(`${PROJ}/wip/installer-skills/demo-installer/SKILL.md`)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> advisor remove (task-81 — a MUTATION)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> advisor remove (task-81 — a MUTATION)", () => {
  it("81#1 — deletes the advisor stub directory (the SKILL.md is gone); exit 0", async () => {
    const { fs, backlog } = seed();
    // add first so there is an advisor to remove.
    expect(await run(["bundle", "a", "advisor", "add", "-C", PROJ], deps(fs, backlog), io())).toBe(
      0,
    );
    expect(fs.exists(advisorPath("a"))).toBe(true);

    const i = io();
    expect(await run(["bundle", "a", "advisor", "remove", "-C", PROJ], deps(fs, backlog), i)).toBe(
      0,
    );
    // the directory (and its SKILL.md) is gone:
    expect(fs.exists(advisorPath("a"))).toBe(false);
    expect(fs.exists(`${PROJ}/wip/installer-skills/a-advisor`)).toBe(false);
    expect(i.out.text).toMatch(/changed: \d+ path/);
  });

  it("81#2 — archives the OPEN 'Write advisor content for a' task", async () => {
    const { fs, backlog } = seed();
    expect(await run(["bundle", "a", "advisor", "add", "-C", PROJ], deps(fs, backlog), io())).toBe(
      0,
    );
    // the task is OPEN (To Do) after add.
    expect(authoringTitles(backlog)).toContain("Write advisor content for a");

    expect(
      await run(["bundle", "a", "advisor", "remove", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    // listTasks excludes archived → the title is gone from the active list (it was archived).
    expect(authoringTitles(backlog)).not.toContain("Write advisor content for a");
  });

  it("81#2 — a Done content task is LEFT (not archived) — 'if still open'", async () => {
    const { fs, backlog } = seed();
    expect(await run(["bundle", "a", "advisor", "add", "-C", PROJ], deps(fs, backlog), io())).toBe(
      0,
    );
    // mark the content task Done (the author closed it) BEFORE removing the advisor.
    const task = backlog
      .listTasks(AUTHORING)
      .find((t) => t.title === "Write advisor content for a");
    expect(task).toBeDefined();
    if (task !== undefined) {
      backlog.editTask(AUTHORING, task.id, { status: "Done" });
    }

    expect(
      await run(["bundle", "a", "advisor", "remove", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    // the Done task is STILL present (not archived) — only OPEN tasks are archived.
    const after = backlog
      .listTasks(AUTHORING)
      .find((t) => t.title === "Write advisor content for a");
    expect(after).toBeDefined();
    expect(after?.status).toBe("Done");
  });

  it("81#3 — removing an advisor that does not exist reports nothing to remove and makes no change; exit 0", async () => {
    const { fs, backlog } = seed();
    // no advisor was added.
    const manifestBefore = fs.read(`${PROJ}/wip/manifest.yml`);
    const bundleBefore = fs.read(`${PROJ}/wip/bundles/a/bundle.yml`);

    const i = io();
    expect(await run(["bundle", "a", "advisor", "remove", "-C", PROJ], deps(fs, backlog), i)).toBe(
      0,
    );
    // a "nothing to remove" message; NO directory created; manifest + bundle.yml untouched.
    expect(`${i.out.text}${i.err.text}`).toMatch(/nothing to remove/);
    expect(fs.exists(`${PROJ}/wip/installer-skills/a-advisor`)).toBe(false);
    expect(fs.read(`${PROJ}/wip/manifest.yml`)).toBe(manifestBefore);
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toBe(bundleBefore);
  });

  it("81#3 — absence short-circuits BEFORE the task lookup (a stray content task is NOT touched)", async () => {
    const { fs, backlog } = seed();
    // a stray "Write advisor content for a" task exists but there is NO advisor dir on disk.
    backlog.createTask(AUTHORING, { title: "Write advisor content for a" });
    expect(authoringTitles(backlog)).toContain("Write advisor content for a");

    expect(
      await run(["bundle", "a", "advisor", "remove", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    // AC81#3 "makes no change" — the stray task is NOT archived (the dir-absence short-circuited).
    expect(authoringTitles(backlog)).toContain("Write advisor content for a");
  });

  it("81#4 — outside any project, exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "advisor", "remove"], deps(fs, backlog, "/nowhere"), i)).toBe(
      1,
    );
    expect(i.err.text).toContain("manifest.yml");
  });

  it("81#5 — help is substantive (usage, an example); exit 0", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "advisor", "remove", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("bundle a advisor remove");
    expect(help).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// end-to-end author workflow + group help + completion
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> advisor — end-to-end (add → remove → add round-trip)", () => {
  it("add (scaffold + task) → remove (dir gone + task archived) → add AGAIN (re-scaffold + a FRESH task)", async () => {
    const { fs, backlog } = seed();
    const d = (): CliDeps => deps(fs, backlog);

    // add: scaffold + materialise.
    expect(await run(["bundle", "a", "advisor", "add", "-C", PROJ], d(), io())).toBe(0);
    expect(fs.exists(advisorPath("a"))).toBe(true);
    expect(authoringTitles(backlog)).toContain("Write advisor content for a");

    // remove: dir gone + the OPEN task archived (gone from the active list).
    expect(await run(["bundle", "a", "advisor", "remove", "-C", PROJ], d(), io())).toBe(0);
    expect(fs.exists(advisorPath("a"))).toBe(false);
    expect(authoringTitles(backlog)).not.toContain("Write advisor content for a");

    // add AGAIN: the stub is re-scaffolded AND a FRESH content task is materialised — the archived one is excluded
    // from listTasks, so the title-idempotent create runs again (archived != present).
    const i = io();
    expect(await run(["bundle", "a", "advisor", "add", "-C", PROJ], d(), i)).toBe(0);
    expect(fs.exists(advisorPath("a"))).toBe(true);
    expect(authoringTitles(backlog)).toContain("Write advisor content for a");
    expect(i.out.text).toMatch(/materialised: 1 authoring task\(s\)/);
    // the author's hand-written bundle.yml comment survived every operation (the load path is undisturbed):
    expect(fs.read(`${PROJ}/wip/bundles/a/bundle.yml`)).toContain("# bundle a —");
  });

  it("the advisor group help lists add and remove", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "a", "advisor", "--help"], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text).toContain("add");
    expect(i.out.text).toContain("remove");
  });

  it("completion: `bundle <id> advisor <tab>` offers add and remove (the subcommand names)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["__complete", "bundle", "a", "advisor", ""], deps(fs, backlog, PROJ), i),
    ).toBe(0);
    const suggestions = i.out.text.split("\n").filter(Boolean);
    expect(suggestions).toContain("add");
    expect(suggestions).toContain("remove");
  });
});
