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
 * Acceptance tests for the per-bundle subcommand family — `bundle <id> show` / `bundle <id> meta` (tasks
 * 57/58) — AND THE `bundle <id> <subcommand>` ROUTING that backs them (the pattern-setter for the 21 later
 * bundle-`<id>` repeats). Driven through `run()` in-process over in-memory ports, against a realistic project
 * at `/proj` (manifest + an enabled bundle `web` whose `bundle.yml` carries a COMMENT and a known key order so
 * the meta edit's comment+order preservation is testable; the project template snippets so ④ RERENDER
 * resolves). Mirrors `bundle-lifecycle-commands.test.ts`.
 */

const PROJ = "/proj";
const BUILTIN = "/builtin-templates";
const AUTHORING = `${PROJ}/.authoring-backlog`;

/** A `bundle.yml` with a leading comment + a specific key order — to test 58#3 (comments + order preserved). */
const WEB_BUNDLE_YML = [
  "# web bundle — edit via `wpm bundle web meta`",
  "id: web",
  "version: 0.1.0",
  "summary: old summary",
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

/** Seed a project at /proj with an enabled bundle `web` (+ optional extra bundles) and the template snippets. */
function seed(opts: { enabled?: readonly string[]; webYml?: string } = {}): {
  fs: MemoryFileSystem;
  backlog: FakeBacklog;
} {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();
  const enabled = opts.enabled ?? ["web"];

  fs.write(
    `${PROJ}/wip/manifest.yml`,
    `project:\n  name: demo\n  version: 1.0.0\ntargets:\n  - claude-code\nbundles:\n${enabled
      .map((b) => `  - ${b}`)
      .join("\n")}\n`,
  );
  for (const id of enabled) {
    if (id === "web") {
      fs.write(`${PROJ}/wip/bundles/web/bundle.yml`, opts.webYml ?? WEB_BUNDLE_YML);
    } else {
      fs.write(
        `${PROJ}/wip/bundles/${id}/bundle.yml`,
        `id: ${id}\nversion: 0.1.0\nsummary: ${id} bundle\nconfirmation: safe\nrequires: {}\n`,
      );
    }
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

/** Resolve completions against /proj via the REAL specs (cwd = PROJ so the sources resolve the project). */
function complete(
  fs: MemoryFileSystem,
  backlog: FakeBacklog,
  words: readonly string[],
): readonly string[] {
  const d = deps(fs, backlog, PROJ);
  // The `bundle <id> …` recursion lives in the CLI's `emitCompletions`; for the per-bundle subcommand specs we
  // mirror that by resolving against the right tree. Here we test the AC-named completions through the MAIN
  // tree (`bundle <tab>`) + the per-bundle recursion is covered by the real-binary E2E. For the
  // `--confirmation-level` value we drive the meta sub-program directly is unnecessary: assert via the binary.
  return completeArgv(buildProgram(d, io()), words, {
    fs: d.fs,
    env: d.env,
    builtinTemplatesRoot: d.builtinTemplatesRoot,
    registry: defaultRegistry(),
    specs: COMPLETION_SPECS,
  });
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE ROUTING (the pattern-setter)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> routing (tasks 57/58 — the pattern-setter)", () => {
  it("a FIXED verb still routes to its command (the `*` catch-all does not swallow it)", async () => {
    const { fs, backlog } = seed();
    expect(await run(["bundle", "disable", "web", "-C", PROJ], deps(fs, backlog), io())).toBe(0);
    // disable routed correctly: web is no longer enabled.
    const m = parseYaml(fs.read(`${PROJ}/wip/manifest.yml`)) as { bundles?: unknown };
    expect(JSON.stringify(m.bundles)).not.toContain("web");
  });

  it("a NON-verb id enters the per-bundle space: `bundle web show` routes to the show leaf", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "web", "show", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text).toContain("id:           web");
  });

  it("-C placed AFTER the dynamic route still resolves the project", async () => {
    const { fs, backlog } = seed();
    const i = io();
    // cwd is /elsewhere; -C comes after the subcommand.
    expect(
      await run(["bundle", "web", "show", "-C", PROJ], deps(fs, backlog, "/elsewhere"), i),
    ).toBe(0);
    expect(i.out.text).toContain("id:           web");
  });

  it("a non-enabled id is a typed NotFound (exit 1) before the sub-program parses", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "ghost", "show", "-C", PROJ], deps(fs, backlog), i)).toBe(1);
    expect(i.err.text).toMatch(/not an enabled bundle/i);
  });

  it("an on-disk-but-disabled id is also NotFound (not enabled)", async () => {
    const { fs, backlog } = seed({ enabled: ["web"] });
    // stage a disabled bundle dir on disk (present, but not in manifest.bundles):
    fs.write(
      `${PROJ}/wip/bundles/draft/bundle.yml`,
      "id: draft\nversion: 0.1.0\nsummary: draft\nconfirmation: safe\nrequires: {}\n",
    );
    const i = io();
    expect(await run(["bundle", "draft", "show", "-C", PROJ], deps(fs, backlog), i)).toBe(1);
    expect(i.err.text).toMatch(/not an enabled bundle/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> show (task-57)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> show (task-57)", () => {
  it("AC#1 — prints bundle.yml metadata and a tree summary of the bundle", async () => {
    const { fs, backlog } = seed();
    // an extra file under the bundle so the tree summary lists it:
    fs.write(`${PROJ}/wip/bundles/web/payload/files/x.txt`, "hello");
    const i = io();
    expect(await run(["bundle", "web", "show", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    const out = i.out.text;
    expect(out).toContain("id:           web");
    expect(out).toContain("version:      0.1.0");
    expect(out).toContain("summary:      old summary");
    expect(out).toContain("confirmation: safe");
    expect(out).toContain("bundle.yml"); // the tree summary lists the bundle's files
    expect(out).toContain("payload/files/x.txt");
  });

  it("AC#2 — an id that is not an enabled bundle fails with a not-found error (exit 1)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "nope", "show", "-C", PROJ], deps(fs, backlog), i)).toBe(1);
    expect(i.err.text).toMatch(/not an enabled bundle/i);
  });

  it("AC#3 — read-only: the manifest and bundle.yml are unchanged after show", async () => {
    const { fs, backlog } = seed();
    const manifestBefore = fs.read(`${PROJ}/wip/manifest.yml`);
    const bundleBefore = fs.read(`${PROJ}/wip/bundles/web/bundle.yml`);
    expect(await run(["bundle", "web", "show", "-C", PROJ], deps(fs, backlog), io())).toBe(0);
    expect(fs.read(`${PROJ}/wip/manifest.yml`)).toBe(manifestBefore);
    expect(fs.read(`${PROJ}/wip/bundles/web/bundle.yml`)).toBe(bundleBefore);
  });

  it("AC#4 — outside any project it exits 1 naming manifest.yml + init", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["bundle", "web", "show"], deps(fs, backlog, "/nowhere"), i)).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
    expect(i.err.text).toContain("init");
  });

  it("AC#4 — the id position completes from enabled bundles", async () => {
    const { fs, backlog } = seed({ enabled: ["web", "doc"] });
    const out = complete(fs, backlog, ["bundle", ""]);
    expect(out).toContain("web");
    expect(out).toContain("doc");
    // and the fixed verbs are still offered at the same position:
    expect(out).toContain("new");
    // the hidden routing catch-all does NOT leak:
    expect(out).not.toContain("*");
  });

  it("the id position resolves from a LEADING -C value (the -C value is not mistaken for an operand) — S1 fix", async () => {
    const { fs, backlog } = seed({ enabled: ["web", "doc"] });
    // cwd is OUTSIDE the project (the `complete` helper's default), and the project is named only via -C — the
    // `descend` global-value-skip means the -C value isn't consumed as an operand, so `bundle <tab>` still
    // resolves the enabled ids (verbs ∪ ids). Drive `completeArgv` directly with a leading -C.
    const d = deps(fs, backlog, "/elsewhere");
    const out = completeArgv(buildProgram(d, io()), ["-C", PROJ, "bundle", ""], {
      fs: d.fs,
      env: d.env,
      builtinTemplatesRoot: BUILTIN,
      registry: defaultRegistry(),
      specs: COMPLETION_SPECS,
    });
    expect(out).toContain("web"); // enabled id resolved via the leading -C
    expect(out).toContain("doc");
    expect(out).toContain("new"); // and the fixed verbs
  });

  it("AC#5 — help is substantive (description, usage, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    await run(["bundle", "web", "show", "--help"], deps(fs, backlog), i);
    expect(i.out.text).toMatch(/Usage:/);
    expect(i.out.text).toMatch(/Example/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// bundle <id> meta (task-58)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("bundle <id> meta (task-58)", () => {
  it("AC#1 — --summary updates only summary; version + confirmation untouched", async () => {
    const { fs, backlog } = seed();
    expect(
      await run(
        ["bundle", "web", "meta", "--summary", "new summary", "-C", PROJ],
        deps(fs, backlog),
        io(),
      ),
    ).toBe(0);
    const b = bundleYml(fs, "web");
    expect(b.ok).toBe(true);
    if (b.ok) {
      expect(b.value.summary).toBe("new summary");
      expect(b.value.version).toBe("0.1.0"); // untouched
      expect(b.value.confirmation).toBe("safe"); // untouched
    }
  });

  it("AC#1 — --confirmation-level updates only confirmation", async () => {
    const { fs, backlog } = seed();
    expect(
      await run(
        ["bundle", "web", "meta", "--confirmation-level", "dangerous", "-C", PROJ],
        deps(fs, backlog),
        io(),
      ),
    ).toBe(0);
    const b = bundleYml(fs, "web");
    if (b.ok) {
      expect(b.value.confirmation).toBe("dangerous");
      expect(b.value.summary).toBe("old summary"); // untouched
    }
  });

  it("AC#1 — --version SETS the bundle version (the inner sub-program parses it)", async () => {
    const { fs, backlog } = seed();
    expect(
      await run(
        ["bundle", "web", "meta", "--version", "3.1.4", "-C", PROJ],
        deps(fs, backlog),
        io(),
      ),
    ).toBe(0);
    const b = bundleYml(fs, "web");
    if (b.ok) expect(b.value.version).toBe("3.1.4");
  });

  it("AC#2 — a bad --confirmation-level value is a usage error (exit 2), bundle.yml unchanged", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/wip/bundles/web/bundle.yml`);
    const i = io();
    expect(
      await run(
        ["bundle", "web", "meta", "--confirmation-level", "bogus", "-C", PROJ],
        deps(fs, backlog),
        i,
      ),
    ).toBe(2);
    expect(fs.read(`${PROJ}/wip/bundles/web/bundle.yml`)).toBe(before);
  });

  it("a bad --version is a usage error (exit 2)", async () => {
    const { fs, backlog } = seed();
    expect(
      await run(
        ["bundle", "web", "meta", "--version", "notsemver", "-C", PROJ],
        deps(fs, backlog),
        io(),
      ),
    ).toBe(2);
  });

  it("no flags is a usage error (exit 2), nothing changed", async () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${PROJ}/wip/bundles/web/bundle.yml`);
    const i = io();
    expect(await run(["bundle", "web", "meta", "-C", PROJ], deps(fs, backlog), i)).toBe(2);
    expect(fs.read(`${PROJ}/wip/bundles/web/bundle.yml`)).toBe(before);
  });

  it("AC#3 — existing comments and key order are preserved across the edit", async () => {
    const { fs, backlog } = seed();
    expect(
      await run(
        ["bundle", "web", "meta", "--summary", "new summary", "-C", PROJ],
        deps(fs, backlog),
        io(),
      ),
    ).toBe(0);
    const text = fs.read(`${PROJ}/wip/bundles/web/bundle.yml`);
    // the leading comment survived:
    expect(text).toContain("# web bundle — edit via `wpm bundle web meta`");
    // the key ORDER is unchanged (id, version, summary, confirmation, requires):
    const keyOrder = text
      .split("\n")
      .map((l) => l.match(/^([a-z_]+):/)?.[1])
      .filter((k): k is string => k !== undefined);
    expect(keyOrder).toEqual(["id", "version", "summary", "confirmation", "requires"]);
    // the edited value landed; the untouched lines are byte-identical:
    expect(text).toContain("summary: new summary");
    expect(text).toContain("id: web");
    expect(text).toContain("confirmation: safe");
  });

  it("rerender: a meta change re-derives the orchestrator; the executor front door stays author-owned", async () => {
    const { fs, backlog } = seed();
    expect(
      await run(
        ["bundle", "web", "meta", "--summary", "fresh menu line", "-C", PROJ],
        deps(fs, backlog),
        io(),
      ),
    ).toBe(0);
    // The new summary is recorded in the bundle's bundle.yml; ④ RERENDER re-derived the orchestrator. The
    // executor front door is author-owned and is NOT re-rendered on a mutation (task-88).
    expect(fs.read(`${PROJ}/wip/bundles/web/bundle.yml`)).toContain("fresh menu line");
    expect(fs.exists(`${PROJ}/wip/installer-skills/demo-installer/SKILL.md`)).toBe(true);
    expect(fs.exists(`${PROJ}/wip/AGENTS.md`)).toBe(false);
  });

  it("AC#4 — outside any project it exits 1 naming manifest.yml", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(
      await run(["bundle", "web", "meta", "--summary", "x"], deps(fs, backlog, "/nowhere"), i),
    ).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#5 — help lists every flag and an example", async () => {
    const { fs, backlog } = seed();
    const i = io();
    await run(["bundle", "web", "meta", "--help"], deps(fs, backlog), i);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("--version");
    expect(help).toContain("--summary");
    expect(help).toContain("--confirmation-level");
    expect(help).toMatch(/Example/i);
  });
});
