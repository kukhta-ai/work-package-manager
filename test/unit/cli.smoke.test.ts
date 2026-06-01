import { describe, expect, it } from "vitest";
import pkg from "../../package.json" with { type: "json" };
import { FakeBacklog } from "../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../src/adapters/fake-env.js";
import { FixedClock } from "../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../src/adapters/memory-fs.js";
import { type CliDeps, run } from "../../src/cli.js";
import type { CliIo, OutputSink } from "../../src/util/exit.js";

/**
 * Isolated-logic (unit) test: exercises the composition root's `run()` purely in-process via in-memory ports
 * + a string-collecting {@link OutputSink} — no real file system and no subprocess. The through-the-edges
 * counterpart (the built binary via a bin symlink) lives in `test/integration/cli.bin.test.ts`.
 */

/** A string-collecting {@link OutputSink} for asserting CLI output in-process. */
function collector(): OutputSink & { text: string } {
  return {
    text: "",
    write(chunk: string) {
      this.text += chunk;
    },
  };
}

/** A minimal in-memory {@link CliDeps} (no real fs/subprocess). */
function deps(): CliDeps {
  return {
    fs: new MemoryFileSystem(),
    backlog: new FakeBacklog(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new FakeEnvironment({ cwd: "/" }),
    builtinTemplatesRoot: "/builtin",
  };
}

/** An I/O bundle with collectors for out/err. */
function io(
  debug = false,
): CliIo & { out: ReturnType<typeof collector>; err: ReturnType<typeof collector> } {
  return { out: collector(), err: collector(), debug };
}

describe("cli run() — commander composition root (task-27)", () => {
  it("prints the package version and exits 0 for --version", async () => {
    const i = io();
    const code = await run(["--version"], deps(), i);
    expect(code).toBe(0);
    expect(i.out.text).toContain(pkg.version);
  });

  it("exits 0 for --help", async () => {
    const i = io();
    const code = await run(["--help"], deps(), i);
    expect(code).toBe(0);
    expect(i.out.text.length).toBeGreaterThan(0);
  });

  it("shows help and exits 0 for a bare invocation", async () => {
    const i = io();
    const code = await run([], deps(), i);
    expect(code).toBe(0);
  });

  it("exits 2 (usage) for an unknown command", async () => {
    const i = io();
    const code = await run(["nope"], deps(), i);
    expect(code).toBe(2);
  });

  it("lists the top-level groups in help output (AC#1)", async () => {
    const i = io();
    await run(["--help"], deps(), i);
    for (const group of ["init", "template", "project", "bundle", "build"]) {
      expect(i.out.text).toContain(group);
    }
  });
});
