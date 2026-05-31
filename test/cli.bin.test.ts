import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };

/**
 * Guards the regression where the program entry-point check compared `import.meta.url` to
 * `process.argv[1]` directly: under a `bin` symlink (the `installer`/`wpm` install path) those
 * differ, so the CLI ran but produced no output. This drives the *built* binary through a symlink
 * — the real AC#1 invocation — to keep that path covered. It is skipped (not failed) when `dist/`
 * has not been built, so `vitest run` works on a fresh checkout without a prior build; CI builds
 * first, so the assertion runs there. The full integration harness is task-6.
 */
const builtCli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const hasBuild = existsSync(builtCli);
const describeIfBuilt = hasBuild ? describe : describe.skip;

describeIfBuilt("installer/wpm binary via a bin symlink (AC#1)", () => {
  let dir: string;
  let link: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "wpm-bin-"));
    link = join(dir, "installer");
    // Mimic how npm exposes the bin: a symlink on PATH pointing at dist/cli.js.
    symlinkSync(builtCli, link);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("prints the version and exits 0 when run through the symlink", () => {
    const out = execFileSync(process.execPath, [link, "--version"], { encoding: "utf8" });
    expect(out.trim()).toBe(pkg.version);
  });

  it("prints usage through the symlink for --help", () => {
    const out = execFileSync(process.execPath, [link, "--help"], { encoding: "utf8" });
    expect(out).toMatch(/^usage: installer/);
  });
});
