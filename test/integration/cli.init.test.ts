import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execaSync } from "execa";
import { describe, expect, it } from "vitest";
import { BacklogCli } from "../../src/adapters/backlog-cli.js";
import { FakeBacklog } from "../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../src/adapters/fake-env.js";
import { FixedClock } from "../../src/adapters/fixed-clock.js";
import { NodeFileSystem } from "../../src/adapters/node-fs.js";
import { ProcessEnvironment } from "../../src/adapters/process-env.js";
import { type CliDeps, run } from "../../src/cli.js";
import { PERSONAL_AUTHORING_STATE_PATH } from "../../src/core/services/personal-authoring-setup.js";
import { parseManifest } from "../../src/core/services/schema/index.js";
import {
  WORKSPACE_INTEGRATION_STATE_PATH,
  WORKSPACE_SKILL_NAMES,
} from "../../src/core/services/workspace-authoring-integration.js";
import type { CliIo, OutputSink } from "../../src/util/exit.js";
import { parseYaml } from "../../src/util/yaml.js";
import { withTempDir } from "../helpers/tmpdir.js";
import { initWorkspace } from "../helpers/workspace.js";

/**
 * Through-the-edges (integration) test for the FULL `wpm init <name>` command (task-34): one real invocation
 * drives a real change on disk through EVERY layer (commander command surface → the `initProject` operation → the
 * services → the FileSystem port), observed in a REAL working directory. It runs against a real `NodeFileSystem`
 * in a real tmpdir, through the production `run()` path (and, when built, through the actual `dist/cli.js`
 * binary). It supersedes the task-33 walking-skeleton assertions (which checked the deliberately-minimal slice).
 */

/** The repo's real built-in templates root (the package ships this). */
const BUILTIN_TEMPLATES = fileURLToPath(new URL("../../templates", import.meta.url));
const BUNDLED_SKILLS = fileURLToPath(new URL("../../agent-skills", import.meta.url));
/** The built CLI, for the through-the-binary variant (skipped when `dist/` is not built). */
const builtCli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
const hasBuild = existsSync(builtCli);
const describeIfBuilt = hasBuild ? describe : describe.skip;

function collector(): OutputSink & { text: string } {
  return {
    text: "",
    write(chunk: string) {
      this.text += chunk;
    },
  };
}
function io(): CliIo & { out: ReturnType<typeof collector>; err: ReturnType<typeof collector> } {
  return { out: collector(), err: collector(), debug: false };
}

/** Real ports, but a FakeBacklog so the always-on E2E doesn't depend on the `backlog` CLI being installed. */
function realDeps(home?: string): CliDeps {
  return {
    fs: new NodeFileSystem(),
    backlog: new FakeBacklog(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new FakeEnvironment({
      cwd: process.cwd(),
      env: home === undefined ? {} : { HOME: home },
      platform: process.platform,
    }),
    builtinTemplatesRoot: BUILTIN_TEMPLATES,
    bundledSkillsRoot: BUNDLED_SKILLS,
  };
}

/**
 * Assert the FULL produced authoring WORKSPACE on REAL DISK (via `node:fs`) under workspace root `proj`
 * (task-87): the authoring surface at the root, the deliverable skeleton under `wip/`, the empty `builds/`.
 */
function assertProjectOnDisk(proj: string, name: string): void {
  const wip = join(proj, "wip");

  // The DELIVERABLE manifest lives under wip/ — parses, name substituted, empty bundles/targets:
  expect(existsSync(join(wip, "manifest.yml"))).toBe(true);
  const manifest = parseManifest(parseYaml(readFileSync(join(wip, "manifest.yml"), "utf8")));
  expect(manifest.ok).toBe(true);
  if (manifest.ok) {
    expect(manifest.value.meta.name).toBe(name);
    expect(manifest.value.bundles).toEqual([]);
    expect(manifest.value.targets).toEqual([]);
  }

  // The selected Codex-native workspace front door names the exact managed-state/router handshake.
  expect(existsSync(join(proj, "AGENTS.md"))).toBe(true);
  const authoring = readFileSync(join(proj, "AGENTS.md"), "utf8");
  expect(authoring).toContain("$wpm-author");
  expect(authoring).toContain(".wpm-authoring.json");
  expect(authoring.toLowerCase()).not.toContain("executing agent");
  expect(existsSync(join(proj, "CLAUDE.md"))).toBe(false);
  for (const skill of WORKSPACE_SKILL_NAMES) {
    expect(existsSync(join(proj, ".agents", "skills", skill, "SKILL.md"))).toBe(true);
  }
  expect(existsSync(join(proj, WORKSPACE_INTEGRATION_STATE_PATH))).toBe(true);

  // AC#8 — the DELIVERABLE executor front door is author-owned under the reserved prefix (NOT the canonical name):
  expect(existsSync(join(wip, "_AGENTS.md"))).toBe(true);
  expect(existsSync(join(wip, "AGENTS.md"))).toBe(false);
  const executor = readFileSync(join(wip, "_AGENTS.md"), "utf8");
  expect(executor).toContain(name);
  expect(executor.toLowerCase()).toContain("install");

  // AC#8 — the orchestrator + its static journaling reference, under wip/:
  expect(existsSync(join(wip, "installer-skills", `${name}-installer`, "SKILL.md"))).toBe(true);
  expect(
    existsSync(join(wip, "installer-skills", `${name}-installer`, "references", "journaling.md")),
  ).toBe(true);

  // the remaining copied files, under wip/:
  expect(existsSync(join(wip, "README.md"))).toBe(true);
  expect(existsSync(join(wip, "RALPH-LOOP.md"))).toBe(true);

  // AC#1 — the default bundle template materialised at wip/bundles/bundle-template/ (placeholders KEPT):
  expect(existsSync(join(wip, "bundles", "bundle-template", "_AGENTS.md.tmpl"))).toBe(true);
  expect(readFileSync(join(wip, "bundles", "bundle-template", "_AGENTS.md.tmpl"), "utf8")).toMatch(
    /\{\{bundle-id\}\}/,
  );

  // TASK-102 — the bundle-template scaffold ships a `backlog → install-backlog` alias so the Backlog.md CLI
  // resolves its recipe. Present on every platform (a real symlink on POSIX; the Windows adapter copies); on
  // POSIX assert it is a RELATIVE link to install-backlog (archive-portable).
  const tmplBacklog = join(wip, "bundles", "bundle-template", "backlog");
  expect(existsSync(tmplBacklog)).toBe(true);
  if (process.platform !== "win32") {
    expect(lstatSync(tmplBacklog).isSymbolicLink()).toBe(true);
    expect(readlinkSync(tmplBacklog)).toBe("install-backlog");
  }

  // AC#1 — the empty registries exist as directories under wip/; the authoring backlog at the workspace root:
  expect(existsSync(join(wip, "installer-skills"))).toBe(true);
  expect(existsSync(join(wip, "templates"))).toBe(true);
  expect(existsSync(join(proj, ".authoring-backlog"))).toBe(true);

  // AC#2 — the empty build-output directory exists at the workspace root:
  expect(existsSync(join(proj, "builds"))).toBe(true);
  expect(readdirSync(join(proj, "builds"))).toEqual([]);

  // AC#3 — the workspace .gitignore records BOTH the authoring backlog AND builds/:
  expect(existsSync(join(proj, ".gitignore"))).toBe(true);
  const gitignore = readFileSync(join(proj, ".gitignore"), "utf8");
  expect(gitignore).toMatch(/^\.authoring-backlog\/$/m);
  expect(gitignore).toMatch(/^builds\/$/m);

  // AC#1 — minimal declares no targets ⇒ NO scope-aliases under wip/:
  expect(existsSync(join(wip, ".claude", "skills"))).toBe(false);

  // NO unresolved {{…}} marker in any produced file EXCEPT the bundle-template scaffold (a template-of-a-template
  // that deliberately keeps its placeholders for `bundle new` to fill):
  const scaffold = join(wip, "bundles", "bundle-template");
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = join(dir, entry.name);
      if (child === scaffold) continue;
      if (entry.isDirectory()) walk(child);
      else if (!child.startsWith(`${scaffold}/`))
        expect(readFileSync(child, "utf8"), `marker in ${child}`).not.toMatch(/\{\{[^}]*\}\}/);
    }
  };
  walk(proj);
}

describe("`wpm init` FULL — drives a real change through every layer (task-34)", () => {
  it("AC#1 — init <name> --at <dir> produces the full project on real disk via run()", async () => {
    await withTempDir(async (dir) => {
      // --at must point at a path that does NOT yet exist (AC#5 refuses an existing target), so target a fresh
      // subdir of the tmpdir rather than the tmpdir itself.
      const proj = join(dir, "proj");
      const i = io();
      const code = await run(
        ["init", "hermes-handoff", "--at", proj, "--authoring-client", "codex"],
        realDeps(),
        i,
      );
      expect(code).toBe(0);
      expect(i.out.text).toContain("created authoring workspace hermes-handoff");
      // AC#7 — the summary names the materialised-task count (8 project-wide tasks):
      expect(i.out.text).toMatch(/materialised: 8 authoring task/);
      // `--at <proj>` ⇒ the project root IS <proj> (doc 10 line 194):
      assertProjectOnDisk(proj, "hermes-handoff");
    });
  });

  it("AC#5 — re-running init on an existing path exits 1 (ConflictError) and changes nothing", async () => {
    await withTempDir(async (dir) => {
      const proj = join(dir, "proj");
      expect(
        await run(
          ["init", "hermes-handoff", "--at", proj, "--authoring-client", "codex"],
          realDeps(),
          io(),
        ),
      ).toBe(0);
      const manifestBefore = readFileSync(join(proj, "wip", "manifest.yml"), "utf8");

      // <proj> now exists, so a second init at the SAME path is refused (AC#5) — exit 1, nothing changed:
      const i = io();
      const code = await run(
        ["init", "other", "--at", proj, "--authoring-client", "codex"],
        realDeps(),
        i,
      );
      expect(code).toBe(1); // ConflictError → exit 1
      expect(i.err.text).toMatch(/^error: /);
      expect(readFileSync(join(proj, "wip", "manifest.yml"), "utf8")).toBe(manifestBefore); // unchanged
    });
  });

  it("rejects an empty authoring-client selection as usage before creating the target", async () => {
    await withTempDir(async (dir) => {
      const proj = join(dir, "proj");
      const i = io();
      expect(await run(["init", "demo", "--at", proj], realDeps(), i)).toBe(2);
      expect(i.err.text).toContain("authoring-clients-empty");
      expect(existsSync(proj)).toBe(false);
    });
  });

  it("uses retained personal setup defaults when init flags are omitted", async () => {
    await withTempDir(async (dir) => {
      const home = join(dir, "home");
      const proj = join(dir, "proj");
      mkdirSync(home);
      const dependencies = realDeps(home);
      expect(
        await run(
          ["authoring", "setup", "--client", "codex", "--client", "claude-code"],
          dependencies,
          io(),
        ),
      ).toBe(0);

      expect(await run(["init", "defaults-demo", "--at", proj], dependencies, io())).toBe(0);
      expect(existsSync(join(proj, "AGENTS.md"))).toBe(true);
      expect(existsSync(join(proj, "CLAUDE.md"))).toBe(true);
    });
  });

  it("explicit init selection bypasses malformed personal state while omission fails closed", async () => {
    await withTempDir(async (dir) => {
      const home = join(dir, "home");
      const state = join(home, PERSONAL_AUTHORING_STATE_PATH);
      mkdirSync(join(home, ".wpm"), { recursive: true });
      writeFileSync(state, "user-modified\n");
      const dependencies = realDeps(home);
      const blocked = join(dir, "blocked");
      const blockedIo = io();
      expect(await run(["init", "blocked", "--at", blocked], dependencies, blockedIo)).toBe(1);
      expect(blockedIo.err.text).toContain("personal-state-invalid");
      expect(existsSync(blocked)).toBe(false);

      const explicit = join(dir, "explicit");
      expect(
        await run(
          ["init", "explicit", "--at", explicit, "--authoring-client", "claude-code"],
          dependencies,
          io(),
        ),
      ).toBe(0);
      expect(existsSync(join(explicit, "CLAUDE.md"))).toBe(true);
      expect(existsSync(join(explicit, "AGENTS.md"))).toBe(false);
      expect(readFileSync(state, "utf8")).toBe("user-modified\n");
    });
  });

  it("TASK-126 QA — reports all contribution, derivation, and target blockers before changing real disk or Backlog state", async () => {
    await withTempDir(async (dir) => {
      const templatesRoot = join(dir, "templates");
      cpSync(BUILTIN_TEMPLATES, templatesRoot, { recursive: true });
      writeFileSync(
        join(templatesRoot, "project", "minimal", "template.yml"),
        [
          "name: minimal",
          "scope: project",
          'revision: "qa-invalid-r1"',
          "parameters:",
          "  - name: project-name",
          "authoring-tasks:",
          "  - key: invalid-context",
          "    title: Invalid {{wpm.bundle.id}} work",
          "    acceptance-criteria: []",
          "    depends-on:",
          "      - self:missing",
          "",
        ].join("\n"),
      );
      rmSync(join(templatesRoot, "project", "minimal", "snippets", "AGENTS.md"));
      const proj = join(dir, "occupied");
      mkdirSync(proj);
      writeFileSync(join(proj, "USER.txt"), "preserve me\n");
      const backlog = new FakeBacklog();
      const dependencies: CliDeps = {
        fs: new NodeFileSystem(),
        backlog,
        clock: new FixedClock("2026-01-01T00:00:00.000Z"),
        env: new FakeEnvironment({ cwd: dir, env: {}, platform: process.platform }),
        builtinTemplatesRoot: templatesRoot,
        bundledSkillsRoot: BUNDLED_SKILLS,
      };
      const streams = io();
      expect(
        await run(
          ["init", "qa-invalid", "--at", proj, "--authoring-client", "codex"],
          dependencies,
          streams,
        ),
      ).toBe(1);
      for (const code of [
        "workspace-target-exists",
        "project-derived-plan-invalid",
        "template-task-acceptance-criteria-empty",
        "template-task-unavailable-context",
        "template-task-unresolved-dependency",
      ]) {
        expect(streams.err.text).toContain(code);
      }
      expect(streams.err.text).toContain("template:built-in:project:minimal@qa-invalid-r1");
      expect(readFileSync(join(proj, "USER.txt"), "utf8")).toBe("preserve me\n");
      expect(existsSync(join(proj, "wip"))).toBe(false);
      expect(backlog.inspectRoot(join(proj, ".authoring-backlog")).valid).toBe(false);
    });
  });

  it("installs both explicit native clients without changing empty manifest targets", async () => {
    await withTempDir(async (dir) => {
      const proj = join(dir, "proj");
      expect(
        await run(
          [
            "init",
            "demo",
            "--at",
            proj,
            "--authoring-client",
            "claude-code",
            "--authoring-client",
            "codex",
          ],
          realDeps(),
          io(),
        ),
      ).toBe(0);
      for (const [scope, frontDoor, invocation] of [
        [".agents/skills", "AGENTS.md", "$wpm-author"],
        [".claude/skills", "CLAUDE.md", "/wpm-author"],
      ] as const) {
        for (const skill of WORKSPACE_SKILL_NAMES) {
          expect(existsSync(join(proj, scope, skill, "SKILL.md"))).toBe(true);
        }
        expect(readFileSync(join(proj, frontDoor), "utf8")).toContain(invocation);
      }
      const manifest = parseManifest(
        parseYaml(readFileSync(join(proj, "wip/manifest.yml"), "utf8")),
      );
      expect(manifest.ok && manifest.value.targets).toEqual([]);
      expect(
        JSON.parse(readFileSync(join(proj, WORKSPACE_INTEGRATION_STATE_PATH), "utf8")),
      ).toMatchObject({ selectedClients: ["codex", "claude-code"], status: "complete" });
    });
  });

  it("AC#6 — --list-templates prints the available project templates and creates NOTHING", async () => {
    await withTempDir(async (dir) => {
      const proj = join(dir, "should-not-exist");
      const i = io();
      const code = await run(
        ["init", "should-not-exist", "--at", proj, "--list-templates"],
        realDeps(),
        i,
      );
      expect(code).toBe(0);
      expect(i.out.text).toContain("minimal"); // the one built-in project template
      // It exited WITHOUT creating a project:
      expect(existsSync(proj)).toBe(false);
    });
  });

  it("AC#6 — --param values thread to placeholder substitution (extra params are harmless for minimal)", async () => {
    await withTempDir(async (dir) => {
      const proj = join(dir, "proj");
      const i = io();
      const code = await run(
        [
          "init",
          "demo",
          "--at",
          proj,
          "--param",
          "author=me",
          "--param",
          "license=MIT",
          "--authoring-client",
          "codex",
        ],
        realDeps(),
        i,
      );
      expect(code).toBe(0);
      assertProjectOnDisk(proj, "demo");
    });
  });

  it("a malformed --param (no =) is a usage error (exit 2)", async () => {
    await withTempDir(async (dir) => {
      const proj = join(dir, "proj");
      const i = io();
      const code = await run(["init", "demo", "--at", proj, "--param", "bogus"], realDeps(), i);
      expect(code).toBe(2);
      expect(i.err.text).toMatch(/--param/);
      expect(existsSync(join(proj, "wip", "manifest.yml"))).toBe(false);
    });
  });

  it("without --at, init <name> nests the project under <cwd>/<name> (doc 10/12 default)", async () => {
    await withTempDir(async (dir) => {
      const proj = join(dir, "hermes-handoff");
      expect(
        await run(
          ["init", "hermes-handoff", "--at", proj, "--authoring-client", "codex"],
          realDeps(),
          io(),
        ),
      ).toBe(0);
      assertProjectOnDisk(proj, "hermes-handoff");
    });
  });

  it("AC#8 — `init --help` shows <name>, every flag, and a worked example", async () => {
    const i = io();
    expect(await run(["init", "--help"], realDeps(), i)).toBe(0);
    const help = i.out.text;
    expect(help).toMatch(/Usage:/);
    expect(help).toContain("init");
    expect(help).toContain("<name>"); // the positional (task-28)
    expect(help).toContain("--at");
    expect(help).toContain("--template");
    expect(help).toContain("--list-templates");
    expect(help).toContain("--param");
    expect(help).toContain("--authoring-client");
    expect(help).toContain("Example"); // the worked example (task-28 contract)
    expect(help).toContain("wpm init");
  });
});

describeIfBuilt(
  "`wpm init` FULL — through the built `dist/cli.js` binary (the fullest real path)",
  () => {
    it("`init <name>` with default cwd creates the full <cwd>/<name>/ on disk", async () => {
      await withTempDir((dir) => {
        execFileSync(
          process.execPath,
          [builtCli, "init", "hermes-handoff", "--authoring-client", "codex"],
          {
            cwd: dir,
            encoding: "utf8",
          },
        );
        assertProjectOnDisk(join(dir, "hermes-handoff"), "hermes-handoff");
      });
    });

    it("`init <name> --at <dir>` creates the project at <dir> on disk", async () => {
      await withTempDir((dir) => {
        const proj = join(dir, "proj");
        const out = execFileSync(
          process.execPath,
          [builtCli, "init", "demo-proj", "--at", proj, "--authoring-client", "codex"],
          { encoding: "utf8" },
        );
        expect(out).toContain("created authoring workspace demo-proj");
        assertProjectOnDisk(proj, "demo-proj");
      });
    });
  },
);

/** Whether the real `backlog` CLI is available; the .authoring-backlog real-root checks skip (not fail) if not. */
function backlogAvailable(): boolean {
  try {
    // Probe via `execaSync` (not `execFileSync`) so the guard's "is backlog present?" check uses the SAME
    // resolution the block's body relies on (the real `BacklogCli` adapter shells out via `src/util/shell.ts`'s
    // execa). On Windows the npm global bin is a `.cmd` shim execa resolves but bare `execFileSync` does not — so
    // a bare-`execFileSync` guard would FALSE-SKIP a runner that actually HAS backlog. A genuinely-absent backlog
    // still throws here ⇒ the block skips cleanly (never fails).
    execaSync("backlog", ["--version"], { stdout: "pipe", stderr: "pipe" });
    return true;
  } catch {
    return false;
  }
}
const describeIfBacklog = backlogAvailable() ? describe : describe.skip;

describeIfBacklog(
  "`wpm init` FULL — the .authoring-backlog is a real Backlog.md root with the project-wide tasks (BacklogMd port)",
  () => {
    /** Backlog.md per-machine global state, isolated inside `dir`. */
    function isolatedEnv(dir: string): Record<string, string> {
      return {
        HOME: dir,
        XDG_CONFIG_HOME: dir,
        XDG_DATA_HOME: dir,
        XDG_STATE_HOME: dir,
        XDG_CACHE_HOME: dir,
      };
    }

    it("AC#4 — init materialises the project-wide set into a real .authoring-backlog/ (task_prefix=authoring)", async () => {
      await withTempDir(async (dir) => {
        const env = isolatedEnv(dir);
        const deps: CliDeps = {
          fs: new NodeFileSystem(),
          backlog: new BacklogCli("backlog", env),
          clock: new FixedClock("2026-01-01T00:00:00.000Z"),
          env: new ProcessEnvironment(),
          builtinTemplatesRoot: BUILTIN_TEMPLATES,
          bundledSkillsRoot: BUNDLED_SKILLS,
        };
        const proj = join(dir, "proj");
        const i = io();
        expect(
          await run(
            ["init", "hermes-handoff", "--at", proj, "--authoring-client", "codex"],
            deps,
            i,
          ),
        ).toBe(0);
        expect(i.out.text).toMatch(/materialised: 8 authoring task/);

        // The real CLI initialised an authoring-backlog root with task_prefix=authoring AND materialised the 8
        // project-wide tasks (authoring-1..8) → the NEXT created task is authoring-9:
        const authoringRoot = join(proj, ".authoring-backlog");
        const real = new BacklogCli("backlog", env);
        const titles = real.listTasks(authoringRoot).map((t) => t.title);
        expect(titles).toContain("Set project metadata");
        expect(titles).toContain("Build dry-run");
        expect(titles).toHaveLength(8);
        const created = real.createTask(authoringRoot, { title: "probe" });
        expect(created.id).toBe("authoring-9");
      });
    });

    it("TASK-126 — one real init publishes project and concrete bundle task packs with exact dependency/provenance records", async () => {
      await withTempDir(async (dir) => {
        const templatesRoot = join(dir, "templates");
        cpSync(BUILTIN_TEMPLATES, templatesRoot, { recursive: true });
        writeFileSync(
          join(templatesRoot, "project", "minimal", "files", "manifest.yml.tmpl"),
          [
            "project:",
            "  name: {{project-name}}",
            "  version: 0.1.0",
            "targets: []",
            "bundles:",
            "  - core",
            "",
          ].join("\n"),
        );
        mkdirSync(join(templatesRoot, "project", "minimal", "files", "bundles", "core"), {
          recursive: true,
        });
        writeFileSync(
          join(templatesRoot, "project", "minimal", "files", "bundles", "core", "bundle.yml"),
          "id: core\nversion: 1.2.3\nsummary: core bundle\nconfirmation: safe\nrequires: {}\n",
        );
        writeFileSync(
          join(templatesRoot, "project", "minimal", "template.yml"),
          [
            "name: minimal",
            "scope: project",
            'revision: "real-project-r1"',
            "parameters:",
            "  - name: project-name",
            "authoring-tasks:",
            "  - key: inspect-license",
            "    title: Inspect license for {{wpm.project.name}}",
            "    acceptance-criteria:",
            "      - The license decision is observable",
            "    depends-on:",
            "      - wpm:project:set-metadata",
            "",
          ].join("\n"),
        );
        writeFileSync(
          join(templatesRoot, "bundle", "default", "template.yml"),
          [
            "name: default",
            "scope: bundle",
            'revision: "real-bundle-r2"',
            "parameters:",
            "  - name: bundle-id",
            "  - name: version",
            "  - name: project-name",
            "authoring-tasks:",
            "  - key: inspect-runtime",
            "    title: Inspect {{wpm.bundle.id}} runtime",
            "    acceptance-criteria:",
            "      - The {{wpm.bundle.id}} {{wpm.bundle.version}} runtime is observable",
            "    depends-on:",
            "      - wpm:bundle:plan",
            "",
          ].join("\n"),
        );

        const env = isolatedEnv(dir);
        const dependencies: CliDeps = {
          fs: new NodeFileSystem(),
          backlog: new BacklogCli("backlog", env),
          clock: new FixedClock("2026-01-01T00:00:00.000Z"),
          env: new ProcessEnvironment(),
          builtinTemplatesRoot: templatesRoot,
          bundledSkillsRoot: BUNDLED_SKILLS,
        };
        const proj = join(dir, "proj");
        const streams = io();
        const exitCode = await run(
          ["init", "real-plan", "--at", proj, "--authoring-client", "codex"],
          dependencies,
          streams,
        );
        expect(exitCode, streams.err.text).toBe(0);
        expect(streams.out.text).toMatch(/materialised: 22 authoring task/);

        const root = join(proj, ".authoring-backlog");
        const real = new BacklogCli("backlog", env);
        expect(real.listTasks(root)).toHaveLength(22);
        expect(real.readTask(root, "authoring-9")).toMatchObject({
          title: "Inspect license for real-plan",
          dependencies: ["authoring-1"],
          labels: [
            "wpm:template-task",
            "wpm:template-origin:built-in:project:minimal",
            "wpm:template-revision:real-project-r1",
            "wpm:template-key:inspect-license",
          ],
        });
        expect(real.readTask(root, "authoring-22")).toMatchObject({
          title: "Inspect core runtime",
          dependencies: ["authoring-10"],
          labels: [
            "wpm:template-task",
            "wpm:template-origin:built-in:bundle:default",
            "wpm:template-revision:real-bundle-r2",
            "wpm:template-key:inspect-runtime",
            "wpm:bundle:core",
          ],
        });
      });
    });
  },
);

describeIfBuilt("`wpm init` FULL — scope aliases on real disk (AC#1, through dist/cli.js)", () => {
  it("init then `project targets add claude-code` creates the platform-contract scope alias", async () => {
    await withTempDir((dir) => {
      // `project targets add` is project-bound: it resolves the authoring WORKSPACE (task-88) and operates on
      // the deliverable under `wip/`, with the authoring backlog at the workspace root. So we init a real
      // workspace and target it via `-C <workspace>`; the alias lands under the deliverable `wip/`.
      const proj = initWorkspace(builtCli, dir);
      // A freshly-init'd minimal project has NO aliases (no targets) — negative case on real disk:
      expect(existsSync(join(proj, "wip", ".claude", "skills"))).toBe(false);

      // Adding a target creates the alias (the same alias plan init would have applied for a declared target):
      execFileSync(
        process.execPath,
        [builtCli, "project", "targets", "add", "claude-code", "-C", proj],
        {
          encoding: "utf8",
        },
      );
      const alias = join(proj, "wip", ".claude", "skills");
      expect(existsSync(alias)).toBe(true);
      // The contract is unconditional: POSIX creates a symlink; Windows creates a readable directory copy
      // without probing runner privileges. Both mechanisms expose the installer skill content.
      expect(lstatSync(alias).isSymbolicLink()).toBe(process.platform !== "win32");
      expect(readFileSync(join(alias, "demo-installer", "SKILL.md"), "utf8")).toContain(
        "name: demo-installer",
      );
    });
  });
});
