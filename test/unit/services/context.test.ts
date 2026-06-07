import { describe, expect, it } from "vitest";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import {
  type ProjectContext,
  resolveContext,
  WORKSPACE_MARKER,
} from "../../../src/core/services/context.js";

/**
 * Make `dir` an authoring WORKSPACE root for the resolver by writing the workspace marker `wip/manifest.yml`
 * into it (task-88). Content is irrelevant — the resolver only probes existence — so a single byte suffices.
 * The resolved deliverable root is then `<dir>/wip`.
 */
function makeWorkspace(fs: MemoryFileSystem, dir: string): void {
  fs.write(`${dir}/${WORKSPACE_MARKER}`, "x");
}

/** A resolver harness: a fresh in-memory filesystem and an environment pinned to `cwd`. */
function harness(cwd: string): { fs: MemoryFileSystem; env: FakeEnvironment } {
  return { fs: new MemoryFileSystem(), env: new FakeEnvironment({ cwd }) };
}

/** The located-workspace context expected for a workspace at `ws` (deliverable at `<ws>/wip`). */
function located(ws: string): ProjectContext {
  return { found: true, workspaceRoot: ws, deliverableRoot: `${ws}/wip` };
}

describe("resolveContext (workspace resolution — doc 10/13 §7)", () => {
  describe("AC#1/#2 — upward search finds the workspace from anywhere within it", () => {
    it("finds the workspace when cwd is the workspace root itself", () => {
      const { fs, env } = harness("/work/proj");
      makeWorkspace(fs, "/work/proj");

      expect(resolveContext({ fs, env })).toEqual(located("/work/proj"));
    });

    it("finds the same deliverable root when cwd is inside the deliverable wip/", () => {
      const { fs, env } = harness("/work/proj/wip");
      makeWorkspace(fs, "/work/proj");

      expect(resolveContext({ fs, env })).toEqual(located("/work/proj"));
    });

    it("finds the same deliverable root when cwd is inside a bundle directory under wip/", () => {
      const { fs, env } = harness("/work/proj/wip/bundles/web-handoff");
      makeWorkspace(fs, "/work/proj");

      expect(resolveContext({ fs, env })).toEqual(located("/work/proj"));
    });

    it("finds the nearest workspace ancestor several levels up", () => {
      const { fs, env } = harness("/work/proj/a/b/c/d");
      makeWorkspace(fs, "/work/proj");

      expect(resolveContext({ fs, env })).toEqual(located("/work/proj"));
    });
  });

  describe("AC#3 — explicit -C/--project override targets a workspace at the given path", () => {
    it("uses an absolute override regardless of the working directory", () => {
      // cwd is somewhere with NO workspace on its chain; the override must win anyway.
      const { fs, env } = harness("/somewhere/unrelated/deep");
      makeWorkspace(fs, "/elsewhere/proj");

      expect(resolveContext({ fs, env }, { projectOverride: "/elsewhere/proj" })).toEqual(
        located("/elsewhere/proj"),
      );
    });

    it("resolves a relative override against the working directory", () => {
      const { fs, env } = harness("/work/here");
      makeWorkspace(fs, "/work/proj"); // ../proj from /work/here

      expect(resolveContext({ fs, env }, { projectOverride: "../proj" })).toEqual(
        located("/work/proj"),
      );
    });

    it("checks the marker at the override dir only, without walking up", () => {
      // The override's PARENT is a workspace, but the override itself is not: an override never walks up.
      const { fs, env } = harness("/work/proj/wip");
      makeWorkspace(fs, "/work/proj"); // parent of the override IS a workspace
      // override = /work/proj/wip has no wip/manifest.yml of its own

      expect(resolveContext({ fs, env }, { projectOverride: "/work/proj/wip" })).toEqual({
        found: false,
      });
    });
  });

  describe("AC#4 — explicit no-workspace outcome (not a throw)", () => {
    it("returns { found: false } when no marker exists up to the filesystem root", () => {
      const { fs, env } = harness("/no/project/here/at/all");

      let ctx: ProjectContext | undefined;
      // The walk MUST terminate at the filesystem root — this call returns rather than hanging.
      expect(() => {
        ctx = resolveContext({ fs, env });
      }).not.toThrow();

      expect(ctx).toEqual({ found: false });
    });

    it("returns no-workspace even when cwd is the filesystem root with no marker", () => {
      const { fs, env } = harness("/");

      expect(resolveContext({ fs, env })).toEqual({ found: false });
    });
  });

  describe("AC#5 — a bare manifest directory is NOT a workspace", () => {
    it("does not resolve a directory holding a top-level manifest.yml (no wip/ wrapper)", () => {
      // An unwrapped deliverable: manifest.yml sits directly in the dir, not under wip/.
      const { fs, env } = harness("/loose/deliverable");
      fs.write("/loose/deliverable/manifest.yml", "project:\n  name: x\n");

      // Only `wip/manifest.yml` identifies a workspace — a bare manifest is never silently treated as one.
      expect(resolveContext({ fs, env })).toEqual({ found: false });
    });

    it("an override pointing at a bare deliverable (manifest.yml, no wip/) also yields no-workspace", () => {
      const { fs, env } = harness("/anywhere");
      fs.write("/loose/deliverable/manifest.yml", "project:\n  name: x\n");

      expect(resolveContext({ fs, env }, { projectOverride: "/loose/deliverable" })).toEqual({
        found: false,
      });
    });
  });

  describe("nearest-workspace-wins", () => {
    it("returns the closest workspace when both cwd and an ancestor are workspaces", () => {
      const { fs, env } = harness("/work/outer/inner");
      makeWorkspace(fs, "/work/outer"); // ancestor workspace
      makeWorkspace(fs, "/work/outer/inner"); // nearer workspace (== cwd)

      expect(resolveContext({ fs, env })).toEqual(located("/work/outer/inner"));
    });
  });

  describe("determinism", () => {
    it("yields an identical result for identical fs + env + opts", () => {
      const { fs, env } = harness("/work/proj/deep/dir");
      makeWorkspace(fs, "/work/proj");

      const first = resolveContext({ fs, env });
      const second = resolveContext({ fs, env });

      expect(first).toEqual(second);
      expect(first).toEqual(located("/work/proj"));
    });
  });
});
