import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
