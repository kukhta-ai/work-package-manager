import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
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
  it("AC83#1/#2 — `--format tarball`: exit 0, prints the path, a real .tgz with the shippable files (no .authoring-backlog)", async () => {
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);

      const out = join(dir, "out");
      mkdirSync(out, { recursive: true });
      // Run with cwd=out so the archive lands there (the CLI writes to the cwd).
      const r = cli(["build", "package", "--format", "tarball", "-C", proj], out);
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/packaged/);

      const archive = join(out, "demo-0.1.0.tgz");
      expect(existsSync(archive)).toBe(true);
      const listed = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
      expect(listed).toContain("manifest.yml");
      expect(listed).toContain("AGENTS.md");
      // .authoring-backlog/ must NOT be in the package:
      expect(listed).not.toContain(".authoring-backlog");
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
      const out = join(dir, "out");
      mkdirSync(out, { recursive: true });
      const r = cli(["build", "package", "--format", "tarball", "-C", proj], out);
      expect(r.code).not.toBe(0);
      // nothing produced:
      expect(readdirSync(out).length).toBe(0);
    });
  });

  it("AC83#2 — `--format zip` produces a real .zip when zip is available (skipped otherwise)", async () => {
    if (!hasZip()) return; // headless CI commonly lacks `zip`; the missing-tool path is covered by the unit test.
    await withTempDir(async (dir) => {
      const proj = initProject(dir);
      expect(cli(["project", "targets", "add", "claude-code", "-C", proj], dir).code).toBe(0);
      const out = join(dir, "out");
      mkdirSync(out, { recursive: true });
      const r = cli(["build", "package", "--format", "zip", "-C", proj], out);
      expect(r.code).toBe(0);
      expect(existsSync(join(out, "demo-0.1.0.zip"))).toBe(true);
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
