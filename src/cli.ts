#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, Option } from "commander";
import { BacklogCli } from "./adapters/backlog-cli.js";
import { NodeFileSystem } from "./adapters/node-fs.js";
import { ProcessEnvironment } from "./adapters/process-env.js";
import { SystemClock } from "./adapters/system-clock.js";
import { type CompletionSpecs, completeArgv } from "./completion/complete.js";
import { defaultRegistry } from "./completion/registry.js";
import { NotFoundError, UsageError } from "./core/errors.js";
import {
  type AgentName,
  parseAgentName,
  RESERVED_BUNDLE_VERBS,
  type Template,
  type TemplateScope,
} from "./core/model/index.js";
import { createBundleSpec } from "./core/operations/create-bundle.js";
import { makeArtefactDeriver } from "./core/operations/derive-artefacts-capability.js";
import { initProject } from "./core/operations/init-project.js";
import { type LifecycleDeps, runMutation, runRead } from "./core/operations/lifecycle.js";
import { addTargetSpec, listTargetsSpec, removeTargetSpec } from "./core/operations/targets.js";
import type { BacklogMd, Clock, Environment, FileSystem } from "./core/ports/index.js";
import { resolveContext } from "./core/services/context.js";
import {
  listTemplates,
  resolveTemplate,
  type TemplateSummary,
} from "./core/services/template-resolver.js";
import { withExamples } from "./help/examples.js";
import { installCompletion, type Shell } from "./util/completion-install.js";
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

/** The canonical "no project resolved" message — shared by every project-bound command (doc 13 §7). */
const NO_PROJECT_MESSAGE =
  "no manifest.yml found in the working directory or any parent — run `wpm init <project-name>` to create a project, or pass `-C <path>` to target one elsewhere";

/**
 * Resolve the project root a project-BOUND command operates on, or raise the canonical {@link NotFoundError}
 * (exit 1) when none resolves. Honours the global `-C/--project` override. The shared entry point every
 * project-bound leaf (and the 7 list-management families) calls before `runMutation`/`runRead`.
 *
 * @param ctx - The command context (ports).
 * @param parent - The command's parent (for the global `-C` flag).
 * @returns The absolute project root.
 * @throws {NotFoundError} When no project is resolved.
 */
function requireProject(ctx: CommandContext, parent: Command): string {
  const projectOverride = parent.opts().project as string | undefined;
  const context = resolveContext(
    { fs: ctx.deps.fs, env: ctx.deps.env },
    projectOverride !== undefined ? { projectOverride } : undefined,
  );
  if (!context.found) {
    throw new NotFoundError(NO_PROJECT_MESSAGE);
  }
  return context.root;
}

/** Build the task-25 {@link LifecycleDeps} for a mutation rooted at `root` (the deriver wired as in `bundle new`). */
function lifecycleDepsFor(ctx: CommandContext, root: string): LifecycleDeps {
  return {
    fs: ctx.deps.fs,
    backlog: ctx.deps.backlog,
    deriveArtefacts: makeArtefactDeriver({
      fs: ctx.deps.fs,
      builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot,
      projectTemplatesRoot: join(root, "templates"),
    }),
  };
}

/** Print any non-fatal warnings on an operation result to stderr (each `warning: …`), keeping the exit 0. */
function writeWarnings(ctx: CommandContext, warnings: readonly string[] | undefined): void {
  for (const warning of warnings ?? []) {
    ctx.io.err.write(`warning: ${warning}\n`);
  }
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
      .option("--template <name>", "the bundle template to scaffold from (doc 10)")
      .option("-v, --version <version>", "the bundle's initial version", "0.1.0")
      .option("--disabled", "create the bundle without enabling it in the manifest")
      .option("--no-advisor", "skip the auto-scaffolded advisor")
      .action(
        async (
          id: string,
          opts: {
            template?: string;
            version?: string;
            disabled?: boolean;
            advisor?: boolean;
          },
        ) => {
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
            createBundleSpec({
              builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot,
              ...(opts.template !== undefined ? { bundleTemplateName: opts.template } : {}),
            }),
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

/**
 * The `init <name>` command — the WALKING SKELETON's command surface (task-33; doc 10 §`init`). init is the
 * BOOTSTRAP: it CREATES a project, so its action does NOT resolve an existing one (no `resolveContext`) — it
 * resolves the TARGET DIR (where to write) and calls the {@link initProject} operation. The project root is
 * `--at <path>` when given, else `<cwd>/<name>` (doc 10 line 194: "init writes to `<path>` if `--at <path>` is
 * given (default cwd)"; doc 12's worked example `wpm init my-installer` then `cd my-installer` shows the
 * default-cwd case nests the project under `<name>`).
 */
const initModule: CommandModule = {
  register(parent, ctx) {
    const leaf = parent
      .command("init")
      .description("scaffold a new project root from the minimal template (doc 10)")
      .argument(
        "<name>",
        "the new project's name (kebab-case; becomes the manifest name and the installer-skill name)",
      )
      .option(
        "--at <path>",
        "create the project at <path> (default: a <name>/ directory in the cwd)",
      )
      .action((name: string, opts: { at?: string }) => {
        // Resolve the target dir: --at <path> (resolved against cwd) when given, else <cwd>/<name>.
        const cwd = ctx.deps.env.cwd();
        const targetDir = opts.at !== undefined ? resolve(cwd, opts.at) : join(cwd, name);

        const result = initProject(
          {
            fs: ctx.deps.fs,
            backlog: ctx.deps.backlog,
            builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot,
          },
          { targetDir, name },
        );
        ctx.io.out.write(formatResult(result));
      });

    withExamples(leaf, [
      {
        command: "wpm init hermes-handoff --at ./my-installer",
        note: "scaffold a project at ./my-installer",
      },
    ]);
  },
};

/** The two template scopes, for the `--scope` choices + validation. */
const TEMPLATE_SCOPES: readonly TemplateScope[] = ["project", "bundle"];

/**
 * Resolve the project-local templates root for a project-AWARE command (`template list`/`show`): walk up for a
 * `manifest.yml` (honouring the global `-C/--project`), and return `<root>/templates` when a project resolves —
 * or `undefined` when none does. Unlike a project-BOUND command, a missing project is NOT an error here: the
 * caller falls back to built-ins only (doc 10 §"Project context resolution": "`template list`/`show` fall back
 * to built-ins only when no project is resolved").
 */
function resolveProjectTemplatesRoot(ctx: CommandContext, parent: Command): string | undefined {
  const projectOverride = parent.opts().project as string | undefined;
  const context = resolveContext(
    { fs: ctx.deps.fs, env: ctx.deps.env },
    projectOverride !== undefined ? { projectOverride } : undefined,
  );
  return context.found ? join(context.root, "templates") : undefined;
}

/** Render the `template list` output: built-in + project-local templates grouped by source, with shadowing. */
function formatTemplateList(
  builtins: readonly TemplateSummary[],
  projectLocals: readonly TemplateSummary[],
): string {
  const key = (s: TemplateSummary): string => `${s.scope}/${s.name}`;
  const projectKeys = new Set(projectLocals.map(key));
  const builtinKeys = new Set(builtins.map(key));
  const lines: string[] = [];

  if (projectLocals.length > 0) {
    lines.push("Project templates (./templates):");
    for (const s of projectLocals) {
      const shadows = builtinKeys.has(key(s)) ? "  (shadows built-in)" : "";
      lines.push(`  ${key(s)}${shadows}`);
    }
  }
  lines.push("Built-in templates:");
  if (builtins.length === 0) {
    lines.push("  (none)");
  }
  for (const s of builtins) {
    const shadowed = projectKeys.has(key(s)) ? "  (shadowed by project-local)" : "";
    lines.push(`  ${key(s)}${shadowed}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Render the `template show` output: the template's metadata + a tree summary of its `files/`. */
function formatTemplateShow(template: Template, source: "built-in" | "project-local"): string {
  const lines: string[] = [
    `Template: ${template.name}  (scope: ${template.scope}, source: ${source})`,
  ];
  // The top-level description (doc-10 "print metadata"), only when the template.yml declares one.
  if (template.description !== undefined) {
    lines.push(`Description: ${template.description}`);
  }
  if (template.parameters.length > 0) {
    lines.push("Parameters:");
    for (const p of template.parameters) {
      const desc = p.description !== undefined ? `  ${p.description}` : "";
      const def = p.default !== undefined ? ` (default: ${p.default})` : "";
      lines.push(`  ${p.name}${desc}${def}`);
    }
  }
  lines.push("Files:");
  if (template.files.length === 0) {
    lines.push("  (none)");
  }
  for (const f of [...template.files].map((f) => f.path).sort()) {
    lines.push(`  ${f}`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The `template` group module (doc 10 rows `template list` / `template show`) — two READ-only, project-AWARE
 * leaves that reuse the existing two-tier resolver services (`listTemplates` / `resolveTemplate`) and never
 * mutate. Output formatting lives here in the shell (output is not a port — doc 13 §3).
 */
const templateModule: CommandModule = {
  register(parent, ctx) {
    const group = parent
      .command("template")
      .description("the templates available to instantiate from (doc 10)");

    // ── template list [--scope project|bundle] ──────────────────────────────────────────────────────────
    const listLeaf = group
      .command("list")
      .description(
        "list the available templates (built-in + project-local), indicating shadowing (doc 10)",
      )
      .addOption(
        new Option("--scope <scope>", "filter to templates of this scope").choices([
          ...TEMPLATE_SCOPES,
        ]),
      )
      .action((opts: { scope?: TemplateScope }) => {
        const projectTemplatesRoot = resolveProjectTemplatesRoot(ctx, parent);
        const filter = opts.scope !== undefined ? { scope: opts.scope } : undefined;
        // Per-source listing (reusing `listTemplates`) so shadowing is visible: built-ins, then — when a
        // project resolved — its templates/ (passing the project root AS the builtin root; `listTemplates`
        // just enumerates a root's `<scope>/` dirs).
        const builtins = listTemplates(
          { fs: ctx.deps.fs, builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot },
          filter,
        );
        const projectLocals =
          projectTemplatesRoot !== undefined
            ? listTemplates({ fs: ctx.deps.fs, builtinTemplatesRoot: projectTemplatesRoot }, filter)
            : [];
        ctx.io.out.write(formatTemplateList(builtins, projectLocals));
      });
    withExamples(listLeaf, [
      { command: "wpm template list --scope bundle", note: "list only the bundle templates" },
    ]);

    // ── template show <name> [--scope project|bundle] ───────────────────────────────────────────────────
    const showLeaf = group
      .command("show")
      .description("print a template's metadata and a tree summary of its files (doc 10)")
      .argument("<name>", "the template name to inspect")
      .addOption(
        new Option("--scope <scope>", "disambiguate a project-vs-bundle name clash").choices([
          ...TEMPLATE_SCOPES,
        ]),
      )
      .action((name: string, opts: { scope?: TemplateScope }) => {
        const projectTemplatesRoot = resolveProjectTemplatesRoot(ctx, parent);
        const resolverDeps = {
          fs: ctx.deps.fs,
          builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot,
          ...(projectTemplatesRoot !== undefined ? { projectTemplatesRoot } : {}),
        };

        // The scopes to try: the one `--scope` names, else both (project then bundle).
        const scopes: TemplateScope[] =
          opts.scope !== undefined ? [opts.scope] : [...TEMPLATE_SCOPES];
        const matches = scopes.filter((s) => resolveTemplate(name, s, resolverDeps).found);

        if (matches.length === 0) {
          const searched = scopes
            .map((s) => {
              const r = resolveTemplate(name, s, resolverDeps);
              return r.found ? "" : r.searched.join(", ");
            })
            .filter((s) => s.length > 0)
            .join("; ");
          throw new NotFoundError(`template "${name}" not found (searched: ${searched})`);
        }
        if (matches.length > 1) {
          // The name exists at both scopes and no `--scope` was given — ask the author to disambiguate.
          throw new UsageError(
            `template "${name}" exists as both a project and a bundle template — pass --scope project|bundle`,
          );
        }

        const scope = matches[0] as TemplateScope;
        const resolution = resolveTemplate(name, scope, resolverDeps);
        // (resolution.found is true — `scope` came from `matches`.)
        if (!resolution.found) {
          throw new NotFoundError(`template "${name}" not found`);
        }
        // The source is project-local iff a project-only resolution finds it (else built-in).
        const source: "built-in" | "project-local" =
          projectTemplatesRoot !== undefined &&
          resolveTemplate(name, scope, {
            fs: ctx.deps.fs,
            builtinTemplatesRoot: projectTemplatesRoot,
          }).found
            ? "project-local"
            : "built-in";
        ctx.io.out.write(formatTemplateShow(resolution.template, source));
      });
    withExamples(showLeaf, [
      {
        command: "wpm template show minimal --scope project",
        note: "inspect the minimal project template",
      },
    ]);
  },
};

/** Parse + validate a `<agent>` positional into an {@link AgentName}, raising a UsageError on a malformed name. */
function requireAgent(raw: string): AgentName {
  const parsed = parseAgentName(raw);
  if (!parsed.ok) {
    throw new UsageError(parsed.problem.message);
  }
  return parsed.value;
}

/**
 * The `project` group module (doc 10 §`project`) — wiring the `targets` subgroup's `add`/`list`/`remove` leaves
 * (tasks 42–44), the LIST-MANAGEMENT EXEMPLAR. These are project-BOUND: each resolves the project via
 * {@link requireProject} (the canonical no-project error) before running. `add`/`remove` ride `runMutation`
 * (so ④ rerender + ⑤ materialise are automatic); `list` rides `runRead`. Non-fatal warnings on the result are
 * printed to stderr ({@link writeWarnings}) and do not change the exit code. The other `project` subcommands
 * (`show`/`meta`/`version`/`installer-skills`/`validate`/`root`) are later tasks.
 */
const projectModule: CommandModule = {
  register(parent, ctx) {
    const group = parent.command("project").description("the project as a release unit (doc 10)");
    const targets = group
      .command("targets")
      .description("the agents this installer supports (doc 10)");

    // ── project targets add <agent> ─────────────────────────────────────────────────────────────────────
    const addLeaf = targets
      .command("add")
      .description("start supporting an agent: record it + create its scope-alias (doc 10)")
      .argument("<agent>", "the target agent to start supporting (e.g. claude-code)")
      .action((agentRaw: string) => {
        const root = requireProject(ctx, parent);
        const agent = requireAgent(agentRaw);
        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, addTargetSpec(), {
          agent,
        });
        ctx.io.out.write(formatResult(result));
        writeWarnings(ctx, result.warnings);
      });
    withExamples(addLeaf, [
      { command: "wpm project targets add claude-code", note: "start supporting Claude Code" },
    ]);

    // ── project targets list ────────────────────────────────────────────────────────────────────────────
    const listLeaf = targets
      .command("list")
      .description("list the agents this installer supports (doc 10)")
      .action(() => {
        const root = requireProject(ctx, parent);
        const { value } = runRead(ctx.deps.fs, { root }, listTargetsSpec(), undefined);
        const body =
          value.length > 0 ? value.map((t) => `  ${t}`).join("\n") : "  (no targets yet)";
        ctx.io.out.write(`Targets:\n${body}\n`);
      });
    withExamples(listLeaf, [
      { command: "wpm project targets list", note: "show the supported agents" },
    ]);

    // ── project targets remove <agent> ──────────────────────────────────────────────────────────────────
    const removeLeaf = targets
      .command("remove")
      .description("stop supporting an agent: remove it + delete its scope-alias (doc 10)")
      .argument("<agent>", "the target agent to stop supporting")
      .action((agentRaw: string) => {
        const root = requireProject(ctx, parent);
        const agent = requireAgent(agentRaw);
        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, removeTargetSpec(), {
          agent,
        });
        ctx.io.out.write(formatResult(result));
        writeWarnings(ctx, result.warnings);
      });
    withExamples(removeLeaf, [
      { command: "wpm project targets remove hermes", note: "stop supporting Hermes" },
    ]);
  },
};

/**
 * The per-command completion declarations (task-29 AC#2/AC#3): which named source completes each option's value
 * or positional. The dispatch ({@link completeArgv}) reads this side-table by command path. A later leaf
 * (tasks 34–84) adds a completion by adding an entry here referencing a source NAME — no change to the
 * completion plumbing. The one wired today is the worked proof: `bundle new --template` → `"template-names"`,
 * and `bundle new <id>` declares NO source (a brand-new id yields no suggestions, doc 10).
 */
const COMPLETION_SPECS: CompletionSpecs = {
  init: {
    args: [undefined], // <name> — a brand-new project name, no suggestions (doc 10)
  },
  "template list": {
    options: { "--scope": "template-scopes" },
  },
  "template show": {
    options: { "--scope": "template-scopes" },
    args: ["template-names"], // <name> — completes from the available template names
  },
  "project targets add": {
    args: ["target-names"], // <agent> — the built-in well-known agents (for `add`)
  },
  "project targets remove": {
    args: ["installed-target-names"], // <agent> — the project's current targets (for `remove`)
  },
  "bundle new": {
    // `--template` takes a BUNDLE template (a project template can't scaffold a bundle), so it completes from
    // the scope-filtered `bundle-template-names` source — the worked proof of a state-dependent completion.
    options: { "--template": "bundle-template-names" },
    args: [undefined], // <id> — a new id, no suggestions
  },
  "completion install": {
    options: { "--shell": "shells" },
  },
};

/**
 * The `completion` group module + its `install` leaf (AC#1; doc 12 line 196: "installed via `wpm completion
 * install`"). `install` emits the omelette-generated completion script and ensures the shell init file sources
 * it, through the FileSystem port (`src/util/completion-install.ts`) — no `process.exit`. `--shell` completes
 * from the `"shells"` fixed-enum source (dogfooding AC#2).
 */
const completionModule: CommandModule = {
  register(parent, ctx) {
    const group = parent.command("completion").description("shell tab-completion (doc 12)");

    const installLeaf = group
      .command("install")
      .description("install shell tab-completion for the current or chosen shell (doc 12)")
      .option("--shell <shell>", "the shell to install for (bash|zsh|fish); default: $SHELL")
      .action((opts: { shell?: string }) => {
        const shell = resolveShell(opts.shell, ctx.deps.env.getEnv("SHELL"));
        const result = installCompletion({ fs: ctx.deps.fs, env: ctx.deps.env }, shell);
        const verb = result.added ? "installed" : "already installed";
        ctx.io.out.write(
          `completion ${verb} for ${result.shell}: wrote ${result.scriptPath}; sourced from ${result.initFile}\n`,
        );
      });

    withExamples(installLeaf, [
      { command: "wpm completion install --shell bash", note: "install bash completion" },
    ]);
  },
};

/** An internal alias the CLI also accepts for completion (a stable, shell-agnostic entry point for tooling). */
const COMPLETE_COMMAND = "__complete";

/**
 * omelette's completion-callback flag set. The completion scripts `completion install` writes
 * (`generateCompletionCode` / `generateCompletionCodeFish`) invoke the CLI as
 * `wpm --comp<shell> --compgen <cword> <prev> <line>` — these are omelette's OWN protocol, NOT `__complete`.
 * Examples straight from omelette 0.4.17's generated scripts:
 *   bash  (`complete -F`):   `wpm --compbash --compgen "$((COMP_CWORD - …))" "$prev" "${COMP_LINE}"`
 *   zsh   (`compdef`):       `wpm --compzsh --compgen "${CURRENT}" "${words[CURRENT-1]}" "${BUFFER}"`
 *   fish:                    `wpm --compfish --compgen (count …) (commandline -pt) (commandline -pb)`
 * So a real shell never calls `__complete`; it calls one of these. We intercept them and route to the dispatch.
 */
const COMP_SHELL_FLAGS = ["--compbash", "--compzsh", "--compfish"] as const;
/** omelette's "generate completions for this line" marker; the args after it are `<cword> <prev> <line…>`. */
const COMPGEN_FLAG = "--compgen";

/**
 * Emit tab-completion suggestions for a list of completion words (the last is the partial being completed), by
 * running {@link completeArgv} over a freshly-built program tree + the named-source registry and printing one
 * suggestion per line (the newline-separated format omelette's bash `compgen -W`, zsh `compadd`/`reply`, and
 * fish `complete -a` all consume). Always succeeds; a failing source is contained inside the registry.
 *
 * @param words - The completion words (tokens after the program name; the last is the partial).
 * @param deps - The assembled dependencies.
 * @param io - The output sinks.
 */
function emitCompletions(words: readonly string[], deps: CliDeps, io: CliIo): void {
  const program = buildProgram(deps, io);
  const suggestions = completeArgv(program, words, {
    fs: deps.fs,
    env: deps.env,
    builtinTemplatesRoot: deps.builtinTemplatesRoot,
    registry: defaultRegistry(),
    specs: COMPLETION_SPECS,
  });
  if (suggestions.length > 0) {
    io.out.write(`${suggestions.join("\n")}\n`);
  }
}

/**
 * Reconstruct the completion `words` from an omelette `--compgen` invocation. omelette builds the line as
 * `argv.slice(compgenIndex + 3).join(' ')` — i.e. it skips `<cword> <prev>` and joins the rest as the raw line
 * buffer (e.g. `"wpm bundle new --template "`). We mirror that exactly, then split the line into tokens AFTER
 * the leading program name. A line ending in whitespace means the user is completing a FRESH token, so the
 * reconstructed words end in `""` (the empty partial) — which is what {@link completeArgv}'s prefix + positional
 * logic expects (the same shape the explicit `__complete` words use).
 *
 * @param argv - The full user argv (containing `--compgen <cword> <prev> <line…>`).
 * @returns The completion words (tokens after the program name; last is the partial), or `[]` if malformed.
 */
function wordsFromCompgen(argv: readonly string[]): string[] {
  const compgenIndex = argv.indexOf(COMPGEN_FLAG);
  if (compgenIndex < 0) {
    return [];
  }
  // omelette: line = argv.slice(compgenIndex + 3).join(' ')  (skip <cword> and <prev>).
  const line = argv.slice(compgenIndex + 3).join(" ");
  const trailingSpace = /\s$/.test(line);
  // Drop the leading program token (`wpm`/`installer`); keep the rest as the typed tokens.
  const tokens = line
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  const afterProgram = tokens.slice(1);
  // A trailing space means a fresh, empty partial is being completed → append "".
  return trailingSpace ? [...afterProgram, ""] : afterProgram;
}

/** Whether `argv` is an omelette completion callback (carries `--compgen`, or a `--comp<shell>` flag). */
function isCompletionCallback(argv: readonly string[]): boolean {
  return argv.includes(COMPGEN_FLAG) || COMP_SHELL_FLAGS.some((flag) => argv.includes(flag));
}

/** Resolve the target shell from an explicit `--shell` value or the `$SHELL` env var; a usage error otherwise. */
function resolveShell(explicit: string | undefined, shellEnv: string | undefined): Shell {
  const candidate = explicit ?? detectShell(shellEnv);
  if (candidate === "bash" || candidate === "zsh" || candidate === "fish") {
    return candidate;
  }
  throw new UsageError(
    `unsupported or undetected shell${candidate !== undefined ? ` '${candidate}'` : ""} — pass --shell bash|zsh|fish`,
  );
}

/** Best-effort shell detection from a `$SHELL` path (e.g. `/bin/zsh` → `zsh`). */
function detectShell(shellEnv: string | undefined): string | undefined {
  if (shellEnv === undefined) return undefined;
  if (shellEnv.includes("bash")) return "bash";
  if (shellEnv.includes("zsh")) return "zsh";
  if (shellEnv.includes("fish")) return "fish";
  return undefined;
}

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
  initModule,
  templateModule,
  projectModule,
  bundleModule,
  groupOnly("build", "package the project for distribution (doc 10)"),
  completionModule,
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
  // Completion callbacks are intercepted BEFORE commander, because a completion line carries arbitrary
  // `--flags`/partials that must reach the dispatch verbatim instead of being parsed as `wpm` options (which
  // would be a usage error). A completion request arrives in one of two shapes; both route to `emitCompletions`
  // and always succeed (exit 0):
  //   1. omelette's REAL protocol — `wpm --comp<shell> --compgen <cword> <prev> <line>` — emitted by the
  //      scripts `completion install` writes. This is what a real shell invokes on <tab>; the line is
  //      reconstructed exactly as omelette does (`argv.slice(compgenIndex + 3).join(' ')`).
  //   2. the internal `__complete <words…>` alias (a stable, shell-agnostic entry point for tooling/tests).
  if (isCompletionCallback(argv)) {
    return runWithExit(io, async () => {
      emitCompletions(wordsFromCompgen(argv), deps, io);
    });
  }
  if (argv.length > 0 && argv[0] === COMPLETE_COMMAND) {
    return runWithExit(io, async () => {
      emitCompletions(argv.slice(1), deps, io);
    });
  }
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
