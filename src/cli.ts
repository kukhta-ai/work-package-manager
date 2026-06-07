#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Argument, Command, Option } from "commander";
import { BacklogCli } from "./adapters/backlog-cli.js";
import { NodeFileSystem } from "./adapters/node-fs.js";
import { type BuildFormat, createArchive, pushArchive } from "./adapters/packager.js";
import { ProcessEnvironment } from "./adapters/process-env.js";
import { SystemClock } from "./adapters/system-clock.js";
import { type CompletionSpecs, completeArgv } from "./completion/complete.js";
import { BUILD_FORMATS, BUMP_LEVELS, CONFIRMATION_LEVELS } from "./completion/enums.js";
import { defaultRegistry } from "./completion/registry.js";
import { NotFoundError, UsageError, ValidationError } from "./core/errors.js";
import {
  type AgentName,
  type ConfirmationLevel,
  parseAgentName,
  parseSemVer,
  parseVersionRange,
  RESERVED_BUNDLE_VERBS,
  type SemVer,
  type SkillRef,
  type Template,
  type TemplateScope,
} from "./core/model/index.js";
import { advisorSkillDir, advisorSkillPath } from "./core/operations/advisor.js";
import { advisorAddSpec, advisorRemoveSpec } from "./core/operations/advisor-commands.js";
import { type BuildPlan, computeBuildPlan } from "./core/operations/build.js";
import { disableBundleSpec, enableBundleSpec } from "./core/operations/bundle-lifecycle.js";
import {
  type BundleListRow,
  hasKindLabel,
  type KindCounts,
  listBundlesSpec,
} from "./core/operations/bundle-list.js";
import { editBundleMetaSpec } from "./core/operations/bundle-meta.js";
import { type BundleView, showBundleSpec } from "./core/operations/bundle-reads.js";
import {
  isRemovableBundle,
  noSuchBundleError,
  removeBundleSpec,
} from "./core/operations/bundle-remove.js";
import {
  addRequiresSpec,
  listRequiresSpec,
  type RequiresEntry,
  removeRequiresSpec,
} from "./core/operations/bundle-requires.js";
import {
  bumpBundleVersionSpec,
  readBundleVersionSpec,
  setBundleVersionSpec,
} from "./core/operations/bundle-version.js";
import { createBundleSpec } from "./core/operations/create-bundle.js";
import { makeArtefactDeriver } from "./core/operations/derive-artefacts-capability.js";
import { initProject } from "./core/operations/init-project.js";
import {
  attachProjectInstallerSkillSpec,
  conventionalProjectSkillPath,
  isReservedInstallerSkillName,
  removeProjectInstallerSkillSpec,
  scaffoldProjectInstallerSkillSpec,
} from "./core/operations/installer-skills-project.js";
import {
  type LifecycleDeps,
  loadProject,
  runMutation,
  runRead,
} from "./core/operations/lifecycle.js";
import {
  addPayloadRefSpec,
  FILES_DESCRIPTOR,
  listPayloadRefsSpec,
  removePayloadRefSpec,
  SCRIPTS_DESCRIPTOR,
  TEMPLATES_DESCRIPTOR,
} from "./core/operations/payload-refs.js";
import { editProjectMetaSpec } from "./core/operations/project-meta.js";
import {
  type ProjectOrientation,
  showProjectSpec,
  validateProjectSpec,
} from "./core/operations/project-reads.js";
import {
  attachSkillRefSpec,
  BUNDLE_INSTALLER_SKILLS_DESCRIPTOR,
  conventionalSkillPath,
  listSkillRefsSpec,
  PAYLOAD_SKILLS_DESCRIPTOR,
  removeSkillRefSpec,
  scaffoldSkillRefSpec,
  scanInstallerSkillsSpec,
} from "./core/operations/skill-refs.js";
import { addTargetSpec, listTargetsSpec, removeTargetSpec } from "./core/operations/targets.js";
import { bumpVersionSpec, readVersionSpec, setVersionSpec } from "./core/operations/version.js";
import type { BacklogMd, Clock, Environment, FileSystem } from "./core/ports/index.js";
import { resolveContext } from "./core/services/context.js";
import { parseManifest, parseTemplateDescriptor } from "./core/services/schema/index.js";
import {
  listTemplates,
  resolveTemplate,
  type TemplateSummary,
} from "./core/services/template-resolver.js";
import { withExamples } from "./help/examples.js";
import { installCompletion, type Shell } from "./util/completion-install.js";
import { readConfirmation } from "./util/confirm.js";
import { type CliIo, runWithExit } from "./util/exit.js";
import { toPosix } from "./util/posix-path.js";
import { parseYaml } from "./util/yaml.js";
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
 * Format a {@link ProjectOrientation} as the human-readable `project show` block (doc 10 row 140): the identity
 * fields, then the targets and the enabled bundles each on their own line. Output lives in the shell (doc 13 §3);
 * `--json` renders the SAME value via `JSON.stringify` so the two forms cannot diverge.
 */
function formatOrientation(o: ProjectOrientation): string {
  const lines = [`name:        ${o.name}`, `version:     ${o.version}`];
  if (o.description !== undefined) {
    lines.push(`description: ${o.description}`);
  }
  lines.push(`root:        ${o.root}`);
  lines.push(`targets:     ${o.targets.length > 0 ? o.targets.join(", ") : "(none)"}`);
  lines.push("bundles:");
  if (o.bundles.length === 0) {
    lines.push("  (none)");
  }
  for (const b of o.bundles) {
    lines.push(`  ${b.id} ${b.version}${b.summary.length > 0 ? ` — ${b.summary}` : ""}`);
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

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// The per-bundle subcommand space — `bundle <id> <subcommand>` (doc 10 §"per-bundle operations")
//
// `bundle <id>` enters a FRESH subcommand space on a specific bundle (show / meta / version / requires / files /
// templates / scripts / skills / installer-skills / advisor — tasks 57–81). `<id>` is a DYNAMIC enabled-bundle
// id, distinct from the FIXED `bundle` verbs (`new`/`enable`/`disable`/`remove`/`list`/`template`), which is
// disambiguated cleanly because ids are validated to NOT be reserved verbs (task-26/27 `RESERVED_BUNDLE_VERBS`).
//
// ROUTING (validated against commander v15): a hidden variadic default catch-all `bundle.command("* [args...]")`
// with `allowUnknownOption(true)` captures `bundle <id> <tail…>` (commander matches the named verbs FIRST, so
// `bundle new …` is unaffected). Its action resolves the project + the enabled bundle, then forwards the
// post-id tail to a PER-BUNDLE SUB-PROGRAM that parses each leaf NATIVELY (its own options/choices/help). The
// global `-C/--project` is stripped by commander from any position before the variadic args are computed, so
// `-C` placement is untouched (unlike `enablePositionalOptions`, which would break it). Inner CommanderErrors
// (invalid-choice/help/version) propagate through the awaited inner `parseAsync` to the outer `runWithExit`,
// which already maps them (invalid→2, help/version→0); a leaf's `DomainError` → exit 1.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A per-bundle subcommand module — the bundle-`<id>`-space analogue of {@link CommandModule}. A family in the
 * per-bundle space (tasks 57–81) registers its `bundle <id> <sub>` leaf by adding one of these to
 * {@link PER_BUNDLE_MODULES}; the routing builds the sub-program and calls each module's `register` with the
 * already-resolved project root and bundle id, so a leaf never re-resolves them.
 */
interface PerBundleCommandModule {
  /**
   * Attach this leaf (or leaves) to the per-bundle sub-program.
   *
   * @param sub - The per-bundle sub-program (its `name` is `bundle <id>`).
   * @param ctx - The command context (ports + I/O).
   * @param root - The already-resolved project root.
   * @param id - The already-validated enabled bundle id.
   */
  register(sub: Command, ctx: CommandContext, root: string, id: string): void;
}

/** The project marker / manifest filename at the project root (shared by the per-bundle guard). */
const MANIFEST_FILE = "manifest.yml";

/** The project's default bundle-scaffold directory under `bundles/` (doc 10 rows 155/156). */
const BUNDLE_TEMPLATE_DIR = "bundle-template";

/**
 * Resolve the bundle context for a `bundle <id> …` invocation: require `<id>` to be an ENABLED bundle (in
 * `manifest.yml.bundles` with a `bundles/<id>/bundle.yml`), or raise a {@link NotFoundError} (exit 1) BEFORE the
 * per-bundle sub-program parses — so every per-bundle leaf gets the same precise failure for a bad id. Pure over
 * the FileSystem port: reads + parses the manifest and probes the bundle's `bundle.yml`.
 *
 * @param ctx - The command context (ports).
 * @param root - The resolved project root.
 * @param id - The bundle id from the `bundle <id>` routing.
 * @throws {NotFoundError} When `<id>` is not an enabled bundle.
 */
function requireEnabledBundle(ctx: CommandContext, root: string, id: string): void {
  const manifest = parseManifest(parseYaml(ctx.deps.fs.read(join(root, MANIFEST_FILE))));
  const enabled = manifest.ok && (manifest.value.bundles as readonly string[]).includes(id);
  if (!enabled || !ctx.deps.fs.exists(join(root, "bundles", id, "bundle.yml"))) {
    throw new NotFoundError(
      `bundle "${id}" is not an enabled bundle — run \`wpm bundle list\` to see enabled bundles, or \`wpm bundle enable ${id}\``,
    );
  }
}

/**
 * List a bundle's directory tree as sorted relative paths under `bundles/<id>/` (the fs touch `bundle <id> show`
 * needs for its tree summary — threaded into the pure read as input). Recurses through the FileSystem port; a
 * directory contributes its descendant files (not the directory entries themselves), so the summary is a flat,
 * deterministic file list. Returns `[]` when the bundle dir does not exist (defensive; the guard already ran).
 *
 * @param fs - The FileSystem port.
 * @param root - The project root.
 * @param id - The bundle id.
 * @returns The relative file paths under `bundles/<id>/`, sorted.
 */
function bundleFileTree(fs: FileSystem, root: string, id: string): string[] {
  const base = join(root, "bundles", id);
  const out: string[] = [];
  const walk = (rel: string): void => {
    const abs = rel === "" ? base : join(base, rel);
    if (!fs.exists(abs)) {
      return;
    }
    for (const entry of fs.list(abs)) {
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.kind === "directory") {
        walk(childRel);
      } else {
        out.push(childRel);
      }
    }
  };
  walk("");
  return out.sort();
}

/**
 * Scan a bundle's install-time helper skills for the `bundle <id> installer-skills list` command (doc 10 row 174):
 * the immediate subdirectory names under `bundles/<id>/installer-skills/` that CONTAIN a `SKILL.md`, sorted. A
 * helper IS a `<name>/SKILL.md` folder, so a directory without a SKILL.md (or a stray file) is not a helper. This
 * fs walk lives in the shell (which owns the FileSystem port) and is threaded into the pure
 * {@link scanInstallerSkillsSpec} read — mirroring how {@link bundleFileTree} feeds `bundle <id> show`. Returns
 * `[]` when the `installer-skills/` directory does not exist (a bundle with no install-time helpers).
 *
 * @param fs - The FileSystem port.
 * @param root - The project root.
 * @param id - The bundle id.
 * @returns The helper-folder names (those containing a SKILL.md) under `bundles/<id>/installer-skills/`, sorted.
 */
function installerSkillNames(fs: FileSystem, root: string, id: string): string[] {
  const base = join(root, "bundles", id, "installer-skills");
  if (!fs.exists(base)) {
    return [];
  }
  return fs
    .list(base)
    .filter((entry) => entry.kind === "directory" && fs.exists(join(base, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Read the resolved project's name from its `manifest.yml` (`project.name`) for the `project installer-skills`
 * family's reserved-name refusal + `list` exclusion. The shell owns the fs port; it parses the manifest just as
 * {@link requireEnabledBundle} does. Returns `""` when the manifest cannot be parsed (defensive — the project was
 * already resolved by {@link requireProject}, so this is reached only on a corrupt manifest, which the operation
 * layer would also reject).
 *
 * @param ctx - The command context (ports).
 * @param root - The resolved project root.
 * @returns The project name, or `""` when the manifest cannot be parsed.
 */
function projectName(ctx: CommandContext, root: string): string {
  const manifest = parseManifest(parseYaml(ctx.deps.fs.read(join(root, MANIFEST_FILE))));
  return manifest.ok ? manifest.value.meta.name : "";
}

/**
 * Scan the PROJECT's install-time helper skills for `project installer-skills list` (doc 10 row 179): the
 * immediate subdirectory names under the root `installer-skills/` that CONTAIN a `SKILL.md`, **EXCLUDING** the
 * main `<project>-installer` skill and any `<id>-advisor` skill, sorted. The exclusion (AC46#1) is WHY `list`
 * scans rather than reads the registry — the main installer + advisors are created by `init`/`bundle <id> advisor
 * add`, not by `installer-skills add`, so they are real on-disk helper folders but not project-helper entries. The
 * fs walk + exclusion live in the shell (which owns the FileSystem port + the project name) and are threaded into
 * the pure {@link scanInstallerSkillsSpec} read. Returns `[]` when the `installer-skills/` dir does not exist.
 *
 * @param ctx - The command context (ports).
 * @param root - The project root.
 * @returns The project helper-folder names (minus the main installer + advisors), sorted.
 */
function projectInstallerSkillNames(ctx: CommandContext, root: string): string[] {
  const base = join(root, "installer-skills");
  if (!ctx.deps.fs.exists(base)) {
    return [];
  }
  const reservedFor = projectName(ctx, root);
  return ctx.deps.fs
    .list(base)
    .filter(
      (entry) =>
        entry.kind === "directory" && ctx.deps.fs.exists(join(base, entry.name, "SKILL.md")),
    )
    .map((entry) => entry.name)
    .filter((name) => !isReservedInstallerSkillName(name, reservedFor))
    .sort();
}

/**
 * Count the `kind:state` vs `kind:migration` tasks in a bundle's install-backlog for `bundle list` (doc 10 row
 * 154 step 2). The install-backlog is NOT a discoverable Backlog.md root (doc 07 line 67), so this is an fs SCAN
 * of `bundles/<id>/install-backlog/tasks/*.md` through the FileSystem port (which the shell owns), NOT a
 * BacklogMd-port read — the `kind:` labels are read out of each task file's frontmatter via the pure
 * {@link hasKindLabel}. Threaded into the pure {@link listBundlesSpec} read, mirroring how {@link bundleFileTree}
 * feeds `bundle <id> show`. Returns `{ state: 0, migration: 0 }` when the install-backlog `tasks/` dir does not
 * exist (a bundle whose recipe has not been filled in yet).
 *
 * @param fs - The FileSystem port.
 * @param root - The project root.
 * @param id - The bundle id whose install-backlog is scanned.
 * @returns The `kind:state` / `kind:migration` task counts.
 */
function installBacklogKindCounts(fs: FileSystem, root: string, id: string): KindCounts {
  const tasksDir = join(root, "bundles", id, "install-backlog", "tasks");
  if (!fs.exists(tasksDir)) {
    return { state: 0, migration: 0 };
  }
  let state = 0;
  let migration = 0;
  for (const entry of fs.list(tasksDir)) {
    if (entry.kind !== "file" || !entry.name.endsWith(".md")) {
      continue;
    }
    const text = fs.read(join(tasksDir, entry.name));
    if (hasKindLabel(text, "state")) {
      state += 1;
    }
    if (hasKindLabel(text, "migration")) {
      migration += 1;
    }
  }
  return { state, migration };
}

/**
 * Render the `bundle list` rows as an aligned table (doc 10 row 154 step 3) — `id`, `version`, `state`,
 * `migration` columns with a header, or a `(no bundles)` line when the project has none. Output lives in the shell
 * (output is not a port — doc 13 §3).
 *
 * @param rows - The projected bundle rows (already id-sorted by the read).
 * @returns The formatted table, newline-terminated.
 */
function formatBundleList(rows: readonly BundleListRow[]): string {
  if (rows.length === 0) {
    return "(no bundles)\n";
  }
  const header = { id: "id", version: "version", state: "state", migration: "migration" };
  const idWidth = Math.max(header.id.length, ...rows.map((r) => r.id.length));
  const versionWidth = Math.max(header.version.length, ...rows.map((r) => r.version.length));
  const stateWidth = Math.max(header.state.length, ...rows.map((r) => String(r.stateCount).length));
  const line = (id: string, version: string, state: string, migration: string): string =>
    `${id.padEnd(idWidth)}  ${version.padEnd(versionWidth)}  ${state.padEnd(stateWidth)}  ${migration}`;
  const lines = [line(header.id, header.version, header.state, header.migration)];
  for (const r of rows) {
    lines.push(line(r.id, r.version, String(r.stateCount), String(r.migrationCount)));
  }
  return `${lines.join("\n")}\n`;
}

/**
 * List a directory tree as sorted relative file paths under `base` (the fs touch `bundle template show` needs for
 * its tree summary). The generalised twin of {@link bundleFileTree} (which is `bundles/<id>/`-rooted): this takes
 * any base dir. Recurses through the FileSystem port; a directory contributes its descendant files (not the
 * directory entries themselves), so the summary is a flat, deterministic file list. Returns `[]` when `base` does
 * not exist (the caller guards that case separately).
 *
 * @param fs - The FileSystem port.
 * @param base - The absolute directory to walk.
 * @returns The relative file paths under `base`, sorted.
 */
function dirFileTree(fs: FileSystem, base: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    const abs = rel === "" ? base : join(base, rel);
    if (!fs.exists(abs)) {
      return;
    }
    for (const entry of fs.list(abs)) {
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.kind === "directory") {
        walk(childRel);
      } else {
        out.push(childRel);
      }
    }
  };
  walk("");
  return out.sort();
}

/**
 * Render the `bundle template show` block (doc 10 row 155: "its template metadata + tree") for the project's
 * default bundle scaffold at `bundles/bundle-template/`. Output lives in the shell (output is not a port —
 * doc 13 §3). The directory is the COPIED `files/` tree of some bundle template, so it normally carries NO
 * `template.yml` of its own — the metadata is then just the header + the file tree. When a `template.yml` IS
 * present (an author may place one), its description + parameters are printed too (mirroring the top-level
 * `template show`). The caller has already guarded that `dir` exists.
 *
 * @param fs - The FileSystem port.
 * @param dir - The absolute `bundles/bundle-template/` directory.
 * @returns The formatted metadata + tree block, newline-terminated.
 */
function formatBundleTemplate(fs: FileSystem, dir: string): string {
  const lines: string[] = [`Bundle template: bundles/${BUNDLE_TEMPLATE_DIR}/`];

  // Optional descriptor: only present if an author placed a template.yml in the scaffold dir.
  const descriptorPath = join(dir, "template.yml");
  if (fs.exists(descriptorPath)) {
    const parsed = parseTemplateDescriptor(parseYaml(fs.read(descriptorPath)));
    if (parsed.ok) {
      if (parsed.value.description !== undefined) {
        lines.push(`Description: ${parsed.value.description}`);
      }
      if (parsed.value.parameters.length > 0) {
        lines.push("Parameters:");
        for (const p of parsed.value.parameters) {
          const desc = p.description !== undefined ? `  ${p.description}` : "";
          const def = p.default !== undefined ? ` (default: ${p.default})` : "";
          lines.push(`  ${p.name}${desc}${def}`);
        }
      }
    }
  }

  lines.push("Files:");
  const files = dirFileTree(fs, dir);
  if (files.length === 0) {
    lines.push("  (none)");
  }
  for (const path of files) {
    lines.push(`  ${path}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Render a {@link BundleView} as the human-readable `bundle <id> show` block (output lives in the shell). */
function formatBundleView(view: BundleView): string {
  const lines = [
    `id:           ${view.id}`,
    `version:      ${view.version}`,
    `summary:      ${view.summary}`,
    `confirmation: ${view.confirmation}`,
    "requires:",
  ];
  if (view.requires.length === 0) {
    lines.push("  (none)");
  }
  for (const req of view.requires) {
    lines.push(`  ${req.id} ${req.range}`);
  }
  lines.push("files:");
  if (view.tree.length === 0) {
    lines.push("  (none)");
  }
  for (const path of view.tree) {
    lines.push(`  ${path}`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * `bundle <id> show` (doc 10 row 157), a READ. Lists the bundle's file tree via the FileSystem port, threads it
 * (with the id) into the pure {@link showBundleSpec} projection through `runRead`, and prints the formatted view.
 * Read-only (AC#3). A non-enabled id is already rejected by the routing's {@link requireEnabledBundle}; the read
 * stays defensive (its projection raises {@link NotFoundError} too).
 */
const bundleShowModule: PerBundleCommandModule = {
  register(sub, ctx, root, id) {
    const leaf = sub
      .command("show")
      .description("print this bundle's bundle.yml metadata and a tree summary (doc 10)")
      .action(() => {
        const tree = bundleFileTree(ctx.deps.fs, root, id);
        const { value } = runRead(ctx.deps.fs, { root }, showBundleSpec(), { id, tree });
        ctx.io.out.write(formatBundleView(value));
      });
    withExamples(leaf, [
      { command: "wpm bundle web-handoff show", note: "inspect a bundle's metadata + files" },
    ]);
  },
};

/**
 * `bundle <id> meta [--version <v>] [--summary <s>] [--confirmation-level safe|dangerous]` (doc 10 row 158), a
 * MUTATION. Validates `--version` (semver) and `--confirmation-level` (the `safe|dangerous` choice) at the
 * boundary, requires at least one flag, then rides `runMutation` with {@link editBundleMetaSpec} so the edit is
 * comment-and-key-order-preserving and ④ RERENDER reflects a changed summary in the menu.
 */
const bundleMetaModule: PerBundleCommandModule = {
  register(sub, ctx, root, id) {
    const leaf = sub
      .command("meta")
      .description(
        "edit this bundle's bundle.yml metadata: version, summary, confirmation level (doc 10)",
      )
      .option("--version <version>", "set the bundle's version (semver)")
      .option("--summary <summary>", "set the bundle's one-line menu summary")
      .addOption(
        new Option(
          "--confirmation-level <level>",
          "how much consent this bundle's steps need",
        ).choices([...CONFIRMATION_LEVELS]),
      )
      .action(
        (opts: { version?: string; summary?: string; confirmationLevel?: ConfirmationLevel }) => {
          // At least one field must be provided — a no-flag invocation would write nothing (doc 10 row 158:
          // "Update fields from flags"). Surface it as a usage error (exit 2) rather than a silent no-op.
          if (
            opts.version === undefined &&
            opts.summary === undefined &&
            opts.confirmationLevel === undefined
          ) {
            throw new UsageError(
              "bundle <id> meta needs at least one of --version, --summary, --confirmation-level",
            );
          }

          // `--version` SETS the bundle's version (the same `bundle.yml.version` field). Validate at the
          // boundary: a bad semver is a USAGE error (exit 2), like `project version set`.
          let version: SemVer | undefined;
          if (opts.version !== undefined) {
            const parsed = parseSemVer(opts.version);
            if (!parsed.ok) {
              throw new UsageError(parsed.problem.message);
            }
            version = parsed.value;
          }

          const result = runMutation(lifecycleDepsFor(ctx, root), { root }, editBundleMetaSpec(), {
            id,
            ...(version !== undefined ? { version } : {}),
            ...(opts.summary !== undefined ? { summary: opts.summary } : {}),
            ...(opts.confirmationLevel !== undefined
              ? { confirmation: opts.confirmationLevel }
              : {}),
          });
          ctx.io.out.write(formatResult(result));
        },
      );
    withExamples(leaf, [
      {
        command:
          'wpm bundle web-handoff meta --summary "web handoff installer" --confirmation-level dangerous',
        note: "set a bundle's summary + consent level",
      },
    ]);
  },
};

/**
 * `bundle <id> version` (+ `bump` / `set`) (doc 10 rows 159 / 160 / 161), the per-bundle VERSION family — the
 * bundle-`<id>` analogue of the project `version` group. The bare `version` action is a READ (`runRead`, prints
 * the raw version); `bump` and `set` are mutations (`runMutation`, so the harness's ④ RERENDER + ⑤ MATERIALISE
 * run automatically). The `<id>` is already resolved + enabled-guarded by the per-bundle routing and threaded in;
 * no leaf re-resolves it. Mirrors the project `version` group's shape (a command WITH a bare action AND `bump`/
 * `set` subcommands), but operates on `bundles/<id>/bundle.yml`'s `version`.
 */
const bundleVersionModule: PerBundleCommandModule = {
  register(sub, ctx, root, id) {
    // ── bundle <id> version (bare = READ) ──────────────────────────────────────────────────────────────────
    // A command WITH subcommands AND its own action: bare `version` runs this read; `bump`/`set` dispatch to
    // their own leaves (commander lists them under "Commands:" in help — 59#4 documents bump+set). Prints the
    // raw version (59#1), matching the project `version` read's `${value}\n` form.
    const version = sub
      .command("version")
      .description("this bundle's version: print it, or bump/set it (doc 10)")
      .action(() => {
        const { value } = runRead(ctx.deps.fs, { root }, readBundleVersionSpec(), { id });
        ctx.io.out.write(`${value}\n`);
      });
    withExamples(version, [
      { command: `wpm bundle ${id} version`, note: "print this bundle's version" },
    ]);

    // ── bundle <id> version bump <major|minor|patch> ───────────────────────────────────────────────────────
    // `.choices([...BUMP_LEVELS])` on the positional makes a bad value AND a missing required arg a commander
    // USAGE error (exit 2, changing nothing — 60#3) with no hand-rolled check; BUMP_LEVELS is the model's single
    // source (the same set the `"bump-levels"` completion enum uses). The bump materialises the doc-11 task set
    // (the summary line is the new version; `formatResult` adds the `materialised: N` line — 60#1/60#2).
    const bumpLeaf = version
      .command("bump")
      .addArgument(
        new Argument("<level>", "the semver level to advance the version by").choices([
          ...BUMP_LEVELS,
        ]),
      )
      .description(
        "advance this bundle's version by a semver level (major, minor, or patch) (doc 10)",
      )
      .action((level: (typeof BUMP_LEVELS)[number]) => {
        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, bumpBundleVersionSpec(), {
          id,
          level,
        });
        ctx.io.out.write(formatResult(result));
      });
    withExamples(bumpLeaf, [
      {
        command: `wpm bundle ${id} version bump minor`,
        note: "advance the minor version (e.g. 0.1.0 → 0.2.0)",
      },
    ]);

    // ── bundle <id> version set <v> ────────────────────────────────────────────────────────────────────────
    // A non-semver `<v>` is a bad CLI argument ⇒ a USAGE error (exit 2, changing nothing — 61#2; doc 13 §7).
    // Validate at the boundary via `parseSemVer` and raise `UsageError` (NOT `ValidationError`, which is exit 1)
    // so the operation receives an already-valid `SemVer`. No materialise (doc 10 row 161).
    const setLeaf = version
      .command("set")
      .argument("<version>", "the explicit semver to set as this bundle's version")
      .description("set this bundle's version to an explicit semver value (doc 10)")
      .action((versionRaw: string) => {
        const parsed = parseSemVer(versionRaw);
        if (!parsed.ok) {
          throw new UsageError(parsed.problem.message);
        }
        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, setBundleVersionSpec(), {
          id,
          version: parsed.value,
        });
        ctx.io.out.write(formatResult(result));
      });
    withExamples(setLeaf, [
      { command: `wpm bundle ${id} version set 1.0.0`, note: "pin this bundle's version to 1.0.0" },
    ]);
  },
};

/** Render a bundle's `requires` entries as the `bundle <id> requires list` block — one `dep-id range` per line. */
function formatRequires(entries: readonly RequiresEntry[]): string {
  if (entries.length === 0) {
    return "(no requires)\n";
  }
  return `${entries.map((entry) => `${entry.id} ${entry.range}`).join("\n")}\n`;
}

/**
 * `bundle <id> requires` (+ `add` / `list` / `remove`) (doc 10 rows 162 / 163 / 164), the per-bundle REQUIRES
 * family — the bundle-`<id>` analogue of the project `targets` LIST-MGMT group, operating on
 * `bundles/<id>/bundle.yml`'s `requires` map. `add`/`remove` are mutations (`runMutation`, so ④ RERENDER + ⑤
 * MATERIALISE run automatically); `list` is a read (`runRead`). The host `<id>` is already resolved +
 * enabled-guarded by the per-bundle routing and threaded in; no leaf re-resolves it. A bad constraint range is a
 * USAGE error (exit 2) raised here at the boundary via {@link parseVersionRange}; the validated RAW range string
 * (or `undefined`, defaulting to a caret on the dependency's current version) is passed to the operation so the
 * author's chosen syntax (e.g. `^0.3.0`) is written verbatim to the human-readable bundle.yml.
 */
const bundleRequiresModule: PerBundleCommandModule = {
  register(sub, ctx, root, id) {
    const requires = sub
      .command("requires")
      .description("declare or inspect this bundle's dependencies on other bundles (doc 10)");

    // ── requires add <dep-bundle-id> [<constraint>] ──────────────────────────────────────────────────────────
    // Declares (append/overwrite) an edge in this bundle's `requires` map. A bad range ⇒ USAGE error (exit 2); a
    // non-enabled dependency ⇒ the operation's NotFound (exit 1, nothing written). A cycle is WARNED (the edge is
    // still written — doc 10 row 162 says "Warn"); the warning is printed to stderr and the exit stays 0.
    const addLeaf = requires
      .command("add")
      .argument(
        "<dep-bundle-id>",
        "the bundle id this bundle depends on (must be an enabled bundle)",
      )
      .argument(
        "[constraint]",
        "an npm-style version range (default: a caret range on the dependency's current version)",
      )
      .description(
        "declare a dependency on another bundle by id + npm-style version constraint (doc 10)",
      )
      .action((dep: string, constraintRaw: string | undefined) => {
        // Validate the optional constraint at the boundary: a bad range is a USAGE error (exit 2), like
        // `version set`'s semver check. We pass the RAW (validated) string to the operation — NOT the normalized
        // `parseVersionRange` value — so the author's chosen syntax (e.g. `^0.3.0`) is written verbatim to the
        // human-readable bundle.yml rather than the expanded comparator form (doc 10 row 162 stores `^0.3.0`).
        if (constraintRaw !== undefined) {
          const parsed = parseVersionRange(constraintRaw);
          if (!parsed.ok) {
            throw new UsageError(parsed.problem.message);
          }
        }
        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, addRequiresSpec(), {
          id,
          dep,
          ...(constraintRaw !== undefined ? { constraint: constraintRaw } : {}),
        });
        ctx.io.out.write(formatResult(result));
        writeWarnings(ctx, result.warnings);
      });
    withExamples(addLeaf, [
      {
        command: "wpm bundle web-handoff requires add core ^0.3.0",
        note: "depend on core ^0.3.0",
      },
      {
        command: "wpm bundle web-handoff requires add core",
        note: "depend on core's current version (caret default)",
      },
    ]);

    // ── requires list ────────────────────────────────────────────────────────────────────────────────────────
    const listLeaf = requires
      .command("list")
      .description(
        "print this bundle's requires map (one dependency id + constraint per line) (doc 10)",
      )
      .action(() => {
        const { value } = runRead(ctx.deps.fs, { root }, listRequiresSpec(), { id });
        ctx.io.out.write(formatRequires(value));
      });
    withExamples(listLeaf, [
      { command: `wpm bundle ${id} requires list`, note: "list this bundle's dependencies" },
    ]);

    // ── requires remove <dep-bundle-id> ──────────────────────────────────────────────────────────────────────
    // Removing a dependency not present ⇒ the operation's NotFound (exit 1, nothing written).
    const removeLeaf = requires
      .command("remove")
      .argument("<dep-bundle-id>", "the dependency id to remove from this bundle's requires map")
      .description("remove a dependency entry from this bundle's requires map (doc 10)")
      .action((dep: string) => {
        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, removeRequiresSpec(), {
          id,
          dep,
        });
        ctx.io.out.write(formatResult(result));
      });
    withExamples(removeLeaf, [
      {
        command: "wpm bundle web-handoff requires remove core",
        note: "drop the dependency on core",
      },
    ]);
  },
};

/**
 * Render a registered-payload-reference list as a `bundle <id> <category> list` block — one path per line, or
 * the `(no <noun>s)` empty marker. Parameterised by the descriptor noun so each per-bundle payload family (files
 * L, templates M, scripts N) prints its own marker (`(no files)` / `(no templates)` / `(no scripts)`).
 *
 * @param paths - The registered reference paths.
 * @param noun - The category noun (e.g. `file`, `template`).
 * @returns The formatted list, newline-terminated.
 */
function formatPayloadList(paths: readonly string[], noun: string): string {
  return paths.length === 0 ? `(no ${noun}s)\n` : `${paths.join("\n")}\n`;
}

/**
 * Render a registered-payload-skill list as a `bundle <id> skills list` block — one skill NAME per line, or the
 * `(no payload skills)` empty marker. Prints the names (the registry key the author reasons about); the stored
 * paths are for `list`/validation to LOCATE each SKILL.md, not for the listing line.
 *
 * @param skills - The registered {@link SkillRef} entries.
 * @returns The formatted list, newline-terminated.
 */
function formatSkillList(skills: readonly SkillRef[]): string {
  return skills.length === 0
    ? "(no payload skills)\n"
    : `${skills.map((skill) => skill.name).join("\n")}\n`;
}

/**
 * Render a SCANNED install-time helper-skill list as a `bundle <id> installer-skills list` block — one helper NAME
 * per line, or the `(no installer skills)` empty marker. Takes NAMES (not refs): `installer-skills list` SCANS the
 * directory (doc 10 row 174), so it yields the on-disk helper-folder names directly, not registry entries.
 *
 * @param names - The scanned helper-folder names.
 * @returns The formatted list, newline-terminated.
 */
function formatInstallerSkillList(names: readonly string[]): string {
  return names.length === 0 ? "(no installer skills)\n" : `${names.join("\n")}\n`;
}

/**
 * `bundle <id> files` (+ `add` / `list` / `remove`) (doc 10 rows 165 / 166 / 167), the per-bundle FILES family —
 * registers / inspects / deregisters authoritative reference files under `payload/files/`. It rides the GENERIC
 * descriptor-driven payload-reference operation ({@link FILES_DESCRIPTOR}); the upcoming `templates` (M) and
 * `scripts` (N) families are each just a new descriptor + a near-identical module. `add`/`remove` are mutations
 * (`runMutation`, so ④ RERENDER runs); `list` is a read (`runRead`). The host `<id>` is already resolved +
 * enabled-guarded by the per-bundle routing and threaded in.
 *
 * Structure-not-content: `add` only REGISTERS the reference (it never writes file content); `remove`
 * DEREGISTERS, leaving the file on disk. The on-disk EXISTENCE CHECK for `add` lives HERE (the CLI shell owns
 * the fs port; the pure operation `check` has none), raising a {@link NotFoundError} BEFORE `runMutation` so a
 * non-existent path registers nothing (65#2).
 */
const bundleFilesModule: PerBundleCommandModule = {
  register(sub, ctx, root, id) {
    const files = sub
      .command("files")
      .description("register or inspect this bundle's payload/files reference files (doc 10)");

    // ── files add <path> ─────────────────────────────────────────────────────────────────────────────────────
    const addLeaf = files
      .command("add")
      .argument(
        "<path>",
        "a path the agent has already placed under payload/files (relative to payload/files)",
      )
      .description(
        "register an authoritative reference file the agent placed under payload/files (doc 10)",
      )
      .action((path: string) => {
        // 65#2: the file MUST exist on disk under payload/files/<path>; else a typed NotFound (exit 1) with
        // nothing registered. The pure operation `check` has no ports, so the existence probe lives here.
        const onDisk = join(root, "bundles", id, FILES_DESCRIPTOR.onDiskDir, path);
        if (!ctx.deps.fs.exists(onDisk)) {
          throw new NotFoundError(
            `no file at bundles/${id}/${FILES_DESCRIPTOR.onDiskDir}/${path} — place the file there first, then register it`,
          );
        }
        const result = runMutation(
          lifecycleDepsFor(ctx, root),
          { root },
          addPayloadRefSpec(FILES_DESCRIPTOR),
          { id, path },
        );
        ctx.io.out.write(formatResult(result));
      });
    withExamples(addLeaf, [
      {
        command: "wpm bundle web-handoff files add agents.md",
        note: "register payload/files/agents.md the agent placed",
      },
    ]);

    // ── files list ───────────────────────────────────────────────────────────────────────────────────────────
    const listLeaf = files
      .command("list")
      .description("list this bundle's registered payload/files references (doc 10)")
      .action(() => {
        const { value } = runRead(ctx.deps.fs, { root }, listPayloadRefsSpec(FILES_DESCRIPTOR), {
          id,
        });
        ctx.io.out.write(formatPayloadList(value, FILES_DESCRIPTOR.noun));
      });
    withExamples(listLeaf, [
      { command: `wpm bundle ${id} files list`, note: "list registered payload files" },
    ]);

    // ── files remove <path> ──────────────────────────────────────────────────────────────────────────────────
    // Deregister-not-delete: the entry leaves bundle.yml but the file stays on disk (doc 10 row 167). A path that
    // is not registered ⇒ the operation's NotFound (exit 1, nothing changed).
    const removeLeaf = files
      .command("remove")
      .argument(
        "<path>",
        "the registered payload/files reference to deregister (the file is left on disk)",
      )
      .description("deregister a payload/files reference, leaving the file on disk (doc 10)")
      .action((path: string) => {
        const result = runMutation(
          lifecycleDepsFor(ctx, root),
          { root },
          removePayloadRefSpec(FILES_DESCRIPTOR),
          { id, path },
        );
        ctx.io.out.write(formatResult(result));
      });
    withExamples(removeLeaf, [
      {
        command: "wpm bundle web-handoff files remove agents.md",
        note: "deregister payload/files/agents.md (the file stays on disk)",
      },
    ]);
  },
};

/**
 * `bundle <id> templates` (+ `add` / `list` / `remove`) (doc 10 row 168, "Same as `files`, against
 * `payload/templates/`"), the per-bundle TEMPLATES family — registers / inspects / deregisters parameterised
 * template files under `payload/templates/`. A PURE REUSE of Family L: it rides the SAME generic
 * descriptor-driven payload-reference operation, parameterised by {@link TEMPLATES_DESCRIPTOR} instead of
 * {@link FILES_DESCRIPTOR}. Behaviour is identical to `files` (structure-not-content; deregister-not-delete; the
 * on-disk existence check for `add` lives HERE, raising {@link NotFoundError} BEFORE `runMutation` so a
 * non-existent path registers nothing — 68#2). The host `<id>` is already resolved + enabled-guarded by the
 * per-bundle routing and threaded in.
 */
const bundleTemplatesModule: PerBundleCommandModule = {
  register(sub, ctx, root, id) {
    const templates = sub
      .command("templates")
      .description("register or inspect this bundle's payload/templates reference files (doc 10)");

    // ── templates add <path> ─────────────────────────────────────────────────────────────────────────────────
    const addLeaf = templates
      .command("add")
      .argument(
        "<path>",
        "a path the agent has already placed under payload/templates (relative to payload/templates)",
      )
      .description(
        "register a parameterised template the agent placed under payload/templates (doc 10)",
      )
      .action((path: string) => {
        // 68#2: the file MUST exist on disk under payload/templates/<path>; else a typed NotFound (exit 1) with
        // nothing registered. The pure operation `check` has no ports, so the existence probe lives here.
        const onDisk = join(root, "bundles", id, TEMPLATES_DESCRIPTOR.onDiskDir, path);
        if (!ctx.deps.fs.exists(onDisk)) {
          throw new NotFoundError(
            `no file at bundles/${id}/${TEMPLATES_DESCRIPTOR.onDiskDir}/${path} — place the file there first, then register it`,
          );
        }
        const result = runMutation(
          lifecycleDepsFor(ctx, root),
          { root },
          addPayloadRefSpec(TEMPLATES_DESCRIPTOR),
          { id, path },
        );
        ctx.io.out.write(formatResult(result));
      });
    withExamples(addLeaf, [
      {
        command: "wpm bundle web-handoff templates add agents.md.tmpl",
        note: "register payload/templates/agents.md.tmpl the agent placed",
      },
    ]);

    // ── templates list ───────────────────────────────────────────────────────────────────────────────────────
    const listLeaf = templates
      .command("list")
      .description("list this bundle's registered payload/templates references (doc 10)")
      .action(() => {
        const { value } = runRead(
          ctx.deps.fs,
          { root },
          listPayloadRefsSpec(TEMPLATES_DESCRIPTOR),
          {
            id,
          },
        );
        ctx.io.out.write(formatPayloadList(value, TEMPLATES_DESCRIPTOR.noun));
      });
    withExamples(listLeaf, [
      { command: `wpm bundle ${id} templates list`, note: "list registered payload templates" },
    ]);

    // ── templates remove <path> ──────────────────────────────────────────────────────────────────────────────
    // Deregister-not-delete: the entry leaves bundle.yml but the file stays on disk (doc 10 row 168 → 167). A
    // path that is not registered ⇒ the operation's NotFound (exit 1, nothing changed).
    const removeLeaf = templates
      .command("remove")
      .argument(
        "<path>",
        "the registered payload/templates reference to deregister (the file is left on disk)",
      )
      .description("deregister a payload/templates reference, leaving the file on disk (doc 10)")
      .action((path: string) => {
        const result = runMutation(
          lifecycleDepsFor(ctx, root),
          { root },
          removePayloadRefSpec(TEMPLATES_DESCRIPTOR),
          { id, path },
        );
        ctx.io.out.write(formatResult(result));
      });
    withExamples(removeLeaf, [
      {
        command: "wpm bundle web-handoff templates remove agents.md.tmpl",
        note: "deregister payload/templates/agents.md.tmpl (the file stays on disk)",
      },
    ]);
  },
};

/**
 * `bundle <id> scripts` (+ `add` / `list` / `remove`) (doc 10 row 169, "Same as `files`, against
 * `installer-scripts/` (install-time tooling; NOT delivered to user)"), the per-bundle SCRIPTS family —
 * registers / inspects / deregisters install-time script references under `installer-scripts/`. A PURE REUSE of
 * Families L/M: it rides the SAME generic descriptor-driven payload-reference operation, parameterised by
 * {@link SCRIPTS_DESCRIPTOR}. NOTE the deliberate asymmetry the descriptor encodes: the on-disk directory is
 * `installer-scripts/` — a SIBLING of `payload/`, NOT delivered to the user (doc 06 line 77 / doc 07 line 51) —
 * while the registry key stays `payload.scripts` (the `payload:` map is the reference registry, not a delivery
 * claim). Behaviour is identical to `files`/`templates` (structure-not-content; deregister-not-delete; the
 * on-disk existence check for `add` lives HERE, raising {@link NotFoundError} BEFORE `runMutation` so a
 * non-existent path registers nothing — 71#2). The host `<id>` is already resolved + enabled-guarded by the
 * per-bundle routing and threaded in.
 */
const bundleScriptsModule: PerBundleCommandModule = {
  register(sub, ctx, root, id) {
    const scripts = sub
      .command("scripts")
      .description(
        "register or inspect this bundle's installer-scripts (install-time tooling; not delivered) (doc 10)",
      );

    // ── scripts add <path> ───────────────────────────────────────────────────────────────────────────────────
    const addLeaf = scripts
      .command("add")
      .argument(
        "<path>",
        "a path the agent has already placed under installer-scripts (relative to installer-scripts)",
      )
      .description(
        "register an install-time script the agent placed under installer-scripts (doc 10)",
      )
      .action((path: string) => {
        // 71#2: the file MUST exist on disk under installer-scripts/<path>; else a typed NotFound (exit 1) with
        // nothing registered. The pure operation `check` has no ports, so the existence probe lives here. NOTE:
        // installer-scripts is a SIBLING of payload/ (doc 06/07), so the dir is `installer-scripts`, NOT
        // `payload/installer-scripts` — supplied by SCRIPTS_DESCRIPTOR.onDiskDir.
        const onDisk = join(root, "bundles", id, SCRIPTS_DESCRIPTOR.onDiskDir, path);
        if (!ctx.deps.fs.exists(onDisk)) {
          throw new NotFoundError(
            `no file at bundles/${id}/${SCRIPTS_DESCRIPTOR.onDiskDir}/${path} — place the file there first, then register it`,
          );
        }
        const result = runMutation(
          lifecycleDepsFor(ctx, root),
          { root },
          addPayloadRefSpec(SCRIPTS_DESCRIPTOR),
          { id, path },
        );
        ctx.io.out.write(formatResult(result));
      });
    withExamples(addLeaf, [
      {
        command: "wpm bundle web-handoff scripts add probe.sh",
        note: "register installer-scripts/probe.sh the agent placed (install-time, not delivered)",
      },
    ]);

    // ── scripts list ─────────────────────────────────────────────────────────────────────────────────────────
    const listLeaf = scripts
      .command("list")
      .description("list this bundle's registered installer-scripts references (doc 10)")
      .action(() => {
        const { value } = runRead(ctx.deps.fs, { root }, listPayloadRefsSpec(SCRIPTS_DESCRIPTOR), {
          id,
        });
        ctx.io.out.write(formatPayloadList(value, SCRIPTS_DESCRIPTOR.noun));
      });
    withExamples(listLeaf, [
      { command: `wpm bundle ${id} scripts list`, note: "list registered installer-scripts" },
    ]);

    // ── scripts remove <path> ────────────────────────────────────────────────────────────────────────────────
    // Deregister-not-delete: the entry leaves bundle.yml but the file stays on disk (doc 10 row 169 → 167). A
    // path that is not registered ⇒ the operation's NotFound (exit 1, nothing changed).
    const removeLeaf = scripts
      .command("remove")
      .argument(
        "<path>",
        "the registered installer-scripts reference to deregister (the file is left on disk)",
      )
      .description("deregister an installer-scripts reference, leaving the file on disk (doc 10)")
      .action((path: string) => {
        const result = runMutation(
          lifecycleDepsFor(ctx, root),
          { root },
          removePayloadRefSpec(SCRIPTS_DESCRIPTOR),
          { id, path },
        );
        ctx.io.out.write(formatResult(result));
      });
    withExamples(removeLeaf, [
      {
        command: "wpm bundle web-handoff scripts remove probe.sh",
        note: "deregister installer-scripts/probe.sh (the file stays on disk)",
      },
    ]);
  },
};

/**
 * `bundle <id> skills` (+ `add` / `list` / `remove`) (doc 10 rows 170 / 171 / 172), the per-bundle SKILLS family
 * — registers / inspects / deregisters the bundle's PAYLOAD skills (the delivered runtime products under
 * `payload/agent-skills/`). It rides the GENERIC, descriptor-driven skill-reference operation core
 * ({@link PAYLOAD_SKILLS_DESCRIPTOR}); the upcoming installer-skill families (P: `bundle <id> installer-skills`;
 * F: `project installer-skills`) each become a new descriptor + a near-identical module (+ their model/schema
 * registry field + a scan-based `list`). The host `<id>` is already resolved + enabled-guarded by the per-bundle
 * routing and threaded in.
 *
 * `add <name> [--path <path>]` is the 3-WAY scaffold-or-attach (doc 10 row 170; doc 10 line 32): the CLI shell —
 * which owns the fs port — resolves the target SKILL.md path, probes existence, and dispatches:
 *   - **ATTACH** (a SKILL.md exists at the resolved path) → {@link attachSkillRefSpec} (validate frontmatter +
 *     register; NO materialise);
 *   - **SCAFFOLD** (none exists AND no `--path`) → {@link scaffoldSkillRefSpec} (render a stub + register; WITH a
 *     ⑤ MATERIALISE of the "Write payload skill …" task);
 *   - **ERROR** (`--path` given but nothing there) → a typed {@link NotFoundError} BEFORE `runMutation`, so the
 *     command registers nothing (74#3).
 * This keeps the 3-way decision a thin CLI branch (the existence-probe-in-CLI pattern of `bundleFilesModule`)
 * and the two core specs single-purpose + reusable. Structure-not-content: `add` never authors the SKILL.md body
 * (scaffold renders a structural stub from the snippet; attach validates+registers what the author placed);
 * `remove` deregisters and leaves the SKILL.md on disk (76#1/#2). `list` is registry-based (75#1) — payload
 * skills are inert until install, so the registry is authoritative.
 */
const bundleSkillsModule: PerBundleCommandModule = {
  register(sub, ctx, root, id) {
    const skills = sub
      .command("skills")
      .description(
        "register or inspect this bundle's payload/agent-skills (the delivered runtime products) (doc 10)",
      );

    // ── skills add <name> [--path <path>] ──────────────────────────────────────────────────────────────────
    const addLeaf = skills
      .command("add")
      .argument(
        "<name>",
        "the payload skill's name (its SKILL.md folder under payload/agent-skills/<name>/)",
      )
      .option(
        "--path <path>",
        "attach an existing SKILL.md at this bundle-relative path instead of the conventional location",
      )
      .description(
        "attach an existing payload skill, or scaffold a stub + queue its writing if none exists (doc 10)",
      )
      .action((name: string, opts: { path?: string }) => {
        // Resolve the target SKILL.md (bundle-relative): --path if given, else the conventional
        // payload/agent-skills/<name>/SKILL.md. The CLI owns the fs port, so the 3-way existence probe lives here
        // (the pure operation `check` has no port — the same place `bundleFilesModule` puts its add check).
        const conventional = conventionalSkillPath(PAYLOAD_SKILLS_DESCRIPTOR, name);
        const targetRel = opts.path ?? conventional;
        const exists = ctx.deps.fs.exists(join(root, "bundles", id, targetRel));

        if (opts.path !== undefined && !exists) {
          // 74#3: --path given but nothing there → typed error (exit 1), register nothing.
          throw new NotFoundError(
            `no SKILL.md at bundles/${id}/${opts.path} — omit --path to scaffold a stub at ${conventional}, or place the file there first`,
          );
        }

        const result = exists
          ? runMutation(
              lifecycleDepsFor(ctx, root),
              { root },
              attachSkillRefSpec(PAYLOAD_SKILLS_DESCRIPTOR),
              { id, name, path: targetRel },
            )
          : runMutation(
              lifecycleDepsFor(ctx, root),
              { root },
              scaffoldSkillRefSpec(PAYLOAD_SKILLS_DESCRIPTOR, {
                builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot,
              }),
              { id, name },
            );
        // 74#4: the summary says attached vs scaffolded; formatResult adds the `materialised: N` line for the
        // scaffold branch (the task id is visible via the authoring backlog the materialise writes into).
        ctx.io.out.write(formatResult(result));
      });
    withExamples(addLeaf, [
      {
        command: "wpm bundle web-handoff skills add handoff-web",
        note: "attach the SKILL.md the agent placed, or scaffold a stub + queue its writing",
      },
      {
        command:
          "wpm bundle web-handoff skills add handoff-web --path payload/agent-skills/handoff-web/SKILL.md",
        note: "attach an existing SKILL.md at an explicit bundle-relative path",
      },
    ]);

    // ── skills list ─────────────────────────────────────────────────────────────────────────────────────────
    const listLeaf = skills
      .command("list")
      .description("list this bundle's registered payload skills (doc 10)")
      .action(() => {
        const { value } = runRead(
          ctx.deps.fs,
          { root },
          listSkillRefsSpec(PAYLOAD_SKILLS_DESCRIPTOR),
          {
            id,
          },
        );
        ctx.io.out.write(formatSkillList(value));
      });
    withExamples(listLeaf, [
      { command: `wpm bundle ${id} skills list`, note: "list registered payload skills" },
    ]);

    // ── skills remove <name> ────────────────────────────────────────────────────────────────────────────────
    // Deregister-not-delete: the entry leaves bundle.yml but the SKILL.md stays on disk (doc 10 row 172). A name
    // that is not registered ⇒ the operation's NotFound (exit 1, nothing changed).
    const removeLeaf = skills
      .command("remove")
      .argument(
        "<name>",
        "the registered payload skill to deregister (the SKILL.md is left on disk)",
      )
      .description("deregister a payload skill, leaving its SKILL.md on disk (doc 10)")
      .action((name: string) => {
        const result = runMutation(
          lifecycleDepsFor(ctx, root),
          { root },
          removeSkillRefSpec(PAYLOAD_SKILLS_DESCRIPTOR),
          { id, name },
        );
        ctx.io.out.write(formatResult(result));
      });
    withExamples(removeLeaf, [
      {
        command: "wpm bundle web-handoff skills remove handoff-web",
        note: "deregister handoff-web (its SKILL.md stays on disk)",
      },
    ]);
  },
};

/**
 * `bundle <id> installer-skills` (+ `add` / `list` / `remove`) (doc 10 rows 173 / 174 / 175), the per-bundle
 * INSTALLER-SKILLS family (Family P) — registers / inspects / deregisters the bundle's bundle-scoped INSTALL-TIME
 * helper skills (`bundles/<id>/installer-skills/`, NOT delivered to the user — doc 06 line 77 / doc 07 line 51).
 * It is the installer-skills TWIN of {@link bundleSkillsModule}: it rides the SAME generic, descriptor-driven
 * skill-reference core ({@link BUNDLE_INSTALLER_SKILLS_DESCRIPTOR}) for `add`/`remove`, and supplies the one
 * difference — a directory-SCAN `list` ({@link scanInstallerSkillsSpec}).
 *
 * `add <name> [--path <path>]` is the SAME 3-WAY scaffold-or-attach as `skills add` (doc 10 row 173; doc 10 line
 * 32): the CLI shell resolves the target SKILL.md path, probes existence, and dispatches ATTACH
 * ({@link attachSkillRefSpec}) / SCAFFOLD ({@link scaffoldSkillRefSpec}, WITH a ⑤ MATERIALISE of "Write content
 * for install-time skill … in …") / ERROR (`--path` given but nothing there → a typed {@link NotFoundError} BEFORE
 * `runMutation`). **AC77#4 (the scope-alias ensure) is delivered by the ④ RERENDER beat**: `scopePlan`
 * (derived-artefacts) already plans the bundle's `installer-skills/` scope aliases for each declared target, and
 * `runMutation`'s ④ RERENDER creates each missing one via `fs.ensureAlias` — so the leaf adds NO explicit alias
 * code; a mutation (`add`) ensures them automatically (a project with no targets has no alias to create — correct,
 * not a violation). `remove` deregisters from the `installerSkills` registry and LEAVES the SKILL.md on disk
 * (79#1/#2). `list` SCANS the directory (74#1 — the helpers are union-scanned at install, so an author-placed or a
 * `remove`-deregistered-but-left helper still shows; the registry and the scan deliberately diverge), with the fs
 * walk in the shell ({@link installerSkillNames}) threaded into the pure read.
 */
const bundleInstallerSkillsModule: PerBundleCommandModule = {
  register(sub, ctx, root, id) {
    const installerSkills = sub
      .command("installer-skills")
      .description(
        "register or inspect this bundle's install-time helper skills (not delivered) (doc 10)",
      );

    // ── installer-skills add <name> [--path <path>] ────────────────────────────────────────────────────────
    const addLeaf = installerSkills
      .command("add")
      .argument(
        "<name>",
        "the install-time helper skill's name (its SKILL.md folder under installer-skills/<name>/)",
      )
      .option(
        "--path <path>",
        "attach an existing SKILL.md at this bundle-relative path instead of the conventional location",
      )
      .description(
        "attach an existing install-time helper skill, or scaffold a stub + queue its writing if none exists (doc 10)",
      )
      .action((name: string, opts: { path?: string }) => {
        // Resolve the target SKILL.md (bundle-relative): --path if given, else the conventional
        // installer-skills/<name>/SKILL.md. The CLI owns the fs port, so the 3-way existence probe lives here (the
        // same place `bundleSkillsModule` puts it).
        const conventional = conventionalSkillPath(BUNDLE_INSTALLER_SKILLS_DESCRIPTOR, name);
        const targetRel = opts.path ?? conventional;
        const exists = ctx.deps.fs.exists(join(root, "bundles", id, targetRel));

        if (opts.path !== undefined && !exists) {
          // AC77#3: --path given but nothing there → typed error (exit 1), register nothing.
          throw new NotFoundError(
            `no SKILL.md at bundles/${id}/${opts.path} — omit --path to scaffold a stub at ${conventional}, or place the file there first`,
          );
        }

        // AC77#4: the bundle's installer-skills scope aliases are ensured by the ④ RERENDER beat inside
        // runMutation (scopePlan already plans them for each declared target) — the leaf needs no alias code.
        const result = exists
          ? runMutation(
              lifecycleDepsFor(ctx, root),
              { root },
              attachSkillRefSpec(BUNDLE_INSTALLER_SKILLS_DESCRIPTOR),
              { id, name, path: targetRel },
            )
          : runMutation(
              lifecycleDepsFor(ctx, root),
              { root },
              scaffoldSkillRefSpec(BUNDLE_INSTALLER_SKILLS_DESCRIPTOR, {
                builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot,
              }),
              { id, name },
            );
        // AC77#6: the summary says attached vs scaffolded; formatResult adds the `materialised: N` line for the
        // scaffold branch (the authoring task id is visible via the backlog the materialise writes into).
        ctx.io.out.write(formatResult(result));
      });
    withExamples(addLeaf, [
      {
        command: "wpm bundle web-handoff installer-skills add detect-node",
        note: "attach the SKILL.md the agent placed, or scaffold a stub + queue its writing",
      },
      {
        command:
          "wpm bundle web-handoff installer-skills add detect-node --path installer-skills/detect-node/SKILL.md",
        note: "attach an existing SKILL.md at an explicit bundle-relative path",
      },
    ]);

    // ── installer-skills list ──────────────────────────────────────────────────────────────────────────────
    // SCAN (doc 10 row 174): enumerate the helper SKILL.md folders under bundles/<id>/installer-skills/. The fs
    // walk lives here (the shell owns the port), threaded into the pure scan spec — mirroring `bundle <id> show`.
    const listLeaf = installerSkills
      .command("list")
      .description(
        "list this bundle's install-time helper skills (scanned under installer-skills/) (doc 10)",
      )
      .action(() => {
        const scannedNames = installerSkillNames(ctx.deps.fs, root, id);
        const { value } = runRead(ctx.deps.fs, { root }, scanInstallerSkillsSpec(), {
          id,
          scannedNames,
        });
        ctx.io.out.write(formatInstallerSkillList(value));
      });
    withExamples(listLeaf, [
      {
        command: `wpm bundle ${id} installer-skills list`,
        note: "list this bundle's install-time helper skills",
      },
    ]);

    // ── installer-skills remove <name> ─────────────────────────────────────────────────────────────────────
    // Deregister-not-delete: the entry leaves the bundle.yml installerSkills registry but the SKILL.md stays on
    // disk (doc 10 row 175). A name that is not registered ⇒ the operation's NotFound (exit 1, nothing changed).
    const removeLeaf = installerSkills
      .command("remove")
      .argument(
        "<name>",
        "the registered install-time helper to deregister (the SKILL.md is left on disk)",
      )
      .description("deregister an install-time helper skill, leaving its SKILL.md on disk (doc 10)")
      .action((name: string) => {
        const result = runMutation(
          lifecycleDepsFor(ctx, root),
          { root },
          removeSkillRefSpec(BUNDLE_INSTALLER_SKILLS_DESCRIPTOR),
          { id, name },
        );
        ctx.io.out.write(formatResult(result));
      });
    withExamples(removeLeaf, [
      {
        command: "wpm bundle web-handoff installer-skills remove detect-node",
        note: "deregister detect-node (its SKILL.md stays on disk)",
      },
    ]);
  },
};

/**
 * `bundle <id> advisor` (+ `add` / `remove`) (doc 10 rows 176 / 177), the per-bundle ADVISOR family (Family Q) —
 * scaffolds or removes the bundle's ONE pull-UX advisor (its recommend-on-match installer-skill at the project
 * root's `installer-skills/<id>-advisor/`). Because there is exactly ONE advisor per bundle, the command takes NO
 * `<name>`, NO `--path`, and has NO `list` (contrast the bundle's MANY payload/installer skills, families O/P).
 *
 * `add` is **the same action `bundle new` step 6 and `bundle enable` step 3 already run, exposed standalone**: it
 * rides `runMutation` with {@link advisorAddSpec} — ③ APPLY renders the advisor stub via the shared
 * `scaffoldAdvisor` (no-op if it already exists), ⑤ MATERIALISE the "Write advisor content for `<id>`" task
 * (title-idempotent). On a true no-op (advisor already present AND the task already materialised) the leaf prints
 * a friendly line rather than the changed/materialised summary (AC80#3). `remove` rides {@link advisorRemoveSpec}
 * — ③ APPLY deletes `installer-skills/<id>-advisor/` and archives the open content task; when no advisor exists it
 * reports "nothing to remove" and changes nothing (AC81#3, surfaced as an empty change set + a warning). The host
 * `<id>` is already resolved + enabled-guarded by the per-bundle routing and threaded in.
 */
const bundleAdvisorModule: PerBundleCommandModule = {
  register(sub, ctx, root, id) {
    const advisor = sub
      .command("advisor")
      .description(
        "scaffold or remove this bundle's pull-UX advisor (its one recommend-on-match skill) (doc 10)",
      );

    // ── advisor add ───────────────────────────────────────────────────────────────────────────────────────────
    // Render the advisor stub (no-op if it already exists) + materialise the "Write advisor content" task — the
    // SAME action `bundle new` step 6 runs. No positional, no flags.
    const addLeaf = advisor
      .command("add")
      .description(
        "render the advisor stub + queue its content-writing task (no-op if it already exists) (doc 10)",
      )
      .action(() => {
        const result = runMutation(
          lifecycleDepsFor(ctx, root),
          { root },
          advisorAddSpec({ builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot }),
          { id },
        );
        // AC80#3: a true no-op is when the advisor already existed — i.e. the scaffold did NOT (re)write the
        // advisor SKILL.md AND no content task was materialised. We key on the advisor SKILL.md path
        // SPECIFICALLY (not `changedPaths.length`): the ④ RERENDER beat may re-ensure the bundle's scope alias on
        // every run (its target is absent until a bundle installer-skill is added), which is benign lifecycle
        // noise, not evidence the advisor was scaffolded. The scaffold writing the advisor SKILL.md, or a task
        // being materialised, is the real "something happened" signal.
        // `changedPaths` entries are POSIX-normalized by the lifecycle (the reported/portable form), so the probe
        // path is normalized the same way before the membership test — otherwise on Windows a native `\` probe
        // would never match the `/` changed-path and the no-op detection would misfire.
        const advisorAbs = toPosix(join(root, advisorSkillPath(id)));
        const scaffolded = result.changedPaths.includes(advisorAbs);
        if (!scaffolded && result.materialisedTaskTitles.length === 0) {
          ctx.io.out.write(`advisor for ${id} already exists — nothing to do\n`);
        } else {
          ctx.io.out.write(formatResult(result));
        }
      });
    withExamples(addLeaf, [
      {
        command: `wpm bundle ${id} advisor add`,
        note: "scaffold the advisor stub + queue writing its content",
      },
    ]);

    // ── advisor remove ────────────────────────────────────────────────────────────────────────────────────────
    // Delete installer-skills/<id>-advisor/ + archive the open content task; "nothing to remove" when absent.
    const removeLeaf = advisor
      .command("remove")
      .description("delete this bundle's advisor stub + archive its content-writing task (doc 10)")
      .action(() => {
        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, advisorRemoveSpec(), {
          id,
        });
        // AC81#3: when no advisor exists the spec deletes nothing — report "nothing to remove". We key on the
        // advisor DIRECTORY appearing in `changedPaths` (the delete recorded it), NOT `changedPaths.length`: the
        // ④ RERENDER beat can re-render the front-door / re-ensure scope aliases on a fresh project even when the
        // advisor was absent, which is benign noise. The advisor dir being among the changed paths is the precise
        // "the advisor was actually removed" signal. The spec's warning (if any) goes to stderr.
        // Normalized to POSIX to match the lifecycle's POSIX-normalized `changedPaths` (see `advisor add` above).
        const advisorDirAbs = toPosix(join(root, advisorSkillDir(id)));
        if (!result.changedPaths.includes(advisorDirAbs)) {
          ctx.io.out.write(`no advisor for ${id} — nothing to remove\n`);
        } else {
          ctx.io.out.write(formatResult(result));
        }
        writeWarnings(ctx, result.warnings);
      });
    withExamples(removeLeaf, [
      {
        command: `wpm bundle ${id} advisor remove`,
        note: "delete the advisor stub + close its content task",
      },
    ]);
  },
};

/**
 * The per-bundle subcommand modules, registered into the `bundle <id>` sub-program in order. A future per-bundle
 * family appends its {@link PerBundleCommandModule} here — the routing and the catch-all need no change. This is
 * the bundle-`<id>` analogue of {@link TOP_LEVEL_MODULES}.
 */
const PER_BUNDLE_MODULES: readonly PerBundleCommandModule[] = [
  bundleShowModule,
  bundleMetaModule,
  bundleVersionModule,
  bundleRequiresModule,
  bundleFilesModule,
  bundleTemplatesModule,
  bundleScriptsModule,
  bundleSkillsModule,
  bundleInstallerSkillsModule,
  bundleAdvisorModule,
];

/** The completion specs for the per-bundle subcommands (keyed by the subcommand path WITHIN `bundle <id>`). */
const PER_BUNDLE_COMPLETION_SPECS: CompletionSpecs = {
  meta: { options: { "--confirmation-level": "confirmation-levels" } },
  // `bundle <id> version bump <level>` — the fixed major/minor/patch enum (reuses the built-in `bump-levels`
  // source; the project `version bump` uses the same one). The `<id>` already completes on `bundle <tab>`.
  "version bump": { args: ["bump-levels"] },
  // `bundle <id> requires add <dep>` — the dependency completes from the enabled bundles (the existing
  // `bundle-ids` source). `remove <dep>` completes from THIS bundle's current requires keys (the `bundle-requires`
  // source, which reads the host id threaded onto the completion context by the per-bundle recursion).
  "requires add": { args: ["bundle-ids"] },
  "requires remove": { args: ["bundle-requires"] },
  // `bundle <id> files add <path>` completes from files PRESENT on disk under payload/files/; `files remove
  // <path>` from the REGISTERED references. Both id-aware sources read the host id off the completion context.
  "files add": { args: ["payload-files-on-disk"] },
  "files remove": { args: ["payload-files-registered"] },
  // `bundle <id> templates add|remove <path>` (Family M) — the same two id-aware shapes against
  // payload/templates/ / the registered `payload.templates`.
  "templates add": { args: ["payload-templates-on-disk"] },
  "templates remove": { args: ["payload-templates-registered"] },
  // `bundle <id> scripts add|remove <path>` (Family N) — the same two id-aware shapes against installer-scripts/
  // (a sibling of payload/) / the registered `payload.scripts`.
  "scripts add": { args: ["payload-scripts-on-disk"] },
  "scripts remove": { args: ["payload-scripts-registered"] },
  // `bundle <id> skills add <name>` (Family O) — completes from the skill-folder NAMES present under
  // payload/agent-skills/ (the attachable skills; a brand-new name yields none). `skills remove <name>`
  // completes from the REGISTERED `payload.skills` names. Both id-aware (read the host id off the context).
  "skills add": { args: ["skills-on-disk"] },
  "skills remove": { args: ["skills-registered"] },
  // `bundle <id> installer-skills add <name>` (Family P) — completes from the helper-folder NAMES present under
  // installer-skills/ (the attachable helpers, matching the directory-scan `list`). `installer-skills remove
  // <name>` completes from the REGISTERED `installerSkills` names (AC79#4 — the deregister set). Both id-aware.
  "installer-skills add": { args: ["installer-skills-on-disk"] },
  "installer-skills remove": { args: ["installer-skills-registered"] },
};

/**
 * Build the per-bundle sub-program for a resolved `<id>`: a fresh commander {@link Command} (name `bundle <id>`)
 * carrying every {@link PER_BUNDLE_MODULES} leaf, with `exitOverride` so a usage/help/version outcome throws a
 * `CommanderError` the outer {@link runWithExit} maps, and its output routed to the SAME I/O sinks so help and
 * errors reach the user. The resolved `root` + `id` are threaded into each leaf (no re-resolution).
 *
 * @param ctx - The command context (ports + I/O).
 * @param root - The resolved project root.
 * @param id - The validated enabled bundle id.
 * @returns The configured per-bundle sub-program.
 */
function buildPerBundleProgram(ctx: CommandContext, root: string, id: string): Command {
  const sub = new Command();
  sub.name(`bundle ${id}`).description(`operate on bundle ${id} (doc 10)`);
  sub.exitOverride();
  sub.configureOutput({
    writeOut: (s) => ctx.io.out.write(s),
    writeErr: (s) => ctx.io.err.write(s),
    outputError: (s, _write) => ctx.io.err.write(s),
  });
  sub.showHelpAfterError();
  for (const module of PER_BUNDLE_MODULES) {
    module.register(sub, ctx, root, id);
  }
  return sub;
}

/**
 * The `bundle` group module: the FIXED verbs `new` / `enable` / `disable` (the bundle-membership lifecycle) PLUS
 * the dynamic `bundle <id> <subcommand>` routing (the hidden `*` catch-all → a per-bundle sub-program). The
 * fixed verbs are named subcommands commander matches first; a non-verb first token enters the per-bundle space.
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

    // ── bundle enable <id> [--no-advisor] ─────────────────────────────────────────────────────────────────
    // Add a previously-created-but-disabled bundle dir back to the manifest (doc 10 row 150). A mutation: ④
    // RERENDER re-includes it in the menu; ⑤ MATERIALISE the per-bundle set idempotently; unless --no-advisor
    // (or an advisor already exists), the shared advisor scaffold runs.
    const enableLeaf = group
      .command("enable")
      .description("enable a previously-created bundle directory in the manifest (doc 10)")
      .argument("<id>", "the disabled-but-present bundle id to enable")
      .option("--no-advisor", "skip the advisor scaffold")
      .action((id: string, opts: { advisor?: boolean }) => {
        const root = requireProject(ctx, parent);
        const result = runMutation(
          lifecycleDepsFor(ctx, root),
          { root },
          enableBundleSpec({ builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot }),
          { id, advisor: opts.advisor },
        );
        ctx.io.out.write(formatResult(result));
        writeWarnings(ctx, result.warnings);
      });
    withExamples(enableLeaf, [
      { command: "wpm bundle enable web-handoff", note: "enable a previously-created bundle" },
    ]);

    // ── bundle disable <id> ───────────────────────────────────────────────────────────────────────────────
    // Remove a bundle from the manifest, leaving its directory on disk but inert (doc 10 row 151). A mutation:
    // ④ RERENDER drops it from the menu. No file/advisor teardown (that is `bundle remove`).
    const disableLeaf = group
      .command("disable")
      .description("remove a bundle from the manifest (its directory stays on disk) (doc 10)")
      .argument("<id>", "the enabled bundle id to disable")
      .action((id: string) => {
        const root = requireProject(ctx, parent);
        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, disableBundleSpec(), {
          id,
        });
        ctx.io.out.write(formatResult(result));
      });
    withExamples(disableLeaf, [
      {
        command: "wpm bundle disable web-handoff",
        note: "drop a bundle from the menu (keeps its files on disk)",
      },
    ]);

    // ── bundle remove <id> [--yes] ──────────────────────────────────────────────────────────────────────────
    // DESTRUCTIVE full teardown (doc 10 row 153): after confirmation, drop <id> from the manifest, delete its
    // dir, delete its advisor stub, archive its authoring tasks, then ④ RERENDER drops it from the menu. The ONE
    // genuinely-new mechanic is AUTHOR CONFIRMATION — there is no prompt in the spine. The DECISION is made HERE,
    // in the shell (it owns process.stdin); the pure `removeBundleSpec` runs ONLY when confirmed (doc 13 §3:
    // stdin is not a port). `--yes` skips the prompt (the scriptable affirmative); without it the action prompts
    // and reads one line from `ctx.io.in`. Declining makes NO change and exits 0 (AC53#4 — "exits without
    // error"). The action is async (it awaits the stdin read); the main program's `parseAsync` in `run()` is
    // awaited, so the async rejection still flows through the shared `runWithExit` handler.
    const removeLeaf = group
      .command("remove")
      .description(
        "remove a bundle entirely: drop it from the manifest, delete its directory + advisor, archive its authoring tasks (doc 10)",
      )
      .argument(
        "<id>",
        "the bundle id to remove (its directory, advisor stub, and authoring tasks are deleted)",
      )
      .option("-y, --yes", "skip the destructive-action confirmation prompt")
      .action(async (id: string, opts: { yes?: boolean }) => {
        const root = requireProject(ctx, parent);

        // Existence probe (the shell owns the fs port; the pure operation `check` has none): a bundle is
        // removable iff it is enabled in the manifest OR has a dir on disk. Neither ⇒ a typed NotFound (exit 1)
        // BEFORE confirming — so a typo never prompts then silently no-ops (AC53#2/#5: act only on a real bundle).
        const manifest = parseManifest(parseYaml(ctx.deps.fs.read(join(root, MANIFEST_FILE))));
        const bundles = manifest.ok ? (manifest.value.bundles as readonly string[]) : [];
        const dirExists = ctx.deps.fs.exists(join(root, "bundles", id));
        if (!isRemovableBundle({ manifest: { bundles } }, id, dirExists)) {
          throw noSuchBundleError(id);
        }

        // AC53#1/#4 — confirm unless --yes; a declined confirmation makes no change and exits 0. With no input
        // stream available (and no --yes), treat as a decline — the safe default for a destructive op.
        let confirmed = opts.yes === true;
        if (!confirmed && ctx.io.in !== undefined) {
          ctx.io.err.write(
            `remove bundle "${id}"? this deletes bundles/${id}/ and its advisor stub, and archives its authoring tasks. [y/N] `,
          );
          confirmed = await readConfirmation(ctx.io.in);
        }
        if (!confirmed) {
          // AC53#4: no change, exit 0 (NOT an error).
          ctx.io.out.write(`aborted — nothing removed\n`);
          return;
        }

        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, removeBundleSpec(), {
          id,
        });
        ctx.io.out.write(formatResult(result));
      });
    withExamples(removeLeaf, [
      {
        command: "wpm bundle remove web-handoff --yes",
        note: "delete a bundle and all its scaffolding without the confirmation prompt",
      },
    ]);

    // ── bundle list ─────────────────────────────────────────────────────────────────────────────────────────
    // READ (doc 10 row 154): enumerate the enabled bundles and print, per bundle, its id, its bundle.yml version,
    // and the counts of kind:state vs kind:migration tasks in its install-backlog. The version comes from the
    // loaded project (`project.bundles` already parsed each enabled bundle.yml); the kind counts are an fs SCAN of
    // bundles/<id>/install-backlog/tasks/ — NOT a BacklogMd-port read, because the install-backlog is not a
    // discoverable Backlog.md root (doc 07 line 67). The scan lives in the shell (which owns the fs port) and is
    // threaded into the pure `listBundlesSpec` read, mirroring how `bundle <id> show` threads its file tree.
    // Read-only — `runRead` writes nothing (AC54#2).
    const listLeaf = group
      .command("list")
      .description(
        "list each enabled bundle with its version and its install-backlog state/migration task counts (doc 10)",
      )
      .action(() => {
        const root = requireProject(ctx, parent);
        const manifest = parseManifest(parseYaml(ctx.deps.fs.read(join(root, MANIFEST_FILE))));
        const ids = manifest.ok ? (manifest.value.bundles as readonly string[]) : [];
        const counts = new Map(
          ids.map((id) => [id, installBacklogKindCounts(ctx.deps.fs, root, id)] as const),
        );
        const { value: rows } = runRead(ctx.deps.fs, { root }, listBundlesSpec(), { counts });
        ctx.io.out.write(formatBundleList(rows));
      });
    withExamples(listLeaf, [
      {
        command: "wpm bundle list",
        note: "show each bundle's version + install-backlog task counts",
      },
    ]);

    // ── bundle template (show / set) ────────────────────────────────────────────────────────────────────────
    // The project's DEFAULT bundle SCAFFOLD at bundles/bundle-template/ — the files/ tree `bundle new`
    // conceptually defaults to (doc 10 line 150 step 2). `template` is a FIXED bundle verb (in
    // RESERVED_BUNDLE_VERBS), so it is a fixed SUBGROUP here, distinct from the TOP-LEVEL `wpm template` group
    // (which reads the template REGISTRY). `show` inspects bundles/bundle-template/ (read-only); `set <name>`
    // replaces its contents from a registered bundle-scope template.
    const template = group
      .command("template")
      .description("the project's default bundle scaffold at bundles/bundle-template/ (doc 10)");

    // ── bundle template show ────────────────────────────────────────────────────────────────────────────────
    // READ (doc 10 row 155): print bundles/bundle-template/'s metadata + a tree summary. `init` ships no
    // bundles/, so the dir is absent in a fresh project ⇒ a typed NotFound (exit 1) naming it + suggesting `set`.
    // Read-only (AC55#2).
    const templateShowLeaf = template
      .command("show")
      .description(
        "print the project default bundle template's metadata and a tree summary of bundles/bundle-template/ (doc 10)",
      )
      .action(() => {
        const root = requireProject(ctx, parent);
        const dir = join(root, "bundles", BUNDLE_TEMPLATE_DIR);
        if (!ctx.deps.fs.exists(dir)) {
          throw new NotFoundError(
            `no bundle template at bundles/${BUNDLE_TEMPLATE_DIR} — run \`wpm bundle template set <name>\` to create it from a registered bundle template`,
          );
        }
        ctx.io.out.write(formatBundleTemplate(ctx.deps.fs, dir));
      });
    withExamples(templateShowLeaf, [
      {
        command: "wpm bundle template show",
        note: "inspect the project default bundle scaffold",
      },
    ]);

    // ── bundle template set <name> ──────────────────────────────────────────────────────────────────────────
    // MUTATION (doc 10 row 156): resolve <name> as a BUNDLE-scope template, then REPLACE bundles/bundle-template/
    // contents from its files/ tree. A name that does not resolve OR resolves to a non-bundle scope ⇒ a typed
    // error (exit 1) changing nothing (AC56#2). On success, clear (fs.remove) THEN write each template file
    // VERBATIM — NO {{placeholder}} substitution, because the scaffold keeps its placeholders for `bundle new` to
    // fill when it instantiates from this template. This is a direct shell effect (resolve in core via the pure
    // resolveTemplate; clear+write via the fs port), NOT runMutation — it touches only the scaffold dir, which is
    // not part of the loaded Project nor an input to the front-door deriver, so there is nothing to ④ RERENDER.
    const templateSetLeaf = template
      .command("set")
      .description(
        "replace the project default bundle scaffold (bundles/bundle-template/) from a registered bundle-scope template (doc 10)",
      )
      .argument(
        "<name>",
        "the bundle-scope template to copy from (its files/ tree replaces bundles/bundle-template/)",
      )
      .action((name: string) => {
        const root = requireProject(ctx, parent);
        const resolution = resolveTemplate(name, "bundle", {
          fs: ctx.deps.fs,
          builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot,
          projectTemplatesRoot: join(root, "templates"),
        });
        if (!resolution.found) {
          // AC56#2: a name that does not resolve as a BUNDLE template → typed NotFound (exit 1), nothing changed.
          // (A project-scope name is ALREADY not-found here: a `bundle` resolution only searches the `bundle/`
          // scope dir, so a `project/`-scoped template like `minimal` does not resolve as a bundle template.)
          throw new NotFoundError(
            `bundle template "${name}" not found (searched: ${resolution.searched.join(", ")})`,
          );
        }
        // Defense-in-depth (AC56#2 wrong-scope): the resolver only finds `bundle/`-scope templates here, so the
        // descriptor's scope is bundle by construction — assert it anyway so a mis-scoped descriptor is rejected
        // before any write.
        if (resolution.template.scope !== "bundle") {
          throw new ValidationError(
            `template "${name}" is not a bundle-scope template (scope: ${resolution.template.scope})`,
          );
        }

        // AC56#1: REPLACE the contents — clear THEN copy (the fs port's copyTree MERGES into an existing dir, so a
        // true replace is remove-first). Write each resolved file verbatim (no substitution).
        const dest = join(root, "bundles", BUNDLE_TEMPLATE_DIR);
        ctx.deps.fs.remove(dest);
        for (const file of resolution.template.files) {
          ctx.deps.fs.write(join(dest, file.path), file.content);
        }
        ctx.io.out.write(
          `set bundle template from "${name}" → bundles/${BUNDLE_TEMPLATE_DIR}/ (${resolution.template.files.length} file(s))\n`,
        );
      });
    withExamples(templateSetLeaf, [
      {
        command: "wpm bundle template set default",
        note: "reset the project default bundle scaffold to the built-in `default`",
      },
    ]);

    // The dynamic `bundle <id> <subcommand>` space is routed BEFORE commander (in `run()` →
    // {@link dispatchPerBundle}), not as a subcommand here — see that function for why (commander's group-level
    // `--help` is greedy and would shadow a per-bundle leaf's `--help`). The fixed verbs above are the only
    // `bundle` subcommands commander itself dispatches.
  },
};

/** The reserved `bundle` verbs that are NOT dynamic bundle ids — handled by commander's named subcommands. */
function isReservedBundleVerb(token: string): boolean {
  return RESERVED_BUNDLE_VERBS.includes(token);
}

/**
 * Whether `argv` is a per-bundle invocation `bundle <id> …` that must be routed to the per-bundle sub-program
 * (rather than commander's main program). True when the first token is `bundle`, the second exists, is not a
 * flag, and is not a fixed `bundle` verb (`new`/`enable`/`disable`/`remove`/`list`/`template`) — i.e. it is a
 * dynamic bundle id. A bare `bundle`, `bundle <verb> …`, or `bundle --help` is NOT per-bundle (commander's main
 * program handles those, including the group help).
 *
 * @param argv - The user arguments (after the program name; may include the global `-C`/`--debug` anywhere).
 * @returns `true` when the line enters the per-bundle space.
 */
function isPerBundleInvocation(argv: readonly string[]): boolean {
  // Strip the global flags (`-C <path>`/`--project <path>`/`--debug`, wherever they appear) via the SHARED helper
  // so dispatch and completion recognise the per-bundle shape identically. After stripping, it is per-bundle iff
  // the first token is `bundle` and the second is a dynamic id (a non-flag, non-reserved-verb token).
  const tokens = stripGlobalOptions(argv);
  if (tokens[0] !== "bundle") {
    return false;
  }
  const next = tokens[1];
  return next !== undefined && !next.startsWith("-") && !isReservedBundleVerb(next);
}

/**
 * Route a per-bundle invocation `bundle <id> <subcommand> …` (doc 10 §"per-bundle operations"). Resolves the
 * project + the enabled bundle, then parses the per-bundle tail with a per-bundle sub-program (each leaf parsed
 * NATIVELY — its own options/choices/help). This runs BEFORE commander's main program (in {@link run}) so a
 * per-bundle leaf's `--help`/`-h` is NOT shadowed by the `bundle` group's greedy auto-help (which fires for any
 * `--help` among the group's args); the named verbs + bare `bundle` still go through the main program.
 *
 * The global `-C/--project` is honoured wherever it appears (extracted here, exactly as commander would). The
 * inner `parseAsync` runs under the caller's {@link runWithExit}, so its CommanderErrors (invalid-choice/help/
 * version → 2/0) and a leaf's `DomainError` (→ 1) map through the one handler with no new code.
 *
 * @param argv - The full user argv (`… bundle <id> <tail…>`, with `-C` possibly anywhere).
 * @param deps - The assembled dependencies.
 * @param io - The output sinks + debug flag.
 */
async function dispatchPerBundle(argv: readonly string[], deps: CliDeps, io: CliIo): Promise<void> {
  // Extract the global `-C/--project` value, then strip ALL globals (the SHARED helper, the same one completion
  // uses) to recover `["bundle", "<id>", ...tail]`.
  const projectOverride = extractProjectOption(argv);
  const positional = stripGlobalOptions(argv);
  const id = positional[1] as string;
  const tail = positional.slice(2);

  const ctx: CommandContext = { deps, io };
  // A `--help`/`-h` request renders the per-bundle leaf's usage and must NOT require a project or an enabled
  // bundle (help is help — consistent with the named verbs' `--help`). The sub-program (built with a placeholder
  // root; no leaf action runs for a help request) handles `--help` and throws `commander.help` → exit 0.
  if (tail.includes("--help") || tail.includes("-h")) {
    await buildPerBundleProgram(ctx, "", id).parseAsync(tail, { from: "user" });
    return;
  }

  const context = resolveContext(
    { fs: deps.fs, env: deps.env },
    projectOverride !== undefined ? { projectOverride } : undefined,
  );
  if (!context.found) {
    throw new NotFoundError(NO_PROJECT_MESSAGE);
  }
  const root = context.root;
  requireEnabledBundle(ctx, root, id);
  await buildPerBundleProgram(ctx, root, id).parseAsync(tail, { from: "user" });
}

/** Extract the `-C/--project <path>` value from `argv` (the global project override), or `undefined`. */
function extractProjectOption(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === "-C" || argv[i] === "--project") {
      return argv[i + 1];
    }
  }
  return undefined;
}

/**
 * Strip the GLOBAL flags (`-C <path>` / `--project <path>` (each consumes its value) and the boolean `--debug`)
 * from a token list, leaving only the command tokens. This is the SINGLE source of the global-stripping used by
 * BOTH per-bundle dispatch ({@link isPerBundleInvocation}, {@link dispatchPerBundle}) AND per-bundle completion
 * ({@link computeCompletions}) — so the two cannot drift on global-flag placement (the review's S1: completion
 * must recognise `wpm -C <dir> bundle web …` as per-bundle exactly as dispatch does). `-C`/`--project` consume
 * the FOLLOWING token as their value (a trailing `-C` with no value contributes nothing); every other token —
 * including the final partial during completion — is preserved in order.
 *
 * @param tokens - The raw tokens (after the program name).
 * @returns The tokens with the global flags (and their values) removed, order preserved.
 */
function stripGlobalOptions(tokens: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === "-C" || tok === "--project") {
      i += 1; // also skip the value
      continue;
    }
    if (tok === "--debug") {
      continue;
    }
    out.push(tok as string);
  }
  return out;
}

/**
 * Parse repeated `--param key=value` flags (doc 10:137 step 3) into a substitution map. Each value splits on the
 * FIRST `=` (so a value may itself contain `=`); a pair with no `=` (or an empty key) is a USAGE error (exit 2),
 * the right class for a malformed argument (doc 13 §7). Returns an empty map when none were given.
 *
 * @param pairs - The raw `key=value` strings commander collected (repeatable option), or `undefined`.
 * @returns The parsed param map.
 * @throws {UsageError} If any pair lacks an `=` or has an empty key.
 */
function parseParams(pairs: readonly string[] | undefined): Map<string, string> {
  const params = new Map<string, string>();
  for (const pair of pairs ?? []) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      throw new UsageError(`invalid --param "${pair}": expected key=value`);
    }
    params.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return params;
}

/**
 * The `init <name>` command — the project-creating front door (task-34; doc 10 §`init`, all 12 steps). init is the
 * BOOTSTRAP: it CREATES a project, so its action does NOT resolve an existing one (no `resolveContext`) — it
 * resolves the TARGET DIR (where to write) and calls the {@link initProject} operation. The project root is
 * `--at <path>` when given, else `<cwd>/<name>` (doc 10 line 194: "init writes to `<path>` if `--at <path>` is
 * given (default cwd)"; doc 12's worked example `wpm init my-installer` then `cd my-installer` shows the
 * default-cwd case nests the project under `<name>`).
 *
 * Flags: `--template <name>` picks the project template (default `minimal`); `--list-templates` prints the
 * available project templates and exits WITHOUT creating anything (AC#6); `--param key=value` (repeatable) adds
 * placeholder-substitution values (AC#6). `--template`/`--list-templates` complete from the project templates.
 */
const initModule: CommandModule = {
  register(parent, ctx) {
    const leaf = parent
      .command("init")
      .description(
        "scaffold a new authoring workspace from a project template (default: minimal) (doc 10)",
      )
      .argument(
        "<name>",
        "the new project's name (kebab-case; becomes the manifest name and the installer-skill name)",
      )
      .option(
        "--at <path>",
        "create the workspace at <path> (default: a <name>/ directory in the cwd)",
      )
      .option("--template <name>", "the project template to scaffold from", "minimal")
      .option(
        "--list-templates",
        "list the available project templates and exit without creating a project",
      )
      .option(
        "--param <key=value>",
        "a placeholder-substitution value (repeatable, e.g. --param author=me)",
        (value: string, previous: string[] = []) => [...previous, value],
      )
      .action(
        (
          name: string,
          opts: {
            at?: string;
            template?: string;
            listTemplates?: boolean;
            param?: string[];
          },
        ) => {
          // --list-templates (AC#6): print the available PROJECT templates and exit 0, creating nothing. This
          // fires before any target-dir resolution or write — `init --list-templates demo` inspects only.
          if (opts.listTemplates === true) {
            const templates = listTemplates(
              { fs: ctx.deps.fs, builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot },
              { scope: "project" },
            );
            ctx.io.out.write(formatProjectTemplateList(templates));
            return;
          }

          // Resolve the target dir: --at <path> (resolved against cwd) when given, else <cwd>/<name>.
          const cwd = ctx.deps.env.cwd();
          const targetDir = opts.at !== undefined ? resolve(cwd, opts.at) : join(cwd, name);
          const params = parseParams(opts.param);

          const result = initProject(
            {
              fs: ctx.deps.fs,
              backlog: ctx.deps.backlog,
              builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot,
            },
            {
              targetDir,
              name,
              ...(opts.template !== undefined ? { templateName: opts.template } : {}),
              params,
            },
          );
          ctx.io.out.write(formatResult(result));
        },
      );

    withExamples(leaf, [
      {
        command: "wpm init hermes-handoff --template minimal --at ./my-installer",
        note: "scaffold a project at ./my-installer from the minimal template (or `--list-templates` to list them, `--param k=v` to add substitutions)",
      },
    ]);
  },
};

/** Render the `init --list-templates` output: the available project-scope template names, one per line. */
function formatProjectTemplateList(templates: readonly TemplateSummary[]): string {
  const lines = ["Available project templates:"];
  if (templates.length === 0) {
    lines.push("  (none)");
  }
  for (const t of templates) {
    lines.push(`  ${t.name}`);
  }
  return `${lines.join("\n")}\n`;
}

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

    // ── project installer-skills (+ add / list / remove) ────────────────────────────────────────────────────
    // The PROJECT-scoped install-time helper-skill family (Family F; doc 10 rows 178/179/180) — the project
    // analogue of `bundle <id> installer-skills` (P), wired as a `project` subgroup (like `targets`). `add` is the
    // SAME 3-way scaffold-or-attach (the existence probe + dispatch lives here, the shell owning the fs port),
    // PLUS a project-only reserved-name refusal (AC45#4); `list` SCANS the root installer-skills/ (excluding the
    // main installer + advisors, AC46#1) via the scope-agnostic scan spec with the walk in the shell; `remove`
    // deregisters from manifest.yml's installerSkills, leaving the SKILL.md on disk.
    const installerSkills = group
      .command("installer-skills")
      .description(
        "register or inspect the project's install-time helper skills (not delivered) (doc 10)",
      );

    // ── project installer-skills add <name> [--path <path>] ───────────────────────────────────────────────
    const isAddLeaf = installerSkills
      .command("add")
      .argument(
        "<name>",
        "the install-time helper skill's name (its SKILL.md folder under installer-skills/<name>/)",
      )
      .option(
        "--path <path>",
        "attach an existing SKILL.md at this project-relative path instead of the conventional location",
      )
      .description(
        "attach an existing project install-time helper skill, or scaffold a stub + queue its writing if none exists (doc 10)",
      )
      .action((name: string, opts: { path?: string }) => {
        const root = requireProject(ctx, parent);
        // AC45#4: refuse a reserved name (ends in -advisor, or == `<project>-installer`) as a USAGE error (exit 2)
        // BEFORE the 3-way probe — a reserved name is invalid regardless of --path. The project name is read from
        // manifest.yml. (Defense-in-depth: the operation `check` re-asserts this.)
        const reservedFor = projectName(ctx, root);
        if (isReservedInstallerSkillName(name, reservedFor)) {
          const reason = name.endsWith("-advisor")
            ? 'names ending in "-advisor" are reserved for bundle advisors'
            : `"${name}" is the main installer skill (${reservedFor}-installer)`;
          throw new UsageError(
            `installer-skill name "${name}" is reserved — ${reason}; pick another name`,
          );
        }

        // Resolve the target SKILL.md (project-root-relative): --path if given, else the conventional
        // installer-skills/<name>/SKILL.md. The 3-way existence probe lives here (the shell owns the fs port).
        const conventional = conventionalProjectSkillPath(name);
        const targetRel = opts.path ?? conventional;
        const exists = ctx.deps.fs.exists(join(root, targetRel));

        if (opts.path !== undefined && !exists) {
          // AC45#3: --path given but nothing there → typed error (exit 1), register nothing.
          throw new NotFoundError(
            `no SKILL.md at ${opts.path} — omit --path to scaffold a stub at ${conventional}, or place the file there first`,
          );
        }

        const result = exists
          ? runMutation(lifecycleDepsFor(ctx, root), { root }, attachProjectInstallerSkillSpec(), {
              name,
              path: targetRel,
            })
          : runMutation(
              lifecycleDepsFor(ctx, root),
              { root },
              scaffoldProjectInstallerSkillSpec({
                builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot,
              }),
              { name },
            );
        // AC45#6: the summary says attached vs scaffolded; formatResult adds the `materialised: N` line for scaffold.
        ctx.io.out.write(formatResult(result));
      });
    withExamples(isAddLeaf, [
      {
        command: "wpm project installer-skills add detect-node",
        note: "attach the SKILL.md the agent placed (or --path it), else scaffold a stub + queue its writing",
      },
    ]);

    // ── project installer-skills list ─────────────────────────────────────────────────────────────────────
    // SCAN (doc 10 row 179): enumerate the root installer-skills/ helper folders, EXCLUDING the main
    // <project>-installer + any *-advisor. The fs walk + exclusion live in the shell; the pure scan spec projects
    // the threaded names.
    const isListLeaf = installerSkills
      .command("list")
      .description(
        "list the project's install-time helper skills (scanned under installer-skills/, excluding the main installer + advisors) (doc 10)",
      )
      .action(() => {
        const root = requireProject(ctx, parent);
        const scannedNames = projectInstallerSkillNames(ctx, root);
        const { value } = runRead(ctx.deps.fs, { root }, scanInstallerSkillsSpec(), {
          id: "",
          scannedNames,
        });
        ctx.io.out.write(formatInstallerSkillList(value));
      });
    withExamples(isListLeaf, [
      {
        command: "wpm project installer-skills list",
        note: "list the project's install-time helper skills",
      },
    ]);

    // ── project installer-skills remove <name> ────────────────────────────────────────────────────────────
    const isRemoveLeaf = installerSkills
      .command("remove")
      .argument(
        "<name>",
        "the registered install-time helper to deregister (the SKILL.md is left on disk)",
      )
      .description(
        "deregister a project install-time helper skill, leaving its SKILL.md on disk (doc 10)",
      )
      .action((name: string) => {
        const root = requireProject(ctx, parent);
        const result = runMutation(
          lifecycleDepsFor(ctx, root),
          { root },
          removeProjectInstallerSkillSpec(),
          { name },
        );
        ctx.io.out.write(formatResult(result));
      });
    withExamples(isRemoveLeaf, [
      {
        command: "wpm project installer-skills remove detect-node",
        note: "deregister detect-node (its SKILL.md stays on disk)",
      },
    ]);

    // ── project meta [--name ...] [--description ...] [--license ...] [--repository ...] [--author ...] ────────
    // Edit the project's descriptive metadata in manifest.yml; only PROVIDED flags change (omitted untouched —
    // AC38#1), comment-and-key-order-preservingly (AC38#2). A `--name` change re-renders the derived front-door +
    // installer skill (the ④ RERENDER beat, since the project name feeds them — doc 10 line 34). With NO flags it
    // is an exit-0 NO-OP that touches nothing and reports it (AC38#3) — distinct from `bundle <id> meta`'s exit-2.
    const metaLeaf = group
      .command("meta")
      .description(
        "edit the project's metadata in manifest.yml: name, description, license, repository, author (doc 10)",
      )
      .option(
        "--name <name>",
        "set the project name (also re-renders AGENTS.md + the installer skill)",
      )
      .option("--description <description>", "set the project's one-line description")
      .option("--license <license>", "set the project's SPDX license identifier")
      .option("--repository <repository>", "set the project's repository URL")
      .option("--author <author>", "set the project's author")
      .action(
        (opts: {
          name?: string;
          description?: string;
          license?: string;
          repository?: string;
          author?: string;
        }) => {
          const root = requireProject(ctx, parent);
          // AC38#3: with NO flags, make no change and report nothing was updated — exit 0, WITHOUT entering the
          // lifecycle (so ④ RERENDER does not run; nothing on disk changes, a true no-op).
          const provided =
            opts.name !== undefined ||
            opts.description !== undefined ||
            opts.license !== undefined ||
            opts.repository !== undefined ||
            opts.author !== undefined;
          if (!provided) {
            ctx.io.out.write(
              "nothing to update — pass at least one of --name, --description, --license, --repository, --author\n",
            );
            return;
          }
          const result = runMutation(lifecycleDepsFor(ctx, root), { root }, editProjectMetaSpec(), {
            ...(opts.name !== undefined ? { name: opts.name } : {}),
            ...(opts.description !== undefined ? { description: opts.description } : {}),
            ...(opts.license !== undefined ? { license: opts.license } : {}),
            ...(opts.repository !== undefined ? { repository: opts.repository } : {}),
            ...(opts.author !== undefined ? { author: opts.author } : {}),
          });
          ctx.io.out.write(formatResult(result));
        },
      );
    withExamples(metaLeaf, [
      {
        command:
          'wpm project meta --name acme-installer --description "Acme onboarding" --license MIT',
        note: "set the project's name, description, and license (only the named fields change)",
      },
    ]);

    // ── project version ───────────────────────────────────────────────────────────────────────────────────
    // A command WITH subcommands AND its own action: bare `project version` runs this action (the read);
    // `bump`/`set` dispatch to their own leaves. commander lists the subcommands under "Commands:" in help.
    const version = group
      .command("version")
      .description("the project's release version: print it, or bump/set it (doc 10)")
      .action(() => {
        const root = requireProject(ctx, parent);
        const { value } = runRead(ctx.deps.fs, { root }, readVersionSpec(), undefined);
        ctx.io.out.write(`${value}\n`);
      });
    withExamples(version, [
      { command: "wpm project version", note: "print the project's release version" },
    ]);

    // ── project version bump <major|minor|patch> ──────────────────────────────────────────────────────────
    // `.choices([...BUMP_LEVELS])` on the positional makes a bad value AND a missing required arg a commander
    // USAGE error (exit 2, changing nothing — AC#2) without a hand-rolled check; the level set is the model's
    // single source (the same `BUMP_LEVELS` the `"bump-levels"` completion enum uses).
    const bumpLeaf = version
      .command("bump")
      .addArgument(
        new Argument("<level>", "the semver level to advance the version by").choices([
          ...BUMP_LEVELS,
        ]),
      )
      .description(
        "advance the release version by a semver level (major, minor, or patch) (doc 10)",
      )
      .action((level: (typeof BUMP_LEVELS)[number]) => {
        const root = requireProject(ctx, parent);
        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, bumpVersionSpec(), {
          level,
        });
        ctx.io.out.write(formatResult(result));
      });
    withExamples(bumpLeaf, [
      {
        command: "wpm project version bump minor",
        note: "advance the minor version (e.g. 1.2.3 → 1.3.0)",
      },
    ]);

    // ── project version set <explicit> ────────────────────────────────────────────────────────────────────
    // A non-semver `<explicit>` is a bad CLI argument ⇒ a USAGE error (exit 2, changing nothing — AC#2; doc 13
    // §7). Validate at the boundary via `parseSemVer` and raise `UsageError` (NOT `ValidationError`, which is
    // exit 1) so the operation receives an already-valid `SemVer`.
    const setLeaf = version
      .command("set")
      .argument("<version>", "the explicit semver to set as the release version")
      .description("set the release version to an explicit semver value (doc 10)")
      .action((versionRaw: string) => {
        const root = requireProject(ctx, parent);
        const parsed = parseSemVer(versionRaw);
        if (!parsed.ok) {
          throw new UsageError(parsed.problem.message);
        }
        const result = runMutation(lifecycleDepsFor(ctx, root), { root }, setVersionSpec(), {
          version: parsed.value,
        });
        ctx.io.out.write(formatResult(result));
      });
    withExamples(setLeaf, [
      { command: "wpm project version set 1.0.0", note: "pin the release version to 1.0.0" },
    ]);

    // ── project show [--json] ─────────────────────────────────────────────────────────────────────────────
    // A READ: project the orientation off the loaded project and render it as text, or as JSON with --json (the
    // SAME value, so the two forms cannot diverge). Read-only (AC 37#3) — `runRead` writes nothing.
    const showLeaf = group
      .command("show")
      .description(
        "print the project's orientation: name, version, targets, and enabled bundles (doc 10)",
      )
      .option("--json", "emit the orientation as machine-readable JSON")
      .action((opts: { json?: boolean }) => {
        const root = requireProject(ctx, parent);
        const { value } = runRead(ctx.deps.fs, { root }, showProjectSpec(), undefined);
        ctx.io.out.write(
          opts.json === true ? `${JSON.stringify(value, null, 2)}\n` : formatOrientation(value),
        );
      });
    withExamples(showLeaf, [
      { command: "wpm project show --json", note: "print the orientation as JSON for tooling" },
    ]);

    // ── project root ──────────────────────────────────────────────────────────────────────────────────────
    // A READ that prints JUST the resolved root path on a single line (no padding/decoration) so it composes in
    // a shell substitution: `cd "$(wpm project root)/bundles/…"` (doc 10:204). `requireProject` already resolved
    // it; print it directly — read-only, nothing reloaded.
    const rootLeaf = group
      .command("root")
      .description(
        "print the resolved project root path on one line (composable in $(...)) (doc 10)",
      )
      .action(() => {
        const root = requireProject(ctx, parent);
        ctx.io.out.write(`${root}\n`);
      });
    withExamples(rootLeaf, [
      {
        command: 'cd "$(wpm project root)"',
        note: "change into the project root from anywhere inside it",
      },
    ]);

    // ── project validate ──────────────────────────────────────────────────────────────────────────────────
    // A READ that REPORTS coherence findings (doc 10 row 148) by backing the task-20 `validateProject` service,
    // which aggregates EVERY problem in one pass (AC#2). The CLI reads the `bundles/` directory names (the fs
    // touch the pure service needs) and threads them as the read input; a coherent project exits 0, and ANY
    // finding exits 1 (AC#4) — achieved by printing the per-finding lines to stdout, then throwing a
    // `ValidationError` (category → exit 1, no stack) carrying a terse summary so the shared handler sets the
    // code. No side effects (AC#3).
    const validateLeaf = group
      .command("validate")
      .description("check project coherence and report every finding (doc 10)")
      .action(() => {
        const root = requireProject(ctx, parent);
        const bundleDirNames = bundleDirectoryNames(ctx.deps.fs, root);
        const { value: report } = runRead(
          ctx.deps.fs,
          { root },
          validateProjectSpec(),
          bundleDirNames,
        );
        if (report.ok) {
          ctx.io.out.write("project is coherent: no problems found\n");
          return;
        }
        for (const problem of report.problems) {
          const where = problem.field !== undefined ? ` [${problem.field}]` : "";
          ctx.io.out.write(`- ${problem.message}${where}\n`);
        }
        // The findings ARE the output (above); throw so the handler maps this to exit 1 (AC#4) without a stack.
        throw new ValidationError(
          `project validation failed: ${report.problems.length} finding(s)`,
        );
      });
    withExamples(validateLeaf, [
      { command: "wpm project validate", note: "report any project-coherence problems" },
    ]);
  },
};

/** The directory under a project root that holds the bundles (doc 10). */
const BUNDLES_DIR = "bundles";

/**
 * List the bundle DIRECTORY names under `<root>/bundles/` (the fs touch the pure `validateProject` service needs
 * to detect orphans). Returns `[]` when `bundles/` does not exist — an init'd project with no bundles has none.
 * Only directory entries are returned; stray files are not bundle dirs.
 */
function bundleDirectoryNames(fs: FileSystem, root: string): string[] {
  const bundlesPath = join(root, BUNDLES_DIR);
  if (!fs.exists(bundlesPath)) {
    return [];
  }
  return fs
    .list(bundlesPath)
    .filter((entry) => entry.kind === "directory")
    .map((entry) => entry.name);
}

/**
 * Compute the {@link BuildPlan} for the project rooted at `root` (the shell glue every `build` leaf shares). Loads
 * the project through the canonical {@link loadProject} (so build's view is byte-identical to every command's),
 * reads the `bundles/` directory names for the validate gate, and threads both — plus the FileSystem port — into
 * the pure {@link computeBuildPlan}. The pure plan does all the work (validate + frozen-lockfile + shippable
 * enumeration); this only assembles its inputs. No effect.
 *
 * @param ctx - The command context (ports).
 * @param root - The resolved project root.
 * @returns The build plan.
 */
function loadBuildPlan(ctx: CommandContext, root: string): BuildPlan {
  const project = loadProject(ctx.deps.fs, root);
  return computeBuildPlan(ctx.deps.fs, root, {
    project,
    enabledBundleIds: project.manifest.bundles,
    bundleDirectoryNames: bundleDirectoryNames(ctx.deps.fs, root),
  });
}

/**
 * Format a {@link BuildPlan} as the human-readable `build` output (output is not a port — doc 13 §3). On success
 * it prints the would-ship file tree (one root-relative path per line) and, for each vendored artifact, its name +
 * locked version + source (doc 08's plan-preview; AC82#3). On failure it prints the validation findings and/or the
 * frozen-lockfile drift so the author sees exactly what to fix. The COMMAND decides the exit code from `plan.ok`;
 * this only renders.
 *
 * @param plan - The computed build plan.
 * @returns The formatted report, newline-terminated.
 */
function formatBuildPlan(plan: BuildPlan): string {
  const lines: string[] = [];

  // Validation findings (AC82#1) — each problem on its own line, matching `project validate`'s shape.
  if (!plan.validation.ok) {
    lines.push("validation failed:");
    for (const problem of plan.validation.problems) {
      const where = problem.field !== undefined ? ` [${problem.field}]` : "";
      lines.push(`  - ${problem.message}${where}`);
    }
  }

  // Frozen-lockfile drift (AC82#2) — name the drifted / missing / extra vendored artifacts.
  if (!plan.lock.ok) {
    lines.push("wpm.lock check failed (frozen-lockfile):");
    for (const name of plan.lock.drifted) {
      lines.push(`  - drifted: ${name} (vendored content no longer matches its locked hash)`);
    }
    for (const name of plan.lock.missing) {
      lines.push(`  - missing: ${name} (pinned in wpm.lock but absent under installer-skills/)`);
    }
    for (const name of plan.lock.extra) {
      lines.push(`  - extra: ${name} (present but not pinned in wpm.lock)`);
    }
  }

  if (!plan.ok) {
    return `${lines.join("\n")}\n`;
  }

  // Success: the would-ship tree (AC82#3) + the vendored summary.
  lines.push(`would ship ${plan.shippable.length} file(s):`);
  for (const path of plan.shippable) {
    lines.push(`  ${path}`);
  }
  if (plan.vendored.length > 0) {
    lines.push("vendored artifacts (frozen-lockfile, OK):");
    for (const artifact of plan.vendored) {
      lines.push(`  ${artifact.name}  ${artifact.version}  (${artifact.source})`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The `build` group module (doc 10 §`build`) — `build dry-run` / `build package` / `build publish` (tasks 82/83/
 * 84). All three are project-BOUND (each resolves the project via {@link requireProject} — the canonical
 * no-project error — before computing the plan) and share {@link loadBuildPlan} (the pure plan) + the
 * {@link formatBuildPlan} renderer. `dry-run` performs NO effect (plan only); `package`/`publish` (later tasks)
 * call the packager adapter for the archiving/pushing effect. The architecture's pure/infra split lives here: the
 * plan is computed in `src/core/operations/build.ts` (pure over the ports), the effect in `src/adapters/
 * packager.ts` (infra) — never in the core.
 */
const buildModule: CommandModule = {
  register(parent, ctx) {
    const group = parent
      .command("build")
      .description("package the project for distribution (doc 10)");

    // ── build dry-run ─────────────────────────────────────────────────────────────────────────────────────────
    // Validate + preview what would ship, producing NO artefact (doc 10 row 181). Runs the pure plan: validate
    // (fail-fast — AC82#1), verify wpm.lock against the vendored content (fail on drift; a fresh project with no
    // wpm.lock passes trivially — AC82#2), then print the would-ship tree + each vendored artifact's locked
    // version + source (AC82#3). Exit 0 iff the plan is ok, else exit 1 (AC82#4) — the findings are printed, then
    // a ValidationError (category → exit 1, no stack) carries the summary so the shared handler sets the code.
    const dryRun = group
      .command("dry-run")
      .description(
        "validate the project and preview the file tree that would ship, producing no artefact (doc 10)",
      )
      .action(() => {
        const root = requireProject(ctx, parent); // AC82#5 (canonical no-project NotFound, exit 1)
        const plan = loadBuildPlan(ctx, root);
        ctx.io.out.write(formatBuildPlan(plan));
        if (!plan.ok) {
          // The findings ARE the output (above); throw so the handler maps this to exit 1 (AC82#4) without a stack.
          const reason = !plan.validation.ok
            ? `${plan.validation.problems.length} validation finding(s)`
            : "wpm.lock drift";
          throw new ValidationError(`build dry-run failed: ${reason}`);
        }
      });
    withExamples(dryRun, [
      {
        command: "wpm build dry-run",
        note: "validate + preview the shippable file tree without producing an artefact",
      },
    ]);

    // ── build package [--format zip|tarball|git] ──────────────────────────────────────────────────────────────
    // Produce a distributable archive of the shippable set (doc 10 row 182). Runs the SAME pure plan as dry-run —
    // validate + verify wpm.lock — and FAILS before producing anything if the plan is not ok (AC83#1). On success
    // the packager adapter (infra) archives EXACTLY the plan's shippable files in `--format` (default zip), and the
    // command prints the output path (AC83#2). `.choices([...BUILD_FORMATS])` makes an unsupported `--format` VALUE
    // a commander usage error → exit 2 (AC83#3); a missing archiving TOOL for a VALID format is an environment
    // failure the adapter raises as a ValidationError → exit 1 (distinct from the bad-value exit 2). The archive is
    // written to the cwd (never the project root, so a re-run cannot pollute the ship set).
    const pkg = group
      .command("package")
      .description("produce a distributable archive of the shippable file set (doc 10)")
      .addOption(
        new Option("--format <format>", "the archive format")
          .choices([...BUILD_FORMATS])
          .default("zip"),
      )
      .action((opts: { format: BuildFormat }) => {
        const root = requireProject(ctx, parent); // AC83#4 (canonical no-project NotFound, exit 1)
        const plan = loadBuildPlan(ctx, root);
        if (!plan.ok) {
          // AC83#1: validate + lock must pass BEFORE producing anything. Print the findings, then exit 1.
          ctx.io.out.write(formatBuildPlan(plan));
          const reason = !plan.validation.ok
            ? `${plan.validation.problems.length} validation finding(s)`
            : "wpm.lock drift";
          throw new ValidationError(`build package failed: ${reason}`);
        }
        const out = createArchive({
          root,
          outDir: ctx.deps.env.cwd(),
          baseName: `${plan.name}-${plan.version}`,
          format: opts.format,
          files: plan.shippable,
        });
        ctx.io.out.write(`packaged ${plan.name} ${plan.version} → ${out}\n`); // AC83#2
      });
    withExamples(pkg, [
      {
        command: "wpm build package --format tarball",
        note: "produce a .tgz of the shippable set (formats: zip [default], tarball, git)",
      },
    ]);

    // ── build publish <destination> ───────────────────────────────────────────────────────────────────────────
    // Build the package, THEN push it to <destination> (doc 10 row 183). ORDER is the contract: the package is
    // built FIRST (validate + verify wpm.lock + produce the archive), and ONLY on success is it pushed — a failure
    // in the build step (validation, lock drift, or the archive itself) throws BEFORE the push, so nothing is
    // published (AC84#1/#2). The destination is resolved by the packager: an existing local directory receives a
    // copy of the archive; anything else is treated as a git remote (`git push <dest> HEAD`). A real
    // registry/npm publish is the same shell-out and is deferred to v2 (doc 12). `--format` mirrors `build
    // package` (default zip) so a publish can choose a format whose tool is present.
    const publish = group
      .command("publish")
      .description("build the package and push it to a destination (doc 10)")
      .argument(
        "<destination>",
        "where to push the built package: an existing local directory, or a git remote (URL or remote name)",
      )
      .addOption(
        new Option("--format <format>", "the archive format to build before pushing")
          .choices([...BUILD_FORMATS])
          .default("zip"),
      )
      .action((destination: string, opts: { format: BuildFormat }) => {
        const root = requireProject(ctx, parent); // AC84#3 (canonical no-project NotFound, exit 1)

        // AC84#1/#2: BUILD FIRST. A non-ok plan (validate/lock) prints its findings and throws BEFORE any push.
        const plan = loadBuildPlan(ctx, root);
        if (!plan.ok) {
          ctx.io.out.write(formatBuildPlan(plan));
          const reason = !plan.validation.ok
            ? `${plan.validation.problems.length} validation finding(s)`
            : "wpm.lock drift";
          throw new ValidationError(`build publish failed (build step): ${reason}`);
        }
        const archive = createArchive({
          root,
          outDir: ctx.deps.env.cwd(),
          baseName: `${plan.name}-${plan.version}`,
          format: opts.format,
          files: plan.shippable,
        });

        // Only now — with a successfully built archive — push it (AC84#1).
        const { where } = pushArchive({ fs: ctx.deps.fs }, { root, archive, destination });
        ctx.io.out.write(`published ${archive} → ${where}\n`);
      });
    withExamples(publish, [
      {
        command: "wpm build publish ./dist-out",
        note: "build the package and place it in the ./dist-out directory (or a git remote)",
      },
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
export const COMPLETION_SPECS: CompletionSpecs = {
  init: {
    // `--template`/`--list-templates` complete from the PROJECT-scope templates (AC#8); a project template can't
    // scaffold a bundle, so the source is `project-template-names`, not the unscoped `template-names`.
    options: {
      "--template": "project-template-names",
      "--list-templates": "project-template-names",
    },
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
  "project version bump": {
    args: ["bump-levels"], // <level> — the fixed major/minor/patch enum (reuses the built-in source)
  },
  // `project installer-skills add <name>` (Family F) — completes from the on-disk root installer-skills/ helper
  // folders (minus the reserved main-installer + advisor names). `project installer-skills remove <name>`
  // completes from the REGISTERED `manifest.installerSkills` names (AC47#5). Both NOT id-aware (project root).
  "project installer-skills add": {
    args: ["project-installer-skills-on-disk"],
  },
  "project installer-skills remove": {
    args: ["project-installer-skills-registered"],
  },
  "bundle new": {
    // `--template` takes a BUNDLE template (a project template can't scaffold a bundle), so it completes from
    // the scope-filtered `bundle-template-names` source — the worked proof of a state-dependent completion.
    options: { "--template": "bundle-template-names" },
    args: [undefined], // <id> — a new id, no suggestions
  },
  "bundle enable": {
    args: ["disabled-bundle-ids"], // <id> — bundle dirs present on disk but NOT in the manifest (doc 10 row 150)
  },
  "bundle disable": {
    args: ["bundle-ids"], // <id> — the currently-enabled bundles from manifest.bundles (doc 10 row 151)
  },
  "bundle remove": {
    args: ["bundle-ids"], // <id> — the current (enabled) bundles, same source `disable` uses (doc 10 row 153)
  },
  "bundle template set": {
    // <name> — bundle-scope templates (built-in + project-local), the SAME source `bundle new --template` uses.
    args: ["bundle-template-names"],
  },
  "build package": {
    // `--format` completes from the fixed zip|tarball|git enum (the `build-formats` source, the same set the
    // `.choices` enforces — one model source, `BUILD_FORMATS`).
    options: { "--format": "build-formats" },
  },
  bundle: {
    // The dynamic `bundle <id>` position: complete the id from the enabled bundles, UNIONED with the fixed
    // verbs (new/enable/disable) by the dispatch — so `bundle <tab>` offers both (doc 10 §per-bundle ops).
    args: ["bundle-ids"],
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
  const suggestions = computeCompletions(words, deps, io);
  if (suggestions.length > 0) {
    io.out.write(`${suggestions.join("\n")}\n`);
  }
}

/**
 * Resolve completion suggestions for `words`, special-casing the dynamic `bundle <id> …` per-bundle space (which
 * a static commander tree can't model, since the per-bundle sub-program is built per-id at dispatch). Everything
 * else goes straight to {@link completeArgv} over the main program tree.
 *
 * For `bundle <id> <tail…>` where `<id>` is NOT a fixed verb and NOT a flag and the id is already complete (the
 * subcommand or beyond is being typed), build the per-bundle sub-program for that id and recurse `completeArgv`
 * into it with the post-id tail + the per-bundle specs — so `bundle web <tab>` → `show`/`meta`, and `bundle web
 * meta --confirmation-level <tab>` → `safe`/`dangerous`. The id POSITION itself (`bundle <tab>`) is handled by
 * the main tree's `bundle` spec (the verbs unioned with the enabled-bundle ids).
 */
function computeCompletions(words: readonly string[], deps: CliDeps, io: CliIo): string[] {
  const ctxDeps = {
    fs: deps.fs,
    env: deps.env,
    builtinTemplatesRoot: deps.builtinTemplatesRoot,
    registry: defaultRegistry(),
  };

  // Detect the per-bundle prefix on the GLOBAL-STRIPPED words — the SAME `stripGlobalOptions` dispatch uses — so
  // completion recognises `wpm -C <dir> bundle web <tab>` as per-bundle exactly as execution does (S1: without
  // this, a leading `-C <path>` made `words[0]` be `-C`, the check failed, and the bundle GROUP verbs were
  // mis-suggested instead of the per-bundle leaves). It is per-bundle when, after stripping, `bundle <id> …` has
  // the id ALREADY complete (≥ 3 tokens) and the id is a non-flag, non-reserved-verb token.
  const stripped = stripGlobalOptions(words);
  if (
    stripped.length >= 3 &&
    stripped[0] === "bundle" &&
    stripped[1] !== undefined &&
    !stripped[1].startsWith("-") &&
    !RESERVED_BUNDLE_VERBS.includes(stripped[1])
  ) {
    const id = stripped[1];
    const ctx: CommandContext = { deps, io };
    // The per-bundle sub-program is the SAME tree dispatch builds; for completion only its shape matters, so a
    // placeholder root is fine (no leaf action runs during completion). Recurse over the post-id tail of the
    // STRIPPED words (the global flags are not part of the per-bundle subcommand line).
    const sub = buildPerBundleProgram(ctx, "", id);
    // Thread the resolved host id onto the completion context so id-scoped per-bundle sources (e.g. `requires
    // remove <dep>` → this bundle's current requires keys) can resolve it — the sub-program is built with a
    // placeholder root and only the post-id tail, so the id is otherwise invisible to a source.
    return completeArgv(sub, stripped.slice(2), {
      ...ctxDeps,
      specs: PER_BUNDLE_COMPLETION_SPECS,
      bundleId: id,
    });
  }

  // The non-per-bundle fall-through uses the ORIGINAL words (NOT stripped) so completing a global flag or its
  // value — e.g. `wpm -C <tab>` / `wpm --project <tab>` — is unaffected.
  const program = buildProgram(deps, io);
  return completeArgv(program, words, { ...ctxDeps, specs: COMPLETION_SPECS });
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

/**
 * Whether `argv` is a request for the PROGRAM's own version (`wpm --version` / `wpm -V`). The program version
 * option is registered under `-V` only (see {@link buildProgram}) so it never shadows a subcommand's own
 * `--version` (e.g. `bundle new <id> --version <v>`); the program's long `--version` is therefore handled here,
 * at the top level, before commander parses. A version request is a bare leading `--version`/`-V` — the FIRST
 * token is the flag — so a subcommand line like `bundle new web --version 0.2.0` (which starts with `bundle`) is
 * NOT matched and flows to the subcommand. (`-V` is still also wired on the program for the canonical form.)
 *
 * @param argv - The user arguments (excluding `node` and the script path).
 * @returns `true` when the first token requests the program version.
 */
function isProgramVersionRequest(argv: readonly string[]): boolean {
  return argv.length > 0 && (argv[0] === "--version" || argv[0] === "-V");
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

/** The doc-10 top-level groups, registered through the one pattern (AC#1). */
const TOP_LEVEL_MODULES: readonly CommandModule[] = [
  initModule,
  templateModule,
  projectModule,
  bundleModule,
  buildModule,
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
    // The program version is registered under `-V` ONLY (not the default `-V, --version`). commander's
    // `.version()` registers a GLOBAL option that, with the default long `--version`, is matched against a
    // SUBCOMMAND's line BEFORE the subcommand's own option — so `bundle new <id> --version <v>` would print the
    // program version and exit instead of setting the bundle's version (a real bug: the in-process tests passed
    // only because they exercised the `-v` short form). Scoping the program version to `-V` lets every
    // subcommand own its own `--version`, and leaves `-C/--project` placement untouched (unlike
    // `enablePositionalOptions`, which breaks `-C` after a subcommand). The program's own long `--version`
    // (`wpm --version`) is preserved by intercepting it at the top level in `run()` — see there.
    .version(VERSION, "-V", "print the version")
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
  // The program's own `--version`/`-V` is handled here, before commander parses: the program registers its
  // version under `-V` only (so a subcommand's `--version` is never shadowed), and this top-level interception
  // keeps `wpm --version` printing the program version. A subcommand line never starts with the flag, so it is
  // not intercepted (see `isProgramVersionRequest`).
  if (isProgramVersionRequest(argv)) {
    return runWithExit(io, async () => {
      io.out.write(`${VERSION}\n`);
    });
  }
  // The dynamic `bundle <id> <subcommand>` space is routed here, BEFORE commander, so a per-bundle leaf's
  // `--help`/`-h` reaches the per-bundle sub-program instead of being shadowed by the `bundle` group's greedy
  // auto-help. Fixed verbs (`bundle new …`), a bare `bundle`, and `bundle --help` are NOT per-bundle and flow to
  // the main program below (which renders the group help and dispatches the named verbs natively).
  if (isPerBundleInvocation(argv)) {
    return runWithExit(io, async () => {
      await dispatchPerBundle(argv, deps, io);
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
    // The confirmation input source for destructive commands (`bundle remove`); reading stdin lives in the shell
    // (doc 13 §3). Tests pass a `Readable.from([...])` instead.
    in: process.stdin,
  };
  void run(process.argv.slice(2), deps, io).then((code) => process.exit(code));
}
