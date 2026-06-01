#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { BacklogCli } from "./adapters/backlog-cli.js";
import { NodeFileSystem } from "./adapters/node-fs.js";
import { ProcessEnvironment } from "./adapters/process-env.js";
import { SystemClock } from "./adapters/system-clock.js";
import { NotFoundError, UsageError } from "./core/errors.js";
import { RESERVED_BUNDLE_VERBS } from "./core/model/index.js";
import { createBundleSpec } from "./core/operations/create-bundle.js";
import { makeArtefactDeriver } from "./core/operations/derive-artefacts-capability.js";
import { runMutation } from "./core/operations/lifecycle.js";
import type { BacklogMd, Clock, Environment, FileSystem } from "./core/ports/index.js";
import { resolveContext } from "./core/services/context.js";
import { withExamples } from "./help/examples.js";
import { type CliIo, runWithExit } from "./util/exit.js";
import { VERSION } from "./version.js";

export type { CliIo, OutputSink } from "./util/exit.js";

/**
 * The CLI composition root (doc 12 line 73: "entry point: argv → commander dispatch → exit code"). This is
 * the IMPURE SHELL — the first module outside `src/core/` — so it freely imports commander, the real adapters,
 * and (in its tail) `node:process`. The import-boundary rule is scoped to `src/core/**`; this file is the
 * sanctioned place those effects live (doc 13 §1/§6). It assembles the real ports ONCE, injects them into the
 * commands through one registration pattern, and routes every outcome through the single error handler in
 * `src/util/exit.ts`. Output formatting (an `OperationResult` → human text) lives here, never in the core
 * (output is not a port — doc 13 §3).
 */

/**
 * The dependencies every command receives (doc 12 §"Layered architecture": DI). The four ports plus the
 * built-in templates root the operations resolve templates against — assembled once at the entry point.
 */
export interface CliDeps {
  /** The filesystem port (real `NodeFileSystem` in production). */
  readonly fs: FileSystem;
  /** The Backlog.md port (real `BacklogCli` in production). */
  readonly backlog: BacklogMd;
  /** The clock port (real `SystemClock` in production). */
  readonly clock: Clock;
  /** The environment port (real `ProcessEnvironment` in production). */
  readonly env: Environment;
  /** The built-in templates root shipped with the package (project-local templates shadow these). */
  readonly builtinTemplatesRoot: string;
}

/** The context handed to each command module's `register`: the injected deps + the I/O bundle. */
export interface CommandContext {
  /** The assembled dependencies. */
  readonly deps: CliDeps;
  /** The output sinks + debug flag. */
  readonly io: CliIo;
}

/**
 * The one registration pattern (AC#1): a command (or group) module exposes `register`, which attaches itself
 * to a parent commander {@link Command} using the injected {@link CommandContext}. Every group below — and
 * every leaf tasks 34–84 add — follows this shape, so dispatch and DI are uniform across the whole tree.
 */
export interface CommandModule {
  /** Attach this command/group to `parent`, wiring its action(s) to the injected context. */
  register(parent: Command, ctx: CommandContext): void;
}

/** Format an {@link OperationResult}-shaped outcome into concise human text (output lives here, not in core). */
function formatResult(result: {
  summary: string;
  changedPaths: readonly string[];
  materialisedTaskTitles: readonly string[];
}): string {
  const lines = [result.summary];
  if (result.changedPaths.length > 0) {
    lines.push(`changed: ${result.changedPaths.length} path(s)`);
  }
  if (result.materialisedTaskTitles.length > 0) {
    lines.push(`materialised: ${result.materialisedTaskTitles.length} authoring task(s)`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The `bundle` group module — and the ONE proof-of-concept leaf for task-27, `bundle new <id>`, which
 * exercises the whole path (DI → resolveContext → runMutation → format → exit). The group's other leaves are
 * later tasks (34+); only `bundle new` is wired here, since its operation already exists (task-26).
 */
const bundleModule: CommandModule = {
  register(parent, ctx) {
    const group = parent
      .command("bundle")
      .description("the author's primary working unit (doc 10)");

    const newLeaf = group
      .command("new")
      .description("create a bundle directory and enable it in the manifest (doc 10)")
      // Declare the positional via `.argument` (NOT in the command string) so it appears in the usage line AND
      // carries a help description stating its meaning (doc 10 discoverability: "every positional argument with
      // its meaning"). Declaring it in both places would register `<id>` twice.
      .argument("<id>", "the new bundle's id (kebab-case; not a reserved cross-bundle verb)")
      .option("-v, --version <version>", "the bundle's initial version", "0.1.0")
      .option("--disabled", "create the bundle without enabling it in the manifest")
      .option("--no-advisor", "skip the auto-scaffolded advisor")
      .action(
        async (id: string, opts: { version?: string; disabled?: boolean; advisor?: boolean }) => {
          // AC#4: a reserved cross-bundle verb as an id would make `bundle <id> …` ambiguous. This is pure CLI
          // grammar — it needs no project — so it fires FIRST, BEFORE context resolution, ensuring a bad
          // argument is a USAGE error (exit 2) regardless of whether a project exists (doc 13 §7). The verb
          // list is the model's single source (`RESERVED_BUNDLE_VERBS`, the same set the operation's
          // `parseBundleId` enforces as an exit-1 ValidationError for defense-in-depth).
          if (RESERVED_BUNDLE_VERBS.includes(id)) {
            throw new UsageError(
              `bundle id '${id}' is a reserved command verb (${RESERVED_BUNDLE_VERBS.join(", ")}) — pick another id`,
            );
          }

          const projectOverride = parent.opts().project as string | undefined;
          const context = resolveContext(
            { fs: ctx.deps.fs, env: ctx.deps.env },
            projectOverride !== undefined ? { projectOverride } : undefined,
          );
          if (!context.found) {
            throw new NotFoundError(
              "no manifest.yml found in the working directory or any parent — run `wpm init <project-name>` to create a project, or pass `-C <path>` to target one elsewhere",
            );
          }
          const root = context.root;

          const result = runMutation(
            {
              fs: ctx.deps.fs,
              backlog: ctx.deps.backlog,
              deriveArtefacts: makeArtefactDeriver({
                fs: ctx.deps.fs,
                builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot,
                projectTemplatesRoot: join(root, "templates"),
              }),
            },
            { root },
            createBundleSpec({ builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot }),
            { id, version: opts.version, disabled: opts.disabled, advisor: opts.advisor },
          );
          ctx.io.out.write(formatResult(result));
        },
      );

    // A worked example — the one piece of doc-10's contract commander does not auto-render (doc 10: "a worked
    // usage example where the flag set is non-trivial"). `bundle new` has a non-trivial flag set, so it carries
    // one; every later leaf (tasks 34–84) with options/args attaches one the same way via `withExamples`.
    withExamples(newLeaf, [
      {
        command: "wpm bundle new web-handoff --version 0.2.0",
        note: "create web-handoff pinned to 0.2.0",
      },
    ]);
  },
};

/** Build a group module that only declares a group + description (its leaves are later tasks). */
function groupOnly(name: string, description: string): CommandModule {
  return {
    register(parent) {
      parent.command(name).description(description);
    },
  };
}

/** The doc-10 top-level groups, registered through the one pattern (AC#1). */
const TOP_LEVEL_MODULES: readonly CommandModule[] = [
  groupOnly("init", "scaffold a new project root (doc 10)"),
  groupOnly("template", "the templates available to instantiate from (doc 10)"),
  groupOnly("project", "the project as a release unit (doc 10)"),
  bundleModule,
  groupOnly("build", "package the project for distribution (doc 10)"),
];

/**
 * Build the commander program (AC#1/AC#3): configure `exitOverride` (so commander throws instead of exiting),
 * route commander's output through the I/O sinks, register the global flags, and attach every top-level group
 * via the one registration pattern. Pure of process side effects — returns the program so tests can
 * `parseAsync`.
 *
 * @param deps - The assembled dependencies.
 * @param io - The output sinks + debug flag.
 * @returns The configured commander {@link Command}.
 */
export function buildProgram(deps: CliDeps, io: CliIo): Command {
  const program = new Command();
  program
    .name("wpm")
    .description("the work-package-manager authoring CLI (doc 10)")
    .version(VERSION, "-V, --version", "print the version")
    .option(
      "-C, --project <path>",
      "operate on the project at <path> (overrides the upward search)",
    )
    .option("--debug", "show diagnostic detail (stack traces) for unexpected errors");
  program.exitOverride();
  program.configureOutput({
    writeOut: (s) => io.out.write(s),
    writeErr: (s) => io.err.write(s),
    outputError: (s, _write) => io.err.write(s),
  });
  program.showHelpAfterError();

  const ctx: CommandContext = { deps, io };
  for (const module of TOP_LEVEL_MODULES) {
    module.register(program, ctx);
  }
  return program;
}

/**
 * Parse `argv` and dispatch, returning the process exit code (doc 12 line 73). The testable entry point: it
 * builds the program and runs it inside the single error handler ({@link runWithExit}), never touching the
 * process. Both `--debug` and `WPM_DEBUG` enable debug detail; the resolved flag is threaded into the I/O
 * bundle before parsing (so an error during parse is still formatted per the debug setting).
 *
 * @param argv - The user arguments (excluding `node` and the script path).
 * @param deps - The assembled dependencies.
 * @param io - The output sinks + debug flag.
 * @returns The process exit code.
 */
export async function run(argv: readonly string[], deps: CliDeps, io: CliIo): Promise<number> {
  return runWithExit(io, async () => {
    const program = buildProgram(deps, io);
    await program.parseAsync(argv, { from: "user" });
  });
}

/** Assemble the REAL ports exactly once (doc 12 §"Layered architecture": DI at the entry point). */
function makeRealDeps(): CliDeps {
  const builtinTemplatesRoot = fileURLToPath(new URL("../templates", import.meta.url));
  return {
    fs: new NodeFileSystem(),
    backlog: new BacklogCli(),
    clock: new SystemClock(),
    env: new ProcessEnvironment(),
    builtinTemplatesRoot,
  };
}

/**
 * Whether this module is being executed directly as the program entry point (as opposed to imported, e.g. by
 * a test). The naive `import.meta.url === file://${process.argv[1]}` check breaks when invoked through a `bin`
 * symlink (`installer`/`wpm` on `PATH`): `process.argv[1]` is the symlink path while `import.meta.url` is the
 * resolved real path, so they never match. Comparing the *realpath* of both sides fixes that. Using
 * `node:fs`/`node:url` here is fine — this is the driving adapter / composition root (doc 13 §6).
 */
function isMainModule(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

/**
 * Process entry point: assemble the real deps + I/O from `process`, run the CLI, and exit with the resulting
 * code. Gated on {@link isMainModule} so importing this module from a test does not trigger the side effect.
 * This impure tail is the only part of `cli.ts` that touches the process.
 */
if (isMainModule()) {
  const deps = makeRealDeps();
  const debug = process.argv.includes("--debug") || deps.env.getEnv("WPM_DEBUG") !== undefined;
  const io: CliIo = {
    out: { write: (s) => process.stdout.write(s) },
    err: { write: (s) => process.stderr.write(s) },
    debug,
  };
  void run(process.argv.slice(2), deps, io).then((code) => process.exit(code));
}
