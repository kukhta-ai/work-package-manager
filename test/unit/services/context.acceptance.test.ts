import { describe, expect, it } from "vitest";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { resolveContext, WORKSPACE_MARKER } from "../../../src/core/services/context.js";

/**
 * Acceptance test for the context service (doc 13 §7; doc 10 "Project context resolution"): `resolveContext`
 * exercised through its public API as a BLACK BOX, the way a command's composition root will call it — resolve
 * the environment's working directory (and any `-C/--project` override) into an authoring-workspace context
 * *before* dispatching a project-bound operation. The workspace marker is the deliverable subdirectory `wip/`
 * holding a `manifest.yml`; a command run anywhere within the workspace resolves the same deliverable root
 * `<workspace>/wip`. One `describe` per acceptance criterion. Pure and deterministic: an in-memory filesystem +
 * a pinned fake environment stand in for the real disk and `process` — no real fs / process / git.
 */

/** Stand up a workspace at `ws` by placing the marker `wip/manifest.yml` there (the resolver only checks existence). */
function workspace(fs: MemoryFileSystem, ws: string): void {
  fs.write(`${ws}/${WORKSPACE_MARKER}`, "project:\n  name: demo\n");
}

/** A command invocation context: an in-memory filesystem + an environment pinned to `cwd`. */
function invokedFrom(cwd: string): { fs: MemoryFileSystem; env: FakeEnvironment } {
  return { fs: new MemoryFileSystem(), env: new FakeEnvironment({ cwd }) };
}

describe("context resolution — acceptance (doc 13 §7, doc 10)", () => {
  describe("AC#1/#2 — the workspace is located by searching upward for its wip/ marker", () => {
    it("an agent runs a project-bound command from a deep subdirectory of the deliverable", () => {
      // A realistic workspace: marker at the root, work happening several directories down inside wip/.
      const { fs, env } = invokedFrom("/home/dev/acme/wip/bundles/web-handoff/payload");
      workspace(fs, "/home/dev/acme");

      const ctx = resolveContext({ fs, env });

      // The command now knows exactly which deliverable it acts on — the nearest enclosing workspace's wip/.
      expect(ctx).toEqual({
        found: true,
        workspaceRoot: "/home/dev/acme",
        deliverableRoot: "/home/dev/acme/wip",
      });
    });

    it("works when the command is run from the workspace root itself", () => {
      const { fs, env } = invokedFrom("/home/dev/acme");
      workspace(fs, "/home/dev/acme");

      expect(resolveContext({ fs, env })).toEqual({
        found: true,
        workspaceRoot: "/home/dev/acme",
        deliverableRoot: "/home/dev/acme/wip",
      });
    });
  });

  describe("AC#3 — an explicit override selects the workspace regardless of the working directory", () => {
    it("the -C/--project flag pins the workspace even when cwd is outside any workspace", () => {
      // cwd has NO workspace on its chain; only the override knows where the workspace is.
      const { fs, env } = invokedFrom("/tmp/scratch/wherever");
      workspace(fs, "/srv/projects/beta");

      expect(resolveContext({ fs, env }, { projectOverride: "/srv/projects/beta" })).toEqual({
        found: true,
        workspaceRoot: "/srv/projects/beta",
        deliverableRoot: "/srv/projects/beta/wip",
      });
    });

    it("accepts a relative override, resolved against the working directory", () => {
      const { fs, env } = invokedFrom("/srv/projects/beta/scripts");
      workspace(fs, "/srv/projects/beta"); // .. from /srv/projects/beta/scripts

      expect(resolveContext({ fs, env }, { projectOverride: ".." })).toEqual({
        found: true,
        workspaceRoot: "/srv/projects/beta",
        deliverableRoot: "/srv/projects/beta/wip",
      });
    });

    it("the override wins even when an unrelated workspace sits on the cwd chain", () => {
      // cwd is INSIDE workspace 'alpha', but the operator explicitly targeted 'beta' via -C.
      const { fs, env } = invokedFrom("/work/alpha/wip/deep");
      workspace(fs, "/work/alpha"); // the workspace the walk-up would have found
      workspace(fs, "/srv/beta"); // the workspace the operator actually wants

      expect(resolveContext({ fs, env }, { projectOverride: "/srv/beta" })).toEqual({
        found: true,
        workspaceRoot: "/srv/beta",
        deliverableRoot: "/srv/beta/wip",
      });
    });
  });

  describe("AC#4 — no workspace yields an explicit, inspectable outcome (not a crash)", () => {
    it("running outside any workspace returns { found: false } so callers can fall back", () => {
      // No wip/manifest.yml anywhere from cwd up to the filesystem root.
      const { fs, env } = invokedFrom("/var/empty/nothing/here");

      const ctx = resolveContext({ fs, env });

      // template list/show would proceed with built-ins; a project-bound command would map this to a
      // not-found domain error (task-23) at the command layer — but the service itself never throws.
      expect(ctx).toEqual({ found: false });
      expect(ctx.found).toBe(false);
    });

    it("an override that points at a non-workspace also yields an explicit no-workspace", () => {
      const { fs, env } = invokedFrom("/anywhere");
      // The override directory exists in spirit but has no wip/manifest.yml, and the override never walks up.
      workspace(fs, "/has/a/workspace/elsewhere");

      expect(resolveContext({ fs, env }, { projectOverride: "/no/marker/dir" })).toEqual({
        found: false,
      });
    });
  });

  describe("AC#5 — a bare deliverable is not mistaken for a workspace", () => {
    it("a directory holding a top-level manifest.yml (no wip/) is never silently treated as a workspace", () => {
      // An unwrapped deliverable extracted on its own: manifest.yml at the root, no wip/ wrapper.
      const { fs, env } = invokedFrom("/extracted/deliverable/bundles/core");
      fs.write("/extracted/deliverable/manifest.yml", "project:\n  name: x\n");

      // Walk-up finds no wip/manifest.yml anywhere → no workspace, so no command silently operates on it.
      expect(resolveContext({ fs, env })).toEqual({ found: false });
    });
  });
});
