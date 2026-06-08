import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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
      // .authoring-backlog/ is builder-time state — it must NOT be in the would-ship tree:
      expect(r.stdout).not.toContain(".authoring-backlog");
      // NO artefact produced: the project dir's top-level entries are unchanged, and no archive sits in cwd/proj:
      expect(readdirSync(proj).sort()).toEqual(before);
      expect(readdirSync(dir).some((f) => f.endsWith(".tgz") || f.endsWith(".zip"))).toBe(false);
      expect(readdirSync(proj).some((f) => f.endsWith(".tgz") || f.endsWith(".zip"))).toBe(false);
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
      expect(r.stdout).toContain(join(proj, "builds", "demo-0.1.0.tgz"));

      const listed = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
      // AC89#2: the archive root is the un-nested deliverable — manifest.yml sits at the archive root (no wip/ prefix).
      expect(listed).toMatch(/^(\.\/)?manifest\.yml$/m);
      expect(listed).not.toMatch(/(^|\/)wip\//m);
      // AC90#2/#5: the executor front door ships under its CANONICAL stripped name `AGENTS.md`, and the reserved
      // `_AGENTS.md` is GONE from the archive (never both names).
      expect(listed).toMatch(/^(\.\/)?AGENTS\.md$/m);
      // No reserved-prefix front door ships under the `_AGENTS.md` BASENAME (the bundle-template's
      // `_AGENTS.md.tmpl` scaffold is a `.tmpl`, not a front door, so it is intentionally not matched).
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
      // names. (The bundle-template's `_AGENTS.md.tmpl` is a `.tmpl` scaffold, not a front door, so it is exempt.)
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
      expect(root.stdout.trim()).toBe(join(proj, "wip"));

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
