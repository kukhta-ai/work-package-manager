import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { NodeFileSystem } from "../../../src/adapters/node-fs.js";
import { createArchive, pushArchive } from "../../../src/adapters/packager.js";
import { isDomainError } from "../../../src/core/errors.js";
import { toPosix } from "../../../src/util/posix-path.js";
import { runSync } from "../../../src/util/shell.js";
import { withTempDir } from "../../helpers/tmpdir.js";

/**
 * Integration tests for the build PACKAGER adapter (task-83) over a REAL tmpdir. The adapter shells out via
 * `runSync`, so real tar/Git/archive and remote-push coverage belongs under the serialized integration budget,
 * not the subprocess-free unit project. ZIP expectations use the same launcher and success classifier as
 * production; deterministic shims cover absence, usability, stale replacement, and post-probe failure.
 */

/** The availability states production distinguishes for an optional tool's version probe. */
type ToolProbeState = "unavailable" | "usable";

/** Classify a CLI probe through the production launcher: only a successful version command is usable. */
function probeTool(tool: string): ToolProbeState {
  try {
    runSync(tool, ["-v"]);
    return "usable";
  } catch {
    return "unavailable";
  }
}
const zipProbeState = probeTool("zip");
const unzipProbeState = probeTool("unzip");

/** Install a cross-platform `zip` command shim backed by a Node script. */
function installFakeZip(bin: string, source: string): void {
  mkdirSync(bin, { recursive: true });
  const script = join(bin, "fake-zip.cjs");
  writeFileSync(script, source);
  if (process.platform === "win32") {
    writeFileSync(join(bin, "zip.cmd"), `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`);
    return;
  }
  const launcher = join(bin, "zip");
  writeFileSync(
    launcher,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`,
  );
  chmodSync(launcher, 0o755);
}

/** Temporarily replace or prepend the process PATH, returning an exact restoration callback. */
function useToolPath(bin: string, includeExisting = true): () => void {
  const previous = process.env.PATH;
  process.env.PATH = includeExisting && previous ? `${bin}${delimiter}${previous}` : bin;
  return () => {
    if (previous === undefined) delete process.env.PATH;
    else process.env.PATH = previous;
  };
}

/** Return a normalized root-relative layout for any gzip-tar archive, ignoring directory-only entries. */
function tarLayout(archive: string): string[] {
  return execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.replace(/^\.\//, "").trim())
    .filter((line) => line.length > 0 && !line.endsWith("/"))
    .sort();
}

/** Return every archived leaf after extraction, treating symlinks as leaves rather than following them. */
function extractedLayout(root: string): string[] {
  const layout: string[] = [];
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(directory, entry.name), relative);
      else layout.push(relative);
    }
  };
  walk(root, "");
  return layout.sort();
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

describe("createArchive — portable scope aliases (TASK-128)", () => {
  const portableFormats: Array<"tarball" | "git" | "zip"> = ["tarball", "git"];
  if (zipProbeState === "usable" && unzipProbeState === "usable") portableFormats.push("zip");
  const scopeAliases = [
    { linkPath: ".claude/skills", aliasTo: "installer-skills" },
    {
      linkPath: "bundles/core/.claude/skills",
      aliasTo: "bundles/core/installer-skills",
    },
  ];

  it.each(
    portableFormats,
  )("%s synthesizes relative root/bundle links from canonical shipped contents, never source aliases", async (format) => {
    if (process.platform === "win32") return;
    await withTempDir(async (dir) => {
      const root = join(dir, "authoring-workspace", "wip");
      mkdirSync(join(root, "installer-skills", "root-skill", "references"), { recursive: true });
      mkdirSync(join(root, "bundles", "core", "installer-skills", "bundle-skill", "assets"), {
        recursive: true,
      });
      writeFileSync(join(root, "manifest.yml"), "project:\n  name: demo\n");
      writeFileSync(join(root, "installer-skills", "root-skill", "SKILL.md"), "root skill\n");
      writeFileSync(
        join(root, "installer-skills", "root-skill", "references", "guide.md"),
        "root guide\n",
      );
      writeFileSync(
        join(root, "bundles", "core", "installer-skills", "bundle-skill", "SKILL.md"),
        "bundle skill\n",
      );
      writeFileSync(
        join(root, "bundles", "core", "installer-skills", "bundle-skill", "assets", "icon.txt"),
        "bundle asset\n",
      );
      // Poison source aliases point to an absolute authoring-only tree. Packaging must neither trust nor copy it.
      const poison = join(dir, "authoring-only-poison");
      mkdirSync(join(poison, "poison-skill"), { recursive: true });
      writeFileSync(join(poison, "poison-skill", "SKILL.md"), "must not ship\n");
      mkdirSync(join(root, ".claude"), { recursive: true });
      mkdirSync(join(root, "bundles", "core", ".claude"), { recursive: true });
      symlinkSync(poison, join(root, ".claude", "skills"));
      symlinkSync(poison, join(root, "bundles", "core", ".claude", "skills"));

      const files = [
        ".claude/skills",
        "bundles/core/.claude/skills",
        "bundles/core/installer-skills/bundle-skill/SKILL.md",
        "bundles/core/installer-skills/bundle-skill/assets/icon.txt",
        "installer-skills/root-skill/SKILL.md",
        "installer-skills/root-skill/references/guide.md",
        "manifest.yml",
      ];
      const archive = createArchive({
        root,
        outDir: dir,
        baseName: `portable-${format}`,
        format,
        files,
        scopeAliases,
      });
      const extracted = join(dir, `extracted-${format}`);
      mkdirSync(extracted, { recursive: true });
      if (format === "zip") execFileSync("unzip", ["-q", archive, "-d", extracted]);
      else execFileSync("tar", ["-xzf", archive, "-C", extracted]);

      for (const alias of scopeAliases) {
        const path = join(extracted, alias.linkPath);
        expect(lstatSync(path).isSymbolicLink()).toBe(true);
        expect(readlinkSync(path)).toBe("../installer-skills");
        expect(readlinkSync(path)).not.toContain(root);
      }
      expect(
        readFileSync(join(extracted, ".claude", "skills", "root-skill", "SKILL.md"), "utf8"),
      ).toBe("root skill\n");
      expect(
        readFileSync(
          join(
            extracted,
            "bundles",
            "core",
            ".claude",
            "skills",
            "bundle-skill",
            "assets",
            "icon.txt",
          ),
          "utf8",
        ),
      ).toBe("bundle asset\n");
      expect(existsSync(join(extracted, ".claude", "skills", "poison-skill"))).toBe(false);
    });
  });

  it("copy fallback exposes complete nested root and bundle skill packages", async () => {
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      mkdirSync(join(root, "installer-skills", "root", "references"), { recursive: true });
      mkdirSync(join(root, "bundles", "core", "installer-skills", "bundle", "assets"), {
        recursive: true,
      });
      writeFileSync(join(root, "manifest.yml"), "project:\n  name: demo\n");
      writeFileSync(join(root, "installer-skills", "root", "SKILL.md"), "root\n");
      writeFileSync(join(root, "installer-skills", "root", "references", "guide.md"), "guide\n");
      writeFileSync(
        join(root, "bundles", "core", "installer-skills", "bundle", "assets", "icon.txt"),
        "icon\n",
      );
      const archive = createArchive({
        root,
        outDir: dir,
        baseName: "fallback",
        format: "tarball",
        files: [
          ".claude/skills",
          "bundles/core/.claude/skills",
          "bundles/core/installer-skills/bundle/assets/icon.txt",
          "installer-skills/root/SKILL.md",
          "installer-skills/root/references/guide.md",
          "manifest.yml",
        ],
        scopeAliases,
        aliasOptions: { platform: "win32" },
      });
      const extracted = join(dir, "fallback-extracted");
      mkdirSync(extracted, { recursive: true });
      execFileSync("tar", ["-xzf", archive, "-C", extracted]);
      expect(lstatSync(join(extracted, ".claude", "skills")).isDirectory()).toBe(true);
      expect(
        readFileSync(
          join(extracted, ".claude", "skills", "root", "references", "guide.md"),
          "utf8",
        ),
      ).toBe("guide\n");
      expect(
        readFileSync(
          join(extracted, "bundles", "core", ".claude", "skills", "bundle", "assets", "icon.txt"),
          "utf8",
        ),
      ).toBe("icon\n");
    });
  });

  it("POSIX tar/Git/ZIP keep empty and missing canonical alias targets resolvable with layout parity", async () => {
    if (process.platform === "win32") return;
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      mkdirSync(join(root, "installer-skills"), { recursive: true });
      mkdirSync(join(root, "bundles", "core"), { recursive: true });
      writeFileSync(join(root, "manifest.yml"), "project:\n  name: demo\n");
      writeFileSync(join(root, "bundles", "core", "bundle.yml"), "id: core\n");

      const layouts: string[][] = [];
      for (const format of portableFormats) {
        const archive = createArchive({
          root,
          outDir: dir,
          baseName: `empty-targets-${format}`,
          format,
          files: [
            ".claude/skills",
            "bundles/core/.claude/skills",
            "bundles/core/bundle.yml",
            "manifest.yml",
          ],
          scopeAliases,
        });
        const extracted = join(dir, `empty-targets-${format}-extracted`);
        mkdirSync(extracted, { recursive: true });
        if (format === "zip") execFileSync("unzip", ["-q", archive, "-d", extracted]);
        else execFileSync("tar", ["-xzf", archive, "-C", extracted]);

        for (const alias of scopeAliases) {
          const link = join(extracted, alias.linkPath);
          const canonical = join(extracted, alias.aliasTo);
          expect(lstatSync(link).isSymbolicLink()).toBe(true);
          expect(readlinkSync(link)).toBe("../installer-skills");
          expect(existsSync(link)).toBe(true);
          expect(lstatSync(canonical).isDirectory()).toBe(true);
          expect(readFileSync(join(canonical, ".keep"), "utf8")).toBe("");
        }
        layouts.push(extractedLayout(extracted));
      }

      for (const layout of layouts.slice(1)) expect(layout).toEqual(layouts[0]);
      expect(existsSync(join(root, "installer-skills", ".keep"))).toBe(false);
      expect(existsSync(join(root, "bundles", "core", "installer-skills"))).toBe(false);
    });
  });

  it("forced-win32 copy fallback keeps empty and missing canonical alias targets resolvable", async () => {
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      mkdirSync(join(root, "installer-skills"), { recursive: true });
      mkdirSync(join(root, "bundles", "core"), { recursive: true });
      writeFileSync(join(root, "manifest.yml"), "project:\n  name: demo\n");
      writeFileSync(join(root, "bundles", "core", "bundle.yml"), "id: core\n");

      const archive = createArchive({
        root,
        outDir: dir,
        baseName: "empty-targets-fallback",
        format: "tarball",
        files: [
          ".claude/skills",
          "bundles/core/.claude/skills",
          "bundles/core/bundle.yml",
          "manifest.yml",
        ],
        scopeAliases,
        aliasOptions: { platform: "win32" },
      });
      const extracted = join(dir, "empty-targets-fallback-extracted");
      mkdirSync(extracted, { recursive: true });
      execFileSync("tar", ["-xzf", archive, "-C", extracted]);

      for (const alias of scopeAliases) {
        const copy = join(extracted, alias.linkPath);
        const canonical = join(extracted, alias.aliasTo);
        expect(lstatSync(copy).isDirectory()).toBe(true);
        expect(existsSync(copy)).toBe(true);
        expect(lstatSync(canonical).isDirectory()).toBe(true);
        expect(readFileSync(join(copy, ".keep"), "utf8")).toBe("");
        expect(readFileSync(join(canonical, ".keep"), "utf8")).toBe("");
      }
      expect(existsSync(join(root, "installer-skills", ".keep"))).toBe(false);
      expect(existsSync(join(root, "bundles", "core", "installer-skills"))).toBe(false);
    });
  });

  it.each([
    {
      name: "canonical root",
      alias: { linkPath: ".claude/skills", aliasTo: "installer-skills" },
      sourceLink: "installer-skills",
    },
    {
      name: "canonical bundle ancestor",
      alias: {
        linkPath: "bundles/core/.claude/skills",
        aliasTo: "bundles/core/installer-skills",
      },
      sourceLink: "bundles/core",
    },
  ])("rejects a symlinked $name without following its authoring-only target", async ({
    alias,
    sourceLink,
  }) => {
    if (process.platform === "win32") return;
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      const poison = join(dir, "authoring-only-poison");
      mkdirSync(root, { recursive: true });
      mkdirSync(join(poison, "installer-skills"), { recursive: true });
      writeFileSync(join(poison, "installer-skills", "SKILL.md"), "must not ship\n");
      writeFileSync(join(root, "manifest.yml"), "project:\n  name: demo\n");
      mkdirSync(join(root, sourceLink, ".."), { recursive: true });
      symlinkSync(poison, join(root, sourceLink));

      let thrown: unknown;
      try {
        createArchive({
          root,
          outDir: dir,
          baseName: `symlinked-target-${sourceLink.replaceAll("/", "-")}`,
          format: "tarball",
          files: [alias.linkPath, "manifest.yml", sourceLink],
          scopeAliases: [alias],
        });
      } catch (error) {
        thrown = error;
      }

      expect(isDomainError(thrown)).toBe(true);
      expect((thrown as Error).message).toMatch(/scope alias target.*not a directory/i);
      expect(lstatSync(join(root, sourceLink)).isSymbolicLink()).toBe(true);
      expect(readlinkSync(join(root, sourceLink))).toBe(poison);
      expect(existsSync(join(poison, "installer-skills", ".keep"))).toBe(false);
      expect(existsSync(join(dir, `symlinked-target-${sourceLink.replaceAll("/", "-")}.tgz`))).toBe(
        false,
      );
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
  it("reports unavailable when no zip command resolves through the production launcher", async () => {
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      const emptyBin = join(dir, "empty-bin");
      mkdirSync(root, { recursive: true });
      mkdirSync(emptyBin, { recursive: true });
      const files = seedShip(root);
      const restorePath = useToolPath(emptyBin, false);
      try {
        let thrown: unknown;
        try {
          createArchive({ root, outDir: dir, baseName: "absent", format: "zip", files });
        } catch (error) {
          thrown = error;
        }
        expect(isDomainError(thrown)).toBe(true);
        expect((thrown as Error).message).toMatch(/zip.*not available|tarball/i);
        expect(existsSync(join(dir, "absent.zip"))).toBe(false);
      } finally {
        restorePath();
      }
    });
  });

  it("treats a non-zero version probe as unavailable and never invokes the archiver", async () => {
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      const bin = join(dir, "bin");
      const invoked = join(dir, "archive-invoked");
      mkdirSync(root, { recursive: true });
      const files = seedShip(root);
      installFakeZip(
        bin,
        [
          'const fs = require("node:fs");',
          "const args = process.argv.slice(2);",
          'if (args[0] === "-v") process.exit(7);',
          `fs.writeFileSync(${JSON.stringify(invoked)}, "called");`,
          "process.exit(9);",
          "",
        ].join("\n"),
      );
      const restorePath = useToolPath(bin);
      try {
        let thrown: unknown;
        try {
          createArchive({ root, outDir: dir, baseName: "nonzero", format: "zip", files });
        } catch (error) {
          thrown = error;
        }
        expect(isDomainError(thrown)).toBe(true);
        expect((thrown as Error).message).toMatch(/zip.*not available|tarball/i);
        expect(existsSync(invoked)).toBe(false);
        expect(existsSync(join(dir, "nonzero.zip"))).toBe(false);
      } finally {
        restorePath();
      }
    });
  });

  it("requests symlink-preserving mode instead of dereferencing planned alias paths", async () => {
    if (process.platform === "win32") return;
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      const bin = join(dir, "bin");
      mkdirSync(join(root, "installer-skills"), { recursive: true });
      mkdirSync(join(root, ".claude"), { recursive: true });
      writeFileSync(join(root, "installer-skills", "demo.txt"), "skill\n");
      symlinkSync("../installer-skills", join(root, ".claude", "skills"));

      // A deterministic stand-in for Info-ZIP: it refuses the archive call unless the documented `-y`
      // (`--symlinks`) switch is present. This keeps the regression covered even on CI images without zip.
      installFakeZip(
        bin,
        [
          'const fs = require("node:fs");',
          "const args = process.argv.slice(2);",
          'if (args[0] === "-v") process.exit(0);',
          'if (!args.includes("-y")) process.exit(9);',
          'fs.writeFileSync(args[args.indexOf("-y") + 1], "fake zip");',
          "",
        ].join("\n"),
      );

      const restorePath = useToolPath(bin);
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
        restorePath();
      }
    });
  });

  it("replaces an existing archive so incremental zip updates cannot retain stale entries", async () => {
    await withTempDir(async (dir) => {
      const root = join(dir, "proj");
      const bin = join(dir, "bin");
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, "keep.txt"), "keep\n");
      writeFileSync(join(root, "stale.txt"), "stale\n");
      writeFileSync(join(root, "fail.txt"), "fail\n");

      // Emulate Info-ZIP's update semantics: when the output already exists, retain its old entries and add the
      // newly requested ones. The production adapter must remove the old output before invoking this tool.
      installFakeZip(
        bin,
        [
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

      const restorePath = useToolPath(bin);
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
        expect((thrown as Error).message).toMatch(/zip failed/i);
        expect((thrown as Error).message).not.toMatch(/not available|use.*tarball/i);
        expect(existsSync(archive)).toBe(false);
      } finally {
        restorePath();
      }
    });
  });

  it(
    zipProbeState === "usable"
      ? "produces a real .zip when zip is usable"
      : "raises unavailable guidance when zip's version probe is not successful",
    async () => {
      await withTempDir(async (dir) => {
        const root = join(dir, "proj");
        mkdirSync(root, { recursive: true });
        const files = seedShip(root);
        const out = join(dir, "out");
        mkdirSync(out, { recursive: true });

        if (zipProbeState === "usable") {
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
