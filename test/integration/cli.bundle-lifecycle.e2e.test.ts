import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execaSync } from "execa";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../helpers/tmpdir.js";
import { initWorkspace } from "../helpers/workspace.js";

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

/**
 * Create a real authoring workspace at <dir>/demo via `wpm init` (deliverable under `wip/`, authoring backlog
 * at the workspace root) and return the workspace root; project-bound commands resolve it via `-C` (task-88).
 */
function initProjectAt(dir: string): string {
  return initWorkspace(builtCli, dir);
}

/** The titles of the authoring tasks Backlog.md tracks in <proj>/.authoring-backlog. */
function authoringTaskTitles(proj: string): string {
  // `bundle new` materialises into the project's own Backlog.md root at .authoring-backlog (doc 10 step 6).
  // Spawn via `execaSync` (not `execFileSync`) so the real `backlog` CLI resolves on Windows too, where the npm
  // global bin is a `.cmd` shim bare `execFileSync` cannot find (same resolution as `src/util/shell.ts`).
  return execaSync("backlog", ["task", "list", "--plain"], {
    cwd: join(proj, ".authoring-backlog"),
    stdout: "pipe",
    stderr: "pipe",
  }).stdout as string;
}

function authoringTaskId(proj: string, title: string): string {
  const output = authoringTaskTitles(proj);
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const id = new RegExp(`^\\s{2}([A-Za-z][A-Za-z0-9-]*-\\d+)\\s+-\\s+${escaped}$`, "m").exec(
    output,
  )?.[1];
  if (id === undefined) throw new Error(`Backlog task not found: ${title}`);
  return id;
}

function authoringTaskRecord(proj: string, id: string): string {
  return execaSync("backlog", ["task", id, "--plain"], {
    cwd: join(proj, ".authoring-backlog"),
    stdout: "pipe",
    stderr: "pipe",
  }).stdout as string;
}

describeIfBuilt("bundle lifecycle E2E via dist/cli.js (tasks 50/51/52)", () => {
  it("the doc-10 worked authoring flow: init → bundle new (×2) scaffolds advisors, lists both in the menu, materialises tasks", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);

      expect(wpm(proj, ["bundle", "new", "web-handoff"]).status).toBe(0);
      expect(wpm(proj, ["bundle", "new", "doc-handoff"]).status).toBe(0);

      // Both bundle dirs exist with a canonical bundle.yml + the rendered install-backlog config (task_prefix).
      for (const id of ["web-handoff", "doc-handoff"]) {
        expect(existsSync(join(proj, "wip", "bundles", id, "bundle.yml"))).toBe(true);
        const config = readFileSync(
          join(proj, "wip", "bundles", id, "install-backlog", "config.yml"),
          "utf8",
        );
        expect(config).toContain("task_prefix");
        expect(config).toContain(id); // the rendered task_prefix == the id
        // Each bundle auto-scaffolded its advisor stub (doc 10 step 6).
        const advisor = readFileSync(
          join(proj, "wip", "installer-skills", `${id}-advisor`, "SKILL.md"),
          "utf8",
        );
        expect(advisor).toContain(`name: ${id}-advisor`);
      }

      // The manifest enables both — the source of truth for the install-time menu (the executor front door is
      // author-owned `wip/_AGENTS.md` and is NOT re-rendered on a mutation; task-88).
      const manifest = readFileSync(join(proj, "wip", "manifest.yml"), "utf8");
      expect(manifest).toMatch(/web-handoff/);
      expect(manifest).toMatch(/doc-handoff/);
      expect(existsSync(join(proj, "wip", "_AGENTS.md"))).toBe(true); // author-owned front door present
      expect(existsSync(join(proj, "wip", "AGENTS.md"))).toBe(false); // never auto-rendered on mutation

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

      expect(existsSync(join(proj, "wip", "bundles", "core", "bundle.yml"))).toBe(true);
      expect(existsSync(join(proj, "wip", "installer-skills", "core-advisor", "SKILL.md"))).toBe(
        false,
      );
      expect(authoringTaskTitles(proj)).not.toContain("Write advisor content for core");
    });
  });

  it("--disabled scaffolds the dir but leaves the bundle out of the manifest (and the menu)", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      expect(wpm(proj, ["bundle", "new", "draft", "--disabled"]).status).toBe(0);

      expect(existsSync(join(proj, "wip", "bundles", "draft", "bundle.yml"))).toBe(true); // dir scaffolded
      const manifest = readFileSync(join(proj, "wip", "manifest.yml"), "utf8");
      expect(manifest).not.toMatch(/draft/); // not enabled (and so absent from the install-time menu)
    });
  });

  it("records a disabled bundle contribution, resolves actual dependency IDs, and enables after source removal without changing human progress", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      const templateRoot = join(proj, "wip", "templates", "bundle", "qa-recorded");
      mkdirSync(join(templateRoot, "files", "install-backlog"), { recursive: true });
      mkdirSync(join(templateRoot, "files", "installer-skills"), { recursive: true });
      writeFileSync(
        join(templateRoot, "template.yml"),
        [
          "name: qa-recorded",
          "scope: bundle",
          'revision: "qa-recorded-r1"',
          "authoring-tasks:",
          "  - key: inspect-recorded",
          '    title: "Inspect {{wpm.bundle.id}} recorded contribution"',
          "    acceptance-criteria:",
          "      - The recorded contribution is inspectable",
          "    depends-on:",
          "      - wpm:bundle:plan",
          "",
        ].join("\n"),
      );
      writeFileSync(
        join(templateRoot, "files", "install-backlog", "config.yml"),
        "task_prefix: {{bundle-id}}\n",
      );
      writeFileSync(join(templateRoot, "files", "installer-skills", ".keep"), "");

      expect(wpm(proj, ["bundle", "template", "set", "qa-recorded"]).status).toBe(0);
      expect(wpm(proj, ["bundle", "new", "durable", "--disabled", "--no-advisor"]).status).toBe(0);
      const planId = authoringTaskId(proj, "Plan bundle durable");
      const contributionTitle = "Inspect durable recorded contribution";
      const contributionId = authoringTaskId(proj, contributionTitle);
      expect(authoringTaskRecord(proj, contributionId)).toContain(planId);

      execaSync(
        "backlog",
        [
          "task",
          "edit",
          contributionId,
          "-s",
          "In Progress",
          "--check-ac",
          "1",
          "--notes",
          "preserve this human progress",
        ],
        { cwd: join(proj, ".authoring-backlog"), stdout: "pipe", stderr: "pipe" },
      );
      const beforeRecord = authoringTaskRecord(proj, contributionId);
      const beforeList = authoringTaskTitles(proj);
      expect(beforeRecord).toContain("wpm:template-origin:project-local:bundle:qa-recorded");
      expect(beforeRecord).toContain("wpm:template-revision:qa-recorded-r1");
      expect(beforeRecord).toContain("wpm:template-key:inspect-recorded");
      expect(beforeRecord).toContain("wpm:bundle:durable");

      rmSync(templateRoot, { recursive: true, force: true });
      rmSync(join(proj, "wip", "bundles", "bundle-template"), {
        recursive: true,
        force: true,
      });
      const enabled = wpm(proj, ["bundle", "enable", "durable", "--no-advisor"]);
      expect(enabled.status).toBe(0);
      expect(authoringTaskTitles(proj)).toBe(beforeList);
      expect(authoringTaskRecord(proj, contributionId)).toBe(beforeRecord);
      expect(readFileSync(join(proj, ".wpm-bundle-authoring.json"), "utf8")).toContain(
        "qa-recorded-r1",
      );
      expect(existsSync(join(proj, "wip", ".wpm-bundle-authoring.json"))).toBe(false);
    });
  });

  it("a reserved cross-bundle verb as an id is refused with exit 2, creating nothing (real binary)", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      const out = wpm(proj, ["bundle", "new", "list"]);
      expect(out.status).toBe(2); // a USAGE error through the real binary
      expect(existsSync(join(proj, "wip", "bundles", "list"))).toBe(false);
    });
  });

  it("disabling then re-enabling restores menu membership without re-creating tasks (real binary + backlog)", async () => {
    await withTempDir((dir) => {
      const proj = initProjectAt(dir);
      expect(wpm(proj, ["bundle", "new", "web"]).status).toBe(0);
      const titlesAfterNew = authoringTaskTitles(proj);

      expect(wpm(proj, ["bundle", "disable", "web"]).status).toBe(0);
      expect(readFileSync(join(proj, "wip", "manifest.yml"), "utf8")).not.toMatch(
        /bundles:.*\bweb\b/s,
      );
      expect(existsSync(join(proj, "wip", "bundles", "web", "bundle.yml"))).toBe(true); // dir stays

      const enabled = wpm(proj, ["bundle", "enable", "web"]);
      expect(enabled.status).toBe(0);
      expect(readFileSync(join(proj, "wip", "manifest.yml"), "utf8")).toMatch(/web/);
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
