import { describe, expect, it } from "vitest";
import pkg from "../../package.json" with { type: "json" };
import { type OutputSink, run } from "../../src/cli.js";

/**
 * Isolated-logic (unit) test: exercises the CLI's `run()` purely in-process via an injected
 * {@link OutputSink} — no real file system and no subprocess. This is the AC#2 demonstration for the
 * harness (pure logic without touching fs/subprocess). The through-the-edges counterpart lives in
 * `test/integration/`.
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

describe("cli run() — bootstrap smoke (task-1)", () => {
  // AC#2: running the command with a version flag prints the version and exits successfully.
  it("prints the package version and exits 0 for --version", () => {
    const out = collector();
    const code = run(["--version"], out);
    expect(code).toBe(0);
    expect(out.text.trim()).toBe(pkg.version);
  });

  it("prints the package version and exits 0 for the -V alias", () => {
    const out = collector();
    const code = run(["-V"], out);
    expect(code).toBe(0);
    expect(out.text.trim()).toBe(pkg.version);
  });

  it("prints a one-line usage and exits 0 for --help", () => {
    const out = collector();
    const code = run(["--help"], out);
    expect(code).toBe(0);
    expect(out.text).toMatch(/^usage: installer/);
  });

  it("prints a one-line usage and exits 0 for no arguments", () => {
    const out = collector();
    const code = run([], out);
    expect(code).toBe(0);
    expect(out.text).toMatch(/^usage: installer/);
  });

  it("rejects an unknown argument with usage exit code 2", () => {
    const out = collector();
    const err = collector();
    const code = run(["--nope"], out, err);
    expect(code).toBe(2);
    expect(err.text).toContain("unknown argument");
  });
});
