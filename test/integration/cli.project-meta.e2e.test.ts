import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../helpers/tmpdir.js";

/**
 * End-to-end (through-the-binary) tests for `project meta` (task-38). They drive the BUILT `dist/cli.js` over a
 * REAL `NodeFileSystem` tmpdir, so the comment-preserving `manifest.yml` edit, the omitted-field preservation, the
 * no-flag no-op, the exit codes / `-C` honouring, and — load-bearing — the ④ RERENDER of the derived artefacts on
 * a `--name` change are all verified the way an author runs them. No `backlog` is needed (`project meta`
 * materialises nothing), but the binary still drives the real fs round-trip and the real re-render.
 *
 * Each test bootstraps with `wpm init demo --at <proj>`, which writes a real `manifest.yml` (a leading comment +
 * the `project:` map with `name`/`version`; `targets: []`) AND renders the initial `AGENTS.md` +
 * `installer-skills/demo-installer/SKILL.md` — so the `--name` re-render is testable against REAL derived
 * artefacts. Skipped (not failed) when `dist/` is unbuilt; CI builds first.
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

/** init a real project at <dir>/demo; return the project path (with a real manifest + rendered derived artefacts). */
function initProject(dir: string): string {
  const proj = join(dir, "demo");
  execFileSync(process.execPath, [builtCli, "init", "demo", "--at", proj], { encoding: "utf8" });
  return proj;
}

/** The `project:` sub-key order of a manifest text (for key-order preservation assertions). */
function projectKeyOrder(text: string): string[] {
  const out: string[] = [];
  let inProject = false;
  for (const line of text.split("\n")) {
    if (/^project:/.test(line)) {
      inProject = true;
      continue;
    }
    if (inProject) {
      const m = line.match(/^ {2}([a-z_]+):/);
      if (m?.[1] !== undefined) {
        out.push(m[1]);
      } else if (/^\S/.test(line)) {
        break;
      }
    }
  }
  return out;
}

describeIfBuilt("project meta E2E via dist/cli.js (task 38)", () => {
  it("38#1/38#2 — `project meta --description` updates the field; name/version + comment + key order preserved", async () => {
    await withTempDir((dir) => {
      const proj = initProject(dir);
      const path = join(proj, "manifest.yml");
      const orderBefore = projectKeyOrder(readFileSync(path, "utf8"));

      const out = wpm(proj, ["project", "meta", "--description", "Acme installer"]);
      expect(out.status).toBe(0);

      const after = readFileSync(path, "utf8");
      // the real eemeli/yaml round-trip set project.description:
      expect(after).toMatch(/description:\s*Acme installer/);
      // name + version untouched:
      expect(after).toMatch(/name:\s*demo/);
      expect(after).toMatch(/version:\s*0\.1\.0/);
      // the leading comment survived + the project: key order is stable (description appended after name/version):
      expect(after).toContain("# demo — project release identity");
      expect(projectKeyOrder(after)).toEqual([...orderBefore, "description"]);
    });
  });

  it("38#1 — a multi-flag call sets license + repository + author; others untouched", async () => {
    await withTempDir((dir) => {
      const proj = initProject(dir);
      const out = wpm(proj, [
        "project",
        "meta",
        "--license",
        "MIT",
        "--repository",
        "https://example.com/r",
        "--author",
        "Jane Q",
      ]);
      expect(out.status).toBe(0);

      const after = readFileSync(join(proj, "manifest.yml"), "utf8");
      expect(after).toMatch(/license:\s*MIT/);
      expect(after).toMatch(/repository:\s*https:\/\/example\.com\/r/);
      expect(after).toMatch(/author:\s*Jane Q/);
      // name + version untouched:
      expect(after).toMatch(/name:\s*demo/);
      expect(after).toMatch(/version:\s*0\.1\.0/);
    });
  });

  it("38#3 — `project meta` with NO flags reports 'nothing to update' and leaves manifest.yml BYTE-IDENTICAL", async () => {
    await withTempDir((dir) => {
      const proj = initProject(dir);
      const path = join(proj, "manifest.yml");
      const before = readFileSync(path, "utf8");

      const out = wpm(proj, ["project", "meta"]);
      expect(out.status).toBe(0);
      expect(out.stdout).toContain("nothing to update");
      // the manifest is byte-for-byte unchanged (a true no-op):
      expect(readFileSync(path, "utf8")).toBe(before);
    });
  });

  it("38#4 — outside any project exits non-zero naming manifest.yml; a -C path is honoured", async () => {
    await withTempDir((dir) => {
      const proj = initProject(dir);
      // run from `dir` (OUTSIDE the project at dir/demo) so only -C can resolve it.
      const outside = cli(["project", "meta", "--name", "x"], { cwd: dir });
      expect(outside.status).not.toBe(0);

      // -C honoured: same command with -C <proj> from outside → exit 0 + the name updated.
      const viaFlag = cli(["project", "meta", "--name", "via-flag", "-C", proj], { cwd: dir });
      expect(viaFlag.status).toBe(0);
      expect(readFileSync(join(proj, "manifest.yml"), "utf8")).toMatch(/name:\s*via-flag/);
    });
  });

  it("38#4 / re-render — `project meta --name` re-renders AGENTS.md + the installer skill at the new-name path", async () => {
    await withTempDir((dir) => {
      const proj = initProject(dir);
      // init rendered the front-door + the demo-named installer skill:
      expect(existsSync(join(proj, "AGENTS.md"))).toBe(true);
      expect(existsSync(join(proj, "installer-skills", "demo-installer", "SKILL.md"))).toBe(true);

      const out = wpm(proj, ["project", "meta", "--name", "renamed"]);
      expect(out.status).toBe(0);

      // the front-door re-rendered with the NEW name:
      expect(readFileSync(join(proj, "AGENTS.md"), "utf8")).toContain("renamed");
      // the orchestrator snippet path carries {{project-name}} → the installer SKILL.md is at the NEW name's path:
      expect(existsSync(join(proj, "installer-skills", "renamed-installer", "SKILL.md"))).toBe(
        true,
      );
      // and the manifest name updated:
      expect(readFileSync(join(proj, "manifest.yml"), "utf8")).toMatch(/name:\s*renamed/);
    });
  });

  it("38#5 — `project meta --help` is substantive (usage, every flag, an example)", async () => {
    await withTempDir((dir) => {
      const proj = initProject(dir);
      const help = wpm(proj, ["project", "meta", "--help"]);
      expect(help.status).toBe(0);
      expect(help.stdout).toContain("project meta");
      expect(help.stdout).toMatch(/Usage:/);
      expect(help.stdout).toContain("--name");
      expect(help.stdout).toContain("--description");
      expect(help.stdout).toContain("--license");
      expect(help.stdout).toContain("--repository");
      expect(help.stdout).toContain("--author");
      expect(help.stdout).toMatch(/Example/i);
    });
  });

  it("end-to-end — `project meta --description` then `project show` reflects the edit through the real binary", async () => {
    await withTempDir((dir) => {
      const proj = initProject(dir);
      expect(wpm(proj, ["project", "meta", "--description", "the new desc"]).status).toBe(0);
      const show = wpm(proj, ["project", "show"]);
      expect(show.status).toBe(0);
      expect(show.stdout).toContain("description: the new desc");
    });
  });
});
