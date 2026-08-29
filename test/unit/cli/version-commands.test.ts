import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { buildProgram, type CliDeps, run } from "../../../src/cli.js";
import { completeArgv } from "../../../src/completion/complete.js";
import { defaultRegistry } from "../../../src/completion/registry.js";
import type { SemVer } from "../../../src/core/model/index.js";
import { parseManifest } from "../../../src/core/services/schema/index.js";
import { bumpSemVer } from "../../../src/core/services/version-constraint.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";
import { parseYaml } from "../../../src/util/yaml.js";

/**
 * Acceptance tests for the `project version` / `version bump` / `version set` family (tasks 39/40/41 — the
 * VERSION pattern), driven through `run()` in-process over in-memory ports. The fixture is a realistic project at
 * `/proj` (manifest with `project.version` + a seeded COMMENT to prove comment-preservation, a bundle, an
 * existing `installer-skills/` so the ④-RERENDER scope alias is non-broken, an `.authoring-backlog` root, and the
 * built-in `minimal` project-template snippets so the lifecycle's `makeArtefactDeriver` resolves the front-door).
 * Mirrors `targets-commands.test.ts`'s harness.
 */

const PROJ = "/proj";
const BUILTIN = "/builtin-templates";
/** A hand-written manifest comment that MUST survive every bump/set (task-13 comment preservation). */
const MANIFEST_COMMENT = "# hand-written note: the release version is bumped via the CLI";

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

/** Seed a project at /proj with the given `project.version`, a comment, one bundle, and the deriver's snippets. */
function seed(version = "1.2.3"): { fs: MemoryFileSystem; backlog: FakeBacklog } {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();

  fs.write(
    `${PROJ}/wip/manifest.yml`,
    [
      "project:",
      "  name: demo",
      `  version: ${version}`,
      MANIFEST_COMMENT,
      "targets:",
      "  - claude-code",
      "bundles:",
      "  - web",
      "",
    ].join("\n"),
  );
  // an enabled bundle so loadProject succeeds (full schema):
  fs.write(
    `${PROJ}/wip/bundles/web/bundle.yml`,
    "id: web\nversion: 0.1.0\nsummary: web bundle\nconfirmation: safe\nrequires: {}\n",
  );
  // the root alias TARGET dir exists, so a created scope alias is non-broken:
  fs.makeDirectories(`${PROJ}/wip/installer-skills`);
  // the authoring backlog the lifecycle lists in ⑤ (version bump/set materialise nothing, but ④/⑤ still run):
  backlog.init(`${PROJ}/.authoring-backlog`, { taskPrefix: "authoring" });

  // The built-in minimal project template snippets the deriver resolves (front-door + orchestrator):
  fs.write(`${BUILTIN}/project/minimal/template.yml`, "name: minimal\nscope: project\n");
  fs.write(`${BUILTIN}/project/minimal/snippets/AGENTS.md`, "# {{project-name}}\n\n{{bundles}}\n");
  fs.write(
    `${BUILTIN}/project/minimal/snippets/installer-skills/{{project-name}}-installer/SKILL.md`,
    "---\nname: {{project-name}}-installer\n---\nInstall {{project-name}}.\n",
  );

  return { fs, backlog };
}

/** CliDeps with cwd outside /proj (so `-C /proj` selects the project). */
function deps(fs: MemoryFileSystem, backlog: FakeBacklog, cwd = "/elsewhere"): CliDeps {
  return {
    fs,
    backlog,
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new FakeEnvironment({ cwd }),
    builtinTemplatesRoot: BUILTIN,
  };
}

/** The `project.version` parsed from the manifest on disk. */
function manifestVersion(fs: MemoryFileSystem): string {
  const m = parseManifest(parseYaml(fs.read(`${PROJ}/wip/manifest.yml`)));
  if (!m.ok) throw new Error("manifest did not parse");
  return m.value.meta.version;
}

describe("project version (task-39 — a READ)", () => {
  it("AC#1/#2 — prints manifest.project.version to stdout, read-only, exit 0", async () => {
    const { fs, backlog } = seed("1.2.3");
    const before = fs.read(`${PROJ}/wip/manifest.yml`);
    const i = io();
    expect(await run(["project", "version", "-C", PROJ], deps(fs, backlog), i)).toBe(0);
    expect(i.out.text.trim()).toBe("1.2.3");
    // read-only: the manifest on disk is byte-identical:
    expect(fs.read(`${PROJ}/wip/manifest.yml`)).toBe(before);
  });

  it("AC#3 — outside any project, exits non-zero naming manifest.yml and suggesting init", async () => {
    const { fs, backlog } = seed();
    const i = io();
    const code = await run(["project", "version"], deps(fs, backlog), i); // no -C
    expect(code).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
    expect(i.err.text).toContain("init");
  });

  it("AC#4 — help is substantive and documents the bump and set subcommands", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "version", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("Example:");
    // commander lists the subcommands under "Commands:" — both bump and set are documented:
    expect(help).toContain("bump");
    expect(help).toContain("set");
  });
});

describe("project version bump (task-40 — a MUTATION)", () => {
  it.each([
    ["patch", "1.2.3", "1.2.4"],
    ["minor", "1.2.3", "1.3.0"],
    ["major", "1.2.3", "2.0.0"],
    ["minor", "0.3.1", "0.4.0"], // a 0.x line behaves the same
  ])("AC#1 — bump %s of %s computes %s, writes it (comment preserved), and prints it", async (level, from, expected) => {
    const { fs, backlog } = seed(from);
    const i = io();
    expect(await run(["project", "version", "bump", level, "-C", PROJ], deps(fs, backlog), i)).toBe(
      0,
    );
    // printed the NEW version (the summary line):
    expect(i.out.text).toContain(expected);
    // written to the manifest on disk:
    expect(manifestVersion(fs)).toBe(expected);
    // the hand-written comment SURVIVED (task-13 comment preservation):
    expect(fs.read(`${PROJ}/wip/manifest.yml`)).toContain(MANIFEST_COMMENT);
  });

  it("AC#3 — the derived front-door is re-rendered (it exists after the bump)", async () => {
    const { fs, backlog } = seed("1.2.3");
    expect(
      await run(["project", "version", "bump", "minor", "-C", PROJ], deps(fs, backlog), io()),
    ).toBe(0);
    expect(fs.exists(`${PROJ}/wip/installer-skills/demo-installer/SKILL.md`)).toBe(true);
  });

  it("AC#2 — an INVALID level is a usage error (exit 2) changing nothing", async () => {
    const { fs, backlog } = seed("1.2.3");
    const before = fs.read(`${PROJ}/wip/manifest.yml`);
    const i = io();
    const code = await run(
      ["project", "version", "bump", "sideways", "-C", PROJ],
      deps(fs, backlog),
      i,
    );
    expect(code).toBe(2);
    expect(fs.read(`${PROJ}/wip/manifest.yml`)).toBe(before); // unchanged
  });

  it("AC#2 — a MISSING level is a usage error (exit 2) changing nothing", async () => {
    const { fs, backlog } = seed("1.2.3");
    const before = fs.read(`${PROJ}/wip/manifest.yml`);
    const code = await run(["project", "version", "bump", "-C", PROJ], deps(fs, backlog), io());
    expect(code).toBe(2);
    expect(fs.read(`${PROJ}/wip/manifest.yml`)).toBe(before);
  });

  it("AC#4 — outside any project, exits non-zero naming manifest.yml", async () => {
    const { fs, backlog } = seed();
    const i = io();
    const code = await run(["project", "version", "bump", "minor"], deps(fs, backlog), i); // no -C
    expect(code).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#5 — help is substantive (usage, the level positional + its values, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "version", "bump", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<level>");
    // commander renders the allowed choices for a constrained argument:
    expect(help).toContain("major");
    expect(help).toContain("minor");
    expect(help).toContain("patch");
    expect(help).toContain("Example:");
  });
});

describe("project version set (task-41 — a MUTATION)", () => {
  it("AC#1 — a valid semver is written (comment preserved), re-rendered, and printed; exit 0", async () => {
    const { fs, backlog } = seed("1.2.3");
    const i = io();
    expect(
      await run(["project", "version", "set", "2.5.0", "-C", PROJ], deps(fs, backlog), i),
    ).toBe(0);
    expect(i.out.text).toContain("2.5.0");
    expect(manifestVersion(fs)).toBe("2.5.0");
    expect(fs.read(`${PROJ}/wip/manifest.yml`)).toContain(MANIFEST_COMMENT);
    // AC#3: the front-door was re-rendered:
    expect(fs.exists(`${PROJ}/wip/installer-skills/demo-installer/SKILL.md`)).toBe(true);
  });

  it("AC#2 — a NON-semver value is a usage error (exit 2) changing nothing", async () => {
    const { fs, backlog } = seed("1.2.3");
    const before = fs.read(`${PROJ}/wip/manifest.yml`);
    const i = io();
    const code = await run(
      ["project", "version", "set", "not-a-version", "-C", PROJ],
      deps(fs, backlog),
      i,
    );
    expect(code).toBe(2);
    expect(i.err.text).toMatch(/semantic version/i);
    expect(fs.read(`${PROJ}/wip/manifest.yml`)).toBe(before); // unchanged
  });

  it("AC#2 — a PARTIAL version (1.2) is rejected as a usage error (exit 2) changing nothing", async () => {
    const { fs, backlog } = seed("1.2.3");
    const before = fs.read(`${PROJ}/wip/manifest.yml`);
    const code = await run(
      ["project", "version", "set", "1.2", "-C", PROJ],
      deps(fs, backlog),
      io(),
    );
    expect(code).toBe(2);
    expect(fs.read(`${PROJ}/wip/manifest.yml`)).toBe(before);
  });

  it("AC#4 — outside any project, exits non-zero naming manifest.yml", async () => {
    const { fs, backlog } = seed();
    const i = io();
    const code = await run(["project", "version", "set", "2.0.0"], deps(fs, backlog), i); // no -C
    expect(code).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC#5 — help is substantive (usage, the version positional, an example)", async () => {
    const { fs, backlog } = seed();
    const i = io();
    expect(await run(["project", "version", "set", "--help"], deps(fs, backlog), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<version>");
    expect(help).toContain("Example:");
  });
});

describe("project version — end-to-end author workflow (39 → 40 → 39 → 41 → 39)", () => {
  it("read reflects each successive bump and set — the manifest is the single source of truth", async () => {
    // One shared project, driven through `run()` exactly as an author would across several invocations: the
    // READ always reports what the previous MUTATION wrote (cross-command continuity), and the comment survives
    // throughout. This exercises the full VERSION pattern end-to-end (the lifecycle re-loads per command).
    const { fs, backlog } = seed("1.0.0");
    const d = (): CliDeps => deps(fs, backlog);

    // 39: starts at 1.0.0
    let i = io();
    expect(await run(["project", "version", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text.trim()).toBe("1.0.0");

    // 40: bump major → 2.0.0, then 39 reflects it
    expect(await run(["project", "version", "bump", "major", "-C", PROJ], d(), io())).toBe(0);
    i = io();
    expect(await run(["project", "version", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text.trim()).toBe("2.0.0");

    // 40: bump patch → 2.0.1, then 39 reflects it
    expect(await run(["project", "version", "bump", "patch", "-C", PROJ], d(), io())).toBe(0);
    i = io();
    expect(await run(["project", "version", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text.trim()).toBe("2.0.1");

    // 41: set 5.6.7 → then 39 reflects it
    expect(await run(["project", "version", "set", "5.6.7", "-C", PROJ], d(), io())).toBe(0);
    i = io();
    expect(await run(["project", "version", "-C", PROJ], d(), i)).toBe(0);
    expect(i.out.text.trim()).toBe("5.6.7");

    // the author's hand-written comment survived every write:
    expect(fs.read(`${PROJ}/wip/manifest.yml`)).toContain(MANIFEST_COMMENT);
  });
});

describe("bumpSemVer (task-18 / doc 13 §4 semver logic)", () => {
  it.each([
    ["1.2.3", "patch", "1.2.4"],
    ["1.2.3", "minor", "1.3.0"],
    ["1.2.3", "major", "2.0.0"],
    ["0.0.0", "patch", "0.0.1"],
    ["0.3.1", "minor", "0.4.0"],
    ["0.9.9", "major", "1.0.0"],
  ])("bumps %s by %s to %s", (from, level, expected) => {
    expect(bumpSemVer(from as SemVer, level as "major" | "minor" | "patch")).toBe(expected);
  });
});

describe("version bump completion (task-40 AC#5 — the completion half)", () => {
  const SPECS = {
    "project version bump": { args: ["bump-levels"] },
  };
  it("AC#5 — `project version bump <tab>` completes from major/minor/patch", () => {
    const { fs, backlog } = seed();
    const d = deps(fs, backlog, PROJ);
    const suggestions = completeArgv(buildProgram(d, io()), ["project", "version", "bump", ""], {
      fs: d.fs,
      env: d.env,
      builtinTemplatesRoot: d.builtinTemplatesRoot,
      registry: defaultRegistry(),
      specs: SPECS,
    });
    expect(suggestions.sort()).toEqual(["major", "minor", "patch"]);
  });
});
