import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { buildProgram, type CliDeps, COMPLETION_SPECS, run } from "../../../src/cli.js";
import { completeArgv } from "../../../src/completion/complete.js";
import { defaultRegistry } from "../../../src/completion/registry.js";
import {
  buildLockfile,
  serializeLockfile,
  type VendoredArtifact,
} from "../../../src/core/services/integrity.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";

/**
 * Acceptance tests for the `build` command family, driven through `run()` in-process over in-memory ports. This
 * pass covers `build dry-run` (task-82) — validate + frozen-lockfile + the would-ship preview, producing no
 * artefact. `build package`/`publish` (tasks 83/84) extend this file. The fixture seeds a coherent, buildable
 * project at /proj (a target + one enabled bundle + the skeleton), so a fresh `dry-run` succeeds.
 */

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

function deps(fs: MemoryFileSystem, cwd = "/work"): CliDeps {
  return {
    fs,
    backlog: new FakeBacklog(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new FakeEnvironment({ cwd }),
    builtinTemplatesRoot: "/builtin",
  };
}

/** A coherent, buildable project at /proj (target present, one enabled bundle, the shippable skeleton). */
function seedBuildable(): MemoryFileSystem {
  const fs = new MemoryFileSystem();
  fs.write(
    `${PROJ}/wip/manifest.yml`,
    "project:\n  name: demo\n  version: 1.2.3\ntargets:\n  - claude-code\nbundles:\n  - core\n",
  );
  fs.write(
    `${PROJ}/wip/bundles/core/bundle.yml`,
    "id: core\nversion: 0.1.0\nsummary: the core bundle\nconfirmation: safe\nrequires: {}\n",
  );
  fs.write(`${PROJ}/wip/AGENTS.md`, "# demo front door\n");
  fs.write(`${PROJ}/wip/installer-skills/demo-installer/SKILL.md`, "# installer\n");
  fs.write(`${PROJ}/.authoring-backlog/config.yml`, "task_prefix: authoring\n");
  return fs;
}

/** Resolve completion suggestions for `words` against a project at /proj (the cwd, so the project resolves). */
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

/** List the files currently present anywhere under /proj (to assert dry-run produces NO artefact). */
function allFiles(fs: MemoryFileSystem, base = PROJ): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    if (!fs.exists(dir)) return;
    for (const e of fs.list(dir)) {
      const child = `${dir}/${e.name}`;
      if (e.kind === "directory") walk(child);
      else out.push(child);
    }
  };
  walk(base);
  return out.sort();
}

describe("build dry-run (task-82)", () => {
  it("AC82#1/#3/#4 — a coherent project: exit 0, prints the would-ship tree, no artefact produced", async () => {
    const fs = seedBuildable();
    const before = allFiles(fs);
    const i = io();
    const code = await run(["build", "dry-run", "-C", PROJ], deps(fs), i);

    expect(code).toBe(0); // AC82#4
    // AC82#3 — the would-ship tree is printed (skeleton present, .authoring-backlog excluded):
    expect(i.out.text).toMatch(/would ship \d+ file/);
    expect(i.out.text).toContain("manifest.yml");
    expect(i.out.text).toContain("AGENTS.md");
    expect(i.out.text).toContain("bundles/core/bundle.yml");
    expect(i.out.text).not.toContain(".authoring-backlog");
    // AC82#3 — NO artefact produced: the project tree is byte-for-byte unchanged.
    expect(allFiles(fs)).toEqual(before);
  });

  it("AC82#1/#4 — a project that FAILS validation exits non-zero and prints the findings", async () => {
    const fs = seedBuildable();
    // No targets ⇒ validateProject reports "no target agents declared".
    fs.write(
      `${PROJ}/wip/manifest.yml`,
      "project:\n  name: demo\n  version: 1.2.3\ntargets: []\nbundles:\n  - core\n",
    );
    const before = allFiles(fs);
    const i = io();
    const code = await run(["build", "dry-run", "-C", PROJ], deps(fs), i);

    expect(code).toBe(1); // AC82#4 — non-zero on a validation failure
    expect(i.out.text).toMatch(/validation failed/i);
    expect(i.out.text).toMatch(/target/i);
    // still no artefact:
    expect(allFiles(fs)).toEqual(before);
  });

  it("AC82#2 — wpm.lock DRIFT fails the dry-run (exit 1) and names the drifted artifact", async () => {
    const fs = seedBuildable();
    fs.write(`${PROJ}/wip/installer-skills/tdd/SKILL.md`, "# tdd\noriginal\n");
    const artifact: VendoredArtifact = {
      name: "tdd",
      source: "obra/superpowers@v1",
      version: "1.0.0",
      files: [{ path: "SKILL.md", content: "# tdd\noriginal\n" }],
    };
    fs.write(`${PROJ}/wip/wpm.lock`, serializeLockfile(buildLockfile([artifact])));
    // Tamper after pinning:
    fs.write(`${PROJ}/wip/installer-skills/tdd/SKILL.md`, "# tdd\nTAMPERED\n");

    const i = io();
    const code = await run(["build", "dry-run", "-C", PROJ], deps(fs), i);
    expect(code).toBe(1); // AC82#2/#4
    expect(i.out.text).toMatch(/wpm.lock check failed/i);
    expect(i.out.text).toContain("tdd");
  });

  it("AC82#2/#3 — a matching wpm.lock: exit 0, and the vendored artifact's version + source are printed", async () => {
    const fs = seedBuildable();
    fs.write(`${PROJ}/wip/installer-skills/tdd/SKILL.md`, "# tdd\n");
    const artifact: VendoredArtifact = {
      name: "tdd",
      source: "obra/superpowers@v1.2",
      version: "1.2.0",
      files: [{ path: "SKILL.md", content: "# tdd\n" }],
    };
    fs.write(`${PROJ}/wip/wpm.lock`, serializeLockfile(buildLockfile([artifact])));

    const i = io();
    const code = await run(["build", "dry-run", "-C", PROJ], deps(fs), i);
    expect(code).toBe(0);
    // AC82#3 — each vendored artifact's locked version + source:
    expect(i.out.text).toMatch(/tdd\s+1\.2\.0\s+\(obra\/superpowers@v1\.2\)/);
  });

  it("AC82#5 — run outside any project exits non-zero naming manifest.yml + init/-C", async () => {
    const fs = seedBuildable();
    const i = io();
    const code = await run(["build", "dry-run"], deps(fs, "/nowhere"), i);
    expect(code).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
    expect(i.err.text).toMatch(/init|-C/);
  });

  it("AC82#6 — `build dry-run --help` is substantive (description, usage, an example)", async () => {
    const fs = seedBuildable();
    const i = io();
    const code = await run(["build", "dry-run", "--help"], deps(fs), i);
    expect(code).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toMatch(/dry-run/);
    expect(help).toMatch(/Example/i);
    expect(help).toContain("wpm build dry-run");
  });
});

describe("build package (task-83)", () => {
  it("AC83#1 — a project that FAILS validation exits 1 and produces NO artefact (fails before producing)", async () => {
    const fs = seedBuildable();
    // No targets ⇒ validate fails; the package must not be produced.
    fs.write(
      `${PROJ}/wip/manifest.yml`,
      "project:\n  name: demo\n  version: 1.2.3\ntargets: []\nbundles:\n  - core\n",
    );
    const before = allFiles(fs);
    const i = io();
    const code = await run(["build", "package", "--format", "tarball", "-C", PROJ], deps(fs), i);
    expect(code).toBe(1); // AC83#1
    expect(i.out.text).toMatch(/validation failed/i);
    // nothing produced (the memory fs has no new file — no archive write reached):
    expect(allFiles(fs)).toEqual(before);
  });

  it("AC83#3 — an unsupported --format value is a usage error, exit 2", async () => {
    const fs = seedBuildable();
    const i = io();
    const code = await run(["build", "package", "--format", "bogus", "-C", PROJ], deps(fs), i);
    expect(code).toBe(2); // AC83#3 (commander .choices rejects the value)
  });

  it("AC83#4 — run outside any project exits non-zero naming manifest.yml", async () => {
    const fs = seedBuildable();
    const i = io();
    const code = await run(["build", "package", "--format", "tarball"], deps(fs, "/nowhere"), i);
    expect(code).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC83#5 — `--format` completes from zip, tarball, git", () => {
    const fs = seedBuildable();
    const out = complete(fs, ["build", "package", "--format", ""]);
    expect([...out].sort()).toEqual(["git", "tarball", "zip"]);
  });

  it("AC83#5 — `build package --help` documents --format, its values, and an example", async () => {
    const fs = seedBuildable();
    const i = io();
    const code = await run(["build", "package", "--help"], deps(fs), i);
    expect(code).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("--format");
    // commander renders the choices in the option description:
    expect(help).toMatch(/zip/);
    expect(help).toMatch(/tarball/);
    expect(help).toMatch(/git/);
    expect(help).toMatch(/Example/i);
  });
});

describe("build publish (task-84)", () => {
  it("AC84#2 — a publish whose BUILD fails (validation) does NOT push and exits non-zero", async () => {
    const fs = seedBuildable();
    // No targets ⇒ the build step (validate) fails BEFORE any push.
    fs.write(
      `${PROJ}/wip/manifest.yml`,
      "project:\n  name: demo\n  version: 1.2.3\ntargets: []\nbundles:\n  - core\n",
    );
    // A local-dir destination that must stay EMPTY (no push happened).
    fs.makeDirectories("/dest");
    const i = io();
    const code = await run(
      ["build", "publish", "/dest", "--format", "tarball", "-C", PROJ],
      deps(fs),
      i,
    );

    expect(code).toBe(1); // AC84#2 — build failure surfaces non-zero
    expect(i.out.text).toMatch(/validation failed/i);
    // AC84#2 — nothing was pushed: the destination dir has no archive.
    expect(fs.list("/dest").length).toBe(0);
  });

  it("AC84#2 — a publish whose lockfile DRIFTS does not push and exits non-zero", async () => {
    const fs = seedBuildable();
    fs.write(`${PROJ}/wip/installer-skills/tdd/SKILL.md`, "# tdd\noriginal\n");
    const artifact: VendoredArtifact = {
      name: "tdd",
      source: "x@1",
      version: "1.0.0",
      files: [{ path: "SKILL.md", content: "# tdd\noriginal\n" }],
    };
    fs.write(`${PROJ}/wip/wpm.lock`, serializeLockfile(buildLockfile([artifact])));
    fs.write(`${PROJ}/wip/installer-skills/tdd/SKILL.md`, "# tdd\nTAMPERED\n");
    fs.makeDirectories("/dest");

    const i = io();
    const code = await run(
      ["build", "publish", "/dest", "--format", "tarball", "-C", PROJ],
      deps(fs),
      i,
    );
    expect(code).toBe(1);
    expect(i.out.text).toMatch(/wpm.lock check failed/i);
    expect(fs.list("/dest").length).toBe(0); // no push
  });

  it("AC84#3 — run outside any project exits non-zero naming manifest.yml", async () => {
    const fs = seedBuildable();
    const i = io();
    const code = await run(["build", "publish", "/dest"], deps(fs, "/nowhere"), i);
    expect(code).toBe(1);
    expect(i.err.text).toContain("manifest.yml");
  });

  it("AC84#4 — `build publish --help` documents the <destination> positional + an example", async () => {
    const fs = seedBuildable();
    const i = io();
    const code = await run(["build", "publish", "--help"], deps(fs), i);
    expect(code).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("<destination>");
    expect(help).toMatch(/Example/i);
    expect(help).toContain("wpm build publish");
  });
});
