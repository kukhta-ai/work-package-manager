import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execaSync } from "execa";
import { describe, expect, it } from "vitest";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { renderTree } from "../../../src/core/services/render.js";
import { resolveTemplate } from "../../../src/core/services/template-resolver.js";
import { withTempDir } from "../../helpers/tmpdir.js";

/**
 * Integration proof that the CONTENT of the REAL `templates/bundle/default/install-backlog/` the operation
 * renders is a valid, **pre-initialized** Backlog.md backlog — read back by the real `backlog` CLI with NO
 * `backlog init` run (doc 07: "a committed `config.yml` plus `tasks/` is all Backlog.md needs"). It renders the
 * production template via the task-17 resolver + task-16 render (the same path `createBundle` uses), drops the
 * rendered config + tasks into a tmpdir, and asserts the CLI lists the detect/setup/verify trio with their
 * labels, acceptance criteria, dependencies, and Definition-of-Done.
 *
 * FOLDER-NAME DIVERGENCE (recorded): doc 06/07 name the per-bundle recipe folder `install-backlog/`, and the
 * template ships it under that name (the unit test `test/unit/templates/default-bundle.test.ts` verifies the
 * shipped structure). But the installed Backlog.md (1.45.2) discovers a backlog root ONLY by a folder literally
 * named `backlog/` at the project root — it does NOT discover `install-backlog/` (probed: `task list` reports
 * "No Backlog.md project found"). Reconciling the `install-backlog/` folder name with the executing agent's
 * Backlog.md is an EXECUTION-time concern (doc 03/09; a future task — e.g. the executor renames/links the
 * recipe folder to `backlog/`, or a newer Backlog.md gains a configurable root). For THIS template task the
 * load-bearing fact is that the rendered config + task FILES are genuine Backlog.md, so this test renders them
 * into the discoverable `backlog/` folder name to prove exactly that.
 *
 * Lives under `test/integration/**`, which the vitest config runs serially (`fileParallelism: false`) precisely
 * because the real `backlog` CLI keeps per-machine global state; HOME/XDG are additionally pointed inside the
 * tmpdir so nothing collides. Skips (does not fail) when the CLI is absent.
 */

const REAL_TEMPLATES = fileURLToPath(new URL("../../../templates", import.meta.url));
const BUILTIN = "/builtin-templates";
const SAMPLE_ID = "web-handoff";

/** Whether the real `backlog` CLI is available; the suite skips (not fails) if it is not. */
function backlogAvailable(): boolean {
  try {
    execaSync("backlog", ["--version"], { stdout: "pipe", stderr: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const describeIfBacklog = backlogAvailable() ? describe : describe.skip;

/** Point Backlog.md's per-machine global state (HOME / XDG) inside the tmpdir so runs can't collide. */
function isolatedEnv(dir: string): Record<string, string> {
  return {
    ...process.env,
    HOME: dir,
    XDG_CONFIG_HOME: dir,
    XDG_DATA_HOME: dir,
    XDG_STATE_HOME: dir,
    XDG_CACHE_HOME: dir,
  };
}

/** Mirror the real `templates/` tree into a MemoryFileSystem so the production resolver can read it. */
function seedTemplates(): MemoryFileSystem {
  const fs = new MemoryFileSystem();
  const mirror = (srcDir: string, destDir: string): void => {
    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
      const src = join(srcDir, entry.name);
      const dest = `${destDir}/${entry.name}`;
      if (entry.isDirectory()) mirror(src, dest);
      else fs.write(dest, readFileSync(src, "utf8"));
    }
  };
  mirror(REAL_TEMPLATES, BUILTIN);
  return fs;
}

/**
 * Render the real bundle template with `bundle new`'s params and write its `install-backlog/` subtree under a
 * `backlog/` folder inside `bundleRoot` on the real filesystem (returning the rendered relative paths). Uses
 * the production resolver + render — the same logic `createBundle` runs — so this exercises the genuine shipped
 * recipe content. The folder is named `backlog/` (not `install-backlog/`) ONLY so the installed Backlog.md
 * discovers it — see the FOLDER-NAME DIVERGENCE note in the file header; the template itself ships
 * `install-backlog/`, which the unit test verifies.
 */
function renderInstallBacklogTo(bundleRoot: string, id: string): string[] {
  const fs = seedTemplates();
  const resolution = resolveTemplate("default", "bundle", { fs, builtinTemplatesRoot: BUILTIN });
  if (!resolution.found) {
    throw new Error("default bundle template not found");
  }
  const params = new Map([
    ["bundle-id", id],
    ["version", "0.1.0"],
    ["project-name", "demo"],
  ]);
  const written: string[] = [];
  for (const file of renderTree(resolution.template.files, params)) {
    if (!file.path.startsWith("install-backlog/")) continue;
    // Re-root each install-backlog/* file under <bundleRoot>/backlog/ (the discoverable folder name).
    const rel = file.path.slice("install-backlog/".length);
    const abs = join(bundleRoot, "backlog", rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, file.content, "utf8");
    written.push(rel);
  }
  return written;
}

describeIfBacklog(
  "default bundle template — rendered install-backlog is a valid pre-initialized Backlog.md (doc 07)",
  () => {
    it("the real CLI lists the detect/setup/verify trio with prefixed ids — no `backlog init` run", async () => {
      await withTempDir((dir) => {
        const written = renderInstallBacklogTo(dir, SAMPLE_ID);
        // The recipe ships a config.yml + three task files (nothing else for the backlog to need):
        expect(written).toContain("config.yml");
        expect(written.filter((p) => p.startsWith("tasks/"))).toHaveLength(3);

        const env = isolatedEnv(dir);
        // No `backlog init`: read the SHIPPED, pre-initialized backlog directly.
        const list = execaSync("backlog", ["task", "list", "--plain"], {
          cwd: dir,
          env,
          stdout: "pipe",
          stderr: "pipe",
        }).stdout as string;

        // All three tasks list, with the bundle-prefixed (upper-cased on display) ids:
        expect(list).toContain(`${SAMPLE_ID.toUpperCase()}-1`);
        expect(list).toContain(`${SAMPLE_ID.toUpperCase()}-2`);
        expect(list).toContain(`${SAMPLE_ID.toUpperCase()}-3`);
      });
    });

    it("the real CLI reads each task's labels, AC, dependency, and DoD (the recipe shape is genuine)", async () => {
      await withTempDir((dir) => {
        renderInstallBacklogTo(dir, SAMPLE_ID);
        const env = isolatedEnv(dir);
        const detail = (id: string): string =>
          execaSync("backlog", ["task", id, "--plain"], {
            cwd: dir,
            env,
            stdout: "pipe",
            stderr: "pipe",
          }).stdout as string;

        // setup task: kind:state + step:setup label, an AC, a dependency on the detect task, and a DoD:
        const setup = detail(`${SAMPLE_ID}-2`);
        expect(setup).toContain("kind:state");
        expect(setup).toContain("step:setup");
        expect(setup.toLowerCase()).toContain(`${SAMPLE_ID}-1`); // dependency recorded
        expect(setup).toMatch(/Definition of Done/i);
        expect(setup).toContain("inverse op"); // a receipt-fact DoD item is present

        // verify task depends on setup:
        const verify = detail(`${SAMPLE_ID}-3`);
        expect(verify).toContain("step:verify");
        expect(verify.toLowerCase()).toContain(`${SAMPLE_ID}-2`);
      });
    });

    it("the shipped per-task DoD is real — the CLI can check a Definition-of-Done item", async () => {
      await withTempDir((dir) => {
        renderInstallBacklogTo(dir, SAMPLE_ID);
        const env = isolatedEnv(dir);
        // Checking DoD item #1 succeeds only if the task file carries a real ## Definition of Done block:
        const out = execaSync("backlog", ["task", "edit", `${SAMPLE_ID}-1`, "--check-dod", "1"], {
          cwd: dir,
          env,
          stdout: "pipe",
          stderr: "pipe",
        });
        expect(out.exitCode).toBe(0);
        const detail = execaSync("backlog", ["task", `${SAMPLE_ID}-1`, "--plain"], {
          cwd: dir,
          env,
          stdout: "pipe",
          stderr: "pipe",
        }).stdout as string;
        // DoD item #1 is now checked in the real file:
        expect(detail).toMatch(/\[x\]\s*#1/);
      });
    });

    it("the rendered config.yml drives the prefix — a NEW task created by the CLI is bundle-prefixed", async () => {
      await withTempDir((dir) => {
        renderInstallBacklogTo(dir, SAMPLE_ID);
        const env = isolatedEnv(dir);
        // The shipped task_prefix is honored on the next create (doc 07/08): a 4th task → <id>-4.
        execaSync("backlog", ["task", "create", "Probe extra task", "--plain"], {
          cwd: dir,
          env,
          stdout: "pipe",
          stderr: "pipe",
        });
        const list = execaSync("backlog", ["task", "list", "--plain"], {
          cwd: dir,
          env,
          stdout: "pipe",
          stderr: "pipe",
        }).stdout as string;
        expect(list).toContain(`${SAMPLE_ID.toUpperCase()}-4`);
      });
    });
  },
);
