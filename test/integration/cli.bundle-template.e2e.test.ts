import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../helpers/tmpdir.js";

/**
 * End-to-end (through-the-binary) tests for the `bundle template` fixed subgroup — `bundle template show`
 * (task-55) and `bundle template set <name>` (task-56). They drive the BUILT `dist/cli.js` over a REAL
 * `NodeFileSystem` tmpdir, exercising the project's default bundle scaffold at `bundles/bundle-template/`: `set
 * default` copies the SHIPPED built-in `templates/bundle/default/files/` tree into it (verbatim, placeholders
 * intact), `show` then prints its tree, and the absent-dir / unresolved-name failure paths exit non-zero. Skipped
 * (not failed) when `dist/` is unbuilt; CI builds first. No `backlog` CLI is needed here (this family touches only
 * the scaffold directory).
 */

const builtCli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
const describeIfBuilt = existsSync(builtCli) ? describe : describe.skip;

/** Run `dist/cli.js <args>` with an optional cwd; return stdout + exit status (recovered on non-zero). */
function cli(
  args: readonly string[],
  opts: { cwd?: string } = {},
): { stdout: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [builtCli, ...args], {
      encoding: "utf8",
      ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
    });
    return { stdout, status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

/** `wpm <args> -C <proj>`. */
function wpm(proj: string, args: readonly string[]): { stdout: string; status: number } {
  return cli([...args, "-C", proj]);
}

/** init a real project at <dir>/demo and return its path. */
function initProjectAt(dir: string): string {
  const proj = join(dir, "demo");
  execFileSync(process.execPath, [builtCli, "init", "demo", "--at", proj], { encoding: "utf8" });
  return proj;
}

describeIfBuilt("bundle template show / set E2E via dist/cli.js (tasks 55/56)", () => {
  it("55 — `show` on a fresh project (init ships no bundles/) exits non-zero naming the dir", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      // a freshly-init'd project has NO bundles/bundle-template/ (the minimal template ships no bundles/).
      expect(existsSync(join(proj, "bundles", "bundle-template"))).toBe(false);
      const out = wpm(proj, ["bundle", "template", "show"]);
      expect(out.status).not.toBe(0);
    });
  });

  it("56#1 — `set default` populates bundles/bundle-template/ from the built-in template files/ tree (verbatim)", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      const out = wpm(proj, ["bundle", "template", "set", "default"]);
      expect(out.status).toBe(0);
      expect(out.stdout).toMatch(/set bundle template from "default"/);

      // the built-in default's files/ tree landed (AGENTS.md.tmpl + the install-backlog config + payload slots):
      expect(existsSync(join(proj, "bundles", "bundle-template", "AGENTS.md.tmpl"))).toBe(true);
      expect(
        existsSync(join(proj, "bundles", "bundle-template", "install-backlog", "config.yml.tmpl")),
      ).toBe(true);
      // verbatim copy — the {{placeholders}} are NOT substituted (the scaffold keeps them for `bundle new`):
      expect(
        readFileSync(join(proj, "bundles", "bundle-template", "AGENTS.md.tmpl"), "utf8"),
      ).toMatch(/\{\{bundle-id\}\}/);
    });
  });

  it("55#1/#2 — after `set`, `show` prints the metadata header + a tree summary (read-only, exit 0)", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      expect(wpm(proj, ["bundle", "template", "set", "default"]).status).toBe(0);

      const out = wpm(proj, ["bundle", "template", "show"]);
      expect(out.status).toBe(0);
      expect(out.stdout).toContain("Bundle template: bundles/bundle-template/");
      expect(out.stdout).toContain("Files:");
      expect(out.stdout).toContain("AGENTS.md.tmpl");
    });
  });

  it("56#2 — an unresolved name fails (non-zero) changing nothing", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      const out = wpm(proj, ["bundle", "template", "set", "does-not-exist"]);
      expect(out.status).not.toBe(0);
      // nothing was created:
      expect(existsSync(join(proj, "bundles", "bundle-template"))).toBe(false);
    });
  });

  it("56#3/55 — help is substantive for both leaves; show synopsis names the command", async () => {
    const setHelp = cli(["bundle", "template", "set", "--help"]);
    expect(setHelp.status).toBe(0);
    expect(setHelp.stdout).toContain("bundle template set");
    expect(setHelp.stdout).toContain("<name>");
    expect(setHelp.stdout).toMatch(/Example/i);

    const showHelp = cli(["bundle", "template", "show", "--help"]);
    expect(showHelp.status).toBe(0);
    expect(showHelp.stdout).toContain("bundle template show");
    expect(showHelp.stdout).toMatch(/Example/i);
  });
});
