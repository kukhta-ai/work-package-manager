import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * Create a real authoring **workspace** from `wpm init`, the way an author starts a project (task-87/88), and
 * return the **workspace root**.
 *
 * `wpm init <name> --at <workspace>` scaffolds the workspace at `<workspace>`: the deliverable (manifest,
 * `bundles/`, `installer-skills/`, `templates/`, the author-owned executor front door `_AGENTS.md`) nests under
 * `<workspace>/wip`, while the authoring front door + the `.authoring-backlog/` Backlog.md root sit at the
 * workspace root. Project-bound commands resolve the workspace from anywhere within it (or via `-C <workspace>`)
 * and operate on `<workspace>/wip` (task-88), so e2e suites pass the returned workspace root to `-C`/`cwd` and
 * assert the deliverable under `wip/` and the authoring backlog at the workspace root.
 *
 * (Replaces the task-87 `flat-project.ts` bridge, which lifted `wip/` to a flat root to satisfy the pre-88
 * resolver; with workspace resolution landed, suites point at the real workspace directly.)
 *
 * @param builtCli - Absolute path to the built `dist/cli.js`.
 * @param parentDir - The tmpdir the workspace is created in.
 * @param name - The project name (defaults to `demo`).
 * @returns The workspace root (`<parentDir>/<name>`); the deliverable is `<workspace>/wip`.
 */
export function initWorkspace(builtCli: string, parentDir: string, name = "demo"): string {
  const workspace = join(parentDir, name);
  execFileSync(process.execPath, [builtCli, "init", name, "--at", workspace], { encoding: "utf8" });
  return workspace;
}
