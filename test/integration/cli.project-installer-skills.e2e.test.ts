import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../helpers/tmpdir.js";

/**
 * End-to-end (through-the-binary) tests for the PROJECT-scoped installer-skills family (Family F) — `project
 * installer-skills add` / `list` / `remove` (tasks 45/46/47). They drive the BUILT `dist/cli.js` over a REAL
 * `NodeFileSystem` tmpdir + the real `backlog` CLI (the scaffold materialise path), so the manifest.yml registry
 * edit, the directory-SCAN `list` WITH its main-installer/advisor EXCLUSION, the reserved-name refusal (exit 2),
 * the help dispatch, the exit codes, and completion (`__complete`) are all verified the way an author runs them.
 * Skipped (not failed) when `dist/` is unbuilt; CI builds first.
 *
 * `init demo` creates a project named `demo` (so the main installer is `demo-installer`, scaffolded by init at
 * `installer-skills/demo-installer/`) whose `manifest.yml` has NO `installerSkills` key — so the OLD-manifest
 * compat (absent ⇒ empty) is the default starting state, and the first `add` introduces the field.
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

/** init a real project at <dir>/demo (named `demo`); return the project path. */
function projectDemo(dir: string): string {
  const proj = join(dir, "demo");
  execFileSync(process.execPath, [builtCli, "init", "demo", "--at", proj], { encoding: "utf8" });
  return proj;
}

/** The authoring-task titles Backlog.md tracks in <proj>/.authoring-backlog (the real materialise root). */
function authoringTaskTitles(proj: string): string {
  return execFileSync("backlog", ["task", "list", "--plain"], {
    encoding: "utf8",
    cwd: join(proj, ".authoring-backlog"),
  });
}

/** Write a SKILL.md at the conventional root path `installer-skills/<name>/SKILL.md`; return its absolute path. */
function placeProjectInstallerSkill(proj: string, name: string, content: string): string {
  const abs = join(proj, "installer-skills", name, "SKILL.md");
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
  return abs;
}

/** A valid SKILL.md (frontmatter with name + description) for an attach. */
function validSkillMd(name: string): string {
  return `---\nname: ${name}\ndescription: Detect ${name} during install for the agent.\n---\n\n# ${name}\nbody\n`;
}

describeIfBuilt(
  "project installer-skills add / list / remove E2E via dist/cli.js (tasks 45/46/47)",
  () => {
    it("45#1 ATTACH — `add detect` attaches a placed helper; registers {name,path} in manifest.yml installerSkills; content unchanged; NO materialised line", () => {
      withTempDir((dir) => {
        const proj = projectDemo(dir);
        const helperPath = placeProjectInstallerSkill(proj, "detect", validSkillMd("detect"));
        const before = readFileSync(helperPath, "utf8");

        const add = wpm(proj, ["project", "installer-skills", "add", "detect"]);
        expect(add.status).toBe(0);
        expect(add.stdout).toContain("attached");
        expect(add.stdout).not.toContain("materialised"); // attach queues no writing

        const manifest = readFileSync(join(proj, "manifest.yml"), "utf8");
        // the real eemeli/yaml round-trip records the {name, path} entry under the top-level `installerSkills`:
        expect(manifest).toMatch(/installerSkills:[\s\S]*name:\s*detect/);
        expect(manifest).toMatch(
          /installerSkills:[\s\S]*path:\s*installer-skills\/detect\/SKILL\.md/,
        );
        // structure-not-content: the placed file's bytes are unchanged.
        expect(readFileSync(helperPath, "utf8")).toBe(before);
      });
    });

    it("45#2 SCAFFOLD — `add fresh` renders a stub (name + placeholder, no prose), registers it, AND materialises the writing task with NO bundle id (loop-closure, cold)", () => {
      withTempDir((dir) => {
        const proj = projectDemo(dir);
        const add = wpm(proj, ["project", "installer-skills", "add", "fresh"]);
        expect(add.status).toBe(0);
        expect(add.stdout).toContain("scaffolded");
        expect(add.stdout).toContain("materialised");

        const stubPath = join(proj, "installer-skills", "fresh", "SKILL.md");
        expect(existsSync(stubPath)).toBe(true);
        const stub = readFileSync(stubPath, "utf8");
        expect(stub).toContain("name: fresh");
        expect(stub).toContain("TODO"); // a placeholder, NOT invented prose

        const manifest = readFileSync(join(proj, "manifest.yml"), "utf8");
        expect(manifest).toMatch(/installerSkills:[\s\S]*name:\s*fresh/);

        // the project-scoped task NAMES no bundle (contrast P's "… in <id>"):
        expect(authoringTaskTitles(proj)).toContain("Write content for install-time skill fresh");
      });
    });

    it("45#3 ERROR — `add ghost --path <missing>` exits non-zero; manifest unchanged; no stub written", () => {
      withTempDir((dir) => {
        const proj = projectDemo(dir);
        const manifestPath = join(proj, "manifest.yml");
        const before = readFileSync(manifestPath, "utf8");
        const res = wpm(proj, [
          "project",
          "installer-skills",
          "add",
          "ghost",
          "--path",
          "installer-skills/ghost/SKILL.md",
        ]);
        expect(res.status).not.toBe(0);
        expect(readFileSync(manifestPath, "utf8")).toBe(before);
        expect(existsSync(join(proj, "installer-skills", "ghost", "SKILL.md"))).toBe(false);
      });
    });

    it("45#4 REFUSAL — a -advisor name AND the <project>-installer name are refused as reserved (exit 2); manifest unchanged", () => {
      withTempDir((dir) => {
        const proj = projectDemo(dir);
        const manifestPath = join(proj, "manifest.yml");
        const before = readFileSync(manifestPath, "utf8");

        const advisor = wpm(proj, ["project", "installer-skills", "add", "web-advisor"]);
        expect(advisor.status).toBe(2); // UsageError → exit 2

        const mainInstaller = wpm(proj, ["project", "installer-skills", "add", "demo-installer"]);
        expect(mainInstaller.status).toBe(2);

        // neither registered/scaffolded anything:
        expect(readFileSync(manifestPath, "utf8")).toBe(before);
        expect(existsSync(join(proj, "installer-skills", "web-advisor", "SKILL.md"))).toBe(false);
      });
    });

    it("46#1 LIST (SCAN + EXCLUSION) — shows author-placed helpers but NOT the main demo-installer or *-advisor", () => {
      withTempDir((dir) => {
        const proj = projectDemo(dir);
        // init already created installer-skills/demo-installer/SKILL.md (the main installer). Add a real helper
        // (without `add`) and an advisor folder — both at the root installer-skills/.
        placeProjectInstallerSkill(proj, "helper", validSkillMd("helper"));
        placeProjectInstallerSkill(proj, "foo-advisor", validSkillMd("foo-advisor"));

        const list = wpm(proj, ["project", "installer-skills", "list"]);
        expect(list.status).toBe(0);
        const names = list.stdout.split("\n").filter(Boolean);
        expect(names).toContain("helper"); // the author-placed helper shows (scan, not registry)
        expect(names).not.toContain("demo-installer"); // the main installer is excluded
        expect(names).not.toContain("foo-advisor"); // the advisor is excluded
      });
    });

    it("47#1/47#2 REMOVE — deregisters AND leaves the SKILL.md on disk; the SCAN-based list STILL shows it", () => {
      withTempDir((dir) => {
        const proj = projectDemo(dir);
        const helperPath = placeProjectInstallerSkill(proj, "detect", validSkillMd("detect"));
        expect(wpm(proj, ["project", "installer-skills", "add", "detect"]).status).toBe(0);

        const remove = wpm(proj, ["project", "installer-skills", "remove", "detect"]);
        expect(remove.status).toBe(0);
        expect(remove.stdout).toContain("left at installer-skills/detect/"); // doc-10:180 message

        // the entry is gone from the registry in manifest.yml:
        const manifest = readFileSync(join(proj, "manifest.yml"), "utf8");
        expect(manifest).not.toMatch(/installerSkills:[\s\S]*name:\s*detect/);
        // BUT the SKILL.md is left on disk …
        expect(existsSync(helperPath)).toBe(true);
        // … so the directory SCAN still lists it (the scan-vs-registry divergence on the real binary):
        expect(wpm(proj, ["project", "installer-skills", "list"]).stdout).toContain("detect");
      });
    });

    it("47#3 — `remove` for a name NOT registered exits non-zero; manifest unchanged", () => {
      withTempDir((dir) => {
        const proj = projectDemo(dir);
        const manifestPath = join(proj, "manifest.yml");
        const before = readFileSync(manifestPath, "utf8");
        expect(wpm(proj, ["project", "installer-skills", "remove", "not-there"]).status).not.toBe(
          0,
        );
        expect(readFileSync(manifestPath, "utf8")).toBe(before);
      });
    });

    it("completion: `add` lists on-disk helper folders (minus reserved); `remove` lists registered names", () => {
      withTempDir((dir) => {
        const proj = projectDemo(dir);
        placeProjectInstallerSkill(proj, "detect", validSkillMd("detect"));
        placeProjectInstallerSkill(proj, "bar-advisor", validSkillMd("bar-advisor"));

        // add → on-disk root helpers, excluding the reserved (demo-installer + *-advisor):
        const addPos = cli(["__complete", "project", "installer-skills", "add", ""], { cwd: proj })
          .stdout.split("\n")
          .filter(Boolean);
        expect(addPos).toContain("detect");
        expect(addPos).not.toContain("demo-installer");
        expect(addPos).not.toContain("bar-advisor");

        // register detect, then remove → completes from the REGISTERED names:
        expect(wpm(proj, ["project", "installer-skills", "add", "detect"]).status).toBe(0);
        const removePos = cli(["__complete", "project", "installer-skills", "remove", ""], {
          cwd: proj,
        })
          .stdout.split("\n")
          .filter(Boolean);
        expect(removePos).toContain("detect");
      });
    });

    it("help: `project installer-skills add --help` reaches the leaf and documents <name>, --path, an example", () => {
      withTempDir((dir) => {
        const proj = projectDemo(dir);
        const help = wpm(proj, ["project", "installer-skills", "add", "--help"]);
        expect(help.status).toBe(0);
        expect(help.stdout).toContain("project installer-skills add"); // the LEAF usage
        expect(help.stdout).toContain("<name>");
        expect(help.stdout).toContain("--path");
        expect(help.stdout).toMatch(/Example/i);
      });
    });

    it("OLD manifest.yml WITHOUT an installerSkills key still drives list AND add (introduces the field) — absent ⇒ empty", () => {
      withTempDir((dir) => {
        const proj = projectDemo(dir);
        // init's manifest.yml already has NO `installerSkills` key — the OLD shape. list works (only the main
        // installer is present, and it is excluded → empty marker):
        const list = wpm(proj, ["project", "installer-skills", "list"]);
        expect(list.status).toBe(0);
        expect(list.stdout.trim()).toBe("(no installer skills)");

        // attach a placed helper → exit 0 and the installerSkills field is introduced:
        placeProjectInstallerSkill(proj, "added", validSkillMd("added"));
        expect(wpm(proj, ["project", "installer-skills", "add", "added"]).status).toBe(0);
        const after = readFileSync(join(proj, "manifest.yml"), "utf8");
        expect(after).toContain("installerSkills:");
        expect(after).toMatch(/installerSkills:[\s\S]*name:\s*added/);
      });
    });
  },
);
