import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../helpers/tmpdir.js";

/**
 * End-to-end (through-the-binary) tests for the bundle-membership lifecycle — `bundle new` / `enable` /
 * `disable` (tasks 50/51/52). They drive the BUILT `dist/cli.js` over a REAL `NodeFileSystem` tmpdir and the
 * REAL `backlog` CLI (the materialise path), exercising the user-facing flows the way an author runs them. This
 * complements the in-process AC tests (`test/unit/cli/bundle-lifecycle-commands.test.ts`, in-memory ports) and
 * the `--version`/round-trip regression in `cli.bundle-new.test.ts` — here the focus is the doc-10 worked
 * authoring flow and the binary-only surfaces (exit codes, completion via `__complete`).
 *
 * Skipped (not failed) when `dist/` is unbuilt, like `cli.bin.test.ts`/`cli.init.test.ts`; CI builds first, so
 * it runs there. The `backlog` CLI is required for `bundle new`'s materialisation (the package's Step-0 toolchain
 * installs it); these tests assert the materialised tasks via `backlog task list`.
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

/** `wpm <args> -C <proj>` — the project-bound form every lifecycle command uses. */
function wpm(proj: string, args: readonly string[]): { stdout: string; status: number } {
  return cli([...args, "-C", proj]);
}

/** init a real project at <dir>/demo and return its path. */
function initProjectAt(dir: string): string {
  const proj = join(dir, "demo");
  execFileSync(process.execPath, [builtCli, "init", "demo", "--at", proj], { encoding: "utf8" });
  return proj;
}

/** The titles of the authoring tasks Backlog.md tracks in <proj>/.authoring-backlog. */
function authoringTaskTitles(proj: string): string {
  // `bundle new` materialises into the project's own Backlog.md root at .authoring-backlog (doc 10 step 6).
  return execFileSync("backlog", ["task", "list", "--plain"], {
    encoding: "utf8",
    cwd: join(proj, ".authoring-backlog"),
  });
}

describeIfBuilt("bundle lifecycle E2E via dist/cli.js (tasks 50/51/52)", () => {
  it("the doc-10 worked authoring flow: init → bundle new (×2) scaffolds advisors, lists both in the menu, materialises tasks", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);

      expect(wpm(proj, ["bundle", "new", "web-handoff"]).status).toBe(0);
      expect(wpm(proj, ["bundle", "new", "doc-handoff"]).status).toBe(0);

      // Both bundle dirs exist with a canonical bundle.yml + the rendered install-backlog config (task_prefix).
      for (const id of ["web-handoff", "doc-handoff"]) {
        expect(existsSync(join(proj, "bundles", id, "bundle.yml"))).toBe(true);
        const config = readFileSync(
          join(proj, "bundles", id, "install-backlog", "config.yml"),
          "utf8",
        );
        expect(config).toContain("task_prefix");
        expect(config).toContain(id); // the rendered task_prefix == the id
        // Each bundle auto-scaffolded its advisor stub (doc 10 step 6).
        const advisor = readFileSync(
          join(proj, "installer-skills", `${id}-advisor`, "SKILL.md"),
          "utf8",
        );
        expect(advisor).toContain(`name: ${id}-advisor`);
      }

      // The front-door menu lists BOTH bundles (re-rendered on each `bundle new`).
      const agents = readFileSync(join(proj, "AGENTS.md"), "utf8");
      expect(agents).toContain("web-handoff");
      expect(agents).toContain("doc-handoff");
      // The manifest enables both.
      const manifest = readFileSync(join(proj, "manifest.yml"), "utf8");
      expect(manifest).toMatch(/web-handoff/);
      expect(manifest).toMatch(/doc-handoff/);

      // The per-bundle authoring tasks materialised in the real .authoring-backlog (doc 11 §3).
      const titles = authoringTaskTitles(proj);
      expect(titles).toContain("Plan bundle web-handoff");
      expect(titles).toContain("Write advisor content for web-handoff");
      expect(titles).toContain("Plan bundle doc-handoff");
    });
  });

  it("--no-advisor skips the advisor stub AND its content task through the real binary", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      expect(wpm(proj, ["bundle", "new", "core", "--no-advisor"]).status).toBe(0);

      expect(existsSync(join(proj, "bundles", "core", "bundle.yml"))).toBe(true);
      expect(existsSync(join(proj, "installer-skills", "core-advisor", "SKILL.md"))).toBe(false);
      expect(authoringTaskTitles(proj)).not.toContain("Write advisor content for core");
    });
  });

  it("--disabled scaffolds the dir but leaves the bundle out of the manifest (and the menu)", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      expect(wpm(proj, ["bundle", "new", "draft", "--disabled"]).status).toBe(0);

      expect(existsSync(join(proj, "bundles", "draft", "bundle.yml"))).toBe(true); // dir scaffolded
      const manifest = readFileSync(join(proj, "manifest.yml"), "utf8");
      expect(manifest).not.toMatch(/draft/); // not enabled
      expect(readFileSync(join(proj, "AGENTS.md"), "utf8")).not.toContain("draft"); // not in the menu
    });
  });

  it("a reserved cross-bundle verb as an id is refused with exit 2, creating nothing (real binary)", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      const out = wpm(proj, ["bundle", "new", "list"]);
      expect(out.status).toBe(2); // a USAGE error through the real binary
      expect(existsSync(join(proj, "bundles", "list"))).toBe(false);
    });
  });

  it("disabling then re-enabling restores menu membership without re-creating tasks (real binary + backlog)", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      expect(wpm(proj, ["bundle", "new", "web"]).status).toBe(0);
      const titlesAfterNew = authoringTaskTitles(proj);

      expect(wpm(proj, ["bundle", "disable", "web"]).status).toBe(0);
      expect(readFileSync(join(proj, "manifest.yml"), "utf8")).not.toMatch(/bundles:.*\bweb\b/s);
      expect(existsSync(join(proj, "bundles", "web", "bundle.yml"))).toBe(true); // dir stays

      const enabled = wpm(proj, ["bundle", "enable", "web"]);
      expect(enabled.status).toBe(0);
      expect(readFileSync(join(proj, "manifest.yml"), "utf8")).toMatch(/web/);
      // re-enable did not duplicate the per-bundle tasks (title-idempotent) — the set is unchanged.
      expect(authoringTaskTitles(proj)).toBe(titlesAfterNew);
    });
  });

  it("completion (via __complete) offers disabled-but-present dirs for `enable` and enabled bundles for `disable`", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      expect(wpm(proj, ["bundle", "new", "web"]).status).toBe(0); // enabled
      expect(wpm(proj, ["bundle", "new", "doc", "--disabled"]).status).toBe(0); // present but disabled

      // The completion line carries no -C; the source resolves the project from cwd (= the project root).
      const enableComp = cli(["__complete", "bundle", "enable", ""], { cwd: proj });
      expect(enableComp.status).toBe(0);
      const enableSuggestions = enableComp.stdout.split("\n").filter((l) => l.length > 0);
      expect(enableSuggestions).toContain("doc"); // disabled-but-present
      expect(enableSuggestions).not.toContain("web"); // already enabled

      const disableComp = cli(["__complete", "bundle", "disable", ""], { cwd: proj });
      expect(disableComp.status).toBe(0);
      const disableSuggestions = disableComp.stdout.split("\n").filter((l) => l.length > 0);
      expect(disableSuggestions).toContain("web"); // enabled
    });
  });
});
