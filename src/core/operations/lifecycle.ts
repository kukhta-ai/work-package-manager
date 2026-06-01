import { join } from "node:path";
import { parseYaml } from "../../util/yaml.js";
import type {
  AuthoringTaskSpec,
  BundleManifest,
  OperationResult,
  Project,
} from "../model/index.js";
import { AUTHORING_BACKLOG_DIR } from "../model/index.js";
import type { BacklogMd, FileSystem } from "../ports/index.js";
import {
  type CurrentState,
  type DesiredArtefacts,
  planChanges,
} from "../services/derived-artefacts.js";
import { materialiseAuthoringTasks } from "../services/materialisation.js";
import { parseBundleManifest, parseManifest } from "../services/schema/index.js";

/**
 * The **shared mutation lifecycle harness** (doc 13 §5/§8) — the first inhabitant of the
 * `src/core/operations/` tier, the use-case layer above the services. Every state-changing command rides this
 * one runner so the **six beats** happen the same way every time and in the same order:
 *
 * ① LOAD → ② CHECK → ③ APPLY → ④ RERENDER → ⑤ MATERIALISE → ⑥ RESULT.
 *
 * doc 13 §5: "an operation declares its structural effect in ③ and the lifecycle handles currency (④) and task
 * materialisation (⑤) around it." So an {@link OperationSpec} supplies only its own `check`/`apply`/
 * `materialise` plan; the harness arranges LOAD, the automatic re-derivation of the front-door artefacts, the
 * title-idempotent task materialisation, and the structured result around them — no operation re-arranges
 * currency or materialisation itself (AC#2). A read-only operation rides {@link runRead}, which runs ① LOAD →
 * projection → ⑥ RESULT and touches nothing (AC#3).
 *
 * It is **pure glue over the ports** (doc 13 §1): it composes the task-19 derivation/diff
 * ({@link planChanges}), the task-21 materialiser ({@link materialiseAuthoringTasks}), the task-11 schema
 * parsers, the task-13 yaml leaf, and the FileSystem/BacklogMd ports — and imports `node:path` for pure path
 * joins, but never `node:fs`/`commander`/`execa`. The import-boundary rule on `src/core/operations/` is
 * therefore satisfied. The harness never prints and never exits: a requested-change failure is raised as a
 * typed task-23 `DomainError` from an operation's `check`, and the command layer formats every outcome (output
 * is not a port — doc 13 §3).
 */

/** The project marker / manifest filename at the project root. */
const MANIFEST_FILE = "manifest.yml";
/** A bundle's manifest filename, under `bundles/<id>/`. */
const BUNDLE_MANIFEST_FILE = "bundle.yml";

/**
 * The harness dependencies: the two effect ports plus the artefact-derivation capability.
 *
 * `deriveArtefacts` is injected (AC#2) rather than computed here: it encapsulates resolving the project's
 * template snippets and calling the task-19 derivation, so the harness stays generic and the concrete deriver
 * (which needs the real templates, tasks 30–31) is supplied by task-26/33. Tests pass a fixture deriver.
 */
export interface LifecycleDeps {
  /** The FileSystem port — used for ① LOAD and ④ RERENDER (read/write/exists/ensureAlias). */
  readonly fs: FileSystem;
  /** The BacklogMd port — used for ⑤ MATERIALISE (and by an operation's `apply`, e.g. backlog init). */
  readonly backlog: BacklogMd;
  /** Derive the desired on-disk artefacts from a (post-apply) project — the ④ RERENDER capability. */
  readonly deriveArtefacts: (project: Project) => DesiredArtefacts;
}

/** The resolved context the harness operates in: the project root (already resolved by task-24, not re-resolved here). */
export interface OperationContext {
  /** The absolute project root. */
  readonly root: string;
}

/** The port surface an operation's `apply` may use to perform its structural effect in beat ③. */
export interface ApplyContext {
  /** The FileSystem port. */
  readonly fs: FileSystem;
  /** The BacklogMd port. */
  readonly backlog: BacklogMd;
  /** The project root the effect is applied within. */
  readonly root: string;
}

/** What an operation's `apply` may report back: the paths it created or modified in beat ③. */
export interface ApplyOutcome {
  /** The paths the structural effect changed (folded into the result alongside ④'s changes). */
  readonly changedPaths?: readonly string[];
  /**
   * Non-fatal warnings the structural effect produced (e.g. "the scope-alias did not exist", "the last target
   * was removed"). The harness folds these into the result's `warnings` alongside the warnings it derives
   * itself (e.g. the deriver's unknown-target set). Output is not a port — the command prints them.
   */
  readonly warnings?: readonly string[];
}

/**
 * A mutating operation, plugged into {@link runMutation} (doc 13 §5). It declares only its own beats — the
 * harness performs ① LOAD, ④ RERENDER, ⑤ MATERIALISE, and ⑥ RESULT around them.
 *
 * @typeParam I - The operation's input payload type (`void` when it needs none).
 */
export interface OperationSpec<I = void> {
  /** The ⑥ summary: a fixed string, or computed from the loaded project + input. */
  readonly summary: string | ((project: Project, input: I) => string);
  /**
   * ② CHECK — validate the requested change against current state. Raise a task-23 `DomainError`
   * (Conflict/NotFound/Constraint/Validation) to abort before any effect; return on success. Pure read.
   */
  readonly check?: (project: Project, input: I) => void;
  /** ③ APPLY — perform the structural effect via the ports; optionally report the paths it changed. */
  readonly apply: (ctx: ApplyContext, project: Project, input: I) => ApplyOutcome | undefined;
  /**
   * ⑤ MATERIALISE plan — the authoring tasks this operation produces (default none). The harness runs the
   * title-idempotent materialiser around it; the operation does NOT call task-21 itself.
   */
  readonly materialise?: (project: Project, input: I) => readonly AuthoringTaskSpec[];
}

/**
 * A read-only operation, plugged into {@link runRead} (doc 13 §8 read trace). It loads the project and
 * projects a value from it, changing nothing.
 *
 * @typeParam I - The input payload type.
 * @typeParam T - The projected value type.
 */
export interface ReadSpec<I, T> {
  /** The ⑥ summary: a fixed string, or computed from the loaded project + input. */
  readonly summary: string | ((project: Project, input: I) => string);
  /** The pure projection from the loaded project (+ input) to the read's value. Performs no effect. */
  readonly project: (project: Project, input: I) => T;
}

/** The outcome of {@link runRead}: the projected value plus an empty-effect {@link OperationResult}. */
export interface ReadOutcome<T> {
  /** The value projected from the loaded project. */
  readonly value: T;
  /** The structured result (empty `changedPaths` / `materialisedTaskTitles` — a read changes nothing). */
  readonly result: OperationResult;
}

/**
 * ① LOAD — read the project at `root` into a fresh {@link Project} projection (no cache; loaded per call).
 *
 * Reads `manifest.yml` and every enabled bundle's `bundle.yml` through the FileSystem port, parsing each via
 * the task-13 yaml leaf + the task-11 schema parsers. A malformed manifest surfaces as the parser's thrown
 * error (a template-authoring bug). A *missing* project is not handled here — task-24's `resolveContext`
 * already turned that into a domain error at the command layer before the harness ran — so this assumes a
 * resolved root with a real manifest.
 *
 * @param fs - The FileSystem port.
 * @param root - The absolute project root.
 * @returns The loaded project projection.
 */
function loadProject(fs: FileSystem, root: string): Project {
  const manifestResult = parseManifest(parseYaml(fs.read(join(root, MANIFEST_FILE))));
  if (!manifestResult.ok) {
    throw new Error(`invalid ${MANIFEST_FILE}: ${manifestResult.problem.message}`);
  }
  const manifest = manifestResult.value;

  const bundles = new Map<(typeof manifest.bundles)[number], BundleManifest>();
  for (const id of manifest.bundles) {
    const bundlePath = join(root, "bundles", id, BUNDLE_MANIFEST_FILE);
    const bundleResult = parseBundleManifest(parseYaml(fs.read(bundlePath)));
    if (!bundleResult.ok) {
      throw new Error(
        `invalid ${BUNDLE_MANIFEST_FILE} for bundle '${id}': ${bundleResult.problem.message}`,
      );
    }
    bundles.set(id, bundleResult.value);
  }

  return { rootPath: root, manifest, bundles };
}

/** Resolve a {@link OperationSpec.summary}/{@link ReadSpec.summary} (string or thunk) to its string. */
function resolveSummary<I>(
  summary: string | ((project: Project, input: I) => string),
  project: Project,
  input: I,
): string {
  return typeof summary === "function" ? summary(project, input) : summary;
}

/**
 * ④ RERENDER — re-derive the front-door artefacts from the (post-apply) project and apply only the diff.
 *
 * Builds the current on-disk state by probing exactly the desired files' paths (via the FileSystem port), diffs
 * with the task-19 {@link planChanges} (which is empty when everything already matches — the root of AC#4's
 * idempotency), then writes only the changed files and creates only the missing aliases. Returns the absolute
 * paths it changed (written files + created alias link paths), in deterministic order.
 *
 * @param fs - The FileSystem port.
 * @param root - The project root.
 * @param desired - The desired artefacts from the injected deriver.
 * @returns The absolute paths changed by the re-derivation.
 */
function applyRerender(fs: FileSystem, root: string, desired: DesiredArtefacts): string[] {
  const files = new Map<string, string>();
  for (const file of desired.files) {
    const abs = join(root, file.path);
    if (fs.exists(abs)) {
      files.set(file.path, fs.read(abs));
    }
  }
  const aliases = new Set<string>();
  for (const alias of desired.aliasPlan.aliases) {
    if (fs.exists(join(root, alias.linkPath))) {
      aliases.add(alias.linkPath);
    }
  }
  const current: CurrentState = { files, aliases };
  const change = planChanges(desired, current);

  const changed: string[] = [];
  for (const file of change.filesToWrite) {
    const abs = join(root, file.path);
    fs.write(abs, file.content);
    changed.push(abs);
  }
  for (const alias of change.aliasesToCreate) {
    fs.ensureAlias(join(root, alias.aliasTo), join(root, alias.linkPath));
    changed.push(join(root, alias.linkPath));
  }
  return changed;
}

/** Append `paths` to `into`, skipping any already present, so the merged list is de-duplicated, order-preserving. */
function mergePaths(into: string[], paths: readonly string[]): void {
  for (const path of paths) {
    if (!into.includes(path)) {
      into.push(path);
    }
  }
}

/**
 * Run a mutating operation through the six-beat lifecycle (doc 13 §5/§8).
 *
 * ① LOAD the project, ② run the operation's `check` (a failure raises its task-23 `DomainError` and aborts —
 * ③④⑤ do not run), ③ run the operation's `apply`, ④ re-derive the front-door artefacts from the *reloaded*
 * (post-apply) project and apply only the diff, ⑤ materialise the operation's authoring-task plan idempotently
 * by title, and ⑥ return the {@link OperationResult}. The harness arranges ①④⑤⑥ so no operation does (AC#2).
 *
 * @param deps - The ports + the artefact-derivation capability.
 * @param ctx - The resolved project context (root). Not re-resolved here.
 * @param spec - The operation to run.
 * @param input - The operation's input payload.
 * @returns The structured operation result (summary, changed paths, materialised task titles).
 */
export function runMutation<I = void>(
  deps: LifecycleDeps,
  ctx: OperationContext,
  spec: OperationSpec<I>,
  input: I,
): OperationResult {
  const { fs, backlog, deriveArtefacts } = deps;
  const { root } = ctx;

  // ① LOAD
  const project = loadProject(fs, root);

  // ② CHECK (raises a DomainError on failure, aborting before any effect)
  spec.check?.(project, input);

  // ③ APPLY
  const applied = spec.apply({ fs, backlog, root }, project, input);

  // Reload so ④/⑤ see the post-apply project (the write trace re-derives from the changed project, doc 13 §8).
  const postApply = loadProject(fs, root);

  // ④ RERENDER (automatic)
  const desired = deriveArtefacts(postApply);
  const rerenderChanged = applyRerender(fs, root, desired);

  // ⑤ MATERIALISE (automatic, title-idempotent). The authoring backlog is its OWN Backlog.md root at
  // `<project>/.authoring-backlog` (doc 10 step 6; `init` initialises it there), NOT the project root — so we
  // materialise into `join(root, AUTHORING_BACKLOG_DIR)`. Using `root` here runs `backlog task list` at the
  // project root, which is not a Backlog.md root, and every materialising command fails ("No Backlog.md project
  // found"). The path is the shared model constant so it can never drift from `init`'s.
  const specs = spec.materialise?.(postApply, input) ?? [];
  const materialised = materialiseAuthoringTasks(backlog, join(root, AUTHORING_BACKLOG_DIR), specs);

  // ⑥ RESULT
  const changedPaths: string[] = [];
  mergePaths(changedPaths, applied?.changedPaths ?? []);
  mergePaths(changedPaths, rerenderChanged);

  // Warnings: the operation's own (③) PLUS the ones the harness derives from ④ — a declared target the deriver
  // could not map to a scope-alias (`unknownTargets`) is surfaced here, so e.g. `targets add` of an unknown
  // agent warns without per-operation code. The single warning channel every list-mgmt command shares.
  const warnings: string[] = [...(applied?.warnings ?? [])];
  for (const agent of desired.aliasPlan.unknownTargets) {
    warnings.push(
      `agent "${agent}" is not a built-in known agent; its scope-alias was skipped — configure it manually`,
    );
  }

  return {
    summary: resolveSummary(spec.summary, postApply, input),
    changedPaths,
    materialisedTaskTitles: materialised.created.map((task) => task.title),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/**
 * Run a read-only operation through the read trace (doc 13 §8): ① LOAD the project, project a value from it,
 * and ⑥ return that value plus an empty-effect {@link OperationResult}. It writes no file, creates no alias,
 * and touches no task — `changedPaths` and `materialisedTaskTitles` are always empty (AC#3).
 *
 * @param fs - The FileSystem port (a read needs no backlog or deriver).
 * @param ctx - The resolved project context (root).
 * @param spec - The read operation.
 * @param input - The operation's input payload.
 * @returns The projected value plus an empty-effect result.
 */
export function runRead<I, T>(
  fs: FileSystem,
  ctx: OperationContext,
  spec: ReadSpec<I, T>,
  input: I,
): ReadOutcome<T> {
  // ① LOAD
  const project = loadProject(fs, ctx.root);
  // Projection (pure; no effect)
  const value = spec.project(project, input);
  // ⑥ RESULT — empty effect
  return {
    value,
    result: {
      summary: resolveSummary(spec.summary, project, input),
      changedPaths: [],
      materialisedTaskTitles: [],
    },
  };
}
