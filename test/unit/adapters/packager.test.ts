import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { NodeFileSystem } from "../../../src/adapters/node-fs.js";
import { createArchive, pushArchive } from "../../../src/adapters/packager.js";
import { isDomainError } from "../../../src/core/errors.js";
import { toPosix } from "../../../src/util/posix-path.js";
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

/** Return a normalized root-relative layout for any gzip-tar archive, ignoring directory-only entries. */
function tarLayout(archive: string): string[] {
  return execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.replace(/^\.\//, "").trim())
    .filter((line) => line.length > 0 && !line.endsWith("/"))
    .sort();
}

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

      // The returned package path is POSIX on every OS — assert the `/`-form (a no-op on Linux/macOS).
      expect(archive).toBe(toPosix(join(out, "demo-1.2.3.tgz")));
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

describe("createArchive — front-door transforms (task-90, staging)", () => {
  it("strips `_AGENTS.md` → `AGENTS.md` (verbatim) + the alias, preserves scope-alias symlinks, drops `_AGENTS.md`", async () => {
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      mkdirSync(join(root, "bundles", "core"), { recursive: true });
      mkdirSync(join(root, "installer-skills"), { recursive: true });
      writeFileSync(join(root, "manifest.yml"), "project:\n  name: demo\n");
      const ROOT_BYTES = "# root front door\nSENTINEL-VERBATIM-βytes\n";
      const BUNDLE_BYTES = "# bundle front door\nSENTINEL-BUNDLE\n";
      writeFileSync(join(root, "_AGENTS.md"), ROOT_BYTES);
      writeFileSync(join(root, "bundles", "core", "_AGENTS.md"), BUNDLE_BYTES);
      writeFileSync(join(root, "installer-skills", "demo-installer.txt"), "skill\n");
      // A scope-alias symlink (the only symlink a generated project carries) — must survive staging as a link.
      mkdirSync(join(root, ".claude"), { recursive: true });
      symlinkSync("../installer-skills", join(root, ".claude", "skills"));

      const out = join(dir, "out");
      mkdirSync(out, { recursive: true });
      const archive = createArchive({
        root,
        outDir: out,
        baseName: "demo-1.0.0",
        format: "tarball",
        files: [
          ".claude/skills",
          "_AGENTS.md",
          "bundles/core/_AGENTS.md",
          "installer-skills/demo-installer.txt",
          "manifest.yml",
        ],
        transforms: [
          { from: "_AGENTS.md", to: "AGENTS.md", aliases: ["CLAUDE.md"] },
          {
            from: "bundles/core/_AGENTS.md",
            to: "bundles/core/AGENTS.md",
            aliases: ["bundles/core/CLAUDE.md"],
          },
        ],
      });

      const listed = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.endsWith("/"));
      // AC90#5: no `_AGENTS.md` anywhere; AC90#2: canonical + alias at root and per bundle.
      expect(listed.some((l) => l.includes("_AGENTS.md"))).toBe(false);
      expect(listed.sort()).toEqual(
        [
          ".claude/skills",
          "AGENTS.md",
          "CLAUDE.md",
          "bundles/core/AGENTS.md",
          "bundles/core/CLAUDE.md",
          "installer-skills/demo-installer.txt",
          "manifest.yml",
        ].sort(),
      );

      // Extract and prove the bytes are verbatim (AC90#6), the alias resolves (AC90#2), and the scope alias is
      // still a symlink to installer-skills/ (symlink preservation).
      const ex = join(dir, "ex");
      mkdirSync(ex, { recursive: true });
      execFileSync("tar", ["-xzf", archive, "-C", ex]);
      expect(readFileSync(join(ex, "AGENTS.md"), "utf8")).toBe(ROOT_BYTES);
      expect(readFileSync(join(ex, "bundles", "core", "AGENTS.md"), "utf8")).toBe(BUNDLE_BYTES);
      expect(lstatSync(join(ex, "CLAUDE.md")).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(ex, "CLAUDE.md"), "utf8")).toBe(ROOT_BYTES);
      expect(lstatSync(join(ex, ".claude", "skills")).isSymbolicLink()).toBe(true);
    });
  });
});

describe("createArchive — git (TASK-95 prepared-tree parity)", () => {
  it("archives exactly the transformed ship set and matches the tarball layout", async () => {
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      mkdirSync(join(root, "bundles", "core"), { recursive: true });
      mkdirSync(join(root, "bundles", "disabled"), { recursive: true });
      mkdirSync(join(root, "installer-skills"), { recursive: true });
      mkdirSync(join(root, ".authoring-backlog"), { recursive: true });
      mkdirSync(join(root, ".claude"), { recursive: true });
      writeFileSync(join(root, "manifest.yml"), "project:\n  name: demo\n");
      writeFileSync(join(root, "_AGENTS.md"), "# root executor\n");
      writeFileSync(join(root, "bundles", "core", "_AGENTS.md"), "# core executor\n");
      writeFileSync(join(root, "bundles", "core", "bundle.yml"), "id: core\n");
      writeFileSync(join(root, "bundles", "disabled", "bundle.yml"), "id: disabled\n");
      writeFileSync(join(root, "installer-skills", "demo.txt"), "skill\n");
      writeFileSync(join(root, "ident.txt"), "$Id: author-owned-sentinel $\n");
      const UTF16_BYTES = Buffer.from([0xff, 0xfe, 0x41, 0x00, 0x0a, 0x00]);
      writeFileSync(join(root, "utf16.txt"), UTF16_BYTES);
      writeFileSync(join(root, ".authoring-backlog", "LEAK.txt"), "must not ship\n");
      // Source Git policy must not override the already-computed build plan: both files themselves ship, the
      // ignored skill still ships, and export-ignore must not remove manifest.yml from the Git-format archive.
      writeFileSync(join(root, ".gitignore"), "installer-skills/\n");
      writeFileSync(
        join(root, ".gitattributes"),
        [
          "manifest.yml export-ignore",
          "ident.txt ident",
          "utf16.txt working-tree-encoding=UTF-16LE-BOM",
          "",
        ].join("\n"),
      );
      symlinkSync("../installer-skills", join(root, ".claude", "skills"));

      // Commit the source repository's trackable tree so the pre-TASK-95 `git archive HEAD` implementation
      // demonstrably leaks files outside the plan. The ignored planned skill intentionally remains uncommitted;
      // the fixed implementation must ignore source HEAD/Git policy and consume `files` only.
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
      const files = [
        ".claude/skills",
        ".gitattributes",
        ".gitignore",
        "_AGENTS.md",
        "bundles/core/_AGENTS.md",
        "bundles/core/bundle.yml",
        "ident.txt",
        "installer-skills/demo.txt",
        "manifest.yml",
        "utf16.txt",
      ];
      const transforms = [
        { from: "_AGENTS.md", to: "AGENTS.md", aliases: ["CLAUDE.md"] },
        {
          from: "bundles/core/_AGENTS.md",
          to: "bundles/core/AGENTS.md",
          aliases: ["bundles/core/CLAUDE.md"],
        },
      ];
      const tarball = createArchive({
        root,
        outDir: out,
        baseName: "demo-tarball",
        format: "tarball",
        files,
        transforms,
      });
      const archive = createArchive({
        root,
        outDir: out,
        baseName: "demo-git",
        format: "git",
        files,
        transforms,
      });
      expect(archive).toBe(toPosix(join(out, "demo-git.tgz")));
      expect(existsSync(archive)).toBe(true);

      const expected = [
        ".claude/skills",
        ".gitattributes",
        ".gitignore",
        "AGENTS.md",
        "CLAUDE.md",
        "bundles/core/AGENTS.md",
        "bundles/core/CLAUDE.md",
        "bundles/core/bundle.yml",
        "ident.txt",
        "installer-skills/demo.txt",
        "manifest.yml",
        "utf16.txt",
      ].sort();
      expect(tarLayout(archive)).toEqual(expected);
      expect(tarLayout(archive)).toEqual(tarLayout(tarball));
      expect(tarLayout(archive)).not.toContain(".authoring-backlog/LEAK.txt");
      expect(tarLayout(archive)).not.toContain("bundles/disabled/bundle.yml");
      expect(tarLayout(archive).some((path) => path.endsWith("_AGENTS.md"))).toBe(false);

      // The temporary Git plumbing is only a packaging mechanism: authored bytes must not be cleaned or
      // transcoded by attributes carried in the deliverable itself.
      const extracted = join(dir, "git-extracted");
      mkdirSync(extracted, { recursive: true });
      execFileSync("tar", ["-xzf", archive, "-C", extracted]);
      expect(readFileSync(join(extracted, "ident.txt"))).toEqual(
        readFileSync(join(root, "ident.txt")),
      );
      expect(readFileSync(join(extracted, "utf16.txt"))).toEqual(UTF16_BYTES);
    });
  });

  it("does not require the source deliverable to be a Git repository", async () => {
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      mkdirSync(root, { recursive: true });
      const files = seedShip(root);
      const archive = createArchive({
        root,
        outDir: dir,
        baseName: "demo-1.0.0",
        format: "git",
        files,
      });
      expect(tarLayout(archive)).toEqual([...files].sort());
    });
  });
});

describe("createArchive — zip (missing-tool handling)", () => {
  it("requests symlink-preserving mode instead of dereferencing planned alias paths", async () => {
    if (process.platform === "win32") return;
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      const bin = join(dir, "bin");
      mkdirSync(join(root, "installer-skills"), { recursive: true });
      mkdirSync(join(root, ".claude"), { recursive: true });
      mkdirSync(bin, { recursive: true });
      writeFileSync(join(root, "installer-skills", "demo.txt"), "skill\n");
      symlinkSync("../installer-skills", join(root, ".claude", "skills"));

      // A deterministic stand-in for Info-ZIP: it refuses the archive call unless the documented `-y`
      // (`--symlinks`) switch is present. This keeps the regression covered even on CI images without zip.
      const fakeZip = join(bin, "zip");
      writeFileSync(
        fakeZip,
        [
          "#!/usr/bin/env node",
          'const fs = require("node:fs");',
          "const args = process.argv.slice(2);",
          'if (args[0] === "-v") process.exit(0);',
          'if (!args.includes("-y")) process.exit(9);',
          'fs.writeFileSync(args[args.indexOf("-y") + 1], "fake zip");',
          "",
        ].join("\n"),
      );
      chmodSync(fakeZip, 0o755);

      const previousPath = process.env.PATH;
      process.env.PATH = `${bin}:${previousPath ?? ""}`;
      try {
        const archive = createArchive({
          root,
          outDir: dir,
          baseName: "symlink-layout",
          format: "zip",
          files: [".claude/skills", "installer-skills/demo.txt"],
        });
        expect(existsSync(archive)).toBe(true);
      } finally {
        if (previousPath === undefined) delete process.env.PATH;
        else process.env.PATH = previousPath;
      }
    });
  });

  it("replaces an existing archive so incremental zip updates cannot retain stale entries", async () => {
    if (process.platform === "win32") return;
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      const bin = join(dir, "bin");
      mkdirSync(root, { recursive: true });
      mkdirSync(bin, { recursive: true });
      writeFileSync(join(root, "keep.txt"), "keep\n");
      writeFileSync(join(root, "stale.txt"), "stale\n");
      writeFileSync(join(root, "fail.txt"), "fail\n");

      // Emulate Info-ZIP's update semantics: when the output already exists, retain its old entries and add the
      // newly requested ones. The production adapter must remove the old output before invoking this tool.
      const fakeZip = join(bin, "zip");
      writeFileSync(
        fakeZip,
        [
          "#!/usr/bin/env node",
          'const fs = require("node:fs");',
          "const args = process.argv.slice(2);",
          'if (args[0] === "-v") process.exit(0);',
          'const outIndex = args.indexOf("-y") + 1;',
          "const out = args[outIndex];",
          'const prior = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : [];',
          "const next = args.slice(outIndex + 1);",
          'if (next.includes("fail.txt")) { fs.writeFileSync(out, "partial"); process.exit(9); }',
          "fs.writeFileSync(out, JSON.stringify([...new Set([...prior, ...next])].sort()));",
          "",
        ].join("\n"),
      );
      chmodSync(fakeZip, 0o755);

      const previousPath = process.env.PATH;
      process.env.PATH = `${bin}:${previousPath ?? ""}`;
      try {
        const request = {
          root,
          outDir: dir,
          baseName: "successive",
          format: "zip" as const,
        };
        const archive = createArchive({ ...request, files: ["keep.txt", "stale.txt"] });
        expect(JSON.parse(readFileSync(archive, "utf8"))).toEqual(["keep.txt", "stale.txt"]);

        createArchive({ ...request, files: ["keep.txt"] });
        expect(JSON.parse(readFileSync(archive, "utf8"))).toEqual(["keep.txt"]);

        let thrown: unknown;
        try {
          createArchive({ ...request, files: ["fail.txt"] });
        } catch (err) {
          thrown = err;
        }
        expect(isDomainError(thrown)).toBe(true);
        expect(existsSync(archive)).toBe(false);
      } finally {
        if (previousPath === undefined) delete process.env.PATH;
        else process.env.PATH = previousPath;
      }
    });
  });

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
          // The returned package path is POSIX on every OS (a portable artefact reference) — assert against the
          // `/`-form so the expectation is correct on Windows too, where `join` would otherwise yield `\`.
          const expected = toPosix(join(out, "demo-1.0.0.zip"));
          const archive = createArchive({
            root,
            outDir: out,
            baseName: "demo-1.0.0",
            format: "zip",
            files,
          });
          expect(archive).toBe(expected);
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
      // `where` (the printed publish destination) is POSIX on every OS — assert the `/`-form (no-op on POSIX).
      expect(result.where).toBe(toPosix(join(destDir, "demo-1.0.0.tgz")));
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
