import { describe, expect, it } from "vitest";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { PROJECT_MARKER, resolveContext } from "../../../src/core/services/context.js";

/**
 * Acceptance test for the context service (doc 13 §7): `resolveContext` exercised through its public API as a
 * BLACK BOX, the way a command's composition root will call it — resolve the environment's working directory
 * (and any `-C/--project` override) into a project context *before* dispatching a project-bound operation
 * (doc 10 "Project context is explicit"). One `describe` per acceptance criterion, each narrating the
 * end-to-end scenario. Pure and deterministic: an in-memory filesystem + a pinned fake environment stand in
 * for the real disk and `process` — no real fs / process / git.
 */

/** Stand up a project at `root` by placing the marker there (the resolver only checks the marker exists). */
function project(fs: MemoryFileSystem, root: string): void {
  fs.write(`${root}/${PROJECT_MARKER}`, "name: demo\n");
}

/** A command invocation context: an in-memory filesystem + an environment pinned to `cwd`. */
function invokedFrom(cwd: string): { fs: MemoryFileSystem; env: FakeEnvironment } {
  return { fs: new MemoryFileSystem(), env: new FakeEnvironment({ cwd }) };
}

describe("context resolution — acceptance (doc 13 §7, doc 10)", () => {
  describe("AC#1 — the project root is located by searching upward for its manifest", () => {
    it("an agent runs a project-bound command from a deep subdirectory", () => {
      // A realistic project: marker at the root, work happening several directories down.
      const { fs, env } = invokedFrom("/home/dev/acme/packages/api/src/handlers");
      project(fs, "/home/dev/acme");
      // (intermediate dirs exist implicitly once any file under them is written; the resolver only
      //  needs to probe the marker, which sits at the project root)
      fs.write("/home/dev/acme/packages/api/src/handlers/route.ts", "//");

      const ctx = resolveContext({ fs, env });

      // The command now knows exactly which project it acts on — the nearest enclosing manifest.
      expect(ctx).toEqual({ found: true, root: "/home/dev/acme" });
    });

    it("works when the command is run from the project root itself", () => {
      const { fs, env } = invokedFrom("/home/dev/acme");
      project(fs, "/home/dev/acme");

      const ctx = resolveContext({ fs, env });

      expect(ctx).toEqual({ found: true, root: "/home/dev/acme" });
    });
  });

  describe("AC#2 — an explicit override selects the project regardless of the working directory", () => {
    it("the -C/--project flag pins the project even when cwd is outside any project", () => {
      // cwd has NO manifest on its chain; only the override knows where the project is.
      const { fs, env } = invokedFrom("/tmp/scratch/wherever");
      project(fs, "/srv/projects/beta");

      const ctx = resolveContext({ fs, env }, { projectOverride: "/srv/projects/beta" });

      expect(ctx).toEqual({ found: true, root: "/srv/projects/beta" });
    });

    it("accepts a relative override, resolved against the working directory", () => {
      const { fs, env } = invokedFrom("/srv/projects/beta/scripts");
      project(fs, "/srv/projects/beta"); // .. from /srv/projects/beta/scripts

      const ctx = resolveContext({ fs, env }, { projectOverride: ".." });

      expect(ctx).toEqual({ found: true, root: "/srv/projects/beta" });
    });

    it("the override wins even when an unrelated project sits on the cwd chain", () => {
      // cwd is INSIDE project 'alpha', but the operator explicitly targeted 'beta' via -C.
      const { fs, env } = invokedFrom("/work/alpha/deep/dir");
      project(fs, "/work/alpha"); // the project the walk-up would have found
      project(fs, "/srv/beta"); // the project the operator actually wants

      const ctx = resolveContext({ fs, env }, { projectOverride: "/srv/beta" });

      // Explicit beats implicit: the override is honoured, the cwd chain ignored.
      expect(ctx).toEqual({ found: true, root: "/srv/beta" });
    });
  });

  describe("AC#3 — no project yields an explicit, inspectable outcome (not a crash)", () => {
    it("running outside any project returns { found: false } so callers can fall back", () => {
      // No manifest anywhere from cwd up to the filesystem root.
      const { fs, env } = invokedFrom("/var/empty/nothing/here");

      const ctx = resolveContext({ fs, env });

      // template list/show would proceed with built-ins; a project-bound command would map this to a
      // not-found domain error (task-23) at the command layer — but the service itself never throws.
      expect(ctx).toEqual({ found: false });
      expect(ctx.found).toBe(false);
    });

    it("an override that points at a non-project also yields an explicit no-project", () => {
      const { fs, env } = invokedFrom("/anywhere");
      // The override directory exists in spirit but has no marker, and the override never walks up.
      project(fs, "/has/a/project/elsewhere");

      const ctx = resolveContext({ fs, env }, { projectOverride: "/no/marker/dir" });

      expect(ctx).toEqual({ found: false });
    });
  });
});
