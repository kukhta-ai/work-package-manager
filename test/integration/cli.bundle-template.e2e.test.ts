import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../helpers/tmpdir.js";
import { initWorkspace } from "../helpers/workspace.js";

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

/**
 * Create a real authoring workspace at <dir>/demo via `wpm init` (deliverable under `wip/`, authoring backlog
 * at the workspace root) and return the workspace root; project-bound commands resolve it via `-C` (task-88).
 */
function initProjectAt(dir: string): string {
  return initWorkspace(builtCli, dir);
}

describeIfBuilt("bundle template show / set E2E via dist/cli.js (tasks 55/56)", () => {
  it("55 — after the FULL init (task-34), `show` on a fresh project SUCCEEDS (init now materialises bundles/bundle-template/)", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      // task-34: the FULL `init` materialises the default bundle template at bundles/bundle-template/, so it is
      // PRESENT in a freshly-init'd project (this supersedes the skeleton-era "init ships no bundles/" assertion).
      expect(existsSync(join(proj, "wip", "bundles", "bundle-template"))).toBe(true);
      const out = wpm(proj, ["bundle", "template", "show"]);
      expect(out.status).toBe(0);
      expect(out.stdout).toContain("Bundle template: bundles/bundle-template/");
      expect(out.stdout).toContain("_AGENTS.md.tmpl");
    });
  });

  it("56#1 — `set default` populates bundles/bundle-template/ from the built-in template files/ tree (verbatim)", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      const out = wpm(proj, ["bundle", "template", "set", "default"]);
      expect(out.status).toBe(0);
      expect(out.stdout).toMatch(/set bundle template from "default"/);

      // the built-in default's files/ tree landed (AGENTS.md.tmpl + the install-backlog config + payload slots):
      expect(existsSync(join(proj, "wip", "bundles", "bundle-template", "_AGENTS.md.tmpl"))).toBe(
        true,
      );
      expect(
        existsSync(
          join(proj, "wip", "bundles", "bundle-template", "install-backlog", "config.yml.tmpl"),
        ),
      ).toBe(true);
      // verbatim copy — the {{placeholders}} are NOT substituted (the scaffold keeps them for `bundle new`):
      expect(
        readFileSync(join(proj, "wip", "bundles", "bundle-template", "_AGENTS.md.tmpl"), "utf8"),
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
      expect(out.stdout).toContain("_AGENTS.md.tmpl");
    });
  });

  it("56#2 — an unresolved name fails (non-zero) changing nothing", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      // task-34: init now materialises bundles/bundle-template/, so "changing nothing" is asserted by snapshotting
      // the scaffold tree BEFORE the failed `set` and confirming it is byte-identical AFTER (not by its absence).
      const scaffold = join(proj, "wip", "bundles", "bundle-template");
      const snapshot = (): Record<string, string> => {
        const out: Record<string, string> = {};
        const walk = (d: string): void => {
          for (const e of readdirSync(d, { withFileTypes: true })) {
            const child = join(d, e.name);
            if (e.isDirectory()) walk(child);
            else out[child.slice(scaffold.length)] = readFileSync(child, "utf8");
          }
        };
        walk(scaffold);
        return out;
      };
      const before = snapshot();

      const out = wpm(proj, ["bundle", "template", "set", "does-not-exist"]);
      expect(out.status).not.toBe(0);
      // the failed `set` changed nothing — the scaffold tree is unchanged:
      expect(snapshot()).toEqual(before);
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
