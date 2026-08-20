import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execaSync } from "execa";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../helpers/tmpdir.js";

/**
 * End-to-end (through-the-binary) tests for the per-bundle subcommand space — `bundle <id> show` / `bundle <id>
 * meta` (tasks 57/58) AND the `bundle <id> <subcommand>` ROUTING. They drive the BUILT `dist/cli.js` over a
 * REAL `NodeFileSystem` tmpdir + the real `backlog` CLI (the `bundle new` materialise path), so the routing,
 * the in-place `bundle.yml` edit, the help dispatch, the exit codes, and completion (`__complete`) are all
 * verified the way an author runs them. Skipped (not failed) when `dist/` is unbuilt; CI builds first.
 */

const builtCli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
const describeIfBuilt = existsSync(builtCli) ? describe : describe.skip;

/** Run `dist/cli.js <args>` with an optional cwd; return stdout + exit status (recovered on non-zero). */
function cli(
  args: readonly string[],
  opts: { cwd?: string } = {},
): { stdout: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [builtCli, ...args], {
      encoding: "utf8",
      ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
    });
    return { stdout, status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

/** `wpm <args> -C <proj>`. */
function wpm(proj: string, args: readonly string[]): { stdout: string; status: number } {
  return cli([...args, "-C", proj]);
}

/** init a real project at <dir>/demo + create the bundle `web`; return the project path. */
function projectWithWeb(dir: string): string {
  const proj = join(dir, "demo");
  execFileSync(process.execPath, [builtCli, "init", "demo", "--at", proj], { encoding: "utf8" });
  execFileSync(process.execPath, [builtCli, "bundle", "new", "web", "-C", proj], {
    encoding: "utf8",
  });
  return proj;
}

describeIfBuilt("bundle <id> routing + show/meta E2E via dist/cli.js (tasks 57/58)", () => {
  it("`bundle <id> show` prints the bundle metadata + a file tree (the routing dispatches a dynamic id)", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      const out = wpm(proj, ["bundle", "web", "show"]);
      expect(out.status).toBe(0);
      expect(out.stdout).toContain("id:           web");
      expect(out.stdout).toContain("version:      0.1.0");
      expect(out.stdout).toContain("confirmation: safe");
      expect(out.stdout).toContain("bundle.yml"); // the file tree lists the bundle's files
    });
  });

  it("`bundle <id> meta` edits bundle.yml in place; a fixed verb still routes to its own command", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);

      // meta updates the named fields:
      const meta = wpm(proj, [
        "bundle",
        "web",
        "meta",
        "--summary",
        "web handoff installer",
        "--confirmation-level",
        "dangerous",
      ]);
      expect(meta.status).toBe(0);
      const bundleYml = readFileSync(join(proj, "bundles", "web", "bundle.yml"), "utf8");
      expect(bundleYml).toMatch(/summary:\s*web handoff installer/);
      expect(bundleYml).toMatch(/confirmation:\s*dangerous/);
      // omitted fields untouched:
      expect(bundleYml).toMatch(/version:\s*0\.1\.0/);
      expect(bundleYml).toMatch(/id:\s*web/);

      // a FIXED verb still routes (the dynamic routing did not swallow it):
      expect(wpm(proj, ["bundle", "new", "doc"]).status).toBe(0);
      expect(existsSync(join(proj, "bundles", "doc", "bundle.yml"))).toBe(true);
    });
  });

  it("`bundle <id> meta --version` sets the BUNDLE version (the inner sub-program parses --version)", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      expect(wpm(proj, ["bundle", "web", "meta", "--version", "2.5.0"]).status).toBe(0);
      expect(readFileSync(join(proj, "bundles", "web", "bundle.yml"), "utf8")).toMatch(
        /version:\s*2\.5\.0/,
      );
    });
  });

  it("a bad --confirmation-level exits 2; a non-enabled id exits 1", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      expect(wpm(proj, ["bundle", "web", "meta", "--confirmation-level", "bogus"]).status).toBe(2);
      expect(wpm(proj, ["bundle", "ghost", "show"]).status).toBe(1);
    });
  });

  it("per-bundle `--help` reaches the leaf (not the bundle group); fixed-verb `--help` still works", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      const metaHelp = wpm(proj, ["bundle", "web", "meta", "--help"]);
      expect(metaHelp.status).toBe(0);
      expect(metaHelp.stdout).toContain("bundle web meta"); // the LEAF's usage, not the group's
      expect(metaHelp.stdout).toContain("--confirmation-level");

      const showHelp = wpm(proj, ["bundle", "web", "show", "--help"]);
      expect(showHelp.status).toBe(0);
      expect(showHelp.stdout).toContain("bundle web show");

      // the group help + a fixed verb's help still work (routed through the main program):
      expect(cli(["bundle", "--help"]).stdout).toMatch(/Usage:/);
      expect(cli(["bundle", "new", "--help"]).stdout).toContain("bundle new");
    });
  });

  it("completion: `bundle <tab>` offers verbs + enabled ids; `bundle <id> <tab>` offers subcommands; `meta --confirmation-level <tab>` offers safe|dangerous", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      execFileSync(process.execPath, [builtCli, "bundle", "new", "doc", "-C", proj], {
        encoding: "utf8",
      });

      // `__complete` resolves the project from cwd (no -C on a completion line).
      const idPos = cli(["__complete", "bundle", ""], { cwd: proj })
        .stdout.split("\n")
        .filter(Boolean);
      expect(idPos).toContain("web"); // enabled id
      expect(idPos).toContain("doc"); // enabled id
      expect(idPos).toContain("new"); // fixed verb
      expect(idPos).not.toContain("*"); // the hidden routing helper does not leak

      const subPos = cli(["__complete", "bundle", "web", ""], { cwd: proj })
        .stdout.split("\n")
        .filter(Boolean);
      expect(subPos).toContain("show");
      expect(subPos).toContain("meta");

      const confLevel = cli(["__complete", "bundle", "web", "meta", "--confirmation-level", ""], {
        cwd: proj,
      })
        .stdout.split("\n")
        .filter(Boolean);
      expect(confLevel).toContain("safe");
      expect(confLevel).toContain("dangerous");
    });
  });

  it("a show → meta → show round-trip: the second show reflects the meta edit (read sees the mutation)", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);

      // before: show reports the scaffolded defaults.
      const before = wpm(proj, ["bundle", "web", "show"]);
      expect(before.stdout).toContain("summary:      web bundle");
      expect(before.stdout).toContain("confirmation: safe");

      // edit via meta.
      expect(
        wpm(proj, [
          "bundle",
          "web",
          "meta",
          "--summary",
          "edited via meta",
          "--confirmation-level",
          "dangerous",
        ]).status,
      ).toBe(0);

      // after: show reflects the edit (the read loads the post-mutation bundle.yml).
      const after = wpm(proj, ["bundle", "web", "show"]);
      expect(after.status).toBe(0);
      expect(after.stdout).toContain("summary:      edited via meta");
      expect(after.stdout).toContain("confirmation: dangerous");
      expect(after.stdout).toContain("version:      0.1.0"); // untouched
    });
  });

  it("meta preserves the canonical key order of the REAL bundle.yml across the eemeli/yaml round-trip", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      const path = join(proj, "bundles", "web", "bundle.yml");

      const orderOf = (text: string): string[] =>
        text
          .split("\n")
          .map((l) => l.match(/^([a-z_]+):/)?.[1])
          .filter((k): k is string => k !== undefined);
      const orderBefore = orderOf(readFileSync(path, "utf8"));

      expect(wpm(proj, ["bundle", "web", "meta", "--summary", "reordered?"]).status).toBe(0);

      const after = readFileSync(path, "utf8");
      expect(orderOf(after)).toEqual(orderBefore); // key order is stable across the edit
      expect(after).toMatch(/summary:\s*reordered\?/); // the edit landed
      expect(after).toMatch(/id:\s*web/); // untouched keys survive
    });
  });

  it("the routing honours -C placed AFTER the dynamic subcommand (a routing-specific concern)", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      // -C comes AFTER `bundle web show` — run from a cwd OUTSIDE the project so only -C can resolve it.
      const out = cli(["bundle", "web", "show", "-C", proj], { cwd: dir });
      expect(out.status).toBe(0);
      expect(out.stdout).toContain("id:           web");
      // and -C BEFORE the route also works:
      const before = cli(["-C", proj, "bundle", "web", "show"], { cwd: dir });
      expect(before.status).toBe(0);
      expect(before.stdout).toContain("id:           web");
    });
  });

  it("meta with no flags exits 2; a non-semver --version exits 2 (boundary validation, real binary)", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      const path = join(proj, "bundles", "web", "bundle.yml");
      const before = readFileSync(path, "utf8");

      expect(wpm(proj, ["bundle", "web", "meta"]).status).toBe(2); // no flags
      expect(wpm(proj, ["bundle", "web", "meta", "--version", "notsemver"]).status).toBe(2); // bad semver
      // nothing was written on either failure:
      expect(readFileSync(path, "utf8")).toBe(before);
    });
  });

  it("completion with a LEADING -C/--project resolves the per-bundle space exactly as dispatch does (S1 review fix)", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      execFileSync(process.execPath, [builtCli, "bundle", "new", "doc", "-C", proj], {
        encoding: "utf8",
      });
      // A real omelette completion line carries the GLOBAL `-C <dir>` BEFORE `bundle` — the blind spot the other
      // completion test avoided by relying on cwd. Run from a cwd OUTSIDE the project so ONLY the `-C` can
      // resolve it; the completion must still recognise the per-bundle prefix (mirroring `dispatchPerBundle`).
      const subPos = cli(["__complete", "-C", proj, "bundle", "web", ""], { cwd: dir })
        .stdout.split("\n")
        .filter(Boolean);
      expect(subPos).toContain("show"); // the per-bundle leaves, NOT the group verbs
      expect(subPos).toContain("meta");
      expect(subPos).not.toContain("new"); // the bug returned the group verbs (new/enable/disable)

      // `--project` (the long form) behaves the same:
      const subPosLong = cli(["__complete", "--project", proj, "bundle", "web", ""], { cwd: dir })
        .stdout.split("\n")
        .filter(Boolean);
      expect(subPosLong).toContain("show");
      expect(subPosLong).toContain("meta");

      // a per-bundle OPTION value with a leading -C still completes (meta --confirmation-level → safe|dangerous):
      const conf = cli(
        ["__complete", "-C", proj, "bundle", "web", "meta", "--confirmation-level", ""],
        {
          cwd: dir,
        },
      )
        .stdout.split("\n")
        .filter(Boolean);
      expect(conf).toContain("safe");
      expect(conf).toContain("dangerous");

      // the id POSITION with a leading -C also resolves (verbs ∪ enabled ids) — the `-C` value is not mistaken
      // for an operand (the `descend` global-value-skip fix):
      const idPos = cli(["__complete", "-C", proj, "bundle", ""], { cwd: dir })
        .stdout.split("\n")
        .filter(Boolean);
      expect(idPos).toContain("web"); // enabled id resolved via the leading -C
      expect(idPos).toContain("doc");
      expect(idPos).toContain("new"); // and the fixed verbs
    });
  });
});

/** The titles of the authoring tasks Backlog.md tracks in <proj>/.authoring-backlog (the real materialise root). */
function authoringTaskTitles(proj: string): string {
  // The version-bump lifecycle materialises into the project's own Backlog.md root at .authoring-backlog (doc 10
  // step 6; doc 11 §"Materialised by `wpm bundle <id> version bump`"). Spawn via `execaSync` (not `execFileSync`)
  // so the real `backlog` CLI resolves on Windows too, where the npm global bin is a `.cmd` shim that bare
  // `execFileSync` cannot find — the same resolution the production adapter (`src/util/shell.ts`) relies on.
  return execaSync("backlog", ["task", "list", "--plain"], {
    cwd: join(proj, ".authoring-backlog"),
    stdout: "pipe",
    stderr: "pipe",
  }).stdout as string;
}

/** init a real project at <dir>/demo + create bundles `a` and `b`, where `b` requires `a`; return the path. */
function projectWithRequirer(dir: string): string {
  const proj = join(dir, "demo");
  execFileSync(process.execPath, [builtCli, "init", "demo", "--at", proj], { encoding: "utf8" });
  for (const id of ["a", "b"]) {
    execFileSync(process.execPath, [builtCli, "bundle", "new", id, "-C", proj], {
      encoding: "utf8",
    });
  }
  // FIXTURE: make bundle `b` REQUIRE bundle `a` by hand. `bundle <id> requires add` (family K) is NOT built yet,
  // so the test sets the `requires` map directly on disk — replacing b's canonical empty `requires: {}` with a
  // constraint naming `a`. This makes the cross-bundle requirer-constraint task materialise when `a` is bumped.
  const bYmlPath = join(proj, "bundles", "b", "bundle.yml");
  const bYml = readFileSync(bYmlPath, "utf8");
  writeFileSync(bYmlPath, bYml.replace(/^requires:\s*\{\}\s*$/m, "requires:\n  a: ^0.1.0"), "utf8");
  return proj;
}

describeIfBuilt("bundle <id> version / bump / set E2E via dist/cli.js (tasks 59/60/61)", () => {
  it("`bundle <id> version` prints the bundle's scaffolded version (0.1.0)", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      const out = wpm(proj, ["bundle", "web", "version"]);
      expect(out.status).toBe(0);
      expect(out.stdout.trim()).toBe("0.1.0");
    });
  });

  it("`bundle <id> version bump minor` advances the version (comments preserved) AND materialises the bump tasks — incl the cross-bundle requirer-constraint — into the REAL .authoring-backlog", async () => {
    await withTempDir((dir) => {
      const proj = projectWithRequirer(dir); // a + b, where b requires a

      const bump = wpm(proj, ["bundle", "a", "version", "bump", "minor"]);
      expect(bump.status).toBe(0);
      // printed the new version + a materialised line:
      expect(bump.stdout).toContain("0.2.0");
      expect(bump.stdout).toMatch(/materialised: \d+ authoring task\(s\)/);

      // bundles/a/bundle.yml advanced to 0.2.0; the canonical bundle.yml structure is intact:
      const aYml = readFileSync(join(proj, "bundles", "a", "bundle.yml"), "utf8");
      expect(aYml).toMatch(/version:\s*0\.2\.0/);
      expect(aYml).toMatch(/id:\s*a/); // untouched key survives

      // The four bump tasks LANDED in the real .authoring-backlog — ESPECIALLY the cross-bundle requirer task
      // (proves the requirer scan ran over the REAL loaded project, finding b's requires:{a}).
      const titles = authoringTaskTitles(proj);
      expect(titles).toContain("Review state-tasks for a at 0.2.0");
      expect(titles).toContain("Consider migration tasks for a 0.1.0→0.2.0");
      expect(titles).toContain("Simulate upgrade for a from 0.1.0 to 0.2.0");
      expect(titles).toContain("Review version constraint on a at 0.2.0");
    });
  });

  it("`bundle <id> version set 2.0.0` writes the explicit version; a bad level/version exits 2 unchanged", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      const path = join(proj, "bundles", "web", "bundle.yml");

      expect(wpm(proj, ["bundle", "web", "version", "set", "2.0.0"]).status).toBe(0);
      expect(readFileSync(path, "utf8")).toMatch(/version:\s*2\.0\.0/);

      // a bogus bump level → exit 2 (commander invalid-choice), bundle.yml unchanged:
      const before = readFileSync(path, "utf8");
      expect(wpm(proj, ["bundle", "web", "version", "bump", "bogus"]).status).toBe(2);
      // a non-semver set value → exit 2, unchanged:
      expect(wpm(proj, ["bundle", "web", "version", "set", "not-a-version"]).status).toBe(2);
      expect(readFileSync(path, "utf8")).toBe(before);
    });
  });

  it("completion: `__complete bundle <id> version bump` offers major/minor/patch; `version --help` documents bump + set", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);

      const levels = cli(["__complete", "bundle", "web", "version", "bump", ""], { cwd: proj })
        .stdout.split("\n")
        .filter(Boolean);
      expect(levels).toContain("major");
      expect(levels).toContain("minor");
      expect(levels).toContain("patch");

      const versionHelp = wpm(proj, ["bundle", "web", "version", "--help"]);
      expect(versionHelp.status).toBe(0);
      expect(versionHelp.stdout).toContain("bundle web version"); // the leaf's usage, not the group's
      expect(versionHelp.stdout).toContain("bump");
      expect(versionHelp.stdout).toContain("set");
    });
  });

  it("a version round-trip: bump → version reflects it (read sees the mutation through the real binary)", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      expect(wpm(proj, ["bundle", "web", "version"]).stdout.trim()).toBe("0.1.0");
      expect(wpm(proj, ["bundle", "web", "version", "bump", "major"]).status).toBe(0);
      expect(wpm(proj, ["bundle", "web", "version"]).stdout.trim()).toBe("1.0.0");
    });
  });
});

/**
 * Run `dist/cli.js <args> -C <proj>` capturing BOTH stdout and stderr (the plain `cli` helper inherits stderr).
 * The per-bundle cycle warning (`requires add`) is printed to stderr on an EXIT-0 success, so it is invisible to
 * `cli()` — this helper surfaces it for the cycle-warning assertion.
 */
function wpmFull(
  proj: string,
  args: readonly string[],
): { stdout: string; stderr: string; status: number } {
  const res = spawnSync(process.execPath, [builtCli, ...args, "-C", proj], { encoding: "utf8" });
  return {
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    status: res.status ?? 1,
  };
}

/** init a real project at <dir>/demo + bundles `a` and `b`, BOTH with the canonical empty requires (no edges). */
function projectWithAB(dir: string): string {
  const proj = join(dir, "demo");
  execFileSync(process.execPath, [builtCli, "init", "demo", "--at", proj], { encoding: "utf8" });
  for (const id of ["a", "b"]) {
    execFileSync(process.execPath, [builtCli, "bundle", "new", id, "-C", proj], {
      encoding: "utf8",
    });
  }
  return proj;
}

describeIfBuilt(
  "bundle <id> requires add / list / remove E2E via dist/cli.js (tasks 62/63/64)",
  () => {
    it("62#1 — `requires add b ^0.1.0` writes the LITERAL caret into a's bundle.yml (id untouched); exit 0", async () => {
      await withTempDir((dir) => {
        const proj = projectWithAB(dir);
        const add = wpm(proj, ["bundle", "a", "requires", "add", "b", "^0.1.0"]);
        expect(add.status).toBe(0);

        const aYml = readFileSync(join(proj, "bundles", "a", "bundle.yml"), "utf8");
        // the RAW caret survived the real eemeli/yaml round-trip (NOT a normalized comparator like >=0.1.0).
        // `bundle new` scaffolds `requires: {}` as an INLINE flow map, so the edit lands as `requires: { b:
        // ^0.1.0 }` — the literal caret is what matters, not flow-vs-block layout.
        expect(aYml).toMatch(/requires:.*b:\s*\^0\.1\.0/s);
        expect(aYml).not.toContain(">=0.1.0");
        expect(aYml).toMatch(/id:\s*a/); // untouched key survives
      });
    });

    it("62#1 — `requires add b` (no constraint) defaults to a caret on b's current version (^0.1.0)", async () => {
      await withTempDir((dir) => {
        const proj = projectWithAB(dir);
        expect(wpm(proj, ["bundle", "a", "requires", "add", "b"]).status).toBe(0);
        const aYml = readFileSync(join(proj, "bundles", "a", "bundle.yml"), "utf8");
        expect(aYml).toMatch(/b:\s*\^0\.1\.0/);
      });
    });

    it("62#3 — `requires add b` materialises 'Adapt a's…use b' into the REAL .authoring-backlog", async () => {
      await withTempDir((dir) => {
        const proj = projectWithAB(dir);
        const add = wpm(proj, ["bundle", "a", "requires", "add", "b"]);
        expect(add.status).toBe(0);
        expect(add.stdout).toMatch(/materialised: 1 authoring task\(s\)/);
        // the task LANDED in the project's own Backlog.md root (catches the materialise-root bug class):
        expect(authoringTaskTitles(proj)).toContain(
          "Adapt a's install-backlog and payload to use b",
        );
      });
    });

    it("62#2 — closing a 2-bundle cycle WARNS (stderr) but still writes the edge; exit 0 (warn, not reject)", async () => {
      await withTempDir((dir) => {
        const proj = projectWithRequirer(dir); // b already requires a
        const add = wpmFull(proj, ["bundle", "a", "requires", "add", "b"]); // closes a→b→a
        expect(add.status).toBe(0); // warn, not reject

        // the cycle warning names both bundles (printed to stderr on the exit-0 success):
        const combined = `${add.stdout}\n${add.stderr}`;
        expect(combined).toMatch(/cycle/i);
        expect(combined).toContain("a");
        expect(combined).toContain("b");

        // the edge WAS written despite the cycle:
        const aYml = readFileSync(join(proj, "bundles", "a", "bundle.yml"), "utf8");
        expect(aYml).toMatch(/b:\s*\^0\.1\.0/);
      });
    });

    it("62#4 — `requires add ghost` (not enabled) exits 1; a's bundle.yml unchanged", async () => {
      await withTempDir((dir) => {
        const proj = projectWithAB(dir);
        const path = join(proj, "bundles", "a", "bundle.yml");
        const before = readFileSync(path, "utf8");
        expect(wpm(proj, ["bundle", "a", "requires", "add", "ghost"]).status).toBe(1);
        expect(readFileSync(path, "utf8")).toBe(before); // nothing written
      });
    });

    it("63#1 — `requires list` prints the dependency + range, one per line; exit 0", async () => {
      await withTempDir((dir) => {
        const proj = projectWithAB(dir);
        expect(wpm(proj, ["bundle", "a", "requires", "add", "b", "^0.1.0"]).status).toBe(0);
        const list = wpm(proj, ["bundle", "a", "requires", "list"]);
        expect(list.status).toBe(0);
        // one line beginning with the dep id; the printed range is the binary's projection (model-normalized):
        const lines = list.stdout.split("\n").filter(Boolean);
        expect(lines).toHaveLength(1);
        expect(lines[0]?.startsWith("b ")).toBe(true);
      });
    });

    it("64#1/64#2 — `requires remove b` drops the key AND materialises 'Verify a no longer references b'", async () => {
      await withTempDir((dir) => {
        const proj = projectWithAB(dir);
        expect(wpm(proj, ["bundle", "a", "requires", "add", "b", "^0.1.0"]).status).toBe(0);

        const remove = wpm(proj, ["bundle", "a", "requires", "remove", "b"]);
        expect(remove.status).toBe(0);
        // the b key is gone from bundle.yml:
        const aYml = readFileSync(join(proj, "bundles", "a", "bundle.yml"), "utf8");
        expect(aYml).not.toMatch(/^\s*b:/m);
        // the verify task landed in the real authoring backlog:
        expect(authoringTaskTitles(proj)).toContain("Verify a no longer references b");
      });
    });

    it("64#3 — `requires remove ghost` (not present) exits 1; bundle.yml unchanged", async () => {
      await withTempDir((dir) => {
        const proj = projectWithAB(dir);
        expect(wpm(proj, ["bundle", "a", "requires", "add", "b", "^0.1.0"]).status).toBe(0);
        const path = join(proj, "bundles", "a", "bundle.yml");
        const before = readFileSync(path, "utf8");
        expect(wpm(proj, ["bundle", "a", "requires", "remove", "ghost"]).status).toBe(1);
        expect(readFileSync(path, "utf8")).toBe(before);
      });
    });

    it("completion: `requires add <tab>` offers enabled ids; `requires remove <tab>` offers THIS bundle's requires", async () => {
      await withTempDir((dir) => {
        const proj = projectWithAB(dir);
        expect(wpm(proj, ["bundle", "a", "requires", "add", "b", "^0.1.0"]).status).toBe(0);

        // add → enabled bundle ids (resolved from cwd, no -C on a completion line):
        const addPos = cli(["__complete", "bundle", "a", "requires", "add", ""], { cwd: proj })
          .stdout.split("\n")
          .filter(Boolean);
        expect(addPos).toContain("b"); // an enabled id

        // remove → THIS bundle's current requires keys (a requires b), proving the id-aware source + threading:
        const removePos = cli(["__complete", "bundle", "a", "requires", "remove", ""], {
          cwd: proj,
        })
          .stdout.split("\n")
          .filter(Boolean);
        expect(removePos).toContain("b");
      });
    });

    it("help: `bundle <id> requires add --help` reaches the leaf and documents the positionals + an example", async () => {
      await withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const help = wpm(proj, ["bundle", "web", "requires", "add", "--help"]);
        expect(help.status).toBe(0);
        expect(help.stdout).toContain("bundle web requires add"); // the LEAF usage, not the group's
        expect(help.stdout).toContain("<dep-bundle-id>");
        expect(help.stdout).toMatch(/Example/i);
      });
    });

    it("a real add → list → remove → list round-trip through the binary", async () => {
      await withTempDir((dir) => {
        const proj = projectWithAB(dir);
        expect(wpm(proj, ["bundle", "a", "requires", "add", "b", "^0.1.0"]).status).toBe(0);
        expect(wpm(proj, ["bundle", "a", "requires", "list"]).stdout).toContain("b ");
        expect(wpm(proj, ["bundle", "a", "requires", "remove", "b"]).status).toBe(0);
        // list now reports the empty marker:
        expect(wpm(proj, ["bundle", "a", "requires", "list"]).stdout.trim()).toBe("(no requires)");
      });
    });
  },
);

/** Place a real file at bundles/<bundle>/payload/files/<rel> under <proj> (creating parent dirs). */
function placePayloadFile(proj: string, bundle: string, rel: string, content: string): string {
  const abs = join(proj, "bundles", bundle, "payload", "files", rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
  return abs;
}

describeIfBuilt(
  "bundle <id> files add / list / remove E2E via dist/cli.js (tasks 65/66/67)",
  () => {
    it("65#1 — `files add` registers a placed file in bundle.yml payload; file content is unchanged (structure-not-content)", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const filePath = placePayloadFile(proj, "web", "agents.md", "# hi");

        const add = wpm(proj, ["bundle", "web", "files", "add", "agents.md"]);
        expect(add.status).toBe(0);

        const ymlText = readFileSync(join(proj, "bundles", "web", "bundle.yml"), "utf8");
        // the real eemeli/yaml round-trip lists `agents.md` under the `payload:` registry (tolerant of layout):
        expect(ymlText).toContain("payload:");
        expect(ymlText).toMatch(/payload:[\s\S]*agents\.md/);
        // structure-not-content: the placed file's bytes are unchanged.
        expect(readFileSync(filePath, "utf8")).toBe("# hi");
      });
    });

    it("65#2 — `files add` for a path NOT on disk exits 1; bundle.yml unchanged", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const path = join(proj, "bundles", "web", "bundle.yml");
        const before = readFileSync(path, "utf8");
        expect(wpm(proj, ["bundle", "web", "files", "add", "ghost.md"]).status).toBe(1);
        expect(readFileSync(path, "utf8")).toBe(before); // nothing registered
      });
    });

    it("66#1 — `files list` shows the registered file; a fresh bundle prints (no files)", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        // fresh bundle (createBundle inits payload.files: []): list prints the empty marker.
        expect(wpm(proj, ["bundle", "web", "files", "list"]).stdout.trim()).toBe("(no files)");

        placePayloadFile(proj, "web", "agents.md", "# hi");
        expect(wpm(proj, ["bundle", "web", "files", "add", "agents.md"]).status).toBe(0);
        const list = wpm(proj, ["bundle", "web", "files", "list"]);
        expect(list.status).toBe(0);
        expect(list.stdout).toContain("agents.md");
      });
    });

    it("67#1/67#2 — `files remove` deregisters AND leaves the file on disk (deregister, not delete)", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const filePath = placePayloadFile(proj, "web", "agents.md", "# hi");
        expect(wpm(proj, ["bundle", "web", "files", "add", "agents.md"]).status).toBe(0);

        const remove = wpm(proj, ["bundle", "web", "files", "remove", "agents.md"]);
        expect(remove.status).toBe(0);
        expect(remove.stdout).toContain("left at payload/files/agents.md"); // doc-10:167 message

        // the entry is gone from bundle.yml:
        const ymlText = readFileSync(join(proj, "bundles", "web", "bundle.yml"), "utf8");
        expect(ymlText).not.toMatch(/^\s*-\s*agents\.md/m);
        // BUT the file is left on disk with its content intact:
        expect(existsSync(filePath)).toBe(true);
        expect(readFileSync(filePath, "utf8")).toBe("# hi");
      });
    });

    it("67#3 — `files remove` for a path NOT registered exits 1; bundle.yml unchanged", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const path = join(proj, "bundles", "web", "bundle.yml");
        const before = readFileSync(path, "utf8");
        expect(wpm(proj, ["bundle", "web", "files", "remove", "nope.md"]).status).toBe(1);
        expect(readFileSync(path, "utf8")).toBe(before);
      });
    });

    it("completion: `files add` lists placed files; `files remove` lists registered files", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        placePayloadFile(proj, "web", "agents.md", "# hi");

        // add → files present on disk under payload/files (resolved from cwd):
        const addPos = cli(["__complete", "bundle", "web", "files", "add", ""], { cwd: proj })
          .stdout.split("\n")
          .filter(Boolean);
        expect(addPos).toContain("agents.md");

        // register it, then remove → completes from the REGISTERED refs:
        expect(wpm(proj, ["bundle", "web", "files", "add", "agents.md"]).status).toBe(0);
        const removePos = cli(["__complete", "bundle", "web", "files", "remove", ""], { cwd: proj })
          .stdout.split("\n")
          .filter(Boolean);
        expect(removePos).toContain("agents.md");
      });
    });

    it("help: `bundle <id> files add --help` reaches the leaf and documents the path positional + an example", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const help = wpm(proj, ["bundle", "web", "files", "add", "--help"]);
        expect(help.status).toBe(0);
        expect(help.stdout).toContain("bundle web files add"); // the LEAF usage
        expect(help.stdout).toContain("<path>");
        expect(help.stdout).toMatch(/Example/i);
      });
    });

    it("OLD bundle.yml WITHOUT a payload key still drives list (no files) AND add (adds the field) — absent ⇒ empty", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        // OVERWRITE web's bundle.yml with a pre-L shape (NO `payload:` key), as an older project would have on disk.
        const ymlPath = join(proj, "bundles", "web", "bundle.yml");
        writeFileSync(
          ymlPath,
          "id: web\nversion: 0.1.0\nsummary: web bundle\nconfirmation: safe\nrequires: {}\n",
          "utf8",
        );

        // list parses the old doc (absent payload ⇒ empty) and prints the empty marker:
        const list = wpm(proj, ["bundle", "web", "files", "list"]);
        expect(list.status).toBe(0);
        expect(list.stdout.trim()).toBe("(no files)");

        // add a placed file → exit 0 and the payload field is introduced:
        placePayloadFile(proj, "web", "x.md", "x");
        expect(wpm(proj, ["bundle", "web", "files", "add", "x.md"]).status).toBe(0);
        const after = readFileSync(ymlPath, "utf8");
        expect(after).toContain("payload:");
        expect(after).toMatch(/payload:[\s\S]*x\.md/);
      });
    });
  },
);

/** Place a real file at bundles/<bundle>/payload/templates/<rel> under <proj> (creating parent dirs). */
function placePayloadTemplate(proj: string, bundle: string, rel: string, content: string): string {
  const abs = join(proj, "bundles", bundle, "payload", "templates", rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
  return abs;
}

describeIfBuilt(
  "bundle <id> templates add / list / remove E2E via dist/cli.js (tasks 68/69/70)",
  () => {
    it("68#1 — `templates add` registers a placed template in bundle.yml payload; content unchanged (structure-not-content)", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const filePath = placePayloadTemplate(proj, "web", "agents.md.tmpl", "# {{x}}");

        const add = wpm(proj, ["bundle", "web", "templates", "add", "agents.md.tmpl"]);
        expect(add.status).toBe(0);

        const ymlText = readFileSync(join(proj, "bundles", "web", "bundle.yml"), "utf8");
        // the real eemeli/yaml round-trip lists `agents.md.tmpl` under the `payload:` registry (tolerant of layout):
        expect(ymlText).toContain("payload:");
        expect(ymlText).toMatch(/payload:[\s\S]*templates:[\s\S]*agents\.md\.tmpl/);
        // structure-not-content: the placed file's bytes are unchanged.
        expect(readFileSync(filePath, "utf8")).toBe("# {{x}}");
      });
    });

    it("68#2 — `templates add` for a path NOT on disk exits 1; bundle.yml unchanged", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const path = join(proj, "bundles", "web", "bundle.yml");
        const before = readFileSync(path, "utf8");
        expect(wpm(proj, ["bundle", "web", "templates", "add", "ghost.tmpl"]).status).toBe(1);
        expect(readFileSync(path, "utf8")).toBe(before); // nothing registered
      });
    });

    it("69#1 — `templates list` shows the registered template; a fresh bundle prints (no templates)", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        // fresh bundle (createBundle inits payload.templates: []): list prints the empty marker.
        expect(wpm(proj, ["bundle", "web", "templates", "list"]).stdout.trim()).toBe(
          "(no templates)",
        );

        placePayloadTemplate(proj, "web", "agents.md.tmpl", "# t");
        expect(wpm(proj, ["bundle", "web", "templates", "add", "agents.md.tmpl"]).status).toBe(0);
        const list = wpm(proj, ["bundle", "web", "templates", "list"]);
        expect(list.status).toBe(0);
        expect(list.stdout).toContain("agents.md.tmpl");
      });
    });

    it("70#1/70#2 — `templates remove` deregisters AND leaves the file on disk (deregister, not delete)", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const filePath = placePayloadTemplate(proj, "web", "agents.md.tmpl", "# t");
        expect(wpm(proj, ["bundle", "web", "templates", "add", "agents.md.tmpl"]).status).toBe(0);

        const remove = wpm(proj, ["bundle", "web", "templates", "remove", "agents.md.tmpl"]);
        expect(remove.status).toBe(0);
        expect(remove.stdout).toContain("left at payload/templates/agents.md.tmpl"); // doc-10:168→167 message

        // the entry is gone from bundle.yml:
        const ymlText = readFileSync(join(proj, "bundles", "web", "bundle.yml"), "utf8");
        expect(ymlText).not.toMatch(/^\s*-\s*agents\.md\.tmpl/m);
        // BUT the file is left on disk with its content intact:
        expect(existsSync(filePath)).toBe(true);
        expect(readFileSync(filePath, "utf8")).toBe("# t");
      });
    });

    it("70#3 — `templates remove` for a path NOT registered exits 1; bundle.yml unchanged", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const path = join(proj, "bundles", "web", "bundle.yml");
        const before = readFileSync(path, "utf8");
        expect(wpm(proj, ["bundle", "web", "templates", "remove", "nope.tmpl"]).status).toBe(1);
        expect(readFileSync(path, "utf8")).toBe(before);
      });
    });

    it("completion: `templates add` lists placed templates; `templates remove` lists registered templates", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        placePayloadTemplate(proj, "web", "agents.md.tmpl", "# t");

        // add → templates present on disk under payload/templates (resolved from cwd):
        const addPos = cli(["__complete", "bundle", "web", "templates", "add", ""], { cwd: proj })
          .stdout.split("\n")
          .filter(Boolean);
        expect(addPos).toContain("agents.md.tmpl");

        // register it, then remove → completes from the REGISTERED refs:
        expect(wpm(proj, ["bundle", "web", "templates", "add", "agents.md.tmpl"]).status).toBe(0);
        const removePos = cli(["__complete", "bundle", "web", "templates", "remove", ""], {
          cwd: proj,
        })
          .stdout.split("\n")
          .filter(Boolean);
        expect(removePos).toContain("agents.md.tmpl");
      });
    });

    it("help: `bundle <id> templates add --help` reaches the leaf and documents the path positional + an example", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const help = wpm(proj, ["bundle", "web", "templates", "add", "--help"]);
        expect(help.status).toBe(0);
        expect(help.stdout).toContain("bundle web templates add"); // the LEAF usage
        expect(help.stdout).toContain("<path>");
        expect(help.stdout).toMatch(/Example/i);
      });
    });

    it("OLD bundle.yml WITHOUT a payload key still drives list (no templates) AND add (adds the field) — absent ⇒ empty", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        // OVERWRITE web's bundle.yml with a pre-L shape (NO `payload:` key), as an older project would have on disk.
        const ymlPath = join(proj, "bundles", "web", "bundle.yml");
        writeFileSync(
          ymlPath,
          "id: web\nversion: 0.1.0\nsummary: web bundle\nconfirmation: safe\nrequires: {}\n",
          "utf8",
        );

        // list parses the old doc (absent payload ⇒ empty) and prints the empty marker:
        const list = wpm(proj, ["bundle", "web", "templates", "list"]);
        expect(list.status).toBe(0);
        expect(list.stdout.trim()).toBe("(no templates)");

        // add a placed template → exit 0 and the payload field is introduced:
        placePayloadTemplate(proj, "web", "x.tmpl", "x");
        expect(wpm(proj, ["bundle", "web", "templates", "add", "x.tmpl"]).status).toBe(0);
        const after = readFileSync(ymlPath, "utf8");
        expect(after).toContain("payload:");
        expect(after).toMatch(/payload:[\s\S]*templates:[\s\S]*x\.tmpl/);
      });
    });
  },
);

/**
 * Place a real file at bundles/<bundle>/installer-scripts/<rel> under <proj> (creating parent dirs). NOTE:
 * `installer-scripts/` is a SIBLING of `payload/` (doc 06:96), NOT under it.
 */
function placeInstallerScript(proj: string, bundle: string, rel: string, content: string): string {
  const abs = join(proj, "bundles", bundle, "installer-scripts", rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
  return abs;
}

describeIfBuilt(
  "bundle <id> scripts add / list / remove E2E via dist/cli.js (tasks 71/72/73)",
  () => {
    it("71#1 — `scripts add` registers a placed installer-script in bundle.yml payload; content unchanged (structure-not-content)", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const filePath = placeInstallerScript(proj, "web", "probe.sh", "#!/bin/sh\necho hi\n");
        // the script lives under installer-scripts/, a SIBLING of payload/ (NOT under payload/):
        expect(existsSync(join(proj, "bundles", "web", "installer-scripts", "probe.sh"))).toBe(
          true,
        );
        expect(existsSync(join(proj, "bundles", "web", "payload", "installer-scripts"))).toBe(
          false,
        );

        const add = wpm(proj, ["bundle", "web", "scripts", "add", "probe.sh"]);
        expect(add.status).toBe(0);

        const ymlText = readFileSync(join(proj, "bundles", "web", "bundle.yml"), "utf8");
        // the real eemeli/yaml round-trip lists `probe.sh` under the `payload:` registry (tolerant of layout):
        expect(ymlText).toContain("payload:");
        expect(ymlText).toMatch(/payload:[\s\S]*scripts:[\s\S]*probe\.sh/);
        // structure-not-content: the placed file's bytes are unchanged.
        expect(readFileSync(filePath, "utf8")).toBe("#!/bin/sh\necho hi\n");
      });
    });

    it("71#2 — `scripts add` for a path NOT on disk exits 1; bundle.yml unchanged", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const path = join(proj, "bundles", "web", "bundle.yml");
        const before = readFileSync(path, "utf8");
        expect(wpm(proj, ["bundle", "web", "scripts", "add", "ghost.sh"]).status).toBe(1);
        expect(readFileSync(path, "utf8")).toBe(before); // nothing registered
      });
    });

    it("72#1 — `scripts list` shows the registered installer-script; a fresh bundle prints (no scripts)", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        // fresh bundle (createBundle inits payload.scripts: []): list prints the empty marker.
        expect(wpm(proj, ["bundle", "web", "scripts", "list"]).stdout.trim()).toBe("(no scripts)");

        placeInstallerScript(proj, "web", "probe.sh", "#!/bin/sh\n");
        expect(wpm(proj, ["bundle", "web", "scripts", "add", "probe.sh"]).status).toBe(0);
        const list = wpm(proj, ["bundle", "web", "scripts", "list"]);
        expect(list.status).toBe(0);
        expect(list.stdout).toContain("probe.sh");
      });
    });

    it("73#1/73#2 — `scripts remove` deregisters AND leaves the file on disk (deregister, not delete)", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const filePath = placeInstallerScript(proj, "web", "probe.sh", "#!/bin/sh\n");
        expect(wpm(proj, ["bundle", "web", "scripts", "add", "probe.sh"]).status).toBe(0);

        const remove = wpm(proj, ["bundle", "web", "scripts", "remove", "probe.sh"]);
        expect(remove.status).toBe(0);
        expect(remove.stdout).toContain("left at installer-scripts/probe.sh"); // doc-10:169→167 message

        // the entry is gone from bundle.yml:
        const ymlText = readFileSync(join(proj, "bundles", "web", "bundle.yml"), "utf8");
        expect(ymlText).not.toMatch(/^\s*-\s*probe\.sh/m);
        // BUT the file is left on disk with its content intact:
        expect(existsSync(filePath)).toBe(true);
        expect(readFileSync(filePath, "utf8")).toBe("#!/bin/sh\n");
      });
    });

    it("73#3 — `scripts remove` for a path NOT registered exits 1; bundle.yml unchanged", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const path = join(proj, "bundles", "web", "bundle.yml");
        const before = readFileSync(path, "utf8");
        expect(wpm(proj, ["bundle", "web", "scripts", "remove", "nope.sh"]).status).toBe(1);
        expect(readFileSync(path, "utf8")).toBe(before);
      });
    });

    it("completion: `scripts add` lists placed installer-scripts; `scripts remove` lists registered scripts", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        placeInstallerScript(proj, "web", "probe.sh", "#!/bin/sh\n");

        // add → installer-scripts present on disk (resolved from cwd):
        const addPos = cli(["__complete", "bundle", "web", "scripts", "add", ""], { cwd: proj })
          .stdout.split("\n")
          .filter(Boolean);
        expect(addPos).toContain("probe.sh");

        // register it, then remove → completes from the REGISTERED refs:
        expect(wpm(proj, ["bundle", "web", "scripts", "add", "probe.sh"]).status).toBe(0);
        const removePos = cli(["__complete", "bundle", "web", "scripts", "remove", ""], {
          cwd: proj,
        })
          .stdout.split("\n")
          .filter(Boolean);
        expect(removePos).toContain("probe.sh");
      });
    });

    it("help: `bundle <id> scripts add --help` reaches the leaf and documents the path positional + an example", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const help = wpm(proj, ["bundle", "web", "scripts", "add", "--help"]);
        expect(help.status).toBe(0);
        expect(help.stdout).toContain("bundle web scripts add"); // the LEAF usage
        expect(help.stdout).toContain("<path>");
        expect(help.stdout).toMatch(/Example/i);
      });
    });

    it("OLD bundle.yml WITHOUT a payload key still drives list (no scripts) AND add (adds the field) — absent ⇒ empty", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        // OVERWRITE web's bundle.yml with a pre-L shape (NO `payload:` key), as an older project would have on disk.
        const ymlPath = join(proj, "bundles", "web", "bundle.yml");
        writeFileSync(
          ymlPath,
          "id: web\nversion: 0.1.0\nsummary: web bundle\nconfirmation: safe\nrequires: {}\n",
          "utf8",
        );

        // list parses the old doc (absent payload ⇒ empty) and prints the empty marker:
        const list = wpm(proj, ["bundle", "web", "scripts", "list"]);
        expect(list.status).toBe(0);
        expect(list.stdout.trim()).toBe("(no scripts)");

        // add a placed installer-script → exit 0 and the payload field is introduced:
        placeInstallerScript(proj, "web", "x.sh", "x");
        expect(wpm(proj, ["bundle", "web", "scripts", "add", "x.sh"]).status).toBe(0);
        const after = readFileSync(ymlPath, "utf8");
        expect(after).toContain("payload:");
        expect(after).toMatch(/payload:[\s\S]*scripts:[\s\S]*x\.sh/);
      });
    });
  },
);

/**
 * Write a SKILL.md at the conventional payload path `bundles/<bundle>/payload/agent-skills/<name>/SKILL.md`,
 * returning its absolute path. `content` is the full file (frontmatter + body). Mirrors `placeInstallerScript`.
 */
function placeSkill(proj: string, bundle: string, name: string, content: string): string {
  const abs = join(proj, "bundles", bundle, "payload", "agent-skills", name, "SKILL.md");
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
  return abs;
}

/** A valid SKILL.md (frontmatter with name + description) for an attach. */
function validSkillMd(name: string): string {
  return `---\nname: ${name}\ndescription: Do ${name} for the user at runtime.\n---\n\n# ${name}\nbody\n`;
}

describeIfBuilt(
  "bundle <id> skills add / list / remove E2E via dist/cli.js (tasks 74/75/76)",
  () => {
    it("74#1 ATTACH — `skills add <id>-skill` attaches the shipped sample; registers {name,path}; content unchanged; NO materialised line", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        // A fresh `bundle new web` ships payload/agent-skills/web-skill/SKILL.md (the default template's sample).
        const samplePath = join(
          proj,
          "bundles",
          "web",
          "payload",
          "agent-skills",
          "web-skill",
          "SKILL.md",
        );
        expect(existsSync(samplePath)).toBe(true);
        const sampleBefore = readFileSync(samplePath, "utf8");

        const add = wpm(proj, ["bundle", "web", "skills", "add", "web-skill"]);
        expect(add.status).toBe(0);
        expect(add.stdout).toContain("attached");
        expect(add.stdout).not.toContain("materialised"); // attach queues no writing

        const ymlText = readFileSync(join(proj, "bundles", "web", "bundle.yml"), "utf8");
        // the real eemeli/yaml round-trip records the {name, path} registry entry under `payload.skills`:
        expect(ymlText).toMatch(/payload:[\s\S]*skills:[\s\S]*name:\s*web-skill/);
        expect(ymlText).toMatch(
          /skills:[\s\S]*path:\s*payload\/agent-skills\/web-skill\/SKILL\.md/,
        );
        // structure-not-content: the sample's bytes are unchanged.
        expect(readFileSync(samplePath, "utf8")).toBe(sampleBefore);
      });
    });

    it("74#2 SCAFFOLD — `skills add <new>` renders a stub (name + placeholder runtime-trigger desc, no authored prose), registers it, AND materialises the writing task (loop-closure, cold)", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const add = wpm(proj, ["bundle", "web", "skills", "add", "fresh-skill"]);
        expect(add.status).toBe(0);
        expect(add.stdout).toContain("scaffolded");
        expect(add.stdout).toContain("materialised");

        // the structural stub exists at the conventional path with the substituted name + the placeholder desc:
        const stubPath = join(
          proj,
          "bundles",
          "web",
          "payload",
          "agent-skills",
          "fresh-skill",
          "SKILL.md",
        );
        expect(existsSync(stubPath)).toBe(true);
        const stub = readFileSync(stubPath, "utf8");
        expect(stub).toContain("name: fresh-skill"); // frontmatter name substituted
        expect(stub).toContain("TODO"); // a placeholder, NOT invented prose

        // it is registered:
        const ymlText = readFileSync(join(proj, "bundles", "web", "bundle.yml"), "utf8");
        expect(ymlText).toMatch(/skills:[\s\S]*name:\s*fresh-skill/);

        // the doc-11 authoring task is materialised in the REAL .authoring-backlog (the materialise path ran cold):
        expect(authoringTaskTitles(proj)).toContain("Write payload skill fresh-skill for web");
      });
    });

    it("74#3 ERROR — `skills add <name> --path <missing>` exits non-zero; bundle.yml unchanged; no stub written", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const ymlPath = join(proj, "bundles", "web", "bundle.yml");
        const before = readFileSync(ymlPath, "utf8");
        const res = wpm(proj, [
          "bundle",
          "web",
          "skills",
          "add",
          "ghost",
          "--path",
          "payload/agent-skills/ghost/SKILL.md",
        ]);
        expect(res.status).not.toBe(0);
        expect(readFileSync(ymlPath, "utf8")).toBe(before); // nothing registered
        expect(
          existsSync(join(proj, "bundles", "web", "payload", "agent-skills", "ghost", "SKILL.md")),
        ).toBe(false); // no stub written
      });
    });

    it("75#1 LIST — after attach + scaffold, `skills list` shows both names; a fresh bundle prints (no payload skills)", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        // a fresh bundle (createBundle inits payload.skills: []) prints the empty marker:
        expect(wpm(proj, ["bundle", "web", "skills", "list"]).stdout.trim()).toBe(
          "(no payload skills)",
        );

        expect(wpm(proj, ["bundle", "web", "skills", "add", "web-skill"]).status).toBe(0); // attach the sample
        expect(wpm(proj, ["bundle", "web", "skills", "add", "fresh-skill"]).status).toBe(0); // scaffold a new one
        const list = wpm(proj, ["bundle", "web", "skills", "list"]);
        expect(list.status).toBe(0);
        expect(list.stdout).toContain("web-skill");
        expect(list.stdout).toContain("fresh-skill");
      });
    });

    it("76#1/76#2 REMOVE — `skills remove` deregisters AND leaves the SKILL.md on disk (deregister, not delete)", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const samplePath = join(
          proj,
          "bundles",
          "web",
          "payload",
          "agent-skills",
          "web-skill",
          "SKILL.md",
        );
        expect(wpm(proj, ["bundle", "web", "skills", "add", "web-skill"]).status).toBe(0);

        const remove = wpm(proj, ["bundle", "web", "skills", "remove", "web-skill"]);
        expect(remove.status).toBe(0);
        expect(remove.stdout).toContain("left at payload/agent-skills/web-skill/"); // doc-10:172 message

        // the entry is gone from bundle.yml:
        const ymlText = readFileSync(join(proj, "bundles", "web", "bundle.yml"), "utf8");
        expect(ymlText).not.toMatch(/name:\s*web-skill/);
        // BUT the SKILL.md is left on disk:
        expect(existsSync(samplePath)).toBe(true);
      });
    });

    it("76#3 — `skills remove` for a name NOT registered exits non-zero; bundle.yml unchanged", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const ymlPath = join(proj, "bundles", "web", "bundle.yml");
        const before = readFileSync(ymlPath, "utf8");
        expect(wpm(proj, ["bundle", "web", "skills", "remove", "not-there"]).status).not.toBe(0);
        expect(readFileSync(ymlPath, "utf8")).toBe(before);
      });
    });

    it("completion: `skills add` lists on-disk skill folders; `skills remove` lists registered names", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        // a fresh bundle ships the web-skill folder on disk → add completes from the folder names:
        const addPos = cli(["__complete", "bundle", "web", "skills", "add", ""], { cwd: proj })
          .stdout.split("\n")
          .filter(Boolean);
        expect(addPos).toContain("web-skill");

        // register it, then remove → completes from the REGISTERED names:
        expect(wpm(proj, ["bundle", "web", "skills", "add", "web-skill"]).status).toBe(0);
        const removePos = cli(["__complete", "bundle", "web", "skills", "remove", ""], {
          cwd: proj,
        })
          .stdout.split("\n")
          .filter(Boolean);
        expect(removePos).toContain("web-skill");
      });
    });

    it("help: `bundle <id> skills add --help` reaches the leaf and documents <name>, --path, an example", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const help = wpm(proj, ["bundle", "web", "skills", "add", "--help"]);
        expect(help.status).toBe(0);
        expect(help.stdout).toContain("bundle web skills add"); // the LEAF usage
        expect(help.stdout).toContain("<name>");
        expect(help.stdout).toContain("--path");
        expect(help.stdout).toMatch(/Example/i);
      });
    });

    it("OLD bundle.yml WITHOUT a payload key still drives list (no payload skills) AND add (adds the field) — absent ⇒ empty", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        // OVERWRITE web's bundle.yml with a pre-payload shape (NO `payload:` key), as an older project would have.
        const ymlPath = join(proj, "bundles", "web", "bundle.yml");
        writeFileSync(
          ymlPath,
          "id: web\nversion: 0.1.0\nsummary: web bundle\nconfirmation: safe\nrequires: {}\n",
          "utf8",
        );

        // list parses the old doc (absent payload ⇒ empty) and prints the empty marker:
        const list = wpm(proj, ["bundle", "web", "skills", "list"]);
        expect(list.status).toBe(0);
        expect(list.stdout.trim()).toBe("(no payload skills)");

        // attach a placed skill → exit 0 and the payload field is introduced:
        placeSkill(proj, "web", "added", validSkillMd("added"));
        expect(wpm(proj, ["bundle", "web", "skills", "add", "added"]).status).toBe(0);
        const after = readFileSync(ymlPath, "utf8");
        expect(after).toContain("payload:");
        expect(after).toMatch(/payload:[\s\S]*skills:[\s\S]*name:\s*added/);
      });
    });
  },
);

/**
 * Write a SKILL.md at the conventional bundle-scoped install-time-helper path
 * `bundles/<bundle>/installer-skills/<name>/SKILL.md`, returning its absolute path. `content` is the full file
 * (frontmatter + body). Mirrors `placeSkill` but against the bundle's `installer-skills/` (a sibling of `payload/`).
 */
function placeInstallerSkill(proj: string, bundle: string, name: string, content: string): string {
  const abs = join(proj, "bundles", bundle, "installer-skills", name, "SKILL.md");
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
  return abs;
}

describeIfBuilt(
  "bundle <id> installer-skills add / list / remove E2E via dist/cli.js (tasks 77/78/79)",
  () => {
    it("77#1 ATTACH — `installer-skills add detect` attaches a placed helper; registers {name,path} in bundle.yml installerSkills; content unchanged; NO materialised line", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const helperPath = placeInstallerSkill(proj, "web", "detect", validSkillMd("detect"));
        const before = readFileSync(helperPath, "utf8");

        const add = wpm(proj, ["bundle", "web", "installer-skills", "add", "detect"]);
        expect(add.status).toBe(0);
        expect(add.stdout).toContain("attached");
        expect(add.stdout).not.toContain("materialised"); // attach queues no writing

        const ymlText = readFileSync(join(proj, "bundles", "web", "bundle.yml"), "utf8");
        // the real eemeli/yaml round-trip records the {name, path} entry under the top-level `installerSkills`
        // registry (a SIBLING of `payload`, NOT under it — installer-skills are not delivered payload):
        expect(ymlText).toMatch(/installerSkills:[\s\S]*name:\s*detect/);
        expect(ymlText).toMatch(
          /installerSkills:[\s\S]*path:\s*installer-skills\/detect\/SKILL\.md/,
        );
        // structure-not-content: the placed file's bytes are unchanged.
        expect(readFileSync(helperPath, "utf8")).toBe(before);
      });
    });

    it("77#2 SCAFFOLD — `installer-skills add fresh` renders a stub (name + placeholder desc, no authored prose), registers it, AND materialises the bundle-named writing task (loop-closure, cold)", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const add = wpm(proj, ["bundle", "web", "installer-skills", "add", "fresh"]);
        expect(add.status).toBe(0);
        expect(add.stdout).toContain("scaffolded");
        expect(add.stdout).toContain("materialised");

        // the structural stub exists at the conventional path with the substituted name + a placeholder marker:
        const stubPath = join(proj, "bundles", "web", "installer-skills", "fresh", "SKILL.md");
        expect(existsSync(stubPath)).toBe(true);
        const stub = readFileSync(stubPath, "utf8");
        expect(stub).toContain("name: fresh"); // frontmatter name substituted
        expect(stub).toContain("TODO"); // a placeholder, NOT invented prose

        // it is registered in the installerSkills registry:
        const ymlText = readFileSync(join(proj, "bundles", "web", "bundle.yml"), "utf8");
        expect(ymlText).toMatch(/installerSkills:[\s\S]*name:\s*fresh/);

        // the doc-11 authoring task NAMING THE BUNDLE is materialised in the REAL .authoring-backlog (cold):
        expect(authoringTaskTitles(proj)).toContain(
          "Write content for install-time skill fresh in web",
        );
      });
    });

    it("77#3 ERROR — `installer-skills add ghost --path <missing>` exits non-zero; bundle.yml unchanged; no stub written", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const ymlPath = join(proj, "bundles", "web", "bundle.yml");
        const before = readFileSync(ymlPath, "utf8");
        const res = wpm(proj, [
          "bundle",
          "web",
          "installer-skills",
          "add",
          "ghost",
          "--path",
          "installer-skills/ghost/SKILL.md",
        ]);
        expect(res.status).not.toBe(0);
        expect(readFileSync(ymlPath, "utf8")).toBe(before); // nothing registered
        expect(
          existsSync(join(proj, "bundles", "web", "installer-skills", "ghost", "SKILL.md")),
        ).toBe(false); // no stub written
      });
    });

    it("77#4 ALIAS-ENSURE — after `installer-skills add` on a target-bearing project, the bundle's scope alias exists (delivered by ④ RERENDER's scopePlan)", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        // init seeds `targets: []`, so declare a target first; its scope-alias path is `.claude/skills`.
        expect(wpm(proj, ["project", "targets", "add", "claude-code"]).status).toBe(0);

        expect(wpm(proj, ["bundle", "web", "installer-skills", "add", "fresh"]).status).toBe(0);
        // scopePlan plans a per-bundle alias bundles/web/.claude/skills → bundles/web/installer-skills; ④ RERENDER
        // creates it via the FileSystem port's ensureAlias (a real symlink on POSIX).
        expect(existsSync(join(proj, "bundles", "web", ".claude", "skills"))).toBe(true);
      });
    });

    it("78#1 LIST (SCAN) — a manually-placed helper shows WITHOUT `add` (scan, not registry); a fresh bundle prints (no installer skills)", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        // a fresh bundle has no installer-skills dir → the empty marker:
        expect(wpm(proj, ["bundle", "web", "installer-skills", "list"]).stdout.trim()).toBe(
          "(no installer skills)",
        );

        // place a helper folder WITHOUT `add` — the directory SCAN must still show it (doc-10:174):
        placeInstallerSkill(proj, "web", "manual", validSkillMd("manual"));
        const list = wpm(proj, ["bundle", "web", "installer-skills", "list"]);
        expect(list.status).toBe(0);
        expect(list.stdout).toContain("manual"); // shown despite never being `add`-registered
      });
    });

    it("79#1/79#2 REMOVE — deregisters AND leaves the SKILL.md on disk; the SCAN-based list STILL shows it (scan ≠ registry)", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const helperPath = placeInstallerSkill(proj, "web", "detect", validSkillMd("detect"));
        expect(wpm(proj, ["bundle", "web", "installer-skills", "add", "detect"]).status).toBe(0);

        const remove = wpm(proj, ["bundle", "web", "installer-skills", "remove", "detect"]);
        expect(remove.status).toBe(0);
        expect(remove.stdout).toContain("left at installer-skills/detect/"); // doc-10:175 message

        // the entry is gone from the registry in bundle.yml:
        const ymlText = readFileSync(join(proj, "bundles", "web", "bundle.yml"), "utf8");
        expect(ymlText).not.toMatch(/installerSkills:[\s\S]*name:\s*detect/);
        // BUT the SKILL.md is left on disk (deregister-not-delete) …
        expect(existsSync(helperPath)).toBe(true);
        // … so the directory SCAN still lists it (the deliberate scan-vs-registry divergence on the real binary):
        expect(wpm(proj, ["bundle", "web", "installer-skills", "list"]).stdout).toContain("detect");
      });
    });

    it("79#3 — `installer-skills remove` for a name NOT registered exits non-zero; bundle.yml unchanged", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const ymlPath = join(proj, "bundles", "web", "bundle.yml");
        const before = readFileSync(ymlPath, "utf8");
        expect(
          wpm(proj, ["bundle", "web", "installer-skills", "remove", "not-there"]).status,
        ).not.toBe(0);
        expect(readFileSync(ymlPath, "utf8")).toBe(before);
      });
    });

    it("completion: `installer-skills add` lists on-disk helper folders; `installer-skills remove` lists registered names", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        placeInstallerSkill(proj, "web", "detect", validSkillMd("detect"));

        // add → helper folders present on disk under installer-skills/ (resolved from cwd):
        const addPos = cli(["__complete", "bundle", "web", "installer-skills", "add", ""], {
          cwd: proj,
        })
          .stdout.split("\n")
          .filter(Boolean);
        expect(addPos).toContain("detect");

        // register it, then remove → completes from the REGISTERED names:
        expect(wpm(proj, ["bundle", "web", "installer-skills", "add", "detect"]).status).toBe(0);
        const removePos = cli(["__complete", "bundle", "web", "installer-skills", "remove", ""], {
          cwd: proj,
        })
          .stdout.split("\n")
          .filter(Boolean);
        expect(removePos).toContain("detect");
      });
    });

    it("help: `bundle <id> installer-skills add --help` reaches the leaf and documents <name>, --path, an example", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        const help = wpm(proj, ["bundle", "web", "installer-skills", "add", "--help"]);
        expect(help.status).toBe(0);
        expect(help.stdout).toContain("bundle web installer-skills add"); // the LEAF usage
        expect(help.stdout).toContain("<name>");
        expect(help.stdout).toContain("--path");
        expect(help.stdout).toMatch(/Example/i);
      });
    });

    it("OLD bundle.yml WITHOUT an installerSkills key still drives list (no installer skills) AND add (adds the field) — absent ⇒ empty", () => {
      withTempDir((dir) => {
        const proj = projectWithWeb(dir);
        // OVERWRITE web's bundle.yml with a pre-P shape (NO `installerSkills` key), as an older project would have.
        const ymlPath = join(proj, "bundles", "web", "bundle.yml");
        writeFileSync(
          ymlPath,
          "id: web\nversion: 0.1.0\nsummary: web bundle\nconfirmation: safe\nrequires: {}\n",
          "utf8",
        );

        // list parses the old doc (absent installerSkills ⇒ empty) and prints the empty marker:
        const list = wpm(proj, ["bundle", "web", "installer-skills", "list"]);
        expect(list.status).toBe(0);
        expect(list.stdout.trim()).toBe("(no installer skills)");

        // attach a placed helper → exit 0 and the installerSkills field is introduced:
        placeInstallerSkill(proj, "web", "added", validSkillMd("added"));
        expect(wpm(proj, ["bundle", "web", "installer-skills", "add", "added"]).status).toBe(0);
        const after = readFileSync(ymlPath, "utf8");
        expect(after).toContain("installerSkills:");
        expect(after).toMatch(/installerSkills:[\s\S]*name:\s*added/);
      });
    });
  },
);

/** The project-root advisor stub path for bundle `<bundle>` under `<proj>` (doc 10: installer-skills/<id>-advisor/). */
function advisorSkillMd(proj: string, bundle: string): string {
  return join(proj, "installer-skills", `${bundle}-advisor`, "SKILL.md");
}

/** Create bundle `<id>` under `<proj>` WITHOUT the auto-advisor (`--no-advisor`), returning the run result. */
function bundleNewNoAdvisor(proj: string, id: string): { stdout: string; status: number } {
  return cli(["bundle", "new", id, "--no-advisor", "-C", proj]);
}

describeIfBuilt("bundle <id> advisor add / remove E2E via dist/cli.js (tasks 80/81)", () => {
  it("baseline — a fresh `bundle new web` already scaffolded the advisor + materialised its content task", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      // `bundle new` step 6 rendered the advisor stub at the PROJECT root installer-skills/web-advisor/SKILL.md.
      expect(existsSync(advisorSkillMd(proj, "web"))).toBe(true);
      expect(readFileSync(advisorSkillMd(proj, "web"), "utf8")).toContain("name: web-advisor");
      // and materialised the "Write advisor content for web" task in the REAL .authoring-backlog.
      expect(authoringTaskTitles(proj)).toContain("Write advisor content for web");
    });
  });

  it("80#3/80#2 — `advisor add` on a bundle whose advisor exists is a NO-OP (idempotent; task count stays one)", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      const stubBefore = readFileSync(advisorSkillMd(proj, "web"), "utf8");

      const add = wpm(proj, ["bundle", "web", "advisor", "add"]);
      expect(add.status).toBe(0);
      expect(add.stdout).toContain("already exists — nothing to do"); // the no-op (80#3)
      // the stub bytes are unchanged (no clobber):
      expect(readFileSync(advisorSkillMd(proj, "web"), "utf8")).toBe(stubBefore);
      // the content task is NOT duplicated — exactly one occurrence in the real authoring backlog (80#2):
      const titles = authoringTaskTitles(proj);
      const occurrences = titles
        .split("\n")
        .filter((l) => l.includes("Write advisor content for web")).length;
      expect(occurrences).toBe(1);
    });
  });

  it("80#1/80#2 — `advisor add` on a `--no-advisor` bundle SCAFFOLDS the stub + materialises the content task (cold)", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      // create `doc` WITHOUT the advisor: no stub, no content task.
      expect(bundleNewNoAdvisor(proj, "doc").status).toBe(0);
      expect(existsSync(advisorSkillMd(proj, "doc"))).toBe(false);
      expect(authoringTaskTitles(proj)).not.toContain("Write advisor content for doc");

      const add = wpm(proj, ["bundle", "doc", "advisor", "add"]);
      expect(add.status).toBe(0);
      expect(add.stdout).toMatch(/changed: \d+ path/); // scaffolded
      expect(add.stdout).toMatch(/materialised: 1 authoring task\(s\)/);

      // the stub now exists at the conventional path with the substituted name + a TODO placeholder (no prose):
      expect(existsSync(advisorSkillMd(proj, "doc"))).toBe(true);
      const stub = readFileSync(advisorSkillMd(proj, "doc"), "utf8");
      expect(stub).toContain("name: doc-advisor");
      expect(stub).toContain("TODO");
      // and the doc-11 content task is now materialised in the REAL .authoring-backlog (loop-closure, cold):
      expect(authoringTaskTitles(proj)).toContain("Write advisor content for doc");
    });
  });

  it("81#1/81#2 — `advisor remove` deletes the stub dir AND archives the open content task", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      // a `--no-advisor` bundle then `advisor add` (advisor present + task OPEN).
      expect(bundleNewNoAdvisor(proj, "doc").status).toBe(0);
      expect(wpm(proj, ["bundle", "doc", "advisor", "add"]).status).toBe(0);
      expect(existsSync(advisorSkillMd(proj, "doc"))).toBe(true);
      expect(authoringTaskTitles(proj)).toContain("Write advisor content for doc");

      const remove = wpm(proj, ["bundle", "doc", "advisor", "remove"]);
      expect(remove.status).toBe(0);
      // the advisor DIRECTORY is gone (81#1):
      expect(existsSync(advisorSkillMd(proj, "doc"))).toBe(false);
      expect(existsSync(join(proj, "installer-skills", "doc-advisor"))).toBe(false);
      // the content task is archived — gone from the ACTIVE `backlog task list --plain` (81#2):
      expect(authoringTaskTitles(proj)).not.toContain("Write advisor content for doc");
    });
  });

  it("81#3 — `advisor remove` on a bundle with NO advisor reports 'nothing to remove' and changes nothing", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      expect(bundleNewNoAdvisor(proj, "doc2").status).toBe(0); // no advisor
      const backlogBefore = authoringTaskTitles(proj);

      const remove = wpm(proj, ["bundle", "doc2", "advisor", "remove"]);
      expect(remove.status).toBe(0);
      expect(remove.stdout).toContain("nothing to remove"); // (81#3)
      // no advisor directory was created, and the authoring backlog is unchanged:
      expect(existsSync(join(proj, "installer-skills", "doc2-advisor"))).toBe(false);
      expect(authoringTaskTitles(proj)).toBe(backlogBefore);
    });
  });

  it("round-trip — add → remove → add on a `--no-advisor` bundle re-scaffolds AND materialises a FRESH content task", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      expect(bundleNewNoAdvisor(proj, "doc").status).toBe(0);

      // add: scaffold + materialise.
      expect(wpm(proj, ["bundle", "doc", "advisor", "add"]).status).toBe(0);
      expect(existsSync(advisorSkillMd(proj, "doc"))).toBe(true);

      // remove: dir gone + task archived (gone from the active list).
      expect(wpm(proj, ["bundle", "doc", "advisor", "remove"]).status).toBe(0);
      expect(existsSync(advisorSkillMd(proj, "doc"))).toBe(false);
      expect(authoringTaskTitles(proj)).not.toContain("Write advisor content for doc");

      // add AGAIN: re-scaffolds AND materialises a FRESH task (the archived one does not block the create).
      const readd = wpm(proj, ["bundle", "doc", "advisor", "add"]);
      expect(readd.status).toBe(0);
      expect(readd.stdout).toMatch(/materialised: 1 authoring task\(s\)/);
      expect(existsSync(advisorSkillMd(proj, "doc"))).toBe(true);
      expect(authoringTaskTitles(proj)).toContain("Write advisor content for doc");
    });
  });

  it("help: `advisor add --help` and `advisor remove --help` reach the leaf with an example", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      const addHelp = wpm(proj, ["bundle", "web", "advisor", "add", "--help"]);
      expect(addHelp.status).toBe(0);
      expect(addHelp.stdout).toContain("bundle web advisor add"); // the LEAF usage
      expect(addHelp.stdout).toMatch(/Usage:/);
      expect(addHelp.stdout).toMatch(/Example/i);

      const removeHelp = wpm(proj, ["bundle", "web", "advisor", "remove", "--help"]);
      expect(removeHelp.status).toBe(0);
      expect(removeHelp.stdout).toContain("bundle web advisor remove");
      expect(removeHelp.stdout).toMatch(/Example/i);
    });
  });

  it("completion: `__complete bundle <id> advisor` offers add and remove", async () => {
    await withTempDir((dir) => {
      const proj = projectWithWeb(dir);
      const subPos = cli(["__complete", "bundle", "web", "advisor", ""], { cwd: proj })
        .stdout.split("\n")
        .filter(Boolean);
      expect(subPos).toContain("add");
      expect(subPos).toContain("remove");
    });
  });
});
