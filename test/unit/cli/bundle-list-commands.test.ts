import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { type CliDeps, run } from "../../../src/cli.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";

/**
 * Acceptance tests for `bundle list` (task-54), driven through `run()` in-process over in-memory ports. The
 * version comes from each enabled bundle's `bundle.yml` (loaded into `project.bundles`); the `kind:state`/
 * `kind:migration` counts come from an fs SCAN of each `bundles/<id>/install-backlog/tasks/*.md` (the install
 * backlog is NOT a Backlog.md root — doc 07 line 67 — so it is a file scan, not a port read). The fixture writes
 * task `.md` files with the EXACT frontmatter `labels:` block-sequence Backlog.md emits, so the scan + matcher are
 * exercised the way the real binary will see them.
 */

const PROJ = "/proj";
const BUILTIN = "/builtin-templates";

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

/** A task `.md` file with the given title + kind label, in the exact frontmatter shape Backlog.md writes. */
function taskFile(title: string, kind: "state" | "migration", step: string): string {
  return [
    "---",
    "id: X-1",
    `title: ${title}`,
    "status: To Do",
    "assignee: []",
    "created_date: '2026-01-01 00:00'",
    "labels:",
    `  - 'kind:${kind}'`,
    `  - 'step:${step}'`,
    "dependencies: []",
    "ordinal: 1000",
    "---",
    "",
    `# ${title}`,
    "",
  ].join("\n");
}

interface BundleSpec {
  readonly id: string;
  readonly version?: string;
  /** install-backlog tasks: each `[kind, step]`. */
  readonly tasks?: ReadonlyArray<readonly ["state" | "migration", string]>;
}

/** Seed a project at /proj with the given enabled bundles, each with a bundle.yml + install-backlog tasks. */
function seed(bundles: readonly BundleSpec[]): { fs: MemoryFileSystem; backlog: FakeBacklog } {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();
  const ids = bundles.map((b) => b.id);
  const bundleLines =
    ids.length > 0 ? `bundles:\n${ids.map((b) => `  - ${b}`).join("\n")}\n` : "bundles: []\n";
  fs.write(
    `${PROJ}/wip/manifest.yml`,
    `project:\n  name: demo\n  version: 1.0.0\ntargets:\n  - claude-code\n${bundleLines}`,
  );
  for (const b of bundles) {
    fs.write(
      `${PROJ}/wip/bundles/${b.id}/bundle.yml`,
      `id: ${b.id}\nversion: ${b.version ?? "0.1.0"}\nsummary: ${b.id} bundle\nconfirmation: safe\nrequires: {}\n`,
    );
    for (const [i, [kind, step]] of (b.tasks ?? []).entries()) {
      fs.write(
        `${PROJ}/wip/bundles/${b.id}/install-backlog/tasks/${b.id}-${i + 1} - ${step}.md`,
        taskFile(`Task ${step}`, kind, step),
      );
    }
  }
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

describe("bundle list (task-54)", () => {
  it("AC#1 — prints each bundle's id, version, and kind:state / kind:migration counts", async () => {
    const { fs, backlog } = seed([
      {
        id: "web",
        version: "1.2.0",
        tasks: [
          ["state", "detect"],
          ["state", "setup"],
          ["migration", "v2"],
        ],
      },
      { id: "doc", version: "0.3.0", tasks: [["state", "detect"]] },
    ]);
    const i = io();
    expect(await run(["bundle", "list", "-C", PROJ], deps(fs, backlog), i)).toBe(0);

    const out = i.out.text;
    // a header + a row per bundle (id-sorted: doc before web):
    expect(out).toMatch(/id\s+version\s+state\s+migration/);
    // web: version 1.2.0, 2 state, 1 migration:
    expect(out).toMatch(/web\s+1\.2\.0\s+2\s+1/);
    // doc: version 0.3.0, 1 state, 0 migration:
    expect(out).toMatch(/doc\s+0\.3\.0\s+1\s+0/);
    // id-sorted (doc appears before web):
    expect(out.indexOf("doc")).toBeLessThan(out.indexOf("web"));
  });

  it("AC#1 — a bundle with NO install-backlog tasks reports 0 state / 0 migration", async () => {
    const { fs, backlog } = seed([{ id: "fresh", version: "0.1.0" }]);
    const i = io();
    expect(await run(["bundle", "list", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text).toMatch(/fresh\s+0\.1\.0\s+0\s+0/);
  });

  it("AC#1 — a non-kind label (step-only) does NOT inflate either count", async () => {
    // a task whose only labels are step:* (no kind:) must count as neither state nor migration.
    const { fs, backlog } = seed([{ id: "web", version: "0.1.0" }]);
    fs.write(
      `${PROJ}/wip/bundles/web/install-backlog/tasks/web-1 - misc.md`,
      [
        "---",
        "id: WEB-1",
        "title: Misc",
        "labels:",
        "  - 'step:misc'",
        "---",
        "",
        "# Misc — mentions kind:state in the body but is NOT labelled with it",
        "",
      ].join("\n"),
    );
    const i = io();
    expect(await run(["bundle", "list", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    // the body mentions `kind:state` but the label block does not → 0 state (the scan is frontmatter-scoped):
    expect(i.out.text).toMatch(/web\s+0\.1\.0\s+0\s+0/);
  });

  it("AC#1 — an empty project prints the (no bundles) marker", async () => {
    const { fs, backlog } = seed([]);
    const i = io();
    expect(await run(["bundle", "list", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text.trim()).toBe("(no bundles)");
  });

  it("AC#2 — read-only: nothing on disk changes; exits 0", async () => {
    const { fs, backlog } = seed([{ id: "web", tasks: [["state", "detect"]] }]);
    const manifestBefore = fs.read(`${PROJ}/wip/manifest.yml`);
    const bundleBefore = fs.read(`${PROJ}/wip/bundles/web/bundle.yml`);
    expect(await run(["bundle", "list", "-C", PROJ], deps(fs, backlog), io())).toBe(0);
    expect(fs.read(`${PROJ}/wip/manifest.yml`)).toBe(manifestBefore);
    expect(fs.read(`${PROJ}/wip/bundles/web/bundle.yml`)).toBe(bundleBefore);
  });

  it("AC#3 — outside any project it exits 1 naming manifest.yml + init", async () => {
    const { fs, backlog } = seed([{ id: "web" }]);
    const i = io();
    expect(await run(["bundle", "list"], deps(fs, backlog, "/nowhere"), i)).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
    expect(i.err.text).toContain("init");
  });

  it("AC#4 — help is substantive (description, usage, an example)", async () => {
    const { fs, backlog } = seed([]);
    const i = io();
    await run(["bundle", "list", "--help"], deps(fs, backlog), i);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toMatch(/Example/i);
  });
});
