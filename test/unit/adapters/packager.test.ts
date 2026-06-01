import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { NodeFileSystem } from "../../../src/adapters/node-fs.js";
import { createArchive, pushArchive } from "../../../src/adapters/packager.js";
import { isDomainError } from "../../../src/core/errors.js";
import { withTempDir } from "../../helpers/tmpdir.js";

/**
 * Unit tests for the build PACKAGER adapter (task-83) over a REAL tmpdir — it is infrastructure (it shells out
 * via `runSync`), so it is exercised end-to-end against real `tar`/`git`, not in memory. The `zip` happy path is
 * conditional on `zip` being installed (it is NOT on CI); the always-on assertions are tarball + git + the
 * missing-tool typed error + the push (local-dir + git-remote).
 */

/** Whether a CLI tool is available (so a zip-dependent test can skip rather than fail on a CI without `zip`). */
function has(tool: string): boolean {
  try {
    execFileSync(tool, ["-v"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
const hasZip = has("zip");

/** Seed a small shippable tree on real disk under `root` and return the relative file list. */
function seedShip(root: string): string[] {
  writeFileSync(join(root, "manifest.yml"), "project:\n  name: demo\n");
  writeFileSync(join(root, "AGENTS.md"), "# front door\n");
  mkdirSync(join(root, "bundles", "core"), { recursive: true });
  writeFileSync(join(root, "bundles", "core", "bundle.yml"), "id: core\n");
  // A file that must NOT be in the ship list — to prove the archive contains ONLY the listed files.
  mkdirSync(join(root, ".authoring-backlog"), { recursive: true });
  writeFileSync(join(root, ".authoring-backlog", "config.yml"), "task_prefix: authoring\n");
  return ["AGENTS.md", "bundles/core/bundle.yml", "manifest.yml"];
}

describe("createArchive — tarball (always available)", () => {
  it("produces a real .tgz at the returned path containing EXACTLY the shippable files", async () => {
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      mkdirSync(root, { recursive: true });
      const files = seedShip(root);
      const out = join(dir, "out");
      mkdirSync(out, { recursive: true });

      const archive = createArchive({
        root,
        outDir: out,
        baseName: "demo-1.2.3",
        format: "tarball",
        files,
      });

      expect(archive).toBe(join(out, "demo-1.2.3.tgz"));
      expect(existsSync(archive)).toBe(true);

      // Untar and assert the entries are exactly the listed files (and NOT .authoring-backlog/).
      const listed = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.endsWith("/"));
      expect(listed.sort()).toEqual(["AGENTS.md", "bundles/core/bundle.yml", "manifest.yml"]);
      expect(listed.some((l) => l.includes(".authoring-backlog"))).toBe(false);
    });
  });

  it("an empty shippable set is a typed error (exit-1 class), not a crash", async () => {
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      mkdirSync(root, { recursive: true });
      let thrown: unknown;
      try {
        createArchive({ root, outDir: dir, baseName: "x-0.0.0", format: "tarball", files: [] });
      } catch (e) {
        thrown = e;
      }
      expect(isDomainError(thrown)).toBe(true);
    });
  });
});

describe("createArchive — git (archives the committed HEAD)", () => {
  it("produces a .tgz from `git archive HEAD` when the project is a committed repo", async () => {
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      mkdirSync(root, { recursive: true });
      seedShip(root);
      // Make it a committed git repo.
      const git = (args: string[]) =>
        execFileSync("git", args, {
          cwd: root,
          stdio: "pipe",
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: "t",
            GIT_AUTHOR_EMAIL: "t@t",
            GIT_COMMITTER_NAME: "t",
            GIT_COMMITTER_EMAIL: "t@t",
          },
        });
      git(["init", "-q"]);
      git(["add", "-A"]);
      git(["commit", "-q", "-m", "init"]);

      const out = join(dir, "out");
      mkdirSync(out, { recursive: true });
      const archive = createArchive({
        root,
        outDir: out,
        baseName: "demo-1.0.0",
        format: "git",
        files: ["manifest.yml"], // git ignores `files`; HEAD is the source
      });
      expect(archive).toBe(join(out, "demo-1.0.0.tgz"));
      expect(existsSync(archive)).toBe(true);
      const listed = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
      expect(listed).toContain("manifest.yml");
    });
  });

  it("a non-git project is a clear typed error (not a crash)", async () => {
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      mkdirSync(root, { recursive: true });
      seedShip(root);
      let thrown: unknown;
      try {
        createArchive({ root, outDir: dir, baseName: "demo-1.0.0", format: "git", files: [] });
      } catch (e) {
        thrown = e;
      }
      expect(isDomainError(thrown)).toBe(true);
      expect((thrown as Error).message).toMatch(/git/i);
    });
  });
});

describe("createArchive — zip (missing-tool handling)", () => {
  it(
    hasZip
      ? "produces a real .zip when zip is available"
      : "raises a clear typed error when zip is absent",
    async () => {
      await withTempDir(async (dir) => {
        const root = join(dir, "proj");
        mkdirSync(root, { recursive: true });
        const files = seedShip(root);
        const out = join(dir, "out");
        mkdirSync(out, { recursive: true });

        if (hasZip) {
          const archive = createArchive({
            root,
            outDir: out,
            baseName: "demo-1.0.0",
            format: "zip",
            files,
          });
          expect(archive).toBe(join(out, "demo-1.0.0.zip"));
          expect(existsSync(archive)).toBe(true);
        } else {
          let thrown: unknown;
          try {
            createArchive({ root, outDir: out, baseName: "demo-1.0.0", format: "zip", files });
          } catch (e) {
            thrown = e;
          }
          expect(isDomainError(thrown)).toBe(true);
          expect((thrown as Error).message).toMatch(/zip.*not available|tarball/i);
        }
      });
    },
  );
});

describe("pushArchive — destination kinds", () => {
  it("a local directory destination: the archive is copied in", async () => {
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      mkdirSync(root, { recursive: true });
      const files = seedShip(root);
      const out = join(dir, "out");
      mkdirSync(out, { recursive: true });
      const archive = createArchive({
        root,
        outDir: out,
        baseName: "demo-1.0.0",
        format: "tarball",
        files,
      });

      const destDir = join(dir, "published");
      mkdirSync(destDir, { recursive: true });
      const result = pushArchive(
        { fs: new NodeFileSystem() },
        { root, archive, destination: destDir },
      );
      expect(result.where).toBe(join(destDir, "demo-1.0.0.tgz"));
      expect(readdirSync(destDir)).toContain("demo-1.0.0.tgz");
    });
  });

  it("a local directory destination via the in-memory fs port (no real disk needed)", () => {
    const fs = new MemoryFileSystem();
    fs.write("/out/demo-1.0.0.tgz", "ARCHIVE-BYTES");
    fs.makeDirectories("/published");
    const result = pushArchive(
      { fs },
      { root: "/proj", archive: "/out/demo-1.0.0.tgz", destination: "/published" },
    );
    expect(result.where).toBe("/published/demo-1.0.0.tgz");
    expect(fs.read("/published/demo-1.0.0.tgz")).toBe("ARCHIVE-BYTES");
  });

  it("a git-remote destination: pushes to a local bare repo (headless)", async () => {
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      mkdirSync(root, { recursive: true });
      seedShip(root);
      const env = {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@t",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@t",
      };
      const git = (cwd: string, args: string[]) =>
        execFileSync("git", args, { cwd, stdio: "pipe", env });
      git(root, ["init", "-q"]);
      git(root, ["add", "-A"]);
      git(root, ["commit", "-q", "-m", "init"]);

      // A local bare repo acts as the "remote".
      const bare = join(dir, "remote.git");
      execFileSync("git", ["init", "-q", "--bare", bare], { stdio: "pipe", env });
      git(root, ["remote", "add", "origin", bare]);
      // The destination here is the remote NAME "origin" (a non-directory), so pushArchive takes the git path.
      // Note: a bare path is also a valid `git push` target, but it exists as a dir, so use the named remote.
      const archive = join(dir, "demo-1.0.0.tgz");
      writeFileSync(archive, "x");
      const result = pushArchive(
        { fs: new NodeFileSystem() },
        { root, archive, destination: "origin" },
      );
      expect(result.where).toBe("git remote origin");
      // The bare repo now has the pushed commit.
      const refs = execFileSync("git", ["--git-dir", bare, "log", "--oneline"], {
        encoding: "utf8",
        env,
      });
      expect(refs).toMatch(/init/);
    });
  });
});
