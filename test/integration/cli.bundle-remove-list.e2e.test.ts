import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execaSync } from "execa";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../helpers/tmpdir.js";

/**
 * End-to-end (through-the-binary) tests for the two remaining top-level `bundle` verbs — `bundle remove` (task-53,
 * DESTRUCTIVE) and `bundle list` (task-54). They drive the BUILT `dist/cli.js` over a REAL `NodeFileSystem` tmpdir
 * and the REAL `backlog` CLI (the `bundle new` materialise path + the `.authoring-backlog` archive that `remove`
 * performs, and the install-backlog label scan that `list` performs), exercising the user-facing flows the way an
 * author runs them. Skipped (not failed) when `dist/` is unbuilt; CI builds first.
 *
 * The destructive `remove` is verified in BOTH modes the design provides: `--yes` (the scriptable affirmative, no
 * TTY needed) for the teardown path, and a DECLINE (a non-TTY stdin of "n\n", read as a decline) for AC53#4. The
 * prefix-collision case (`web` vs `web-extra`) is the load-bearing safety proof — only `web`'s authoring tasks may
 * be archived.
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
 * Run `dist/cli.js <args> -C <proj>` with `stdin` fed from `input` (a non-TTY) — needed for the DECLINE path of
 * the destructive `remove`, which reads one line from stdin when `--yes` is absent. Returns stdout + status.
 */
function wpmWithStdin(
  proj: string,
  args: readonly string[],
  input: string,
): { stdout: string; status: number } {
  const res = spawnSync(process.execPath, [builtCli, ...args, "-C", proj], {
    encoding: "utf8",
    input,
  });
  return { stdout: res.stdout ?? "", status: res.status ?? 1 };
}

/** init a real project at <dir>/demo and return its path. */
function initProjectAt(dir: string): string {
  const proj = join(dir, "demo");
  execFileSync(process.execPath, [builtCli, "init", "demo", "--at", proj], { encoding: "utf8" });
  return proj;
}

/** Create the bundle `<id>` in an already-init'd project. */
function newBundle(proj: string, id: string): void {
  execFileSync(process.execPath, [builtCli, "bundle", "new", id, "-C", proj], { encoding: "utf8" });
}

/** The titles of the authoring tasks Backlog.md tracks in <proj>/.authoring-backlog (the real materialise root). */
function authoringTaskTitles(proj: string): string {
  // Spawn via `execaSync` (not `execFileSync`) so the real `backlog` CLI resolves on Windows too, where the npm
  // global bin is a `.cmd` shim bare `execFileSync` cannot find (same resolution as `src/util/shell.ts`).
  return execaSync("backlog", ["task", "list", "--plain"], {
    cwd: join(proj, ".authoring-backlog"),
    stdout: "pipe",
    stderr: "pipe",
  }).stdout as string;
}

describeIfBuilt("bundle remove E2E via dist/cli.js (task-53)", () => {
  it("53#1/#2/#3 — `bundle remove web --yes` tears the bundle down completely + re-renders it out of the menu", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      newBundle(proj, "web");

      // preconditions: the bundle, its advisor, its authoring tasks, and its menu entry all exist.
      expect(existsSync(join(proj, "bundles", "web", "bundle.yml"))).toBe(true);
      expect(existsSync(join(proj, "installer-skills", "web-advisor", "SKILL.md"))).toBe(true);
      expect(authoringTaskTitles(proj)).toContain("Plan bundle web");
      expect(readFileSync(join(proj, "AGENTS.md"), "utf8")).toContain("web");

      const out = wpm(proj, ["bundle", "remove", "web", "--yes"]);
      expect(out.status).toBe(0);
      expect(out.stdout).toContain("removed bundle web"); // a summary of what was removed (AC#3)

      // full teardown (AC#2):
      expect(readFileSync(join(proj, "manifest.yml"), "utf8")).not.toMatch(/-\s*web\b/); // manifest entry gone
      expect(existsSync(join(proj, "bundles", "web"))).toBe(false); // dir gone
      expect(existsSync(join(proj, "installer-skills", "web-advisor"))).toBe(false); // advisor gone
      // the bundle's authoring tasks are archived (gone from the active list):
      expect(authoringTaskTitles(proj)).not.toContain("Plan bundle web");
      expect(authoringTaskTitles(proj)).not.toContain("Write advisor content for web");
      // re-rendered out of the front-door menu (AC#3):
      expect(readFileSync(join(proj, "AGENTS.md"), "utf8")).not.toContain("web");
    });
  });

  it("53#4 — declining (a non-TTY `n`) makes NO change and exits 0", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      newBundle(proj, "web");
      const manifestBefore = readFileSync(join(proj, "manifest.yml"), "utf8");

      const out = wpmWithStdin(proj, ["bundle", "remove", "web"], "n\n");
      expect(out.status).toBe(0); // exit 0, NOT an error (AC#4)

      // nothing changed:
      expect(readFileSync(join(proj, "manifest.yml"), "utf8")).toBe(manifestBefore);
      expect(existsSync(join(proj, "bundles", "web", "bundle.yml"))).toBe(true);
      expect(existsSync(join(proj, "installer-skills", "web-advisor", "SKILL.md"))).toBe(true);
      expect(authoringTaskTitles(proj)).toContain("Plan bundle web"); // tasks untouched
    });
  });

  it("53#2 — PREFIX COLLISION: `bundle remove web --yes` archives ONLY web's tasks, never web-extra's", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      newBundle(proj, "web");
      newBundle(proj, "web-extra");

      // both bundles materialised their own "Plan bundle <id>" tasks:
      const before = authoringTaskTitles(proj);
      expect(before).toContain("Plan bundle web");
      expect(before).toContain("Plan bundle web-extra");

      expect(wpm(proj, ["bundle", "remove", "web", "--yes"]).status).toBe(0);

      const after = authoringTaskTitles(proj);
      // web's tasks are archived…
      expect(after).not.toContain("Plan bundle web\n"); // (the active list no longer shows web's task)
      // …but EVERY web-extra task survives (the boundary held — web ⊄ web-extra):
      expect(after).toContain("Plan bundle web-extra");
      expect(after).toContain("Write advisor content for web-extra");
      // and web-extra itself is intact on disk + in the manifest:
      expect(existsSync(join(proj, "bundles", "web-extra", "bundle.yml"))).toBe(true);
      expect(readFileSync(join(proj, "manifest.yml"), "utf8")).toMatch(/web-extra/);
    });
  });

  it("53#5/#6 — outside a project exits non-zero naming manifest.yml; help is substantive", async () => {
    await withTempDir((dir) => {
      // outside any project (cwd = the bare tmpdir, no -C):
      const outside = cli(["bundle", "remove", "web"], { cwd: dir });
      expect(outside.status).not.toBe(0);

      const help = cli(["bundle", "remove", "--help"]);
      expect(help.status).toBe(0);
      expect(help.stdout).toContain("bundle remove");
      expect(help.stdout).toContain("<id>");
      expect(help.stdout).toMatch(/Example/i);
    });
  });
});

/** A task `.md` file with a `kind:migration` label, in the exact frontmatter shape Backlog.md emits. */
function migrationTaskFile(title: string): string {
  return [
    "---",
    "id: WEB-MIG",
    `title: ${title}`,
    "status: To Do",
    "labels:",
    "  - 'kind:migration'",
    "  - 'step:upgrade'",
    "dependencies: []",
    "---",
    "",
    `# ${title}`,
    "",
  ].join("\n");
}

describeIfBuilt("bundle list E2E via dist/cli.js (task-54)", () => {
  it("54#1/#2 — lists each bundle's id, version, and install-backlog kind counts (read-only, exit 0)", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      newBundle(proj, "web");
      newBundle(proj, "doc");
      // pin web to a distinct version so the printed version column is meaningful:
      execFileSync(
        process.execPath,
        [builtCli, "bundle", "web", "version", "set", "1.2.0", "-C", proj],
        {
          encoding: "utf8",
        },
      );
      // a fresh bundle ships the detect/setup/verify trio — all kind:state (3 state, 0 migration). Add ONE
      // kind:migration task to web's install-backlog (as an author would via `backlog` inside the bundle) so the
      // migration column is exercised too.
      writeFileSync(
        join(proj, "bundles", "web", "install-backlog", "tasks", "web-9 - Upgrade old layout.md"),
        migrationTaskFile("Upgrade old layout"),
        "utf8",
      );

      const manifestBefore = readFileSync(join(proj, "manifest.yml"), "utf8");
      const out = wpm(proj, ["bundle", "list"]);
      expect(out.status).toBe(0); // read-only, exit 0 (AC#2)

      // a header + a row per bundle:
      expect(out.stdout).toMatch(/id\s+version\s+state\s+migration/);
      // web: version 1.2.0, the 3 shipped kind:state tasks + the 1 added kind:migration:
      expect(out.stdout).toMatch(/web\s+1\.2\.0\s+3\s+1/);
      // doc: version 0.1.0, the 3 shipped kind:state tasks, 0 migration:
      expect(out.stdout).toMatch(/doc\s+0\.1\.0\s+3\s+0/);

      // read-only: the manifest is untouched (AC#2):
      expect(readFileSync(join(proj, "manifest.yml"), "utf8")).toBe(manifestBefore);
    });
  });

  it("54#3/#4 — outside a project exits non-zero naming manifest.yml; help is substantive", async () => {
    await withTempDir((dir) => {
      const outside = cli(["bundle", "list"], { cwd: dir });
      expect(outside.status).not.toBe(0);

      const help = cli(["bundle", "list", "--help"]);
      expect(help.status).toBe(0);
      expect(help.stdout).toContain("bundle list");
      expect(help.stdout).toMatch(/Example/i);
    });
  });
});
