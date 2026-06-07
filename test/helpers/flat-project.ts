import { execFileSync } from "node:child_process";
import { cpSync, existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Build a **flat** project root from the real `wpm init` output — a TEST stopgap for the task-87/task-88 gap.
 *
 * As of task-87, `wpm init` scaffolds an *authoring workspace*: the deliverable (manifest, bundles,
 * installer-skills, the executor front door as `_AGENTS.md`) nests under `wip/`, while the authoring backlog
 * sits at the workspace root and `builds/` is isolated. Project-bound commands, however, still resolve a
 * **flat** project root that holds `manifest.yml` *and* `.authoring-backlog/` side by side (the pre-87 shape) —
 * teaching them to resolve the *workspace* and operate on `wip/` is **task-88**.
 *
 * Until task-88 lands, the E2E suites for those *other* commands (`project meta`, `build`, `bundle …`, …) need
 * a project in the flat shape they support. This helper produces exactly that from the genuine init output, so
 * the suites still exercise real init-authored content: it runs `init`, lifts everything under `wip/` to a flat
 * root, restores the canonical front-door name (`_AGENTS.md` → `AGENTS.md`, what the build does), and co-locates
 * the `.authoring-backlog/` beside the manifest (where the current lifecycle materialiser expects it).
 *
 * TODO(task-88/task-93): once workspace resolution lands, delete this helper and point these suites at the real
 * workspace root via `-C <workspace>` (or cwd), asserting the deliverable under `wip/` directly.
 *
 * @param builtCli - Absolute path to the built `dist/cli.js`.
 * @param parentDir - The tmpdir the project is created in.
 * @param name - The project name (defaults to `demo`).
 * @returns The flat project root (`<parentDir>/<name>`) holding `manifest.yml` + `.authoring-backlog/`.
 */
export function initFlatProject(builtCli: string, parentDir: string, name = "demo"): string {
  const workspace = join(parentDir, `${name}-workspace`);
  execFileSync(process.execPath, [builtCli, "init", name, "--at", workspace], { encoding: "utf8" });

  const proj = join(parentDir, name);
  // Lift the deliverable (`wip/`) to the flat root.
  cpSync(join(workspace, "wip"), proj, { recursive: true });
  // Restore the canonical front-door basename the build would produce (`_AGENTS.md` → `AGENTS.md`).
  const reserved = join(proj, "_AGENTS.md");
  if (existsSync(reserved)) {
    renameSync(reserved, join(proj, "AGENTS.md"));
  }
  // Co-locate the authoring backlog beside the manifest (the flat shape the current lifecycle resolves).
  cpSync(join(workspace, ".authoring-backlog"), join(proj, ".authoring-backlog"), {
    recursive: true,
  });
  // Drop the workspace wrapper so the flat root is the only project on disk.
  rmSync(workspace, { recursive: true, force: true });
  return proj;
}
