import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { buildProgram, type CliDeps } from "../../../src/cli.js";
import { completeArgv } from "../../../src/completion/complete.js";
import { defaultRegistry } from "../../../src/completion/registry.js";
import { type CompletionContext, CompletionRegistry } from "../../../src/completion/sources.js";
import {
  generateScript,
  installCompletion,
  type Shell,
} from "../../../src/util/completion-install.js";
import type { CliIo } from "../../../src/util/exit.js";

/**
 * Tests for the tab-completion plumbing (task-29). They drive the testable seams IN-PROCESS — `completeArgv`
 * (the `__complete` dispatch), the named-source registry, and the `installCompletion` emitter — over in-memory
 * ports, with no `process.exit` and no subprocess (omelette's exit-y paths are deliberately avoided). One
 * `describe` per acceptance criterion.
 */

const ROOT = "/proj";
const BUILTIN = "/builtin-templates";
const HOME = "/home/u";

function io(): CliIo {
  return { out: { write() {} }, err: { write() {} }, debug: false };
}

/** A CliDeps with a project (manifest with bundles) + built-in & project-local templates seeded in memory. */
function seededDeps(): CliDeps {
  const fs = new MemoryFileSystem();
  fs.write(
    `${ROOT}/wip/manifest.yml`,
    [
      "project:",
      "  name: demo",
      "  version: 1.0.0",
      "targets:",
      "  - claude-code",
      "  - codex",
      "bundles:",
      "  - core",
      "  - web-handoff",
      "",
    ].join("\n"),
  );
  // Built-in templates: a project template + two bundle templates.
  fs.write(`${BUILTIN}/project/minimal/template.yml`, "name: minimal\nscope: project\n");
  fs.write(`${BUILTIN}/bundle/default/template.yml`, "name: default\nscope: bundle\n");
  fs.write(
    `${BUILTIN}/bundle/with-payload-skill/template.yml`,
    "name: with-payload-skill\nscope: bundle\n",
  );
  // A project-local template shadows/extends the built-ins.
  fs.write(
    `${ROOT}/wip/templates/bundle/adopts-tool/template.yml`,
    "name: adopts-tool\nscope: bundle\n",
  );

  return {
    fs,
    backlog: new FakeBacklog(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new FakeEnvironment({ cwd: ROOT, env: { HOME } }),
    builtinTemplatesRoot: BUILTIN,
  };
}

/** Run completeArgv against the real program tree + the real default registry + the CLI's specs. */
function complete(deps: CliDeps, words: string[]): string[] {
  const program = buildProgram(deps, io());
  // The CLI's COMPLETION_SPECS aren't exported; re-declare the one wired today for the dispatch test.
  return completeArgv(program, words, {
    fs: deps.fs,
    env: deps.env,
    builtinTemplatesRoot: deps.builtinTemplatesRoot,
    registry: defaultRegistry(),
    specs: {
      init: { options: { "--authoring-client": "authoring-client-ids" } },
      "authoring integrate": { options: { "--client": "authoring-client-ids" } },
      "authoring handoff verify": { options: { "--client": "authoring-client-ids" } },
      "bundle new": { options: { "--template": "bundle-template-names" }, args: [undefined] },
      "completion install": { options: { "--shell": "shells" } },
    },
  });
}

describe("AC#1 — a user can install completion for the common shells (doc 12)", () => {
  it.each<Shell>([
    "bash",
    "zsh",
    "fish",
  ])("generates a non-trivial, shell-correct completion script for %s", (shell) => {
    const script = generateScript(shell);
    expect(script.length).toBeGreaterThan(50);
    if (shell === "fish") {
      expect(script).toContain("complete -f -c wpm");
    } else {
      // bash + zsh branches:
      expect(script).toMatch(/complete -F|compdef/);
    }
  });

  it.each<Shell>([
    "bash",
    "zsh",
    "fish",
  ])("installs the script + ensures the init file sources it (idempotently), through the fs port — %s", (shell) => {
    const fs = new MemoryFileSystem();
    const env = new FakeEnvironment({ cwd: ROOT, env: { HOME } });
    const deps = { fs, env };

    const first = installCompletion(deps, shell);
    expect(first.shell).toBe(shell);
    expect(first.added).toBe(true);
    // The completion script was written and is non-trivial:
    expect(fs.exists(first.scriptPath)).toBe(true);
    expect(fs.read(first.scriptPath).length).toBeGreaterThan(50);
    // The init file now sources it (the loader block is present):
    expect(fs.read(first.initFile)).toContain("begin wpm completion");
    expect(fs.read(first.initFile)).toContain(first.scriptPath);

    // Re-install is idempotent: the block is not duplicated.
    const before = fs.read(first.initFile);
    const second = installCompletion(deps, shell);
    expect(second.added).toBe(false);
    expect(fs.read(second.initFile)).toBe(before);
    const occurrences = before.split("begin wpm completion").length - 1;
    expect(occurrences).toBe(1);
  });

  it("install is driven through run() end-to-end and exits 0 (no process.exit escapes)", async () => {
    const { run } = await import("../../../src/cli.js");
    const fs = new MemoryFileSystem();
    const deps: CliDeps = {
      fs,
      backlog: new FakeBacklog(),
      clock: new FixedClock("2026-01-01T00:00:00.000Z"),
      env: new FakeEnvironment({ cwd: ROOT, env: { HOME, SHELL: "/bin/bash" } }),
      builtinTemplatesRoot: BUILTIN,
    };
    const out = {
      text: "",
      write(c: string) {
        this.text += c;
      },
    };
    const code = await run(["completion", "install", "--shell", "bash"], deps, {
      out,
      err: { write() {} },
      debug: false,
    });
    expect(code).toBe(0); // the test process survived — omelette did not process.exit
    expect(out.text).toContain("completion installed for bash");
    expect(fs.exists(`${HOME}/.wpm/completion.sh`)).toBe(true);
  });

  it("an unsupported / undetected shell is a clean usage error (exit 2), not a crash", async () => {
    const { run } = await import("../../../src/cli.js");
    const deps = seededDeps();
    // No --shell and SHELL unset → undetected → UsageError → exit 2.
    const code = await run(["completion", "install"], deps, io());
    expect(code).toBe(2);
  });
});

describe("AC#2 — options with a fixed set of valid values complete to those values", () => {
  it("a fixed-enum source returns exactly its values (and prefix-filters)", () => {
    const registry = defaultRegistry();
    const ctx = (partial: string): CompletionContext => ({
      fs: new MemoryFileSystem(),
      env: new FakeEnvironment({ cwd: ROOT }),
      builtinTemplatesRoot: BUILTIN,
      partial,
    });
    expect(registry.resolve("bump-levels", ctx(""))).toEqual(["major", "minor", "patch"]);
    expect(registry.resolve("bump-levels", ctx("m"))).toEqual(["major", "minor"]);
    expect(registry.resolve("build-formats", ctx(""))).toEqual(["zip", "tarball", "git"]);
    expect(registry.resolve("confirmation-levels", ctx(""))).toEqual(["safe", "dangerous"]);
    expect(registry.resolve("task-kinds", ctx(""))).toEqual(["kind:state", "kind:migration"]);
    expect(registry.resolve("template-scopes", ctx(""))).toEqual(["project", "bundle"]);
    expect(registry.resolve("authoring-client-ids", ctx(""))).toEqual(["codex", "claude-code"]);
  });

  it("workspace integration and handoff client flags complete from the shared catalog", () => {
    const deps = seededDeps();
    expect(complete(deps, ["init", "demo", "--authoring-client", ""])).toEqual([
      "codex",
      "claude-code",
    ]);
    expect(complete(deps, ["authoring", "integrate", "--client", "c"])).toEqual([
      "codex",
      "claude-code",
    ]);
    expect(complete(deps, ["authoring", "handoff", "verify", "--client", "c"])).toEqual([
      "codex",
      "claude-code",
    ]);
  });

  it("a live option completes to its fixed enum end-to-end (`completion install --shell <tab>`)", () => {
    const deps = seededDeps();
    expect(complete(deps, ["completion", "install", "--shell", ""])).toEqual([
      "bash",
      "zsh",
      "fish",
    ]);
    expect(complete(deps, ["completion", "install", "--shell", "f"])).toEqual(["fish"]);
  });
});

describe("AC#3 — state-dependent completions via named sources; a new source slots in without rewiring", () => {
  it("`bundle new --template <tab>` resolves template names from built-in + project-local templates/", () => {
    const deps = seededDeps();
    const names = complete(deps, ["bundle", "new", "--template", ""]).sort();
    // built-in default + with-payload-skill, plus the project-local adopts-tool:
    expect(names).toEqual(["adopts-tool", "default", "with-payload-skill"]);
  });

  it("the `bundle-ids` source resolves the enabled bundles from the manifest (prefix-filtered)", () => {
    const deps = seededDeps();
    const registry = defaultRegistry();
    const ctx = (partial: string): CompletionContext => ({
      fs: deps.fs,
      env: deps.env,
      builtinTemplatesRoot: BUILTIN,
      partial,
    });
    expect(registry.resolve("bundle-ids", ctx("")).sort()).toEqual(["core", "web-handoff"]);
    expect(registry.resolve("bundle-ids", ctx("w"))).toEqual(["web-handoff"]);
  });

  it("the `target-names` (well-known) and `installed-target-names` (manifest) sources resolve", () => {
    const deps = seededDeps();
    const registry = defaultRegistry();
    const ctx: CompletionContext = {
      fs: deps.fs,
      env: deps.env,
      builtinTemplatesRoot: BUILTIN,
      partial: "",
    };
    expect(registry.resolve("target-names", ctx)).toEqual(
      expect.arrayContaining(["claude-code", "codex", "hermes", "openclaw"]),
    );
    expect(registry.resolve("installed-target-names", ctx).sort()).toEqual([
      "claude-code",
      "codex",
    ]);
  });

  it("no project → state-dependent sources yield [] (and never throw)", () => {
    const deps: CliDeps = {
      fs: new MemoryFileSystem(), // empty fs: no manifest anywhere
      backlog: new FakeBacklog(),
      clock: new FixedClock("2026-01-01T00:00:00.000Z"),
      env: new FakeEnvironment({ cwd: "/nowhere" }),
      builtinTemplatesRoot: BUILTIN,
    };
    const registry = defaultRegistry();
    const ctx: CompletionContext = {
      fs: deps.fs,
      env: deps.env,
      builtinTemplatesRoot: BUILTIN,
      partial: "",
    };
    expect(registry.resolve("bundle-ids", ctx)).toEqual([]);
    expect(registry.resolve("installed-target-names", ctx)).toEqual([]);
  });

  it("`bundle new <id>` (a brand-new id) yields NO suggestions, but flags still complete after (doc 10)", () => {
    const deps = seededDeps();
    // Completing the positional id: declared source is `undefined` → [].
    expect(complete(deps, ["bundle", "new", ""])).toEqual([]);
    // ...but a flag partial still completes the command's flags:
    const flags = complete(deps, ["bundle", "new", "--"]);
    expect(flags).toEqual(
      expect.arrayContaining(["--version", "--disabled", "--no-advisor", "--template"]),
    );
  });

  it("EXTENSIBILITY: a NEW named source slots in by name and resolves through the SAME dispatch — no rewiring", () => {
    const deps = seededDeps();
    const program = buildProgram(deps, io());
    // Register a brand-new source on a fresh registry — the dispatch code is untouched.
    const registry = new CompletionRegistry();
    registry.register("fixture-source", () => ["alpha", "beta", "gamma"]);

    // Wire a spec that references the new source by NAME for an existing option position, then dispatch:
    const result = completeArgv(program, ["bundle", "new", "--template", ""], {
      fs: deps.fs,
      env: deps.env,
      builtinTemplatesRoot: BUILTIN,
      registry,
      specs: { "bundle new": { options: { "--template": "fixture-source" } } },
    });
    expect(result).toEqual(["alpha", "beta", "gamma"]);
    // The registry resolves the new name directly too:
    expect(registry.has("fixture-source")).toBe(true);
  });

  it("a `-C/--project` override on the line is respected — completion targets THAT project", () => {
    // The project lives at /proj, but the cwd is elsewhere; only `-C /proj` points completion at it.
    const fs = new MemoryFileSystem();
    fs.write(
      `${ROOT}/wip/manifest.yml`,
      [
        "project:",
        "  name: demo",
        "  version: 1.0.0",
        "targets: []",
        "bundles:",
        "  - core",
        "",
      ].join("\n"),
    );
    fs.write(`${BUILTIN}/bundle/default/template.yml`, "name: default\nscope: bundle\n");
    const deps: CliDeps = {
      fs,
      backlog: new FakeBacklog(),
      clock: new FixedClock("2026-01-01T00:00:00.000Z"),
      env: new FakeEnvironment({ cwd: "/somewhere-else" }), // cwd has NO manifest on its chain
      builtinTemplatesRoot: BUILTIN,
    };

    // Without -C the cwd resolves no project → bundle-ids is empty:
    const registry = defaultRegistry();
    expect(
      registry.resolve("bundle-ids", {
        fs,
        env: deps.env,
        builtinTemplatesRoot: BUILTIN,
        partial: "",
      }),
    ).toEqual([]);

    // With `-C /proj` on the completion line, the dispatch threads the override into the source → it resolves:
    const withOverride = complete(deps, ["-C", ROOT, "bundle", "new", "--template", ""]);
    expect(withOverride).toEqual(["default"]); // the project-targeted bundle template
  });
});

describe("the __complete dispatch derives commands/flags from the commander tree", () => {
  it("completes top-level group names (so new leaves auto-appear as they are added)", () => {
    const deps = seededDeps();
    const groups = complete(deps, [""]);
    expect(groups).toEqual(
      expect.arrayContaining(["init", "template", "project", "bundle", "build", "completion"]),
    );
    // a prefix narrows:
    expect(complete(deps, ["b"]).sort()).toEqual(["build", "bundle"]);
  });

  it("completes a group's subcommands (`bundle <tab>` → its leaves)", () => {
    const deps = seededDeps();
    expect(complete(deps, ["bundle", ""])).toEqual(expect.arrayContaining(["new"]));
  });

  it("the hidden __complete command runs end-to-end via run() and prints suggestions", async () => {
    const { run } = await import("../../../src/cli.js");
    const deps = seededDeps();
    const out = {
      text: "",
      write(c: string) {
        this.text += c;
      },
    };
    const code = await run(["__complete", "completion", "install", "--shell", ""], deps, {
      out,
      err: { write() {} },
      debug: false,
    });
    expect(code).toBe(0);
    expect(out.text.trim().split("\n").sort()).toEqual(["bash", "fish", "zsh"]);
  });
});

describe("the REAL omelette completion protocol reaches the dispatch (the generated script's callback)", () => {
  // omelette's generated scripts invoke the CLI as `wpm --comp{bash|zsh|fish} --compgen <cword> <prev> <line>`
  // (NOT `__complete`). These tests drive that EXACT invocation shape through run() — the path a real shell
  // exercises on <tab>. omelette reconstructs the line as argv.slice(compgenIndex + 3).join(' '), so the LINE
  // (incl. a trailing space when completing a fresh token) is the args after <cword> <prev>.
  const out = () => ({
    text: "",
    write(c: string) {
      this.text += c;
    },
  });

  it.each([
    ["--compbash", "bash"],
    ["--compzsh", "zsh"],
    ["--compfish", "fish"],
  ])("%s --compgen … completes `wpm completion install --shell ` to the shell enum", async (flag) => {
    const { run } = await import("../../../src/cli.js");
    const deps = seededDeps();
    const o = out();
    // cword/prev are positional metadata; the LINE (trailing space → completing a fresh token) is the payload.
    const code = await run(
      [flag, "--compgen", "4", "--shell", "wpm completion install --shell "],
      deps,
      { out: o, err: { write() {} }, debug: false },
    );
    expect(code).toBe(0);
    expect(o.text.trim().split("\n").sort()).toEqual(["bash", "fish", "zsh"]);
  });

  it("the real protocol completes a state-dependent value (`wpm bundle new --template `)", async () => {
    const { run } = await import("../../../src/cli.js");
    const deps = seededDeps();
    const o = out();
    const code = await run(
      ["--compbash", "--compgen", "4", "--template", "wpm bundle new --template "],
      deps,
      { out: o, err: { write() {} }, debug: false },
    );
    expect(code).toBe(0);
    // built-in bundle templates + the project-local one (bundle-scoped):
    expect(o.text.trim().split("\n").sort()).toEqual([
      "adopts-tool",
      "default",
      "with-payload-skill",
    ]);
  });

  it("the real protocol completes a partial token (no trailing space → prefix-filter)", async () => {
    const { run } = await import("../../../src/cli.js");
    const deps = seededDeps();
    const o = out();
    const code = await run(
      ["--compzsh", "--compgen", "4", "--shell", "wpm completion install --shell f"],
      deps,
      { out: o, err: { write() {} }, debug: false },
    );
    expect(code).toBe(0);
    expect(o.text.trim()).toBe("fish");
  });

  it("the real protocol honours a `-C/--project` override embedded in the completion line", async () => {
    const { run } = await import("../../../src/cli.js");
    // Project at /proj, cwd elsewhere: only the `-C /proj` on the line points completion at it.
    const fs = new MemoryFileSystem();
    fs.write(
      `${ROOT}/wip/manifest.yml`,
      [
        "project:",
        "  name: demo",
        "  version: 1.0.0",
        "targets: []",
        "bundles:",
        "  - core",
        "",
      ].join("\n"),
    );
    fs.write(`${BUILTIN}/bundle/default/template.yml`, "name: default\nscope: bundle\n");
    const deps: CliDeps = {
      fs,
      backlog: new FakeBacklog(),
      clock: new FixedClock("2026-01-01T00:00:00.000Z"),
      env: new FakeEnvironment({ cwd: "/somewhere-else" }),
      builtinTemplatesRoot: BUILTIN,
    };
    const o = out();
    const code = await run(
      ["--compbash", "--compgen", "6", "--template", `wpm -C ${ROOT} bundle new --template `],
      deps,
      { out: o, err: { write() {} }, debug: false },
    );
    expect(code).toBe(0);
    expect(o.text.trim()).toBe("default"); // resolved against the -C project
  });

  it("the generated-script ↔ dispatch loop CLOSES: the invocation in each shell's real script reaches completeArgv", async () => {
    const { run } = await import("../../../src/cli.js");
    // Extract the actual `wpm --comp… --compgen …` callback line from each generated script, then synthesize a
    // realistic argv for it and assert suggestions come back. This proves the binding contract end-to-end:
    // omelette's generated script → the CLI → completeArgv.
    for (const shell of ["bash", "zsh", "fish"] as const) {
      const script = generateScript(shell);
      // Each generated script contains a `wpm --comp<shell> --compgen …` invocation:
      const flag = shell === "bash" ? "--compbash" : shell === "fish" ? "--compfish" : "--compzsh";
      expect(script).toContain(`wpm ${flag} --compgen`);

      const deps = seededDeps();
      const o = out();
      // Synthesize the call the script would make for `wpm completion install --shell <tab>`:
      const code = await run(
        [flag, "--compgen", "4", "--shell", "wpm completion install --shell "],
        deps,
        { out: o, err: { write() {} }, debug: false },
      );
      expect(code, `dispatch must run for ${shell}`).toBe(0);
      expect(o.text.trim().split("\n").sort(), `suggestions must come back for ${shell}`).toEqual([
        "bash",
        "fish",
        "zsh",
      ]);
    }
  });
});
