import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toPosix } from "../../src/util/posix-path.js";
import { withTempDir } from "../helpers/tmpdir.js";
import { initWorkspace } from "../helpers/workspace.js";

/**
 * Through-the-edges (integration) E2E for the `build` command family (tasks 82 dry-run / 83 package / 84
 * publish), driving the BUILT `dist/cli.js` against a REAL project on REAL disk — the fullest real path. Each
 * scenario stands up a real project with the real `init` (now full), exercises a `build` leaf, and asserts the
 * observable outcome (exit code, printed path, the real archive's contents, the destination dir). Skipped (not
 * failed) when `dist/` is unbuilt, exactly like the other binary E2E suites; CI builds first, so it runs there.
 */

const builtCli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
const authorRouterSkill = fileURLToPath(
  new URL("../../agent-skills/wpm-author/SKILL.md", import.meta.url),
);
const authoringBundleSkill = fileURLToPath(
  new URL("../../agent-skills/wpm-author-bundle/SKILL.md", import.meta.url),
);
const authoringRecipeSkill = fileURLToPath(
  new URL("../../agent-skills/wpm-author-recipe/SKILL.md", import.meta.url),
);
const authoringSkillSkill = fileURLToPath(
  new URL("../../agent-skills/wpm-author-skill/SKILL.md", import.meta.url),
);
const reviewPackageSkill = fileURLToPath(
  new URL("../../agent-skills/wpm-review-package/SKILL.md", import.meta.url),
);
const createPackageSkill = fileURLToPath(
  new URL("../../agent-skills/wpm-create-package/SKILL.md", import.meta.url),
);
const hasBuild = existsSync(builtCli);
const describeIfBuilt = hasBuild ? describe : describe.skip;

/** Run the built CLI; returns `{ code, stdout, stderr }` (execFileSync throws on non-zero — we capture status). */
function cli(
  args: readonly string[],
  cwd: string,
): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [builtCli, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

/** Whether the `zip` tool is available (the zip happy path is conditional; CI commonly lacks `zip`). */
function hasZip(): boolean {
  try {
    execFileSync("zip", ["-v"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** Whether `unzip` can list a zip archive (needed only for conditional cross-format layout parity). */
function hasUnzip(): boolean {
  try {
    execFileSync("unzip", ["-v"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** Return a normalized root-relative archive layout, ignoring backend-specific directory-only entries. */
function archiveLayout(archive: string): string[] {
  const listed = archive.endsWith(".zip")
    ? execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" })
    : execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
  return listed
    .split("\n")
    .map((line) => line.replace(/^\.\//, "").trim())
    .filter((line) => line.length > 0 && !line.endsWith("/"))
    .sort();
}

/**
 * Concatenate the UTF-8 content of every regular file beneath `root` (recursively) into one blob, so a leak
 * regression can assert a sentinel is absent from the WHOLE extracted archive — content, not just file names.
 * `isDirectory()` is lstat-based, so symlinks (the scope-alias / `CLAUDE.md` aliases) are read as files rather
 * than recursed, which both reads the linked bytes and avoids symlink cycles; non-UTF-8 reads are ignored.
 */
function concatAllFiles(root: string): string {
  let blob = "";
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = join(root, entry.name);
    if (entry.isDirectory()) {
      blob += concatAllFiles(child);
    } else {
      try {
        blob += readFileSync(child, "utf8");
      } catch {
        // a non-UTF-8 or dangling entry contributes nothing to the text-sentinel search
      }
    }
  }
  return blob;
}

/** Snapshot paths, file bytes, and symlink targets without following directory links. */
function snapshotTree(root: string): string[] {
  const entries: string[] = [];
  const walk = (absolute: string): void => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const child = join(absolute, entry.name);
      const path = toPosix(relative(root, child));
      const stat = lstatSync(child);
      if (stat.isSymbolicLink()) {
        entries.push(`link ${path} -> ${readlinkSync(child)}`);
      } else if (stat.isDirectory()) {
        entries.push(`dir ${path}`);
        walk(child);
      } else {
        const digest = createHash("sha256").update(readFileSync(child)).digest("hex");
        entries.push(`file ${path} ${digest}`);
      }
    }
  };
  walk(root);
  return entries.sort();
}

/** Resolve the enclosing Git worktree, or return undefined when `root` is deliberately isolated from Git. */
function gitTopLevel(root: string): string | undefined {
  try {
    return execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Create a real authoring workspace via `wpm init` and return the workspace root. The deliverable nests under
 * `wip/` and `build` resolves it via `-C` and packages the `wip/` tree (task-88); the `.authoring-backlog/`
 * lives at the workspace root, OUTSIDE `wip/`, so `build`'s "no `.authoring-backlog` in the shipped tree"
 * assertions hold structurally.
 */
function initProject(dir: string): string {
  return initWorkspace(builtCli, dir);
}

describeIfBuilt("`wpm build dry-run` E2E (task-82, through dist/cli.js)", () => {
  it("AC82#1/#4 — a fresh minimal project (no targets) FAILS validate ⇒ dry-run exits non-zero", async () => {
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      const r = cli(["build", "dry-run", "-C", proj], dir);
      expect(r.code).not.toBe(0); // validate fails: "no target agents declared"
      expect(`${r.stdout}${r.stderr}`).toMatch(/validation failed|target/i);
    });
  });

  it("AC82#3/#4 — after adding a target: exit 0, prints the would-ship tree (no .authoring-backlog), NO artefact", async () => {
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);

      const before = readdirSync(proj).sort();
      const r = cli(["build", "dry-run", "-C", proj], dir);
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/would ship \d+ file/);
      expect(r.stdout).toContain("manifest.yml");
      expect(r.stdout).toContain("AGENTS.md");
      expect(r.stdout).toMatch(/^ {2}\.claude\/skills$/m);
      expect(r.stdout).not.toMatch(/^ {2}\.agents\/skills$/m);
      // .authoring-backlog/ is builder-time state — it must NOT be in the would-ship tree:
      expect(r.stdout).not.toContain(".authoring-backlog");
      // NO artefact produced: the project dir's top-level entries are unchanged, and no archive sits in cwd/proj:
      expect(readdirSync(proj).sort()).toEqual(before);
      expect(readdirSync(dir).some((f) => f.endsWith(".tgz") || f.endsWith(".zip"))).toBe(false);
      expect(readdirSync(proj).some((f) => f.endsWith(".tgz") || f.endsWith(".zip"))).toBe(false);
    });
  });

  it("TASK-128 AC#1/#2/#6 — dry-run shows exact root/enabled-bundle scopes and no absent-target scope", async () => {
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);
      expect(cli(["bundle", "new", "web", "-C", proj], dir).code).toBe(0);

      const r = cli(["build", "dry-run", "-C", proj], dir);
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/^ {2}\.claude\/skills$/m);
      expect(r.stdout).toMatch(/^ {2}bundles\/web\/\.claude\/skills$/m);
      expect(r.stdout).not.toMatch(/\.agents\/skills|\.openclaw\/skills/);
      expect(r.stdout).not.toMatch(/^ {2}\.claude$/m);
      expect(r.stdout).not.toMatch(/^ {2}bundles\/web\/\.claude$/m);
    });
  });

  it("AC82#5 — run outside any project exits non-zero naming manifest.yml", async () => {
    await withTempDir(async (dir) => {
      // dir has no project; run dry-run from it without -C.
      const r = cli(["build", "dry-run"], dir);
      expect(r.code).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toContain("manifest.yml");
    });
  });

  it("AC82#6 — `build dry-run --help` exits 0 with Usage + an Example", async () => {
    await withTempDir(async (dir) => {
      const r = cli(["build", "dry-run", "--help"], dir);
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/Usage:/);
      expect(r.stdout).toMatch(/Example/i);
    });
  });
});

describeIfBuilt("`wpm build package` E2E (task-83, through dist/cli.js)", () => {
  it("TASK-128 AC#3-#5/#8 — every format exposes portable root/bundle scopes after the authoring tree is unavailable", async () => {
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);
      expect(cli(["bundle", "new", "web", "-C", proj], dir).code).toBe(0);
      const wip = join(proj, "wip");
      writeFileSync(join(wip, "installer-skills", "qa-root.txt"), "root-scope-content\n");
      writeFileSync(
        join(wip, "bundles", "web", "installer-skills", "qa-bundle.txt"),
        "bundle-scope-content\n",
      );

      const formats: Array<{ name: "tarball" | "git" | "zip"; ext: "tgz" | "zip" }> = [
        { name: "tarball", ext: "tgz" },
        { name: "git", ext: "tgz" },
      ];
      if (hasZip() && hasUnzip()) formats.push({ name: "zip", ext: "zip" });
      const archives: Array<{ format: (typeof formats)[number]; path: string }> = [];
      for (const format of formats) {
        const result = cli(["build", "package", "--format", format.name, "-C", proj], dir);
        expect(result.code).toBe(0);
        const produced = join(proj, "builds", `demo-0.1.0.${format.ext}`);
        const retained = join(dir, `task128-${format.name}.${format.ext}`);
        cpSync(produced, retained);
        archives.push({ format, path: retained });
      }

      // Any source-absolute authoring link is now broken. Every retained artifact must remain self-contained.
      renameSync(wip, join(proj, "authoring-tree-unavailable"));
      for (const { format, path } of archives) {
        const layout = archiveLayout(path);
        expect(layout).toEqual(
          expect.arrayContaining([".claude/skills", "bundles/web/.claude/skills"]),
        );
        const extracted = join(dir, `task128-${format.name}-extracted`);
        mkdirSync(extracted, { recursive: true });
        if (format.ext === "zip") execFileSync("unzip", ["-q", path, "-d", extracted]);
        else execFileSync("tar", ["-xzf", path, "-C", extracted]);

        const rootScope = join(extracted, ".claude", "skills");
        const bundleScope = join(extracted, "bundles", "web", ".claude", "skills");
        if (process.platform === "win32") {
          expect(lstatSync(rootScope).isDirectory()).toBe(true);
          expect(lstatSync(bundleScope).isDirectory()).toBe(true);
        } else {
          expect(lstatSync(rootScope).isSymbolicLink()).toBe(true);
          expect(lstatSync(bundleScope).isSymbolicLink()).toBe(true);
          expect(readlinkSync(rootScope)).toBe("../installer-skills");
          expect(readlinkSync(bundleScope)).toBe("../installer-skills");
          expect(readlinkSync(rootScope)).not.toContain(proj);
          expect(readlinkSync(bundleScope)).not.toContain(proj);
        }
        expect(readFileSync(join(rootScope, "qa-root.txt"), "utf8")).toBe("root-scope-content\n");
        expect(readFileSync(join(bundleScope, "qa-bundle.txt"), "utf8")).toBe(
          "bundle-scope-content\n",
        );
      }
    });
  });

  it("AC83#1/#2 + AC89#1/#2/#3 — `--format tarball`: exit 0, archive in <workspace>/builds/, un-nested root (manifest at root), no authoring surface", async () => {
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);

      // Run with cwd=out (NOT the workspace) to prove the archive lands in <workspace>/builds/, never the cwd.
      const out = join(dir, "out");
      mkdirSync(out, { recursive: true });
      const r = cli(["build", "package", "--format", "tarball", "-C", proj], out);
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/packaged/);

      // AC89#1: the archive lands in <workspace>/builds/, NOT the cwd.
      const archive = join(proj, "builds", "demo-0.1.0.tgz");
      expect(existsSync(archive)).toBe(true);
      expect(existsSync(join(out, "demo-0.1.0.tgz"))).toBe(false);
      expect(r.stdout).toContain(toPosix(archive));

      const listed = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
      // AC89#2: the archive root is the un-nested deliverable — manifest.yml sits at the archive root (no wip/ prefix).
      expect(listed).toMatch(/^(\.\/)?manifest\.yml$/m);
      expect(listed).not.toMatch(/(^|\/)wip\//m);
      // AC90#2/#5: the executor front door ships under its CANONICAL stripped name `AGENTS.md`, and the reserved
      // `_AGENTS.md` is GONE from the archive (never both names).
      expect(listed).toMatch(/^(\.\/)?AGENTS\.md$/m);
      // No reserved-prefix front door ships under the `_AGENTS.md` BASENAME. The authoring bundle-template
      // scaffold is excluded from the archive entirely (TASK-104).
      expect(listed).not.toMatch(/(^|\/)_AGENTS\.md$/m);
      // AC89#3: the authoring backlog, the authoring front door (workspace-root AGENTS.md), and builds/ are ABSENT.
      expect(listed).not.toContain(".authoring-backlog");
      expect(listed).not.toMatch(/(^|\/)builds\//m);
      expect(listed).not.toContain("demo-0.1.0.tgz"); // the archive never contains itself
    });
  });

  it("AC90#2/#5/#6 — `_AGENTS.md` (root + per bundle) ships as canonical `AGENTS.md` VERBATIM, with the `CLAUDE.md` alias, never `_AGENTS.md`", async () => {
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      // claude-code is a target ⇒ the build creates the CLAUDE.md alias front door beside each AGENTS.md (doc 05).
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);
      // A real enabled bundle ⇒ exercises the PER-BUNDLE front door + the scope-alias symlink-preservation path.
      expect(cli(["bundle", "new", "web", "-C", proj], dir).code).toBe(0);

      // The author EDITS the reserved-prefix front doors (AC90#1). Unique sentinels prove byte-for-byte fidelity.
      const ROOT_SENTINEL = "ROOT-FRONT-DOOR-SENTINEL-зважив-7f3a";
      const BUNDLE_SENTINEL = "BUNDLE-FRONT-DOOR-SENTINEL-9c1d";
      writeFileSync(join(proj, "wip", "_AGENTS.md"), `# root\n${ROOT_SENTINEL}\n`);
      writeFileSync(
        join(proj, "wip", "bundles", "web", "_AGENTS.md"),
        `# web\n${BUNDLE_SENTINEL}\n`,
      );

      const r = cli(["build", "package", "--format", "tarball", "-C", proj], dir);
      expect(r.code).toBe(0);
      const archive = join(proj, "builds", "demo-0.1.0.tgz");
      expect(existsSync(archive)).toBe(true);

      // AC90#5: no reserved-prefix front door (the `_AGENTS.md` basename) anywhere in the archive — never both
      // names. The authoring bundle-template scaffold is excluded from the archive entirely (TASK-104).
      const listed = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
      expect(listed).not.toMatch(/(^|\/)_AGENTS\.md$/m);
      // AC90#2: the canonical front door + the CLAUDE.md alias are present at the root AND in the bundle.
      expect(listed).toMatch(/^(\.\/)?AGENTS\.md$/m);
      expect(listed).toMatch(/^(\.\/)?CLAUDE\.md$/m);
      expect(listed).toMatch(/^(\.\/)?bundles\/web\/AGENTS\.md$/m);
      expect(listed).toMatch(/^(\.\/)?bundles\/web\/CLAUDE\.md$/m);

      // AC90#6: extract and assert the canonical front door carries the AUTHOR'S bytes verbatim (no regeneration).
      const ex = join(dir, "extracted");
      mkdirSync(ex, { recursive: true });
      execFileSync("tar", ["-xzf", archive, "-C", ex]);
      expect(readFileSync(join(ex, "AGENTS.md"), "utf8")).toBe(`# root\n${ROOT_SENTINEL}\n`);
      expect(readFileSync(join(ex, "bundles", "web", "AGENTS.md"), "utf8")).toBe(
        `# web\n${BUNDLE_SENTINEL}\n`,
      );
      // The alias is a symlink to the canonical name, so resolving it yields the same author bytes (AC90#2).
      expect(lstatSync(join(ex, "CLAUDE.md")).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(ex, "CLAUDE.md"), "utf8")).toBe(`# root\n${ROOT_SENTINEL}\n`);
      expect(lstatSync(join(ex, "bundles", "web", "CLAUDE.md")).isSymbolicLink()).toBe(true);
    });
  });

  it("TASK-102 — the archive ships `bundles/<id>/backlog` as a symlink → install-backlog (once, no double-include) and the EXTRACTED recipe resolves under the Backlog.md CLI (AC#3)", async () => {
    // The shipped link is a relative POSIX symlink (tar preserves it); on Windows authoring it is a copy, so
    // gate the symlink-shape + executor-resolution proof to POSIX (the designed-for case).
    if (process.platform === "win32") return;
    await withTempDir((dir) => {
      const proj = initProject(dir);
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);
      expect(cli(["bundle", "new", "web", "-C", proj], dir).code).toBe(0);

      const r = cli(["build", "package", "--format", "tarball", "-C", proj], dir);
      expect(r.code).toBe(0);
      const archive = join(proj, "builds", "demo-0.1.0.tgz");
      expect(existsSync(archive)).toBe(true);

      // The archive lists `bundles/web/backlog` (the link) AND the real install-backlog content. The recipe's
      // config.yml appears EXACTLY ONCE (it is NOT duplicated through the `backlog/` link), and nothing is
      // archived UNDER `bundles/web/backlog/` (the link is a leaf, never traversed):
      const listed = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
      expect(listed).toMatch(/^(\.\/)?bundles\/web\/backlog$/m);
      expect(
        listed
          .split("\n")
          .filter((l) => /^(\.\/)?bundles\/web\/install-backlog\/config\.yml$/.test(l)),
      ).toHaveLength(1);
      expect(listed).not.toMatch(/(^|\/)bundles\/web\/backlog\//m); // no children under the link

      // Extract and prove the EXECUTOR's install-time flow: the link is a relative symlink → install-backlog,
      // and the Backlog.md CLI resolves the recipe with the extracted bundle as cwd (AC#3).
      const ex = join(dir, "extracted");
      mkdirSync(ex, { recursive: true });
      execFileSync("tar", ["-xzf", archive, "-C", ex]);
      const exBacklog = join(ex, "bundles", "web", "backlog");
      expect(lstatSync(exBacklog).isSymbolicLink()).toBe(true);
      expect(readlinkSync(exBacklog)).toBe("install-backlog");
      // `backlog task list` resolves from the extracted bundle (throws on a non-zero exit / unresolved project):
      const recipe = execFileSync("backlog", ["task", "list", "--plain"], {
        cwd: join(ex, "bundles", "web"),
        encoding: "utf8",
      });
      expect(recipe).toMatch(/Detect/i); // the scaffold's detect→setup→verify recipe is resolvable
    });
  });

  it("AC90#3 — during authoring (after init + bundle new) ONLY `_AGENTS.md` exists on disk; no canonical front door", async () => {
    await withTempDir((dir) => {
      const proj = initProject(dir);
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);
      expect(cli(["bundle", "new", "web", "-C", proj], dir).code).toBe(0);

      // The reserved-prefix front doors exist (author-owned), at the project root and in the bundle.
      expect(existsSync(join(proj, "wip", "_AGENTS.md"))).toBe(true);
      expect(existsSync(join(proj, "wip", "bundles", "web", "_AGENTS.md"))).toBe(true);
      // NO canonical agent-surface front door is auto-discoverable in the deliverable during authoring.
      for (const rel of [
        ["wip", "AGENTS.md"],
        ["wip", "CLAUDE.md"],
        ["wip", "GEMINI.md"],
        ["wip", "bundles", "web", "AGENTS.md"],
        ["wip", "bundles", "web", "CLAUDE.md"],
        ["wip", "bundles", "web", "GEMINI.md"],
      ]) {
        expect(existsSync(join(proj, ...rel))).toBe(false);
      }
    });
  });

  it("AC93#4 — REGRESSION GUARD: NO canonical executor front door (`AGENTS.md`/`CLAUDE.md`/`GEMINI.md`) appears ANYWHERE in the authoring deliverable tree — root or any bundle — only the reserved `_AGENTS.md` prefix", async () => {
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);
      // Two bundles ⇒ the guard covers MULTIPLE bundle subtrees, not just one.
      expect(cli(["bundle", "new", "web", "-C", proj], dir).code).toBe(0);
      expect(cli(["bundle", "new", "doc", "-C", proj], dir).code).toBe(0);

      // Walk the WHOLE deliverable (`wip/`) and assert no file's BASENAME is a canonical auto-discovered front
      // door. During authoring the executor front door lives ONLY under the reserved `_AGENTS.md` (and the
      // bundle-template ships `_AGENTS.md.tmpl`); a canonical `AGENTS.md`/`CLAUDE.md`/`GEMINI.md` would be read as
      // a directive by an authoring agent, so its presence under `wip/` is a regression. (The WORKSPACE-ROOT
      // `AGENTS.md`/`CLAUDE.md` authoring front door is legitimate and lives OUTSIDE `wip/`, so it is not walked.)
      const canonical = new Set(["AGENTS.md", "CLAUDE.md", "GEMINI.md"]);
      const offenders: string[] = [];
      const walk = (abs: string): void => {
        for (const entry of readdirSync(abs, { withFileTypes: true })) {
          const child = join(abs, entry.name);
          if (entry.isDirectory()) walk(child);
          else if (canonical.has(entry.name)) offenders.push(child);
        }
      };
      walk(join(proj, "wip"));
      expect(offenders).toEqual([]);
      // And the reserved-prefix front door IS present at the root and in each bundle (the positive counterpart).
      expect(existsSync(join(proj, "wip", "_AGENTS.md"))).toBe(true);
      expect(existsSync(join(proj, "wip", "bundles", "web", "_AGENTS.md"))).toBe(true);
      expect(existsSync(join(proj, "wip", "bundles", "doc", "_AGENTS.md"))).toBe(true);
    });
  });

  // AC89#4 (disabled bundle directories + builder-time dirs excluded) is proven at the pure-plan level in
  // test/unit/operations/build.test.ts ("EXCLUDES a DISABLED bundle dir …") — the same `plan.shippable` enumeration
  // that becomes the archive content. It cannot be shown through a produced archive because an orphan/disabled
  // bundle directory FAILS validation (validate.ts check 4), so `build package` exits before archiving.

  it("AC89#7 — re-packaging unchanged project state reproduces an identical archive layout", async () => {
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);

      const archive = join(proj, "builds", "demo-0.1.0.tgz");
      const layout = (): string[] => {
        expect(cli(["build", "package", "--format", "tarball", "-C", proj], dir).code).toBe(0);
        return execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
          .split("\n")
          .filter((l) => l.length > 0)
          .sort();
      };
      expect(layout()).toEqual(layout());
    });
  });

  it("AC93#3 — REGRESSION GUARD: no builder-time region (authoring backlog, authoring front door, builds/) leaks into the archive — by PATH and by CONTENT", async () => {
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);

      // Plant a UNIQUE sentinel in EACH of the three builder-time regions (all OUTSIDE the deliverable `wip/`).
      // A leak of ANY one into the archive must FAIL this test — at the content level, not merely by path. The
      // authoring front door is the WORKSPACE-ROOT `AGENTS.md`/`CLAUDE.md` (it addresses the authoring agent); it
      // is distinct from the deliverable's executor front door, which legitimately ships AS `AGENTS.md` from
      // `wip/_AGENTS.md` — so its sentinel must be absent EVEN THOUGH an `AGENTS.md` is in the archive.
      const BACKLOG_SENTINEL = "AUTHORING-BACKLOG-LEAK-SENTINEL-3b7d";
      const FRONTDOOR_SENTINEL = "AUTHORING-FRONT-DOOR-LEAK-SENTINEL-9a2e";
      const BUILDS_SENTINEL = "BUILD-OUTPUT-LEAK-SENTINEL-c4f1";
      writeFileSync(join(proj, ".authoring-backlog", "leak-probe.md"), BACKLOG_SENTINEL);
      writeFileSync(join(proj, "AGENTS.md"), `# authoring front door\n${FRONTDOOR_SENTINEL}\n`);
      writeFileSync(join(proj, "CLAUDE.md"), `# authoring front door\n${FRONTDOOR_SENTINEL}\n`);
      writeFileSync(join(proj, "builds", "stray-probe.txt"), BUILDS_SENTINEL);

      const r = cli(["build", "package", "--format", "tarball", "-C", proj], dir);
      expect(r.code).toBe(0);
      const archive = join(proj, "builds", "demo-0.1.0.tgz");
      expect(existsSync(archive)).toBe(true);

      // PATH-level: none of the three region paths (nor the planted probe files) appear in the archive listing.
      const listed = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
      expect(listed).not.toContain(".authoring-backlog");
      expect(listed).not.toMatch(/(^|\/)builds\//m);
      expect(listed).not.toContain("leak-probe.md");
      expect(listed).not.toContain("stray-probe.txt");

      // CONTENT-level: extract and prove NONE of the sentinels appear in ANY archived file's bytes.
      const ex = join(dir, "extracted");
      mkdirSync(ex, { recursive: true });
      execFileSync("tar", ["-xzf", archive, "-C", ex]);
      const blob = concatAllFiles(ex);
      expect(blob).not.toContain(BACKLOG_SENTINEL);
      expect(blob).not.toContain(FRONTDOOR_SENTINEL); // the authoring front door's bytes never reach the archive
      expect(blob).not.toContain(BUILDS_SENTINEL);
      // Sanity: the archive DID ship a deliverable executor front door (so the front-door check is meaningful).
      expect(existsSync(join(ex, "AGENTS.md"))).toBe(true);
      expect(readFileSync(join(ex, "AGENTS.md"), "utf8")).not.toContain(FRONTDOOR_SENTINEL);
    });
  });

  it("TASK-103 AC#3 — a bundle that ships NO payload skill packages with no placeholder skill in the archive", async () => {
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);
      // a config-only bundle: a fresh `bundle new` registers/ships no payload skill (TASK-103):
      expect(cli(["bundle", "new", "web", "-C", proj], dir).code).toBe(0);

      const r = cli(["build", "package", "--format", "tarball", "-C", proj], dir);
      expect(r.code).toBe(0);
      const archive = join(proj, "builds", "demo-0.1.0.tgz");
      expect(existsSync(archive)).toBe(true);

      const listed = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
      // NO payload SKILL.md under any bundle's payload/agent-skills/<name>/ — the build ships no placeholder skill.
      // (The `.keep` slot file sits directly under agent-skills/, not in a `<name>/` subdir, so it is not matched.)
      expect(listed).not.toMatch(/bundles\/[^/]+\/payload\/agent-skills\/[^/]+\/SKILL\.md/);
      // Sanity: the bundle DID ship (so the negative assertion is meaningful):
      expect(listed).toMatch(/^(\.\/)?bundles\/web\/bundle\.yml$/m);
    });
  });

  it("TASK-104 — every package format prunes builder templates but preserves registered runtime `.tmpl` files and symlinks", async () => {
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      const executorFrontDoor = join(proj, "wip", "_AGENTS.md");
      const assertRuntimeBundleMenu = (): void => {
        const content = readFileSync(executorFrontDoor, "utf8");
        expect(content).not.toContain("{{bundles}}");
        expect(content).not.toMatch(/choose from:\s*$/im);
        expect(content).toContain("Read each enabled bundle's `summary`");
        expect(content).toContain("Never expose internal bundle ids");
      };

      // Zero enabled bundles: init renders a complete runtime-discovery protocol, never a static menu.
      assertRuntimeBundleMenu();
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);
      expect(cli(["bundle", "new", "web", "-C", proj], dir).code).toBe(0);
      // One enabled bundle: the author-owned front door remains complete and discovers it from the manifest.
      assertRuntimeBundleMenu();

      const wip = join(proj, "wip");
      const runtimeDir = join(wip, "bundles", "web", "payload", "templates", "nested");
      mkdirSync(runtimeDir, { recursive: true });
      writeFileSync(join(runtimeDir, "runtime.conf.tmpl"), "port={{port}}\n", "utf8");
      expect(
        cli(["bundle", "web", "templates", "add", "nested/runtime.conf.tmpl", "-C", proj], dir)
          .code,
      ).toBe(0);

      // A root builder source must be pruned. A file-like orphan under bundles/ models the real adapter's
      // DirEntry shape for a symlink and proves it cannot bypass the manifest boundary.
      writeFileSync(join(wip, "README.md.tmpl"), "unresolved={{project-name}}\n", "utf8");
      const outsideBundle = join(dir, "orphan-bundle.txt");
      writeFileSync(outsideBundle, "ORPHAN-BUNDLE-MUST-NOT-SHIP\n", "utf8");
      if (process.platform !== "win32") {
        symlinkSync(outsideBundle, join(wip, "bundles", "orphan-link"));
        symlinkSync("runtime.conf.tmpl", join(runtimeDir, "runtime-link.tmpl"));
        expect(
          cli(["bundle", "web", "templates", "add", "nested/runtime-link.tmpl", "-C", proj], dir)
            .code,
        ).toBe(0);
      }

      const runtimeTemplate = "bundles/web/payload/templates/nested/runtime.conf.tmpl";
      const runtimeLink = "bundles/web/payload/templates/nested/runtime-link.tmpl";
      const assertClean = (layout: readonly string[]): void => {
        expect(layout.some((path) => path.startsWith("bundles/bundle-template/"))).toBe(false);
        expect(layout).not.toContain("README.md.tmpl");
        expect(layout).not.toContain("bundles/orphan-link");
        expect(
          layout.filter(
            (path) => path.endsWith(".tmpl") && !path.startsWith("bundles/web/payload/templates/"),
          ),
        ).toEqual([]);
        expect(layout).toContain(runtimeTemplate);
        if (process.platform !== "win32") expect(layout).toContain(runtimeLink);
        expect(layout).toContain("bundles/web/bundle.yml");
        expect(layout).toContain("AGENTS.md");
        expect(layout).toContain("bundles/web/AGENTS.md");
      };

      const layouts: string[][] = [];
      const assertArchive = (archive: string, format: "tar" | "zip", label: string): void => {
        const layout = archiveLayout(archive);
        assertClean(layout);
        layouts.push(layout);

        const extracted = join(dir, `task104-${label}-extracted`);
        mkdirSync(extracted, { recursive: true });
        if (format === "zip") {
          execFileSync("unzip", ["-q", archive, "-d", extracted]);
        } else {
          execFileSync("tar", ["-xzf", archive, "-C", extracted]);
        }
        expect(readFileSync(join(extracted, runtimeTemplate), "utf8")).toBe("port={{port}}\n");
        if (process.platform !== "win32") {
          const link = join(extracted, runtimeLink);
          expect(lstatSync(link).isSymbolicLink()).toBe(true);
          expect(readlinkSync(link)).toBe("runtime.conf.tmpl");
          expect(readFileSync(link, "utf8")).toBe("port={{port}}\n");
        }
      };

      expect(cli(["build", "package", "--format", "tarball", "-C", proj], dir).code).toBe(0);
      assertArchive(join(proj, "builds", "demo-0.1.0.tgz"), "tar", "tarball");

      expect(cli(["build", "package", "--format", "git", "-C", proj], dir).code).toBe(0);
      assertArchive(join(proj, "builds", "demo-0.1.0.tgz"), "tar", "git");

      if (hasZip() && hasUnzip()) {
        expect(cli(["build", "package", "--format", "zip", "-C", proj], dir).code).toBe(0);
        assertArchive(join(proj, "builds", "demo-0.1.0.zip"), "zip", "zip");
      }

      for (const layout of layouts.slice(1)) expect(layout).toEqual(layouts[0]);

      // Packaging is read-only over the authoring workspace: the scaffold remains present and can still feed
      // a later bundle-new operation after every archive backend has run.
      expect(existsSync(join(wip, "bundles", "bundle-template", "_AGENTS.md.tmpl"))).toBe(true);
      expect(cli(["bundle", "new", "later", "--version", "7.8.9", "-C", proj], dir).code).toBe(0);
      // Multiple enabled bundles: no mutation reintroduces a rendered list or dangling introducer.
      assertRuntimeBundleMenu();
      expect(existsSync(join(wip, "bundles", "later", "install-backlog", "config.yml"))).toBe(true);
    });
  });

  it("TASK-105 — successive archives ship only registered payload-skill packages after real deregistration", async () => {
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);
      expect(cli(["bundle", "new", "web", "-C", proj], dir).code).toBe(0);
      expect(cli(["bundle", "new", "other", "-C", proj], dir).code).toBe(0);

      const wip = join(proj, "wip");
      const web = join(wip, "bundles", "web");
      const other = join(wip, "bundles", "other");
      const skillMd = (name: string): string =>
        `---\nname: ${name}\ndescription: Use ${name} after installation.\n---\n# ${name}\n`;

      const keptRoot = join(web, "payload", "agent-skills", "kept");
      mkdirSync(join(keptRoot, "references"), { recursive: true });
      mkdirSync(join(keptRoot, "assets"), { recursive: true });
      writeFileSync(join(keptRoot, "SKILL.md"), skillMd("kept"), "utf8");
      writeFileSync(join(keptRoot, "references", "guide.md"), "registered guide\n", "utf8");
      writeFileSync(join(keptRoot, "assets", "prompt.tmpl"), "hello {{name}}\n", "utf8");
      if (process.platform !== "win32") {
        symlinkSync("../references/guide.md", join(keptRoot, "assets", "guide-link.md"));
      }

      const movedRoot = join(web, "custom");
      mkdirSync(join(movedRoot, "assets"), { recursive: true });
      writeFileSync(join(movedRoot, "two.md"), skillMd("moved"), "utf8");
      writeFileSync(join(movedRoot, "assets", "moved.txt"), "registered custom path\n", "utf8");

      // A registered custom symlink package uses an arbitrary marker basename too. NodeFileSystem reports the
      // directory link as file-like, while add/read follows it to validate the referenced document.
      const linkedTarget = join(dir, "registered-linked-target");
      const linkedRoot = join(web, "payload", "custom-skills", "linked");
      if (process.platform !== "win32") {
        mkdirSync(linkedTarget, { recursive: true });
        mkdirSync(join(web, "payload", "custom-skills"), { recursive: true });
        writeFileSync(join(linkedTarget, "linked-entry.md"), skillMd("linked"), "utf8");
        writeFileSync(join(linkedTarget, "asset.txt"), "linked package asset\n", "utf8");
        symlinkSync(linkedTarget, linkedRoot, "dir");
      }

      // Exact-boundary and bundle-isolation negatives. None is registered in its host bundle.
      const conventionalOrphans = [
        join(web, "payload", "agent-skills", "kept-extra"),
        join(web, "payload", "agent-skills", "orphan"),
        join(other, "payload", "agent-skills", "kept"),
      ];
      for (const orphan of conventionalOrphans) {
        mkdirSync(orphan, { recursive: true });
        writeFileSync(join(orphan, "SKILL.md"), skillMd("orphan"), "utf8");
      }
      const customSibling = join(web, "payload", "custom-skills", "moved-extra");
      mkdirSync(customSibling, { recursive: true });
      writeFileSync(join(customSibling, "SKILL.md"), skillMd("moved-extra"), "utf8");

      // A custom symlinked skill directory is file-like through NodeFileSystem.list and must still be rejected.
      const customOrphanTarget = join(dir, "custom-orphan-target");
      mkdirSync(customOrphanTarget, { recursive: true });
      writeFileSync(join(customOrphanTarget, "orphan-entry.md"), skillMd("linked-orphan"), "utf8");
      const customOrphanLink = join(web, "payload", "custom-skills", "linked-orphan");
      if (process.platform !== "win32") symlinkSync(customOrphanTarget, customOrphanLink, "dir");

      // Controls: bundle installer-skills and another payload category are not governed by payload.skills.
      const helper = join(web, "installer-skills", "helper", "SKILL.md");
      const deliveredFile = join(web, "payload", "files", "manual", "info.md");
      const deliveredTemplate = join(web, "payload", "templates", "manual", "info.md.tmpl");
      const deliveredDoc = join(web, "docs", "manual", "info.md");
      const uninstallRecipe = join(web, "uninstall-backlog", "notes", "info.md");
      mkdirSync(join(web, "installer-skills", "helper"), { recursive: true });
      mkdirSync(join(web, "payload", "files", "manual"), { recursive: true });
      mkdirSync(join(web, "payload", "templates", "manual"), { recursive: true });
      mkdirSync(join(web, "docs", "manual"), { recursive: true });
      mkdirSync(join(web, "uninstall-backlog", "notes"), { recursive: true });
      writeFileSync(helper, skillMd("helper"), "utf8");
      writeFileSync(deliveredFile, skillMd("ordinary-file"), "utf8");
      writeFileSync(deliveredTemplate, skillMd("ordinary-template"), "utf8");
      writeFileSync(deliveredDoc, skillMd("ordinary-doc"), "utf8");
      writeFileSync(uninstallRecipe, skillMd("ordinary-uninstall-recipe"), "utf8");

      expect(cli(["bundle", "web", "skills", "add", "kept", "-C", proj], dir).code).toBe(0);
      expect(
        cli(["bundle", "web", "skills", "add", "moved", "--path", "custom/two.md", "-C", proj], dir)
          .code,
      ).toBe(0);
      if (process.platform !== "win32") {
        expect(
          cli(
            [
              "bundle",
              "web",
              "skills",
              "add",
              "linked",
              "--path",
              "payload/custom-skills/linked/linked-entry.md",
              "-C",
              proj,
            ],
            dir,
          ).code,
        ).toBe(0);
      }

      const kept = "bundles/web/payload/agent-skills/kept";
      const moved = "bundles/web/custom";
      const controls = [
        "bundles/web/installer-skills/helper/SKILL.md",
        "bundles/web/payload/files/manual/info.md",
        "bundles/web/payload/templates/manual/info.md.tmpl",
        "bundles/web/docs/manual/info.md",
        "bundles/web/uninstall-backlog/notes/info.md",
      ];
      const absentAlways = [
        "bundles/web/payload/agent-skills/kept-extra/SKILL.md",
        "bundles/web/payload/agent-skills/orphan/SKILL.md",
        "bundles/other/payload/agent-skills/kept/SKILL.md",
        "bundles/web/payload/custom-skills/moved-extra/SKILL.md",
        "bundles/web/payload/custom-skills/linked-orphan",
      ];
      const registeredPaths = [
        `${kept}/SKILL.md`,
        `${kept}/references/guide.md`,
        `${kept}/assets/prompt.tmpl`,
        `${moved}/two.md`,
        `${moved}/assets/moved.txt`,
      ];
      if (process.platform !== "win32") {
        registeredPaths.push(`${kept}/assets/guide-link.md`);
        registeredPaths.push("bundles/web/payload/custom-skills/linked");
      }

      const beforeDryRun = cli(["build", "dry-run", "-C", proj], dir);
      expect(beforeDryRun.code).toBe(0);
      for (const path of [...registeredPaths, ...controls])
        expect(beforeDryRun.stdout).toContain(path);
      for (const path of absentAlways) expect(beforeDryRun.stdout).not.toContain(path);

      const formats: Array<{ name: "tarball" | "git" | "zip"; ext: "tgz" | "zip" }> = [
        { name: "tarball", ext: "tgz" },
        { name: "git", ext: "tgz" },
      ];
      if (hasZip() && hasUnzip()) formats.push({ name: "zip", ext: "zip" });

      const packageLayouts = (
        phase: "registered" | "deregistered",
        shouldContainRegistered: boolean,
      ): string[][] => {
        const layouts: string[][] = [];
        for (const format of formats) {
          expect(cli(["build", "package", "--format", format.name, "-C", proj], dir).code).toBe(0);
          const archive = join(proj, "builds", `demo-0.1.0.${format.ext}`);
          const layout = archiveLayout(archive);
          layouts.push(layout);
          for (const path of controls) expect(layout).toContain(path);
          for (const path of absentAlways) expect(layout).not.toContain(path);
          for (const path of registeredPaths) {
            if (shouldContainRegistered) expect(layout).toContain(path);
            else expect(layout).not.toContain(path);
          }

          const extracted = join(dir, `task105-${phase}-${format.name}`);
          mkdirSync(extracted, { recursive: true });
          if (format.ext === "zip") execFileSync("unzip", ["-q", archive, "-d", extracted]);
          else execFileSync("tar", ["-xzf", archive, "-C", extracted]);
          if (shouldContainRegistered) {
            expect(readFileSync(join(extracted, `${kept}/references/guide.md`), "utf8")).toBe(
              "registered guide\n",
            );
            expect(readFileSync(join(extracted, `${kept}/assets/prompt.tmpl`), "utf8")).toBe(
              "hello {{name}}\n",
            );
            if (process.platform !== "win32") {
              expect(
                lstatSync(join(extracted, `${kept}/assets/guide-link.md`)).isSymbolicLink(),
              ).toBe(true);
              expect(
                lstatSync(
                  join(extracted, "bundles/web/payload/custom-skills/linked"),
                ).isSymbolicLink(),
              ).toBe(true);
            }
          }
        }
        for (const layout of layouts.slice(1)) expect(layout).toEqual(layouts[0]);
        return layouts;
      };

      packageLayouts("registered", true);

      expect(cli(["bundle", "web", "skills", "remove", "kept", "-C", proj], dir).code).toBe(0);
      expect(cli(["bundle", "web", "skills", "remove", "moved", "-C", proj], dir).code).toBe(0);
      if (process.platform !== "win32") {
        expect(cli(["bundle", "web", "skills", "remove", "linked", "-C", proj], dir).code).toBe(0);
      }
      // Deregister-not-delete: both conventional and custom sources remain author-editable on disk.
      expect(existsSync(join(keptRoot, "SKILL.md"))).toBe(true);
      expect(existsSync(join(movedRoot, "two.md"))).toBe(true);
      if (process.platform !== "win32") expect(lstatSync(linkedRoot).isSymbolicLink()).toBe(true);

      const afterDryRun = cli(["build", "dry-run", "-C", proj], dir);
      expect(afterDryRun.code).toBe(0);
      for (const path of [...registeredPaths, ...absentAlways])
        expect(afterDryRun.stdout).not.toContain(path);
      for (const path of controls) expect(afterDryRun.stdout).toContain(path);
      packageLayouts("deregistered", false);
    });
  }, 90_000);

  it("TASK-118 AC#5/#6/#8/#10 — fresh multi-format review builds use an equivalent Git-isolated copy while the original stays byte-for-byte unchanged", async () => {
    if (process.platform === "win32") return;
    await withTempDir(async (dir) => {
      const sourceRepo = join(dir, "source-repository");
      mkdirSync(sourceRepo);
      execFileSync("git", ["init", "--quiet"], { cwd: sourceRepo });
      const sourceAscentMarker = "TASK118-SOURCE-GIT-ASCENT-MUST-NOT-SHIP-a712";
      writeFileSync(join(sourceRepo, "source-only-review-marker.txt"), sourceAscentMarker);

      const proj = initProject(sourceRepo);
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);
      expect(cli(["bundle", "new", "web", "-C", proj], dir).code).toBe(0);
      expect(gitTopLevel(proj)).toBe(sourceRepo);

      // Give the review subject a pre-existing prospective deliverable. Review must not replace these bytes.
      expect(cli(["build", "package", "--format", "tarball", "-C", proj], dir).code).toBe(0);
      const originalArchive = join(proj, "builds", "demo-0.1.0.tgz");
      const originalArchiveDigest = createHash("sha256")
        .update(readFileSync(originalArchive))
        .digest("hex");
      const authoringFrontDoorMarker = "<!-- wpm:workspace-authoring:start -->";
      expect(readFileSync(join(proj, "AGENTS.md"), "utf8")).toContain(authoringFrontDoorMarker);
      expect(JSON.parse(readFileSync(join(proj, ".wpm-authoring.json"), "utf8"))).toMatchObject({
        status: "complete",
        selectedClients: ["codex"],
      });
      expect(existsSync(join(proj, "CLAUDE.md"))).toBe(false);

      // Establish the immutable subject baseline BEFORE copying or planting any review-only marker.
      const before = snapshotTree(proj);
      const reviewCopy = join(dir, "isolated-review", "workspace");
      mkdirSync(join(dir, "isolated-review"));
      cpSync(proj, reviewCopy, {
        recursive: true,
        dereference: false,
        verbatimSymlinks: true,
      });

      // The unmodified copy is equivalent at the review boundary and cannot ascend to the source repository.
      expect(snapshotTree(reviewCopy)).toEqual(before);
      expect(snapshotTree(proj)).toEqual(before);
      expect(gitTopLevel(reviewCopy)).toBeUndefined();
      expect(existsSync(join(reviewCopy, "CLAUDE.md"))).toBe(false);

      // Copied archives are stale input, never proof of this review. Every format must create absent output.
      rmSync(join(reviewCopy, "builds"), { recursive: true, force: true });
      mkdirSync(join(reviewCopy, "builds"));
      expect(readdirSync(join(reviewCopy, "builds"))).toEqual([]);

      // Plant exact workspace-native authoring paths and unique content in the disposable copy only.
      const marker = "TASK118-WPM-REVIEW-PACKAGE-MUST-NOT-SHIP-6d29";
      const reviewBytes = `${readFileSync(reviewPackageSkill, "utf8")}\n${marker}\n`;
      for (const nativePath of [
        join(reviewCopy, ".agents", "skills", "wpm-review-package", "SKILL.md"),
        join(reviewCopy, ".claude", "skills", "wpm-review-package", "SKILL.md"),
      ]) {
        mkdirSync(join(nativePath, ".."), { recursive: true });
        writeFileSync(nativePath, reviewBytes);
      }
      expect(snapshotTree(proj)).toEqual(before);

      const dryRun = cli(["build", "dry-run", "-C", reviewCopy], dir);
      expect(dryRun.code).toBe(0);

      const formats: Array<{ name: "tarball" | "git" | "zip"; ext: "tgz" | "zip" }> = [
        { name: "tarball", ext: "tgz" },
        { name: "git", ext: "tgz" },
      ];
      if (hasZip() && hasUnzip()) formats.push({ name: "zip", ext: "zip" });

      const layouts: string[][] = [];
      for (const format of formats) {
        const copyArchive = join(reviewCopy, "builds", `demo-0.1.0.${format.ext}`);
        rmSync(copyArchive, { force: true });
        expect(existsSync(copyArchive)).toBe(false);

        const packed = cli(["build", "package", "--format", format.name, "-C", reviewCopy], dir);
        expect(packed.code).toBe(0);
        expect(existsSync(copyArchive)).toBe(true);

        const layout = archiveLayout(copyArchive);
        layouts.push(layout);
        expect(layout.some((path) => path.includes("wpm-review-package"))).toBe(false);
        const declaredClaudeScopes = [".claude/skills", "bundles/web/.claude/skills"];
        expect(layout).toEqual(expect.arrayContaining(declaredClaudeScopes));
        expect(
          layout.some((path) => {
            const inAgentsScope =
              /^\.agents(?:\/|$)/.test(path) || /^bundles\/[^/]+\/\.agents(?:\/|$)/.test(path);
            const inClaudeScope =
              /^\.claude(?:\/|$)/.test(path) || /^bundles\/[^/]+\/\.claude(?:\/|$)/.test(path);
            const isDeclaredClaudeSkillPath = declaredClaudeScopes.some(
              (scope) => path === scope || path.startsWith(`${scope}/`),
            );
            return inAgentsScope || (inClaudeScope && !isDeclaredClaudeSkillPath);
          }),
        ).toBe(false);
        expect(layout).not.toContain("source-only-review-marker.txt");

        const extracted = join(dir, `task118-review-copy-${format.name}-extracted`);
        mkdirSync(extracted);
        if (format.ext === "zip") execFileSync("unzip", ["-q", copyArchive, "-d", extracted]);
        else execFileSync("tar", ["-xzf", copyArchive, "-C", extracted]);
        const extractedBytes = concatAllFiles(extracted);
        expect(extractedBytes).not.toContain(marker);
        expect(extractedBytes).not.toContain(sourceAscentMarker);
        expect(extractedBytes).not.toContain(authoringFrontDoorMarker);
        expect(lstatSync(join(extracted, "CLAUDE.md")).isSymbolicLink()).toBe(true);
        expect(readlinkSync(join(extracted, "CLAUDE.md"))).toBe("AGENTS.md");
        expect(lstatSync(join(extracted, "bundles", "web", "CLAUDE.md")).isSymbolicLink()).toBe(
          true,
        );
        expect(readlinkSync(join(extracted, "bundles", "web", "CLAUDE.md"))).toBe("AGENTS.md");
      }
      for (const layout of layouts.slice(1)) expect(layout).toEqual(layouts[0]);

      // The exact original paths, bytes, links, and pre-existing archive remain unchanged after real build.
      expect(snapshotTree(proj)).toEqual(before);
      expect(createHash("sha256").update(readFileSync(originalArchive)).digest("hex")).toBe(
        originalArchiveDigest,
      );
    });
  });

  it("TASK-95 AC#1-4 — git packages the same un-nested, prefix-stripped layout as tarball (and zip when available)", async () => {
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);
      expect(cli(["bundle", "new", "web", "-C", proj], dir).code).toBe(0);
      expect(
        cli(
          ["authoring", "integrate", "--client", "codex", "--client", "claude-code", "-C", proj],
          dir,
        ).code,
      ).toBe(0);
      expect(cli(["authoring", "handoff", "prepare", "-C", proj], dir).code).toBe(0);

      const ROOT_SENTINEL = "TASK95-ROOT-EXECUTOR-3f8c";
      const BUNDLE_SENTINEL = "TASK95-BUNDLE-EXECUTOR-b247";
      const WRAPPER_SENTINEL = "TASK95-WORKSPACE-WRAPPER-MUST-NOT-SHIP-91ad";
      const PREPARATION_SENTINEL = "TASK108-DISTRIBUTION-PREPARATION-MUST-NOT-SHIP-2e4c";
      const FRONTDOOR_SENTINEL = "TASK120-MANAGED-FRONT-DOOR-MUST-NOT-SHIP-53fe";
      const PERSONAL_SKILL_SENTINEL = "TASK122-WPM-CREATE-PACKAGE-MUST-NOT-SHIP-4c8e";
      const PERSONAL_STATE_SENTINEL = "TASK123-PERSONAL-SETUP-STATE-MUST-NOT-SHIP-87d1";
      const PERSONAL_QUARANTINE_SENTINEL = "TASK124-PERSONAL-SETUP-QUARANTINE-MUST-NOT-SHIP-16cf";
      const TEMPLATE_TASK_DEFINITION_SENTINEL =
        "TASK126-TEMPLATE-TASK-DEFINITION-MUST-NOT-SHIP-6f13";
      const TEMPLATE_TASK_PROVENANCE_SENTINEL =
        "wpm:template-origin:built-in:project:task126-nonleak";
      const BUNDLE_CONTRIBUTION_RECORD_SENTINEL =
        "TASK127-BUNDLE-CONTRIBUTION-RECORD-MUST-NOT-SHIP-842c";
      const BUNDLE_TASK_DEFINITION_SENTINEL = "TASK127-BUNDLE-TASK-DEFINITION-MUST-NOT-SHIP-a17e";
      const BUNDLE_TASK_PROVENANCE_SENTINEL =
        "wpm:template-origin:project-local:bundle:task127-nonleak";
      const workspaceSkillEvidence = [
        [
          "wpm-author",
          authorRouterSkill,
          "Treat orientation and selection as one fail-closed workflow.",
        ],
        ["wpm-author-bundle", authoringBundleSkill, "Turn the request into four short lists:"],
        [
          "wpm-author-recipe",
          authoringRecipeSkill,
          "The bundle's install backlog is the single recipe task source:",
        ],
        [
          "wpm-author-skill",
          authoringSkillSkill,
          "Classify all requested artifacts and existing collisions before changing state.",
        ],
        ["wpm-review-package", reviewPackageSkill, "## Evaluate the complete bounded catalog"],
      ] as const;
      const integrationStateText = readFileSync(join(proj, ".wpm-authoring.json"), "utf8");
      const integrationState = JSON.parse(integrationStateText) as {
        workspaceRoot: string;
        selectedClients: string[];
      };
      expect(integrationState).toMatchObject({
        workspaceRoot: proj,
        selectedClients: ["codex", "claude-code"],
      });
      const STATE_SENTINEL = integrationState.workspaceRoot;
      const handoffReceiptText = readFileSync(join(proj, ".wpm-handoff.json"), "utf8");
      const handoffReceipt = JSON.parse(handoffReceiptText) as {
        status: string;
        configuredClients: string[];
      };
      expect(handoffReceipt).toMatchObject({
        status: "prepared",
        configuredClients: ["codex", "claude-code"],
      });
      const HANDOFF_SENTINEL = '"authoringBacklogPath": ".authoring-backlog"';
      expect(handoffReceiptText).toContain(HANDOFF_SENTINEL);
      writeFileSync(join(proj, "wip", "_AGENTS.md"), `# root\n${ROOT_SENTINEL}\n`);
      writeFileSync(
        join(proj, "wip", "bundles", "web", "_AGENTS.md"),
        `# web\n${BUNDLE_SENTINEL}\n`,
      );
      writeFileSync(
        join(proj, ".authoring-backlog", "task95-leak.txt"),
        [
          WRAPPER_SENTINEL,
          TEMPLATE_TASK_DEFINITION_SENTINEL,
          TEMPLATE_TASK_PROVENANCE_SENTINEL,
          BUNDLE_TASK_DEFINITION_SENTINEL,
          BUNDLE_TASK_PROVENANCE_SENTINEL,
          "revision: task126-nonleak",
          "authoring-tasks:",
        ].join("\n"),
      );
      writeFileSync(join(proj, "builds", "task95-leak.txt"), WRAPPER_SENTINEL);
      writeFileSync(
        join(proj, ".wpm-bundle-authoring.json"),
        `${JSON.stringify({ marker: BUNDLE_CONTRIBUTION_RECORD_SENTINEL })}\n`,
      );
      mkdirSync(join(proj, "distribution-preparation"));
      writeFileSync(
        join(proj, "distribution-preparation", "package-boundary.js"),
        PREPARATION_SENTINEL,
      );
      for (const frontDoor of ["AGENTS.md", "CLAUDE.md"]) {
        const frontDoorPath = join(proj, frontDoor);
        writeFileSync(
          frontDoorPath,
          `${FRONTDOOR_SENTINEL}\n${readFileSync(frontDoorPath, "utf8")}`,
        );
      }
      for (const [skillName, sourcePath, sentinel] of workspaceSkillEvidence) {
        const expectedBytes = readFileSync(sourcePath, "utf8");
        expect(expectedBytes).toContain(sentinel);
        for (const nativeRoot of [".agents", ".claude"]) {
          expect(
            readFileSync(join(proj, nativeRoot, "skills", skillName, "SKILL.md"), "utf8"),
          ).toBe(expectedBytes);
        }
      }
      const personalSkillBytes = `${readFileSync(createPackageSkill, "utf8")}\n${PERSONAL_SKILL_SENTINEL}\n`;
      for (const nativeRoot of [".agents", ".claude"]) {
        const personalPath = join(proj, nativeRoot, "skills", "wpm-create-package", "SKILL.md");
        mkdirSync(join(personalPath, ".."), { recursive: true });
        writeFileSync(personalPath, personalSkillBytes);
      }
      mkdirSync(join(proj, ".wpm"), { recursive: true });
      writeFileSync(
        join(proj, ".wpm", "authoring-setup.json"),
        `${JSON.stringify({ marker: PERSONAL_STATE_SENTINEL })}\n`,
      );
      mkdirSync(join(proj, ".wpm", "authoring-setup-quarantine", "request"), {
        recursive: true,
      });
      writeFileSync(
        join(proj, ".wpm", "authoring-setup-quarantine", "request", "evidence.json"),
        `${JSON.stringify({ marker: PERSONAL_QUARANTINE_SENTINEL })}\n`,
      );

      const assertNoWorkspaceIntegration = (layout: string[], extractedRoot: string): void => {
        expect(layout).not.toContain(".wpm-authoring.json");
        expect(layout).not.toContain(".wpm-handoff.json");
        expect(layout).not.toContain(".wpm-bundle-authoring.json");
        expect(layout).not.toContain(".wpm/authoring-setup.json");
        expect(layout.some((path) => path.startsWith(".wpm/authoring-setup-quarantine/"))).toBe(
          false,
        );
        const declaredClaudeScopes = [".claude/skills", "bundles/web/.claude/skills"];
        expect(layout).toEqual(expect.arrayContaining(declaredClaudeScopes));
        expect(
          layout.some((path) => {
            const inAgentsScope =
              /^\.agents(?:\/|$)/.test(path) || /^bundles\/[^/]+\/\.agents(?:\/|$)/.test(path);
            const inClaudeScope =
              /^\.claude(?:\/|$)/.test(path) || /^bundles\/[^/]+\/\.claude(?:\/|$)/.test(path);
            const isDeclaredClaudeSkillPath = declaredClaudeScopes.some(
              (scope) => path === scope || path.startsWith(`${scope}/`),
            );
            return inAgentsScope || (inClaudeScope && !isDeclaredClaudeSkillPath);
          }),
        ).toBe(false);
        for (const [skillName] of workspaceSkillEvidence) {
          expect(layout.some((path) => path.includes(skillName))).toBe(false);
        }
        expect(layout.some((path) => path.includes("wpm-create-package"))).toBe(false);
        const extractedBytes = concatAllFiles(extractedRoot);
        expect(extractedBytes).not.toContain(STATE_SENTINEL);
        expect(extractedBytes).not.toContain(HANDOFF_SENTINEL);
        expect(extractedBytes).not.toContain(FRONTDOOR_SENTINEL);
        expect(extractedBytes).not.toContain(PERSONAL_SKILL_SENTINEL);
        expect(extractedBytes).not.toContain(PERSONAL_STATE_SENTINEL);
        expect(extractedBytes).not.toContain(PERSONAL_QUARANTINE_SENTINEL);
        expect(extractedBytes).not.toContain(TEMPLATE_TASK_DEFINITION_SENTINEL);
        expect(extractedBytes).not.toContain(TEMPLATE_TASK_PROVENANCE_SENTINEL);
        expect(extractedBytes).not.toContain(BUNDLE_CONTRIBUTION_RECORD_SENTINEL);
        expect(extractedBytes).not.toContain(BUNDLE_TASK_DEFINITION_SENTINEL);
        expect(extractedBytes).not.toContain(BUNDLE_TASK_PROVENANCE_SENTINEL);
        for (const [, , sentinel] of workspaceSkillEvidence) {
          expect(extractedBytes).not.toContain(sentinel);
        }
      };

      const sourceDeliverableBefore = snapshotTree(join(proj, "wip"));
      expect(sourceDeliverableBefore.some((entry) => entry.includes("wpm-author/SKILL.md"))).toBe(
        false,
      );
      for (const [, , sentinel] of workspaceSkillEvidence) {
        expect(concatAllFiles(join(proj, "wip"))).not.toContain(sentinel);
      }
      expect(concatAllFiles(join(proj, "wip"))).not.toContain(HANDOFF_SENTINEL);
      expect(concatAllFiles(join(proj, "wip"))).not.toContain(PERSONAL_SKILL_SENTINEL);
      expect(concatAllFiles(join(proj, "wip"))).not.toContain(PERSONAL_STATE_SENTINEL);
      expect(concatAllFiles(join(proj, "wip"))).not.toContain(PERSONAL_QUARANTINE_SENTINEL);
      expect(concatAllFiles(join(proj, "wip"))).not.toContain(TEMPLATE_TASK_DEFINITION_SENTINEL);
      expect(concatAllFiles(join(proj, "wip"))).not.toContain(TEMPLATE_TASK_PROVENANCE_SENTINEL);
      expect(concatAllFiles(join(proj, "wip"))).not.toContain(BUNDLE_CONTRIBUTION_RECORD_SENTINEL);
      expect(concatAllFiles(join(proj, "wip"))).not.toContain(BUNDLE_TASK_DEFINITION_SENTINEL);
      expect(concatAllFiles(join(proj, "wip"))).not.toContain(BUNDLE_TASK_PROVENANCE_SENTINEL);

      const tgz = join(proj, "builds", "demo-0.1.0.tgz");
      expect(cli(["build", "package", "--format", "tarball", "-C", proj], dir).code).toBe(0);
      const tarballLayout = archiveLayout(tgz);
      const tarballExtracted = join(dir, "task95-tarball-extracted");
      mkdirSync(tarballExtracted);
      execFileSync("tar", ["-xzf", tgz, "-C", tarballExtracted]);
      assertNoWorkspaceIntegration(tarballLayout, tarballExtracted);

      // The workspace created by init is intentionally NOT initialized as its own Git repository. Git format
      // must package the prepared ship set, not require/ascend to an enclosing repository's raw HEAD.
      rmSync(tgz);
      expect(existsSync(tgz)).toBe(false);
      const gitBuild = cli(["build", "package", "--format", "git", "-C", proj], dir);
      expect(gitBuild.code).toBe(0);
      expect(existsSync(tgz)).toBe(true);
      const gitLayout = archiveLayout(tgz);
      expect(gitLayout).toEqual(tarballLayout);

      // AC#1/#3: un-nested root + canonical root/bundle front doors and target aliases; no reserved prefix.
      expect(gitLayout).toContain("manifest.yml");
      expect(gitLayout).toContain("AGENTS.md");
      expect(gitLayout).toContain("CLAUDE.md");
      expect(gitLayout).toContain("bundles/web/AGENTS.md");
      expect(gitLayout).toContain("bundles/web/CLAUDE.md");
      expect(gitLayout.some((path) => path === "wip" || path.startsWith("wip/"))).toBe(false);
      expect(gitLayout.some((path) => path.endsWith("_AGENTS.md"))).toBe(false);
      // AC#2: the three workspace-wrapper regions and the archive itself never enter the Git archive.
      expect(gitLayout.some((path) => path.startsWith(".authoring-backlog/"))).toBe(false);
      expect(gitLayout.some((path) => path.startsWith("builds/"))).toBe(false);
      expect(gitLayout.some((path) => path.startsWith("distribution-preparation/"))).toBe(false);
      expect(gitLayout).not.toContain("task95-leak.txt");

      const extracted = join(dir, "task95-git-extracted");
      mkdirSync(extracted, { recursive: true });
      execFileSync("tar", ["-xzf", tgz, "-C", extracted]);
      expect(readFileSync(join(extracted, "AGENTS.md"), "utf8")).toBe(`# root\n${ROOT_SENTINEL}\n`);
      expect(readFileSync(join(extracted, "bundles", "web", "AGENTS.md"), "utf8")).toBe(
        `# web\n${BUNDLE_SENTINEL}\n`,
      );
      expect(lstatSync(join(extracted, "CLAUDE.md")).isSymbolicLink()).toBe(true);
      expect(concatAllFiles(extracted)).not.toContain(WRAPPER_SENTINEL);
      expect(concatAllFiles(extracted)).not.toContain(PREPARATION_SENTINEL);
      assertNoWorkspaceIntegration(gitLayout, extracted);

      // AC#4: zip is part of the same parity assertion when both authoring and listing tools are available.
      if (hasZip() && hasUnzip()) {
        expect(cli(["build", "package", "--format", "zip", "-C", proj], dir).code).toBe(0);
        const zip = join(proj, "builds", "demo-0.1.0.zip");
        expect(archiveLayout(zip)).toEqual(tarballLayout);
        const zipExtracted = join(dir, "task95-zip-extracted");
        mkdirSync(zipExtracted);
        execFileSync("unzip", ["-q", zip, "-d", zipExtracted]);
        assertNoWorkspaceIntegration(tarballLayout, zipExtracted);
      }

      expect(snapshotTree(join(proj, "wip"))).toEqual(sourceDeliverableBefore);
      for (const [, , sentinel] of workspaceSkillEvidence) {
        expect(concatAllFiles(join(proj, "wip"))).not.toContain(sentinel);
      }
      expect(concatAllFiles(join(proj, "wip"))).not.toContain(PERSONAL_SKILL_SENTINEL);
      expect(concatAllFiles(join(proj, "wip"))).not.toContain(PERSONAL_STATE_SENTINEL);
      expect(concatAllFiles(join(proj, "wip"))).not.toContain(PERSONAL_QUARANTINE_SENTINEL);
      expect(concatAllFiles(join(proj, "wip"))).not.toContain(TEMPLATE_TASK_DEFINITION_SENTINEL);
      expect(concatAllFiles(join(proj, "wip"))).not.toContain(TEMPLATE_TASK_PROVENANCE_SENTINEL);
      expect(concatAllFiles(join(proj, "wip"))).not.toContain(BUNDLE_CONTRIBUTION_RECORD_SENTINEL);
      expect(concatAllFiles(join(proj, "wip"))).not.toContain(BUNDLE_TASK_DEFINITION_SENTINEL);
      expect(concatAllFiles(join(proj, "wip"))).not.toContain(BUNDLE_TASK_PROVENANCE_SENTINEL);
      expect(readFileSync(join(proj, ".wpm-bundle-authoring.json"), "utf8")).toContain(
        BUNDLE_CONTRIBUTION_RECORD_SENTINEL,
      );
      expect(readFileSync(join(proj, ".wpm", "authoring-setup.json"), "utf8")).toContain(
        PERSONAL_STATE_SENTINEL,
      );
      expect(
        readFileSync(
          join(proj, ".wpm", "authoring-setup-quarantine", "request", "evidence.json"),
          "utf8",
        ),
      ).toContain(PERSONAL_QUARANTINE_SENTINEL);
    });
  });

  it("AC83#3 — an unsupported --format value exits 2 (usage error)", async () => {
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      const r = cli(["build", "package", "--format", "bogus", "-C", proj], dir);
      expect(r.code).toBe(2);
    });
  });

  it("AC83#1 — package FAILS before producing when validate fails (fresh project, no targets)", async () => {
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      const r = cli(["build", "package", "--format", "tarball", "-C", proj], dir);
      expect(r.code).not.toBe(0);
      // nothing produced: the build-output directory holds no archive (init seeds an empty builds/).
      expect(readdirSync(join(proj, "builds")).length).toBe(0);
    });
  });

  it("AC83#2 — `--format zip` produces a real .zip in <workspace>/builds/ when zip is available (skipped otherwise)", async () => {
    if (!hasZip()) return; // headless CI commonly lacks `zip`; the missing-tool path is covered by the unit test.
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);
      const r = cli(["build", "package", "--format", "zip", "-C", proj], dir);
      expect(r.code).toBe(0);
      expect(existsSync(join(proj, "builds", "demo-0.1.0.zip"))).toBe(true);
    });
  });

  it("AC89#6 — package outside any workspace exits non-zero naming the missing workspace", async () => {
    await withTempDir(async (dir) => {
      const r = cli(["build", "package"], dir); // no -C, no workspace marker in dir
      expect(r.code).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toMatch(/workspace/i);
    });
  });

  it("AC83#5 — `build package --help` exits 0 with Usage, --format + its values, and an Example", async () => {
    await withTempDir(async (dir) => {
      const r = cli(["build", "package", "--help"], dir);
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/Usage:/);
      expect(r.stdout).toContain("--format");
      expect(r.stdout).toMatch(/zip/);
      expect(r.stdout).toMatch(/tarball/);
      expect(r.stdout).toMatch(/git/);
      expect(r.stdout).toMatch(/Example/i);
    });
  });
});

describeIfBuilt("`wpm build publish` E2E (task-84, through dist/cli.js)", () => {
  it("AC84#1 — `publish <local-dir> --format tarball`: exit 0, the archive lands in the destination dir", async () => {
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);

      const dest = join(dir, "published");
      mkdirSync(dest, { recursive: true });
      const out = join(dir, "out");
      mkdirSync(out, { recursive: true });
      const r = cli(["build", "publish", dest, "--format", "tarball", "-C", proj], out);
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/published/);
      // the archive landed in the destination:
      expect(readdirSync(dest)).toContain("demo-0.1.0.tgz");
    });
  });

  it("AC84#2 — a publish whose BUILD fails (no targets) does NOT push and exits non-zero", async () => {
    await withTempDir(async (dir) => {
      const proj = initProject(dir); // fresh minimal ⇒ no targets ⇒ validate fails
      const dest = join(dir, "published");
      mkdirSync(dest, { recursive: true });
      const out = join(dir, "out");
      mkdirSync(out, { recursive: true });
      const r = cli(["build", "publish", dest, "--format", "tarball", "-C", proj], out);
      expect(r.code).not.toBe(0); // AC84#2
      // no push happened — the destination stays empty:
      expect(readdirSync(dest).length).toBe(0);
    });
  });

  it("AC84#3 — run outside any project exits non-zero naming manifest.yml", async () => {
    await withTempDir(async (dir) => {
      const r = cli(["build", "publish", join(dir, "anywhere")], dir);
      expect(r.code).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toContain("manifest.yml");
    });
  });

  it("AC84#4 — `build publish --help` exits 0 with Usage, the <destination> positional, and an Example", async () => {
    await withTempDir(async (dir) => {
      const r = cli(["build", "publish", "--help"], dir);
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/Usage:/);
      expect(r.stdout).toContain("<destination>");
      expect(r.stdout).toMatch(/Example/i);
    });
  });
});

describeIfBuilt("FULL workspace lifecycle E2E (AC93#2, through dist/cli.js)", () => {
  it("init → bundle new → project meta → build: the workspace layout holds throughout and the archive is un-nested in builds/", async () => {
    await withTempDir(async (dir) => {
      // 1. init creates a WORKSPACE: deliverable nested under wip/, authoring backlog + front door at the root,
      //    builds/ created empty. The deliverable manifest is NOT at the workspace root.
      const proj = initProject(dir);
      expect(existsSync(join(proj, "wip", "manifest.yml"))).toBe(true);
      expect(existsSync(join(proj, "manifest.yml"))).toBe(false);
      expect(existsSync(join(proj, ".authoring-backlog"))).toBe(true);
      expect(existsSync(join(proj, "AGENTS.md"))).toBe(true); // workspace-root authoring front door
      expect(readdirSync(join(proj, "builds"))).toEqual([]); // builds/ starts empty

      // 2. project-bound commands resolve the NESTED deliverable via -C <workspace> (task-88). `project root`
      //    prints the resolved deliverable path = <workspace>/wip.
      const root = cli(["project", "root", "-C", proj], dir);
      expect(root.code).toBe(0);
      expect(root.stdout.trim()).toBe(toPosix(join(proj, "wip")));

      // 3. bundle new scaffolds INTO the deliverable (wip/bundles/web/), under the reserved front-door prefix.
      expect(cli(["bundle", "new", "web", "-C", proj], dir).code).toBe(0);
      expect(existsSync(join(proj, "wip", "bundles", "web", "bundle.yml"))).toBe(true);
      expect(existsSync(join(proj, "wip", "bundles", "web", "_AGENTS.md"))).toBe(true);
      expect(existsSync(join(proj, "wip", "bundles", "web", "AGENTS.md"))).toBe(false);

      // 4. project meta + targets add mutate the nested manifest; a target is required for a valid build.
      expect(
        cli(["project", "meta", "--description", "lifecycle demo", "-C", proj], dir).code,
      ).toBe(0);
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);
      const show = cli(["project", "show", "-C", proj], dir);
      expect(show.code).toBe(0);
      expect(show.stdout).toContain("lifecycle demo"); // the edit is read back through resolution

      // 5. build produces an UN-NESTED archive in <workspace>/builds/: manifest at the archive root (no wip/
      //    prefix), the executor front door stripped to AGENTS.md, and no builder-time region shipped.
      const r = cli(["build", "package", "--format", "tarball", "-C", proj], dir);
      expect(r.code).toBe(0);
      const archive = join(proj, "builds", "demo-0.1.0.tgz");
      expect(existsSync(archive)).toBe(true);
      const listed = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
      expect(listed).toMatch(/^(\.\/)?manifest\.yml$/m);
      expect(listed).not.toMatch(/(^|\/)wip\//m); // un-nested: no wip/ prefix in the archive
      expect(listed).toMatch(/^(\.\/)?AGENTS\.md$/m); // executor front door, prefix-stripped
      expect(listed).toMatch(/^(\.\/)?bundles\/web\/bundle\.yml$/m); // the bundle authored in step 3
      expect(listed).not.toMatch(/(^|\/)_AGENTS\.md$/m);
      expect(listed).not.toContain(".authoring-backlog");
      expect(listed).not.toMatch(/(^|\/)builds\//m);
    });
  });
});
