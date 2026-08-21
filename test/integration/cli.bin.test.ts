import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pkg from "../../package.json" with { type: "json" };

/**
 * Through-the-edges (integration) test: drives the *built* `dist/cli.js` through a `bin` symlink — the
 * real `installer`/`wpm` install path. It also guards the regression where the entry-point check compared
 * `import.meta.url` to `process.argv[1]` directly: under a symlink those differ, so the CLI ran but
 * produced no output. The test is skipped (not failed) when `dist/` has not been built, so `vitest run`
 * works on a fresh checkout without a prior build; CI builds first, so the assertion runs there.
 */
const builtCli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
const hasBuild = existsSync(builtCli);
const describeIfBuilt = hasBuild ? describe : describe.skip;

const binNames = ["wpm", "installer"] as const;

describe("published CLI bin map (TASK-106 AC#5)", () => {
  it("declares both executable aliases against the built CLI entry point", () => {
    expect(pkg.bin).toEqual({
      wpm: "./dist/cli.js",
      installer: "./dist/cli.js",
    });
  });
});

describeIfBuilt("installer/wpm binaries via bin symlinks (TASK-106 AC#5)", () => {
  let dir: string;
  let links: Readonly<Record<(typeof binNames)[number], string>>;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "wpm-bin-"));
    links = Object.fromEntries(
      binNames.map((binName) => {
        const link = join(dir, binName);
        // Mimic how npm exposes each declared bin: a symlink on PATH pointing at dist/cli.js.
        const declaredTarget = fileURLToPath(new URL(`../../${pkg.bin[binName]}`, import.meta.url));
        symlinkSync(declaredTarget, link);
        return [binName, link];
      }),
    ) as Record<(typeof binNames)[number], string>;
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it.each(binNames)("%s prints the installed package version and exits 0", (binName) => {
    const out = execFileSync(process.execPath, [links[binName], "--version"], { encoding: "utf8" });
    expect(out.trim()).toBe(pkg.version);
  });

  it("prints usage through the wpm symlink for --help", () => {
    const out = execFileSync(process.execPath, [links.wpm, "--help"], { encoding: "utf8" });
    // commander renders a `Usage: wpm …` block (task-27 replaced the bootstrap usage line).
    expect(out).toMatch(/Usage:/);
  });
});
