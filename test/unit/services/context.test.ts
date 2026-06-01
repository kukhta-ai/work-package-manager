import { describe, expect, it } from "vitest";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import {
  PROJECT_MARKER,
  type ProjectContext,
  resolveContext,
} from "../../../src/core/services/context.js";

/**
 * Write a project marker (`manifest.yml`) into `dir`, making `dir` a project root for the resolver. Content is
 * irrelevant — the resolver only probes existence — so a single byte suffices.
 */
function makeProject(fs: MemoryFileSystem, dir: string): void {
  fs.write(`${dir}/${PROJECT_MARKER}`, "x");
}

/** A resolver harness: a fresh in-memory filesystem and an environment pinned to `cwd`. */
function harness(cwd: string): { fs: MemoryFileSystem; env: FakeEnvironment } {
  return { fs: new MemoryFileSystem(), env: new FakeEnvironment({ cwd }) };
}

describe("resolveContext (context resolution — doc 13 §7)", () => {
  describe("AC#1 — upward search from the working directory", () => {
    it("finds the project when the marker is at the working directory itself", () => {
      const { fs, env } = harness("/work/proj");
      makeProject(fs, "/work/proj");

      const ctx = resolveContext({ fs, env });

      expect(ctx).toEqual({ found: true, root: "/work/proj" });
    });

    it("finds the nearest ancestor several levels up when cwd is deep inside", () => {
      const { fs, env } = harness("/work/proj/a/b/c/d");
      makeProject(fs, "/work/proj");

      const ctx = resolveContext({ fs, env });

      expect(ctx).toEqual({ found: true, root: "/work/proj" });
    });
  });

  describe("AC#2 — explicit -C/--project override", () => {
    it("uses an absolute override regardless of the working directory", () => {
      // cwd is somewhere with NO marker on its chain; the override must win anyway.
      const { fs, env } = harness("/somewhere/unrelated/deep");
      makeProject(fs, "/elsewhere/proj");

      const ctx = resolveContext({ fs, env }, { projectOverride: "/elsewhere/proj" });

      expect(ctx).toEqual({ found: true, root: "/elsewhere/proj" });
    });

    it("resolves a relative override against the working directory", () => {
      const { fs, env } = harness("/work/here");
      makeProject(fs, "/work/proj"); // ../proj from /work/here

      const ctx = resolveContext({ fs, env }, { projectOverride: "../proj" });

      expect(ctx).toEqual({ found: true, root: "/work/proj" });
    });

    it("reports no-project when the override dir has no marker, without walking up", () => {
      // The override's PARENT is a project, but the override itself is not: an override never walks up.
      const { fs, env } = harness("/work/proj/sub");
      makeProject(fs, "/work/proj"); // parent of the override IS a project
      // override = /work/proj/sub has NO marker

      const ctx = resolveContext({ fs, env }, { projectOverride: "/work/proj/sub" });

      expect(ctx).toEqual({ found: false });
    });
  });

  describe("AC#3 — explicit no-project outcome", () => {
    it("returns { found: false } (not a throw) when no marker exists up to the filesystem root", () => {
      const { fs, env } = harness("/no/project/here/at/all");
      // no marker anywhere

      let ctx: ProjectContext | undefined;
      // The walk MUST terminate at the filesystem root — this call returns rather than hanging.
      expect(() => {
        ctx = resolveContext({ fs, env });
      }).not.toThrow();

      expect(ctx).toEqual({ found: false });
    });

    it("returns no-project even when cwd is the filesystem root with no marker", () => {
      const { fs, env } = harness("/");

      const ctx = resolveContext({ fs, env });

      expect(ctx).toEqual({ found: false });
    });
  });

  describe("nearest-manifest-wins", () => {
    it("returns the closest project root when both cwd and an ancestor are projects", () => {
      const { fs, env } = harness("/work/outer/inner");
      makeProject(fs, "/work/outer"); // ancestor project
      makeProject(fs, "/work/outer/inner"); // nearer project (== cwd)

      const ctx = resolveContext({ fs, env });

      expect(ctx).toEqual({ found: true, root: "/work/outer/inner" });
    });
  });

  describe("determinism", () => {
    it("yields an identical result for identical fs + env + opts", () => {
      const { fs, env } = harness("/work/proj/deep/dir");
      makeProject(fs, "/work/proj");

      const first = resolveContext({ fs, env });
      const second = resolveContext({ fs, env });

      expect(first).toEqual(second);
      expect(first).toEqual({ found: true, root: "/work/proj" });
    });
  });
});
