import { dirname, isAbsolute, join, relative } from "node:path";
import { toPosix } from "../../util/posix-path.js";
import { parseYaml } from "../../util/yaml.js";
import {
  type MutationBoundary,
  MutationFailure,
  type MutationLifecycleBeat,
  NotFoundError,
  PersonalAuthoringSetupPreflightError,
  type WorkspaceIntegrationBlocker,
  WorkspaceIntegrationPreflightError,
} from "../errors.js";
import {
  AUTHORING_BACKLOG_DIR,
  AUTHORING_TASK_PREFIX,
  type AuthoringTaskSpec,
  type BundleManifest,
  type MandatoryAuthoringTask,
  type OperationResult,
  type Project,
} from "../model/index.js";
import type { BacklogMd, Environment, FileSystem } from "../ports/index.js";
import { EXECUTOR_FRONT_DOOR_PATH } from "../services/derived-artefacts.js";
import { hashTextContent } from "../services/integrity.js";
import {
  compileProjectAuthoringTaskPlan,
  type PlannedProjectAuthoringTask,
  type ProjectAuthoringTaskPlanProblem,
} from "../services/project-authoring-task-plan.js";
import { type RenderedFile, renderTree } from "../services/render.js";
import { parseBundleManifest, parseManifest } from "../services/schema/index.js";
import { inspectTemplateAuthoringTasks } from "../services/template-authoring-tasks.js";
import { resolveTemplate } from "../services/template-resolver.js";
import { WORKSPACE_INTEGRATION_STATE_PATH } from "../services/workspace-authoring-integration.js";
import {
  createWorkspaceHandoffReceipt,
  serializeWorkspaceHandoffReceipt,
  WORKSPACE_HANDOFF_RECEIPT_PATH,
} from "../services/workspace-handoff.js";
import { perBundleAuthoringTaskCatalog, perBundleAuthoringTasks } from "./create-bundle.js";
import { deriveArtefactsFromTemplateSnapshot } from "./derive-artefacts-capability.js";
import { readPersonalAuthoringDefaults } from "./personal-authoring-setup.js";
import {
  authorizeFreshWorkspaceAuthoringPlan,
  type FreshWorkspaceAuthoringPlan,
  type FreshWorkspaceAuthoringPlanSeed,
  planFreshWorkspaceAuthoringIntegration,
  type WorkspaceAuthoringIntegrationResult,
} from "./workspace-authoring-integration.js";
import type { PreparedWorkspaceHandoffResult } from "./workspace-handoff.js";

/**
 * `initProject` — the `wpm init` use case (doc 10 §"Per-command actions", the `init` row), and the architecture's
 * **bootstrap** operation. Unlike every other operation, init does NOT run the task-25 `runMutation` six-beat
 * lifecycle and does NOT call `resolveContext`: those LOAD an existing project, and context resolution runs
 * "before any project-**bound** operation" (doc 13 §7), but `init` is **project-creating** (doc 10 line 17) —
 * there is no project to load, it builds one from a template. So this is its own small operation that composes
 * the same services + ports and returns the same {@link OperationResult}.
 *
 * It is **pure over the FileSystem + BacklogMd ports** (doc 13 §1): it composes the task-17 template-resolver,
 * the task-16 render service, the task-19/26 derived-artefacts deriver, and the task-21 materialiser, importing
 * only those + the model + `node:path` — never `node:fs`/`commander`/`omelette`. Failures are raised as typed
 * task-23 `DomainError`s.
 *
 * This is `init` rebuilt to scaffold an **authoring workspace** (task-87; docs 06, 10, 11, 12), not a deliverable
 * at the project root. `input.targetDir` is now the **workspace root**; the shipped bundle-project skeleton nests
 * under the deliverable subdirectory `wip/` (the deliverable root is exactly `<workspace>/wip`), build output is
 * isolated in `builds/`, and the workspace root keeps only the authoring surface. It performs doc-10:137's `init`
 * steps: resolve the chosen project template (default `minimal`); refuse if the target path exists; render the
 * template `files/` into `wip/`; materialise the default bundle template at `wip/bundles/bundle-template/`; create
 * the empty `wip/installer-skills/`, `wip/templates/`, the `.authoring-backlog/` (a Backlog.md root,
 * `task_prefix=authoring`, at the workspace root), and the empty `builds/`; create one scope-alias per declared
 * target under `wip/`; render the derived `<project>-installer/SKILL.md` and the author-owned executor front door
 * to `wip/_AGENTS.md` (the reserved build-stripped prefix); render the **authoring** front door + a `CLAUDE.md`
 * alias at the workspace root from a template snippet; materialise the project-wide authoring task set (doc 11)
 * plus a per-bundle set for every bundle the template pre-includes; record `.authoring-backlog/` and `builds/` in
 * the workspace `.gitignore`; and return a summary with the count of materialised tasks.
 */

/** The default project template `init` instantiates when `--template` is not given (doc 10: `init`'s default). */
const DEFAULT_PROJECT_TEMPLATE = "minimal";
/** The default bundle template whose tree is materialised at `bundles/bundle-template/` (doc 10:137 step 5). */
const DEFAULT_BUNDLE_TEMPLATE = "default";
/** The project's default bundle scaffold directory, under `bundles/` (doc 10:150 step 2; `bundle template`). */
const BUNDLE_TEMPLATE_DIR = "bundle-template";
/**
 * The deliverable subdirectory of the authoring workspace (docs 06, 12). The whole shipped bundle-project
 * skeleton (manifest, bundles, installer-skills, templates, scope aliases, the executor front door) nests
 * under `<workspace>/wip` — the deliverable root is exactly this, with NO extra deliverable-id subdir — while
 * the workspace root keeps only the authoring surface (the authoring front door + `.authoring-backlog/`).
 */
const DELIVERABLE_DIR = "wip";
/**
 * The empty build-output directory (docs 06, 12): where `wpm build` later writes archives, isolated from both
 * the authoring surface and the deliverable. `init` creates it empty (AC#2).
 */
const BUILDS_DIR = "builds";
/**
 * The reserved leading-underscore name the deliverable's **executor front door** is authored under (doc 12
 * §"reserved-prefix transform"; AC#8). Kept `.md` so it stays author-editable, but never matched by any
 * agent's front-door basename during authoring; the build (task-90) strips the prefix to `AGENTS.md`. It is
 * **author-owned** — written once here and NOT re-derived on later mutations (doc 10).
 */
const EXECUTOR_FRONT_DOOR = "_AGENTS.md";
/**
 * The rendered path the artefact deriver gives the executor front door (its snippet lives at `snippets/AGENTS.md`).
 * `init` recognises this file in the derived set and relocates it to {@link EXECUTOR_FRONT_DOOR} under `wip/`,
 * rather than writing a canonical `wip/AGENTS.md` (which an authoring agent would read as a directive). It is the
 * shared {@link EXECUTOR_FRONT_DOOR_PATH} constant so `init`'s relocation and the lifecycle's re-render exclusion
 * can never disagree about which derived file is the author-owned front door.
 */
const DERIVED_EXECUTOR_FRONT_DOOR_PATH = EXECUTOR_FRONT_DOOR_PATH;
/**
 * The hidden authoring-backlog root + its task-prefix (doc 10 step 6; doc 11) come from the shared model
 * constants ({@link AUTHORING_BACKLOG_DIR}, {@link AUTHORING_TASK_PREFIX}) so `init` (which creates the root)
 * and the task-25 lifecycle (which materialises into it) can never disagree about where it lives — the
 * root-mismatch bug that broke every materialising command.
 */

/** The input to {@link initProject}: where to create the project, its name, the chosen template, and extra params. */
export interface InitProjectInput {
  /** The directory that becomes the **authoring workspace root** (the CLI resolves it from `--at`/cwd; doc 10). */
  readonly targetDir: string;
  /** The project name (kebab-case); written into the manifest and the installer-skill name. */
  readonly name: string;
  /** The project template to instantiate (default `minimal`; doc 10 `--template`). */
  readonly templateName?: string;
  /**
   * Extra placeholder-substitution params from `--param key=value` (doc 10:137 step 3), merged with the built-in
   * `project-name`. Unreferenced extras are harmless (the render service throws only on UNRESOLVED placeholders).
   */
  readonly params?: ReadonlyMap<string, string>;
  /** Explicit selection; when absent only, canonical personal setup defaults are consulted. */
  readonly authoringClientIds?: readonly string[];
}

/** The dependencies {@link initProject} needs: the two ports + the built-in templates root. */
export interface InitProjectDeps {
  /** The filesystem port (real `NodeFileSystem` in production). */
  readonly fs: FileSystem;
  /** The Backlog.md port — used to initialise + materialise into the `.authoring-backlog/` root (doc 13 §3). */
  readonly backlog: BacklogMd;
  /** Environment used only to locate canonical personal defaults when the input selection is absent. */
  readonly env: Environment;
  /** The built-in templates root shipped with the package. */
  readonly builtinTemplatesRoot: string;
  /** Exact packaged source of the five workspace-local WPM authoring skills. */
  readonly bundledSkillsRoot: string;
  /** Installed WPM version recorded coherently across managed workspace integration. */
  readonly integrationVersion: string;
}

/** Fresh-init outcome, including workspace integration and its completion-gated prepared handoff. */
export interface InitProjectResult extends OperationResult {
  readonly authoringIntegration: WorkspaceAuthoringIntegrationResult;
  readonly handoff: PreparedWorkspaceHandoffResult;
  readonly handoffPrepared: true;
}

/**
 * The project-wide authoring tasks `wpm init` materialises (doc 11 §3 "Materialised by `wpm init`"). These are the
 * planning / meta / release / review tasks every project has at minimum; their titles are stable (the
 * materialiser de-duplicates by title) and their single acceptance criterion is the free-text criterion from
 * doc 11 §3 (agent self-attests — it is not machine-evaluated). For a template that pre-includes bundles, `init`
 * ALSO materialises {@link perBundleAuthoringTasks} for each; this helper supplies only the project-wide set.
 *
 * @returns The eight project-wide authoring-task specs, in doc-11 reading order (meta → confirm → verify → release).
 */
export function projectWideAuthoringTaskCatalog(): MandatoryAuthoringTask[] {
  return [
    {
      reference: "wpm:project:set-metadata",
      title: "Set project metadata",
      acceptanceCriteria: [
        "manifest.yml.project has description, license (and ideally repository, author) set via `wpm project meta`",
      ],
    },
    {
      reference: "wpm:project:confirm-target-agents",
      title: "Confirm target agents",
      acceptanceCriteria: [
        "manifest.yml.targets has at least one entry, added via `wpm project targets add`",
      ],
    },
    {
      reference: "wpm:project:verify-manifest",
      title: "Verify manifest coherence",
      acceptanceCriteria: [
        "`wpm project validate` exits clean (deps resolve, targets non-empty, valid semver, no orphan bundle dirs)",
      ],
    },
    {
      reference: "wpm:project:verify-scope-aliases",
      title: "Verify scope-alias symlinks",
      acceptanceCriteria: [
        "each scope-alias under the project root corresponds to a target agent in manifest.yml.targets and points at installer-skills/; no bare skills/ aliases exist",
      ],
    },
    {
      reference: "wpm:project:verify-front-door",
      title: "Verify AGENTS.md and main installer skill are current",
      acceptanceCriteria: [
        "AGENTS.md and the <project>-installer/SKILL.md reflect the current manifest.yml and each enabled bundle.yml",
      ],
    },
    {
      reference: "wpm:project:verify-helpers-and-advisors",
      title: "Verify helpers and advisors registered",
      acceptanceCriteria: [
        "every SKILL.md under installer-skills/ at root scope corresponds to a registered helper or advisor",
      ],
    },
    {
      reference: "wpm:project:bump-release-version",
      title: "Bump project release version",
      acceptanceCriteria: [
        "manifest.yml.project.version has been advanced since the previous release tag (or set explicitly for the first release)",
      ],
    },
    {
      reference: "wpm:project:build-dry-run",
      title: "Build dry-run",
      acceptanceCriteria: ["`wpm build dry-run` exits clean"],
    },
  ];
}

/** Mandatory project task specs with stable-reference metadata removed for the existing materialiser. */
export function projectWideAuthoringTasks(): AuthoringTaskSpec[] {
  return projectWideAuthoringTaskCatalog().map(({ title, acceptanceCriteria }) => ({
    title,
    acceptanceCriteria,
  }));
}

/**
 * Build the in-memory {@link Project} projection the deriver renders against (doc 13 §5 ④) by LOADING the
 * just-written project root — the rendered `manifest.yml` (already on disk from step 3) and each bundle the
 * template pre-includes. This is what makes `init` honor whatever the CHOSEN template declares: its `targets`
 * drive the scope-alias plan (AC#3 — `minimal` declares none, so the plan is empty) and its `bundles` drive both
 * the front-door menu and the per-bundle authoring materialisation (AC#4 — `minimal` pre-includes none). Mirrors
 * the lifecycle's `loadProject` so the two cannot diverge on how a project is read.
 *
 * @param fs - The filesystem port.
 * @param targetDir - The project root (its `manifest.yml` + any pre-included `bundles/<id>/bundle.yml` exist).
 * @returns The projection.
 * @throws If the rendered `manifest.yml` or a pre-included `bundle.yml` is malformed (a template-authoring bug).
 */
function buildProjection(files: readonly RenderedFile[], targetDir: string): Project {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const manifestText = byPath.get("manifest.yml");
  if (manifestText === undefined) {
    throw new NotFoundError("internal: rendered project template has no manifest.yml");
  }
  const manifestResult = parseManifest(parseYaml(manifestText));
  if (!manifestResult.ok) {
    throw new NotFoundError(
      `internal: rendered manifest.yml is invalid: ${manifestResult.problem.message}`,
    );
  }
  const manifest = manifestResult.value;

  const bundles = new Map<(typeof manifest.bundles)[number], BundleManifest>();
  for (const id of manifest.bundles) {
    const bundleText = byPath.get(`bundles/${id}/bundle.yml`);
    if (bundleText === undefined) {
      throw new NotFoundError(
        `internal: rendered project template has no bundles/${id}/bundle.yml`,
      );
    }
    const bundleResult = parseBundleManifest(parseYaml(bundleText));
    if (!bundleResult.ok) {
      throw new NotFoundError(
        `internal: pre-included bundle '${id}' has an invalid bundle.yml: ${bundleResult.problem.message}`,
      );
    }
    bundles.set(id, bundleResult.value);
  }

  return { rootPath: targetDir, manifest, bundles };
}

function initBlocker(
  code: string,
  surface: WorkspaceIntegrationBlocker["surface"],
  message: string,
  recovery: string,
): WorkspaceIntegrationBlocker {
  return { code, surface, message, recovery };
}

function authoringTaskPlanBlocker(
  problem: ProjectAuthoringTaskPlanProblem,
): WorkspaceIntegrationBlocker {
  return initBlocker(
    `template-task-${problem.code}`,
    "authoring-task-plan",
    `${problem.contribution} ${problem.path}: ${problem.message}`,
    "repair the affected template contribution or packaged mandatory catalog before creating the workspace",
  );
}

interface PlannedInitFile {
  readonly id: string;
  readonly path: string;
  readonly content: string;
  readonly description: string;
  readonly beat?: MutationLifecycleBeat;
}

interface PlannedInitDirectory {
  readonly id: string;
  readonly path: string;
  readonly description: string;
}

interface PlannedInitAlias {
  readonly id: string;
  readonly target: string;
  readonly path: string;
  readonly description: string;
  readonly beat?: MutationLifecycleBeat;
}

interface PlannedInitAction extends MutationBoundary {
  readonly perform: () => void;
  readonly beat: MutationLifecycleBeat;
  readonly materialisedTitle?: string;
  readonly recordsChange: boolean;
}

function freshInitRequestKey(
  input: {
    readonly name: string;
    readonly templateName: string;
    readonly params: ReadonlyMap<string, string>;
    readonly clients: readonly string[];
    readonly integrationVersion: string;
    readonly completeStateText: string;
    readonly handoffShapeText: string;
  },
  files: Iterable<PlannedInitFile>,
  directories: Iterable<PlannedInitDirectory>,
  aliases: Iterable<PlannedInitAlias>,
  tasks: readonly PlannedProjectAuthoringTask[],
): string {
  const byPathAndId = <T extends { readonly path: string; readonly id: string }>(
    left: T,
    right: T,
  ): number => left.path.localeCompare(right.path) || left.id.localeCompare(right.id);
  const fingerprint = hashTextContent(
    JSON.stringify({
      request: {
        name: input.name,
        templateName: input.templateName,
        params: [...input.params].sort(([left], [right]) => left.localeCompare(right)),
        clients: input.clients,
        integrationVersion: input.integrationVersion,
      },
      completeState: hashTextContent(input.completeStateText),
      handoffShape: hashTextContent(input.handoffShapeText),
      files: [...files].sort(byPathAndId).map(({ id, path, content, beat }) => ({
        id,
        path: toPosix(path),
        sha256: hashTextContent(content),
        beat: beat ?? "APPLY",
      })),
      directories: [...directories]
        .sort(byPathAndId)
        .map(({ id, path }) => ({ id, path: toPosix(path) })),
      aliases: [...aliases].sort(byPathAndId).map(({ id, path, target, beat }) => ({
        id,
        path: toPosix(path),
        target: toPosix(target),
        beat: beat ?? "APPLY",
      })),
      tasks,
    }),
  );
  return `init|${fingerprint}`;
}

function initAction(
  id: string,
  path: string,
  description: string,
  perform: () => void,
  materialisedTitle?: string,
  beat: MutationLifecycleBeat = "APPLY",
  recordsChange = true,
): PlannedInitAction {
  return {
    id,
    path: toPosix(path),
    description,
    perform,
    beat,
    recordsChange,
    ...(materialisedTitle !== undefined ? { materialisedTitle } : {}),
  };
}

function executeInitPlan(actions: readonly PlannedInitAction[]): {
  readonly changedPaths: readonly string[];
  readonly materialisedTaskTitles: readonly string[];
} {
  const completed: MutationBoundary[] = [];
  const changedPaths: string[] = [];
  const materialisedTaskTitles: string[] = [];
  for (let index = 0; index < actions.length; index += 1) {
    const planned = actions[index] as PlannedInitAction;
    try {
      planned.perform();
      const evidence = {
        id: planned.id,
        path: planned.path,
        description: planned.description,
      } satisfies MutationBoundary;
      completed.push(evidence);
      if (planned.recordsChange) {
        if (!changedPaths.includes(planned.path as string))
          changedPaths.push(planned.path as string);
        if (planned.materialisedTitle !== undefined) {
          materialisedTaskTitles.push(planned.materialisedTitle);
        }
      }
    } catch (cause) {
      throw new MutationFailure({
        operation: "authoring workspace init",
        failedBeat: planned.beat,
        completed,
        failed: {
          id: planned.id,
          path: planned.path,
          description: planned.description,
        },
        unattempted: actions.slice(index + 1).map(({ id, path, description }) => ({
          id,
          path,
          description,
        })),
        recovery:
          "make the failed boundary recoverable, then repeat the identical init request; completed WPM-planned bytes are verified before any retry write and no rollback or generic resume is claimed",
        cause,
      });
    }
  }
  return { changedPaths, materialisedTaskTitles };
}

function assertExactMaterialisedTaskPlan(
  backlog: BacklogMd,
  authoringRoot: string,
  taskPlan: readonly PlannedProjectAuthoringTask[],
  taskIdByIdentity: ReadonlyMap<string, string>,
): void {
  const tasks = backlog.listTasks(authoringRoot);
  const inventory = backlog.inspectTaskInventory(authoringRoot);
  const listedIds = tasks.map(({ id }) => id).sort();
  if (
    tasks.length !== taskPlan.length ||
    !inventory.configurationMatchesFreshDefaults ||
    JSON.stringify([...inventory.activeEntries].sort()) !== JSON.stringify(listedIds) ||
    inventory.inactiveEntries.length > 0 ||
    inventory.unexpectedEntries.length > 0
  ) {
    throw new Error("materialised authoring backlog does not have the exact fresh task inventory");
  }

  for (const [index, expected] of taskPlan.entries()) {
    const task = tasks[index];
    const expectedId = taskIdByIdentity.get(expected.identity);
    if (task === undefined || expectedId === undefined || task.id !== expectedId) {
      throw new Error(
        `materialised authoring task ${JSON.stringify(expected.identity)} is unavailable`,
      );
    }
    const record = backlog.readTask(authoringRoot, task.id);
    const dependencyIds = expected.dependencyIdentities.map((identity) =>
      taskIdByIdentity.get(identity),
    );
    const criteriaMatch =
      record.acceptanceCriteria.length === expected.acceptanceCriteria.length &&
      record.acceptanceCriteria.every(
        (criterion, criterionIndex) =>
          !criterion.checked && criterion.text === expected.acceptanceCriteria[criterionIndex],
      );
    if (
      dependencyIds.some((dependency) => dependency === undefined) ||
      task.title !== expected.title ||
      task.status !== "To Do" ||
      record.id !== task.id ||
      record.title !== task.title ||
      record.status !== task.status ||
      record.ordinal !== (index + 1) * 1000 ||
      record.description !== null ||
      record.definitionOfDone.length !== 0 ||
      record.dependencies.length !== dependencyIds.length ||
      record.dependencies.some(
        (dependency, dependencyIndex) => dependency !== dependencyIds[dependencyIndex],
      ) ||
      record.labels.length !== expected.labels.length ||
      record.labels.some((label, labelIndex) => label !== expected.labels[labelIndex]) ||
      record.extraMetadata.length !== 0 ||
      record.extraSections.length !== 0 ||
      !criteriaMatch
    ) {
      throw new Error(
        `materialised authoring task ${JSON.stringify(expected.identity)} differs from the immutable init plan`,
      );
    }
  }
}

function isContained(root: string, path: string): boolean {
  const rel = relative(root, path);
  return (
    rel === "" ||
    (!isAbsolute(rel) && rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\"))
  );
}

function inspectProspectiveTarget(
  fs: FileSystem,
  targetDir: string,
  blockers: WorkspaceIntegrationBlocker[],
): void {
  let current = targetDir;
  while (true) {
    try {
      const inspection = fs.inspectPath(current);
      if (inspection.kind === "missing") {
        const parent = dirname(current);
        if (parent === current) {
          blockers.push(
            initBlocker(
              "workspace-target-ancestor-missing",
              "target",
              `no existing canonical ancestor was found for ${JSON.stringify(targetDir)}`,
              "choose a target beneath an existing real directory",
            ),
          );
          return;
        }
        current = parent;
        continue;
      }
      if (inspection.kind !== "directory") {
        blockers.push(
          initBlocker(
            "workspace-target-ancestor-ambiguous",
            "target",
            `${JSON.stringify(current)} is ${inspection.kind}, not a real target ancestor`,
            "choose a target whose existing ancestors are real directories rather than aliases or special paths",
          ),
        );
        return;
      }
      const canonical = fs.canonicalPath(current);
      if (toPosix(canonical) !== toPosix(current)) {
        blockers.push(
          initBlocker(
            "workspace-target-ancestor-noncanonical",
            "target",
            `${JSON.stringify(current)} resolves to ${JSON.stringify(canonical)}`,
            "repeat with a canonical target path that cannot escape through an aliased ancestor",
          ),
        );
      }
      return;
    } catch (error) {
      blockers.push(
        initBlocker(
          "workspace-target-ancestor-unreadable",
          "target",
          `${JSON.stringify(current)} cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
          "make every existing target ancestor inspectable before repeating init",
        ),
      );
      return;
    }
  }
}

function inspectExistingRootIdentity(
  fs: FileSystem,
  targetDir: string,
  blockers: WorkspaceIntegrationBlocker[],
): void {
  try {
    const canonical = fs.canonicalPath(targetDir);
    if (toPosix(canonical) !== toPosix(targetDir)) {
      blockers.push(
        initBlocker(
          "workspace-target-noncanonical",
          "target",
          `${JSON.stringify(targetDir)} resolves to ${JSON.stringify(canonical)}`,
          "repeat from the exact canonical workspace root recorded by the applying request",
        ),
      );
    }
  } catch (error) {
    blockers.push(
      initBlocker(
        "workspace-target-unreadable",
        "target",
        error instanceof Error ? error.message : String(error),
        "make the applying workspace root inspectable before retrying",
      ),
    );
  }
}

function inspectPlannedAncestors(
  fs: FileSystem,
  targetDir: string,
  path: string,
  blockers: WorkspaceIntegrationBlocker[],
): void {
  const rel = relative(targetDir, path);
  if (!isContained(targetDir, path)) {
    blockers.push(
      initBlocker(
        "workspace-plan-path-escapes",
        "packaged-content",
        `planned path ${JSON.stringify(path)} escapes ${JSON.stringify(targetDir)}`,
        "repair the selected template or packaged integration path",
      ),
    );
    return;
  }
  let current = targetDir;
  for (const segment of rel.split(/[\\/]/).slice(0, -1)) {
    if (segment.length === 0) continue;
    current = join(current, segment);
    try {
      const inspection = fs.inspectPath(current);
      if (inspection.kind === "missing") return;
      if (inspection.kind === "directory") continue;
      blockers.push(
        initBlocker(
          "workspace-plan-ancestor-ambiguous",
          "destination",
          `${JSON.stringify(current)} is ${inspection.kind}, not a real workspace directory`,
          "restore the exact applying workspace with real directory ancestors before retrying",
        ),
      );
      return;
    } catch (error) {
      blockers.push(
        initBlocker(
          "workspace-plan-ancestor-unreadable",
          "destination",
          `${JSON.stringify(current)} cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
          "make every planned destination ancestor inspectable before retrying",
        ),
      );
      return;
    }
  }
}

function directoryTreeIsExact(fs: FileSystem, source: string, destination: string): boolean {
  try {
    if (
      fs.inspectPath(source).kind !== "directory" ||
      fs.inspectPath(destination).kind !== "directory"
    ) {
      return false;
    }
    const sourceEntries = [...fs.list(source)].sort((a, b) => a.name.localeCompare(b.name));
    const destinationEntries = [...fs.list(destination)].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    if (JSON.stringify(sourceEntries) !== JSON.stringify(destinationEntries)) return false;
    for (const entry of sourceEntries) {
      const sourcePath = join(source, entry.name);
      const destinationPath = join(destination, entry.name);
      if (
        fs.inspectPath(sourcePath).kind !== entry.kind ||
        fs.inspectPath(destinationPath).kind !== entry.kind
      ) {
        return false;
      }
      if (entry.kind === "directory") {
        if (!directoryTreeIsExact(fs, sourcePath, destinationPath)) return false;
      } else if (fs.read(sourcePath) !== fs.read(destinationPath)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function inspectRetryTree(
  fs: FileSystem,
  root: string,
  allowedPaths: ReadonlySet<string>,
  opaqueDirectories: ReadonlySet<string>,
  blockers: WorkspaceIntegrationBlocker[],
): void {
  const visit = (directory: string): void => {
    let entries: ReturnType<FileSystem["list"]>;
    try {
      entries = fs.list(directory);
    } catch (error) {
      blockers.push(
        initBlocker(
          "workspace-partial-tree-unreadable",
          "destination",
          `${JSON.stringify(directory)} cannot be inventoried: ${error instanceof Error ? error.message : String(error)}`,
          "make the exact partial workspace tree inspectable before retrying",
        ),
      );
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (!allowedPaths.has(path)) {
        blockers.push(
          initBlocker(
            "workspace-partial-unplanned-path",
            "ownership",
            `${JSON.stringify(path)} is not an output authorized by the applying init request`,
            "preserve or remove the unplanned content before retrying the exact init request",
          ),
        );
        continue;
      }
      try {
        if (fs.inspectPath(path).kind === "directory" && !opaqueDirectories.has(path)) {
          visit(path);
        }
      } catch (error) {
        blockers.push(
          initBlocker(
            "workspace-partial-tree-unreadable",
            "destination",
            `${JSON.stringify(path)} cannot be inventoried: ${error instanceof Error ? error.message : String(error)}`,
            "make the exact partial workspace tree inspectable before retrying",
          ),
        );
      }
    }
  };
  visit(root);
}

/**
 * Create a new **authoring workspace** at `input.targetDir` from the chosen built-in project template (default
 * `minimal`). The shipped bundle-project skeleton nests under the deliverable subdirectory `wip/`.
 *
 * Steps (doc 10 §"Per-command actions" `init` row; docs 06/12 for the workspace layout):
 * 1. Capture and validate the complete project-template, bundle-template, Backlog.md, selected-client, packaged
 *    skill, destination, and ownership plan; aggregate every predictable blocker before the first write.
 * 2. Refuse an existing target unless it carries the exact applying record for this immutable init plan.
 * 3. Render the template's `files/` into the deliverable subdir `wip/`, substituting `{{project-name}}` + `--param`.
 * 4. (manifest) The template's `manifest.yml` snippet is part of `files/`, so it is instantiated by step 3.
 * 5. Materialise the default bundle template at `wip/bundles/bundle-template/` (its `files/` tree, verbatim).
 * 6. Create the empty `wip/installer-skills/` + `wip/templates/` dirs, the `.authoring-backlog/` Backlog.md root
 *    (at the workspace root), and the empty `builds/` build-output directory.
 * 7. Create one scope-alias per declared target (none for `minimal`) under `wip/`, via the deriver's alias plan.
 * 8. Render the `<name>-installer/SKILL.md` orchestrator under `wip/`, and the author-owned executor front door
 *    to `wip/_AGENTS.md` (the reserved build-stripped prefix — written once, not re-derived later).
 * 9. Install the exact five WPM authoring skills and native root front door for each explicitly selected client.
 * 10. Materialise the project-wide authoring task set (doc 11) into the workspace-root authoring backlog, plus a
 *     per-bundle set for every bundle the template pre-includes (idempotent by title).
 * 11. Record `.authoring-backlog/` and `builds/` in the workspace `.gitignore`.
 * 12. Return a summary naming the workspace path and the number of materialised tasks.
 *
 * @param deps - The filesystem + backlog ports and exact packaged template/skill sources.
 * @param input - The target, project/template parameters, and explicit workspace authoring-client selection.
 * @returns The init result, including the selected-client integration result and an explicit no-handoff claim.
 * @throws {WorkspaceIntegrationPreflightError} For aggregated predictable blockers before mutation.
 * @throws {MutationFailure} For typed progress when an unforeseen planned effect fails.
 */
export function initProject(deps: InitProjectDeps, input: InitProjectInput): InitProjectResult {
  const { fs, backlog, builtinTemplatesRoot } = deps;
  const { targetDir, name } = input;
  const templateName = input.templateName ?? DEFAULT_PROJECT_TEMPLATE;
  const blockers: WorkspaceIntegrationBlocker[] = [];
  let defaultResolutionFailed = false;
  let authoringClientIds = input.authoringClientIds;
  if (authoringClientIds === undefined) {
    try {
      authoringClientIds = readPersonalAuthoringDefaults({ fs, env: deps.env }) ?? [];
    } catch (error) {
      if (!(error instanceof PersonalAuthoringSetupPreflightError)) throw error;
      defaultResolutionFailed = true;
      blockers.push(
        ...error.blockers.map((blocker) => ({
          code: blocker.code,
          surface: "managed-state" as const,
          message: blocker.message,
          recovery: `${blocker.recovery}; alternatively pass an explicit --authoring-client selection`,
        })),
      );
      authoringClientIds = [];
    }
  }
  const wip = join(targetDir, DELIVERABLE_DIR);
  const params = new Map<string, string>([["project-name", name]]);
  for (const [key, value] of input.params ?? []) {
    params.set(key, value);
  }

  // Complete predictable preflight. Every source, destination, task, alias, and ownership fact is inspected
  // before the first write; the immutable values captured here are the only bytes the plan can later apply.
  let authoringSeed: FreshWorkspaceAuthoringPlanSeed | undefined;
  try {
    authoringSeed = planFreshWorkspaceAuthoringIntegration(
      {
        fs,
        backlog,
        bundledSkillsRoot: deps.bundledSkillsRoot,
      },
      {
        workspaceRoot: targetDir,
        clientIds: authoringClientIds,
        integrationVersion: deps.integrationVersion,
      },
    );
  } catch (error) {
    if (error instanceof WorkspaceIntegrationPreflightError) {
      blockers.push(
        ...error.blockers.filter(
          ({ code }) => !(defaultResolutionFailed && code === "authoring-clients-empty"),
        ),
      );
    } else throw error;
  }

  // Inspect the target independently so a bad package/selection/backlog still reports the predictable target
  // conflict in the same aggregate. Exact applying-state authorization waits until the full plan is bound.
  let targetInspection: ReturnType<FileSystem["inspectPath"]> | undefined;
  try {
    targetInspection = fs.inspectPath(targetDir);
    if (targetInspection.kind === "missing") {
      inspectProspectiveTarget(fs, targetDir, blockers);
    } else if (targetInspection.kind !== "directory") {
      blockers.push(
        initBlocker(
          "workspace-target-exists",
          "target",
          `cannot create a project at ${JSON.stringify(targetDir)}: found ${targetInspection.kind}`,
          "pick an absent target path and repeat the complete creation request",
        ),
      );
    } else if (authoringSeed === undefined) {
      const statePath = join(targetDir, WORKSPACE_INTEGRATION_STATE_PATH);
      const stateInspection = fs.inspectPath(statePath);
      blockers.push(
        initBlocker(
          stateInspection.kind === "file"
            ? "workspace-partial-request-mismatch"
            : "workspace-target-exists",
          stateInspection.kind === "file" ? "managed-state" : "target",
          stateInspection.kind === "file"
            ? `existing ${WORKSPACE_INTEGRATION_STATE_PATH} cannot be authorized without a complete immutable init plan`
            : `cannot create a project at ${JSON.stringify(targetDir)}: found an existing directory without the exact applying record`,
          stateInspection.kind === "file"
            ? "repair the packaged request blockers, then repeat the exact original init plan"
            : "pick an absent target path, or recover a prior WPM applying request before retrying",
        ),
      );
    }
  } catch (error) {
    blockers.push(
      initBlocker(
        "workspace-target-unreadable",
        "target",
        `${JSON.stringify(targetDir)} cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
        "make the target and its managed-state path inspectable before repeating init",
      ),
    );
  }

  let resolution: ReturnType<typeof resolveTemplate> | undefined;
  try {
    resolution = resolveTemplate(templateName, "project", { fs, builtinTemplatesRoot });
  } catch (error) {
    blockers.push(
      initBlocker(
        "project-template-unreadable",
        "packaged-content",
        error instanceof Error ? error.message : String(error),
        "repair the selected project template before creating the workspace",
      ),
    );
  }
  if (resolution !== undefined && !resolution.found) {
    blockers.push(
      initBlocker(
        "project-template-missing",
        "packaged-content",
        `project template ${JSON.stringify(templateName)} was not found (searched: ${resolution.searched.join(", ")})`,
        "select an available project template or repair the WPM package",
      ),
    );
  }

  let bundleTemplate: ReturnType<typeof resolveTemplate> | undefined;
  try {
    bundleTemplate = resolveTemplate(DEFAULT_BUNDLE_TEMPLATE, "bundle", {
      fs,
      builtinTemplatesRoot,
    });
  } catch (error) {
    blockers.push(
      initBlocker(
        "default-bundle-template-unreadable",
        "packaged-content",
        error instanceof Error ? error.message : String(error),
        "repair the WPM package so the default bundle template is readable",
      ),
    );
  }
  if (bundleTemplate !== undefined && !bundleTemplate.found) {
    blockers.push(
      initBlocker(
        "default-bundle-template-missing",
        "packaged-content",
        `bundle template ${JSON.stringify(DEFAULT_BUNDLE_TEMPLATE)} was not found (searched: ${bundleTemplate.searched.join(", ")})`,
        "repair the WPM package so the default bundle template is available",
      ),
    );
  }

  let renderedProject: RenderedFile[] | undefined;
  let projection: Project | undefined;
  let desired: ReturnType<typeof deriveArtefactsFromTemplateSnapshot> | undefined;
  let taskPlan: readonly PlannedProjectAuthoringTask[] | undefined;
  if (resolution?.found) {
    try {
      renderedProject = renderTree(resolution.template.files, params);
      projection = buildProjection(renderedProject, wip);
    } catch (error) {
      blockers.push(
        initBlocker(
          "project-template-invalid",
          "packaged-content",
          error instanceof Error ? error.message : String(error),
          "repair the selected project template before creating the workspace",
        ),
      );
    }
  }

  if (resolution?.found && projection !== undefined) {
    try {
      const concreteProject = projection;
      desired = deriveArtefactsFromTemplateSnapshot(concreteProject, resolution.template);
    } catch (error) {
      blockers.push(
        initBlocker(
          "project-derived-plan-invalid",
          "packaged-content",
          error instanceof Error ? error.message : String(error),
          "repair the selected project template or packaged derivation sources before creating the workspace",
        ),
      );
    }

    try {
      const concreteProject = projection;
      const projectInspection = inspectTemplateAuthoringTasks({
        template: resolution.template,
        producer: {
          source: resolution.source,
          scope: "project",
          name: resolution.template.name,
        },
        mandatoryTasks: projectWideAuthoringTaskCatalog(),
        context: { "wpm.project.name": concreteProject.manifest.meta.name },
      });
      const bundleContributions = bundleTemplate?.found
        ? concreteProject.manifest.bundles.map((id) => {
            const bundle = concreteProject.bundles.get(id);
            if (bundle === undefined) {
              throw new Error(`internal: pre-included bundle ${id} is absent from the projection`);
            }
            if (bundle.id !== id) {
              blockers.push(
                initBlocker(
                  "template-task-bundle-identity-mismatch",
                  "authoring-task-plan",
                  `template:${bundleTemplate.source}:bundle:${bundleTemplate.template.name}#bundle:${id} is selected by manifest id ${JSON.stringify(id)} but its rendered bundle.yml declares ${JSON.stringify(bundle.id)}`,
                  "repair the project template so every pre-included bundle directory, manifest entry, and rendered bundle id agree",
                ),
              );
            }
            return {
              id,
              // Story 3.1 deliberately excludes the conditional advisor reference from the documented
              // dependency vocabulary. The complete-plan compiler receives advisor-inclusive actual work
              // separately, so its title still participates in whole-plan collision checks.
              inspection: inspectTemplateAuthoringTasks({
                template: bundleTemplate.template,
                producer: {
                  source: bundleTemplate.source,
                  scope: "bundle",
                  name: bundleTemplate.template.name,
                },
                mandatoryTasks: perBundleAuthoringTaskCatalog(id, { advisor: false }),
                context: {
                  "wpm.project.name": concreteProject.manifest.meta.name,
                  "wpm.bundle.id": id,
                  "wpm.bundle.version": bundle.version,
                },
              }),
              mandatoryTasks: perBundleAuthoringTaskCatalog(id, { advisor: true }),
            };
          })
        : [];
      const compiled = compileProjectAuthoringTaskPlan({
        project: {
          inspection: projectInspection,
          mandatoryTasks: projectWideAuthoringTaskCatalog(),
        },
        bundles: bundleContributions,
      });
      if (!compiled.ok) {
        blockers.push(...compiled.problems.map(authoringTaskPlanBlocker));
      } else if (bundleTemplate?.found) {
        taskPlan = compiled.tasks;
      }
    } catch (error) {
      blockers.push(
        initBlocker(
          "authoring-task-plan-invalid",
          "authoring-task-plan",
          error instanceof Error ? error.message : String(error),
          "repair the selected template task contribution or packaged mandatory catalog before creating the workspace",
        ),
      );
    }
  }

  // A broken rendered projection prevents construction of the complete plan, but it does not make the
  // selected project's descriptor contribution unreadable. Inspect that independently available evidence so
  // structural task findings are not hidden behind a separate manifest/bundle projection blocker. This
  // diagnostic-only fallback never exposes tasks or authorizes a write; a valid plan still requires the exact
  // rendered project context above.
  if (resolution?.found && projection === undefined) {
    try {
      const diagnosticProjectInspection = inspectTemplateAuthoringTasks({
        template: resolution.template,
        producer: {
          source: resolution.source,
          scope: "project",
          name: resolution.template.name,
        },
        mandatoryTasks: projectWideAuthoringTaskCatalog(),
        context: { "wpm.project.name": name },
      });
      const diagnosticBundles: Array<{
        readonly id: string;
        readonly inspection: ReturnType<typeof inspectTemplateAuthoringTasks>;
        readonly mandatoryTasks: readonly MandatoryAuthoringTask[];
      }> = [];
      const manifestText = renderedProject?.find(({ path }) => path === "manifest.yml")?.content;
      if (manifestText !== undefined && bundleTemplate?.found) {
        let manifestResult: ReturnType<typeof parseManifest> | undefined;
        try {
          manifestResult = parseManifest(parseYaml(manifestText));
        } catch {
          // The project-template blocker above already retains this parse failure. Project contribution
          // inspection remains independently useful and must still reach the compiler below.
        }
        if (manifestResult?.ok) {
          for (const id of manifestResult.value.bundles) {
            const bundleText = renderedProject?.find(
              ({ path }) => path === `bundles/${id}/bundle.yml`,
            )?.content;
            let version = "";
            let contextProblem: string | undefined;
            if (bundleText === undefined) {
              contextProblem = `rendered bundles/${id}/bundle.yml is missing`;
            } else {
              try {
                const bundleResult = parseBundleManifest(parseYaml(bundleText));
                if (bundleResult.ok) version = bundleResult.value.version;
                else contextProblem = bundleResult.problem.message;
              } catch (error) {
                contextProblem = error instanceof Error ? error.message : String(error);
              }
            }
            if (contextProblem !== undefined) {
              blockers.push(
                initBlocker(
                  "template-task-bundle-context-invalid",
                  "authoring-task-plan",
                  `template:${bundleTemplate.source}:bundle:${bundleTemplate.template.name}#bundle:${id} has no valid concrete bundle context: ${contextProblem}`,
                  `repair the rendered bundles/${id}/bundle.yml before creating the workspace`,
                ),
              );
            }
            diagnosticBundles.push({
              id,
              inspection: inspectTemplateAuthoringTasks({
                template: bundleTemplate.template,
                producer: {
                  source: bundleTemplate.source,
                  scope: "bundle",
                  name: bundleTemplate.template.name,
                },
                mandatoryTasks: perBundleAuthoringTaskCatalog(id, { advisor: false }),
                context: {
                  "wpm.project.name": manifestResult.value.meta.name,
                  "wpm.bundle.id": id,
                  "wpm.bundle.version": version,
                },
              }),
              mandatoryTasks: perBundleAuthoringTaskCatalog(id, { advisor: true }),
            });
          }
        }
      }
      const diagnosticPlan = compileProjectAuthoringTaskPlan({
        project: {
          inspection: diagnosticProjectInspection,
          mandatoryTasks: projectWideAuthoringTaskCatalog(),
        },
        bundles: diagnosticBundles,
      });
      if (!diagnosticPlan.ok) {
        blockers.push(...diagnosticPlan.problems.map(authoringTaskPlanBlocker));
      }
    } catch (error) {
      blockers.push(
        initBlocker(
          "authoring-task-plan-invalid",
          "authoring-task-plan",
          error instanceof Error ? error.message : String(error),
          "repair the selected template task contribution or packaged mandatory catalog before creating the workspace",
        ),
      );
    }
  }

  if (
    !resolution?.found ||
    !bundleTemplate?.found ||
    renderedProject === undefined ||
    projection === undefined ||
    desired === undefined ||
    taskPlan === undefined ||
    authoringSeed === undefined
  ) {
    if (targetInspection?.kind === "directory" && authoringSeed !== undefined) {
      try {
        const stateInspection = fs.inspectPath(join(targetDir, WORKSPACE_INTEGRATION_STATE_PATH));
        blockers.push(
          initBlocker(
            stateInspection.kind === "file"
              ? "workspace-partial-request-mismatch"
              : "workspace-target-exists",
            stateInspection.kind === "file" ? "managed-state" : "target",
            stateInspection.kind === "file"
              ? `existing ${WORKSPACE_INTEGRATION_STATE_PATH} cannot be authorized without a complete immutable init plan`
              : `cannot create a project at ${JSON.stringify(targetDir)}: found an existing directory without the exact applying record`,
            stateInspection.kind === "file"
              ? "repair the packaged request blockers, then repeat the exact original init plan"
              : "pick an absent target path, or recover a prior WPM applying request before retrying",
          ),
        );
      } catch (error) {
        blockers.push(
          initBlocker(
            "workspace-target-unreadable",
            "target",
            `${JSON.stringify(targetDir)} cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
            "make the target and its managed-state path inspectable before repeating init",
          ),
        );
      }
    }
    if (blockers.length > 0) throw new WorkspaceIntegrationPreflightError(blockers);
    throw new Error("internal: successful init preflight produced no complete immutable plan");
  }

  const plannedFiles = new Map<string, PlannedInitFile>();
  const plannedDirectories = new Map<string, PlannedInitDirectory>();
  const plannedAliases = new Map<string, PlannedInitAlias>();
  const addFile = (file: PlannedInitFile, owningRoot: string = targetDir): void => {
    if (!isContained(owningRoot, file.path)) {
      blockers.push(
        initBlocker(
          "workspace-plan-path-escapes",
          "packaged-content",
          `planned file ${JSON.stringify(file.path)} escapes its owning output root ${JSON.stringify(owningRoot)}`,
          "repair the selected template or packaged integration path",
        ),
      );
      return;
    }
    const existing = plannedFiles.get(file.path);
    if (existing !== undefined && existing.content !== file.content) {
      blockers.push(
        initBlocker(
          "workspace-plan-path-collision",
          "packaged-content",
          `two packaged sources produce different bytes for ${JSON.stringify(file.path)}`,
          "repair the colliding template/integration sources before creating the workspace",
        ),
      );
      return;
    }
    if (existing === undefined) plannedFiles.set(file.path, file);
  };
  const addDirectory = (directory: PlannedInitDirectory): void => {
    if (!isContained(targetDir, directory.path)) {
      blockers.push(
        initBlocker(
          "workspace-plan-path-escapes",
          "packaged-content",
          `planned directory ${JSON.stringify(directory.path)} escapes the workspace root`,
          "repair the selected template before creating the workspace",
        ),
      );
      return;
    }
    plannedDirectories.set(directory.path, directory);
  };
  const addAlias = (alias: PlannedInitAlias, owningRoot: string = targetDir): void => {
    if (
      !isContained(owningRoot, alias.path) ||
      (isAbsolute(alias.target) && !isContained(owningRoot, alias.target))
    ) {
      blockers.push(
        initBlocker(
          "workspace-plan-path-escapes",
          "packaged-content",
          `planned alias ${JSON.stringify(alias.path)} or its target escapes owning output root ${JSON.stringify(owningRoot)}`,
          "repair the selected template before creating the workspace",
        ),
      );
      return;
    }
    const existing = plannedAliases.get(alias.path);
    if (existing !== undefined && toPosix(existing.target) !== toPosix(alias.target)) {
      blockers.push(
        initBlocker(
          "workspace-plan-alias-collision",
          "packaged-content",
          `two packaged sources target ${JSON.stringify(alias.path)} at different destinations`,
          "repair the colliding template alias plans before creating the workspace",
        ),
      );
      return;
    }
    if (existing === undefined) plannedAliases.set(alias.path, alias);
  };

  for (const file of renderedProject) {
    const abs = join(wip, file.path);
    addFile(
      {
        id: `project-file:${toPosix(file.path)}`,
        path: abs,
        content: file.content,
        description: `write rendered project file ${toPosix(file.path)}`,
      },
      wip,
    );
  }

  const bundleTemplateDir = join(wip, "bundles", BUNDLE_TEMPLATE_DIR);
  for (const file of bundleTemplate.template.files) {
    const abs = join(bundleTemplateDir, file.path);
    addFile(
      {
        id: `bundle-template-file:${toPosix(file.path)}`,
        path: abs,
        content: file.content,
        description: `write default bundle-template file ${toPosix(file.path)}`,
      },
      bundleTemplateDir,
    );
  }
  addAlias(
    {
      id: "bundle-template-backlog-alias",
      target: "install-backlog",
      path: join(bundleTemplateDir, "backlog"),
      description: "create the bundle-template backlog alias",
    },
    bundleTemplateDir,
  );

  for (const [id, path, description] of [
    ["deliverable-bundles-directory", join(wip, "bundles"), "create the bundles directory"],
    [
      "deliverable-installer-skills-directory",
      join(wip, "installer-skills"),
      "create the installer-skills directory",
    ],
    ["deliverable-templates-directory", join(wip, "templates"), "create the templates directory"],
    [
      "workspace-builds-directory",
      join(targetDir, BUILDS_DIR),
      "create the build-output directory",
    ],
    [
      "authoring-backlog-directory",
      join(targetDir, AUTHORING_BACKLOG_DIR),
      "create the authoring-backlog directory",
    ],
  ] as const) {
    addDirectory({ id, path, description });
  }

  for (const file of desired.files) {
    const abs =
      file.path === DERIVED_EXECUTOR_FRONT_DOOR_PATH
        ? join(wip, EXECUTOR_FRONT_DOOR)
        : join(wip, file.path);
    addFile(
      {
        id: `derived-file:${toPosix(file.path)}`,
        path: abs,
        content: file.content,
        description: `write derived deliverable file ${toPosix(file.path)}`,
        beat: "RERENDER",
      },
      wip,
    );
  }
  for (const alias of desired.aliasPlan.aliases) {
    addAlias(
      {
        id: `deliverable-alias:${toPosix(alias.linkPath)}`,
        target: join(wip, alias.aliasTo),
        path: join(wip, alias.linkPath),
        description: `create deliverable scope alias ${toPosix(alias.linkPath)}`,
        beat: "RERENDER",
      },
      wip,
    );
  }

  for (const id of projection.manifest.bundles) {
    addAlias(
      {
        id: `bundle-backlog-alias:${id}`,
        target: "install-backlog",
        path: join(wip, "bundles", id, "backlog"),
        description: `create ${id} backlog alias`,
      },
      wip,
    );
  }

  for (const file of authoringSeed.files) {
    addFile({
      id: `workspace-authoring:${file.client}:${file.path}`,
      path: join(targetDir, file.path),
      content: file.content,
      description: `install ${file.client} workspace authoring file ${file.path}`,
    });
  }

  addFile({
    id: "workspace-gitignore",
    path: join(targetDir, ".gitignore"),
    content: `${AUTHORING_BACKLOG_DIR}/\n${BUILDS_DIR}/\n`,
    description: "write workspace builder exclusions",
  });

  const managedStatePath = join(targetDir, WORKSPACE_INTEGRATION_STATE_PATH);
  const handoffReceiptPath = join(targetDir, WORKSPACE_HANDOFF_RECEIPT_PATH);
  const authoringRoot = join(targetDir, AUTHORING_BACKLOG_DIR);
  const kindByPath = new Map<string, Set<"file" | "directory" | "alias">>();
  const recordKind = (path: string, kind: "file" | "directory" | "alias"): void => {
    const kinds = kindByPath.get(path) ?? new Set();
    kinds.add(kind);
    kindByPath.set(path, kinds);
  };
  for (const { path } of plannedFiles.values()) recordKind(path, "file");
  for (const { path } of plannedDirectories.values()) recordKind(path, "directory");
  for (const { path } of plannedAliases.values()) recordKind(path, "alias");
  recordKind(managedStatePath, "file");
  recordKind(handoffReceiptPath, "file");
  for (const path of [
    ...plannedFiles.keys(),
    ...plannedAliases.keys(),
    ...plannedDirectories.keys(),
  ]) {
    if (path === managedStatePath || isContained(managedStatePath, path)) {
      blockers.push(
        initBlocker(
          "workspace-plan-managed-path-collision",
          "packaged-content",
          `${JSON.stringify(path)} collides with WPM's reserved managed-state path`,
          "repair the selected template so only WPM owns the integration state path",
        ),
      );
    }
    if (path === handoffReceiptPath || isContained(handoffReceiptPath, path)) {
      blockers.push(
        initBlocker(
          "workspace-plan-handoff-path-collision",
          "packaged-content",
          `${JSON.stringify(path)} collides with WPM's reserved handoff-receipt path`,
          "repair the selected template so only WPM owns the handoff receipt path",
        ),
      );
    }
    if (path !== authoringRoot && isContained(authoringRoot, path)) {
      blockers.push(
        initBlocker(
          "workspace-plan-managed-path-collision",
          "packaged-content",
          `${JSON.stringify(path)} collides with the Backlog.md-owned authoring root`,
          "repair the selected template so only Backlog.md owns the authoring-backlog subtree",
        ),
      );
    }
  }
  for (const [path, kinds] of kindByPath) {
    if (kinds.size <= 1) continue;
    blockers.push(
      initBlocker(
        "workspace-plan-path-kind-collision",
        "packaged-content",
        `${JSON.stringify(path)} is planned as multiple incompatible kinds: ${[...kinds].join(", ")}`,
        "repair the selected template so every output path has one concrete kind",
      ),
    );
  }
  const plannedPaths = [...kindByPath.keys()];
  for (const ancestor of [...plannedFiles.values(), ...plannedAliases.values()]) {
    for (const descendant of plannedPaths) {
      if (descendant === ancestor.path) continue;
      const rel = relative(ancestor.path, descendant);
      if (
        rel !== "" &&
        !isAbsolute(rel) &&
        rel !== ".." &&
        !rel.startsWith("../") &&
        !rel.startsWith("..\\")
      ) {
        blockers.push(
          initBlocker(
            "workspace-plan-nondirectory-ancestor",
            "packaged-content",
            `${JSON.stringify(ancestor.path)} is planned as a non-directory ancestor of ${JSON.stringify(descendant)}`,
            "repair the selected template so descendants have only directory ancestors",
          ),
        );
      }
    }
  }

  // Bind the applying record to the exact immutable output/task plan, not merely to the caller's flags. A
  // partial retry may therefore use only the same captured package/template revision; newly resolved bytes
  // cannot be mixed with already-completed boundaries from an earlier plan.
  const handoffShapeText = serializeWorkspaceHandoffReceipt(
    createWorkspaceHandoffReceipt({
      status: "prepared",
      workspaceRoot: targetDir,
      integrationVersion: deps.integrationVersion,
      configuredClients: authoringSeed.clients,
    }),
  );
  const pendingRequestKey = freshInitRequestKey(
    {
      name,
      templateName,
      params,
      clients: authoringSeed.clients,
      integrationVersion: deps.integrationVersion,
      completeStateText: authoringSeed.completeStateText,
      handoffShapeText,
    },
    plannedFiles.values(),
    plannedDirectories.values(),
    plannedAliases.values(),
    taskPlan,
  );
  const authoringPlan: FreshWorkspaceAuthoringPlan = authorizeFreshWorkspaceAuthoringPlan(
    authoringSeed,
    pendingRequestKey,
  );
  const preparedHandoffReceipt = createWorkspaceHandoffReceipt({
    status: "prepared",
    workspaceRoot: targetDir,
    integrationVersion: deps.integrationVersion,
    configuredClients: authoringPlan.clients,
  });
  const preparingHandoffReceipt = createWorkspaceHandoffReceipt({
    status: "preparing",
    workspaceRoot: targetDir,
    integrationVersion: deps.integrationVersion,
    configuredClients: authoringPlan.clients,
    requestKey: pendingRequestKey,
  });
  const preparedHandoffText = serializeWorkspaceHandoffReceipt(preparedHandoffReceipt);
  const preparingHandoffText = serializeWorkspaceHandoffReceipt(preparingHandoffReceipt);

  let retryStage: "none" | "applying" | "finalizing" = "none";
  let handoffReceiptAlreadyPreparing = false;
  try {
    if (targetInspection?.kind === "directory") {
      const stateInspection = fs.inspectPath(managedStatePath);
      const stateText = stateInspection.kind === "file" ? fs.read(managedStatePath) : undefined;
      const receiptInspection = fs.inspectPath(handoffReceiptPath);
      const receiptText =
        receiptInspection.kind === "file" ? fs.read(handoffReceiptPath) : undefined;
      if (stateText === authoringPlan.applyingStateText) {
        if (receiptInspection.kind === "missing") {
          retryStage = "applying";
        } else if (receiptText === preparingHandoffText) {
          retryStage = "applying";
          handoffReceiptAlreadyPreparing = true;
        } else {
          blockers.push(
            initBlocker(
              "workspace-partial-handoff-conflict",
              "ownership",
              `existing ${WORKSPACE_HANDOFF_RECEIPT_PATH} is not absent or the exact preparing receipt authorized by the applying init plan`,
              "restore the exact applying receipt bytes or preserve the conflicting content before retrying",
            ),
          );
        }
      } else if (
        stateText === authoringPlan.completeStateText &&
        receiptText === preparingHandoffText
      ) {
        retryStage = "finalizing";
        handoffReceiptAlreadyPreparing = true;
      } else if (
        stateText === authoringPlan.completeStateText &&
        receiptText === preparedHandoffText
      ) {
        blockers.push(
          initBlocker(
            "workspace-target-exists",
            "target",
            `cannot create a project at ${JSON.stringify(targetDir)}: the workspace is already completely initialized and handoff-prepared`,
            "pick an absent target path; use the project-bound authoring commands for an existing workspace",
          ),
        );
      } else {
        blockers.push(
          initBlocker(
            stateInspection.kind === "file"
              ? "workspace-partial-request-mismatch"
              : "workspace-target-exists",
            stateInspection.kind === "file" ? "managed-state" : "target",
            stateInspection.kind === "file"
              ? `existing ${WORKSPACE_INTEGRATION_STATE_PATH} and ${WORKSPACE_HANDOFF_RECEIPT_PATH} do not authorize this exact immutable init plan`
              : `cannot create a project at ${JSON.stringify(targetDir)}: found an existing directory without the exact applying record`,
            stateInspection.kind === "file"
              ? "repeat the exact init request with the original packaged plan or preserve/recover the partial workspace explicitly"
              : "pick an absent target path, or recover a prior WPM applying request before retrying",
          ),
        );
      }
      if (retryStage !== "none") {
        inspectExistingRootIdentity(fs, targetDir, blockers);
      }
    }
  } catch (error) {
    blockers.push(
      initBlocker(
        "workspace-target-unreadable",
        "target",
        `${JSON.stringify(targetDir)} cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
        "make the target and its managed-state path inspectable before repeating init",
      ),
    );
  }

  const retrying = retryStage !== "none";
  // Before the receipt exists, an applying record can truthfully authorize unfinished output boundaries.
  // Once the exact preparing receipt exists, every earlier output/task boundary was reported complete; a
  // missing path at that stage is external change, not recoverable partial creation.
  const repairing = retryStage === "applying" && !handoffReceiptAlreadyPreparing;

  const filesToWrite: PlannedInitFile[] = [];
  const directoriesToCreate: PlannedInitDirectory[] = [];
  const aliasesToCreate: PlannedInitAlias[] = [];
  if (retrying) {
    for (const planned of [
      ...plannedFiles.values(),
      ...plannedDirectories.values(),
      ...plannedAliases.values(),
    ]) {
      inspectPlannedAncestors(fs, targetDir, planned.path, blockers);
    }
  }

  for (const planned of plannedFiles.values()) {
    if (!retrying) {
      filesToWrite.push(planned);
      continue;
    }
    try {
      const inspection = fs.inspectPath(planned.path);
      if (inspection.kind === "missing") {
        if (repairing) {
          filesToWrite.push(planned);
        } else {
          blockers.push(
            initBlocker(
              "workspace-complete-file-missing",
              "destination",
              `${JSON.stringify(planned.path)} is missing after managed integration reached complete`,
              "restore the exact completed output before finalizing the prepared handoff",
            ),
          );
        }
      } else if (inspection.kind !== "file" || fs.read(planned.path) !== planned.content) {
        blockers.push(
          initBlocker(
            "workspace-partial-file-conflict",
            "destination",
            `${JSON.stringify(planned.path)} does not match the exact planned partial-init bytes`,
            "restore/remove only the proven partial output or preserve the changed content before retrying",
          ),
        );
      }
    } catch (error) {
      blockers.push(
        initBlocker(
          "workspace-partial-file-unreadable",
          "destination",
          `${JSON.stringify(planned.path)} cannot be verified: ${error instanceof Error ? error.message : String(error)}`,
          "make the planned destination inspectable before retrying",
        ),
      );
    }
  }

  for (const planned of plannedDirectories.values()) {
    if (!retrying) {
      directoriesToCreate.push(planned);
      continue;
    }
    try {
      const inspection = fs.inspectPath(planned.path);
      if (inspection.kind === "missing") {
        if (repairing) {
          directoriesToCreate.push(planned);
        } else {
          blockers.push(
            initBlocker(
              "workspace-complete-directory-missing",
              "destination",
              `${JSON.stringify(planned.path)} is missing after managed integration reached complete`,
              "restore the exact completed directory before finalizing the prepared handoff",
            ),
          );
        }
      } else if (inspection.kind !== "directory") {
        blockers.push(
          initBlocker(
            "workspace-partial-directory-conflict",
            "destination",
            `${JSON.stringify(planned.path)} is ${inspection.kind}, not the planned directory`,
            "preserve or remove the conflicting path before retrying the exact request",
          ),
        );
      }
    } catch (error) {
      blockers.push(
        initBlocker(
          "workspace-partial-directory-unreadable",
          "destination",
          `${JSON.stringify(planned.path)} cannot be verified: ${error instanceof Error ? error.message : String(error)}`,
          "make the planned directory inspectable before retrying",
        ),
      );
    }
  }

  for (const planned of plannedAliases.values()) {
    if (!retrying) {
      aliasesToCreate.push(planned);
      continue;
    }
    try {
      const inspection = fs.inspectPath(planned.path);
      if (inspection.kind === "missing") {
        if (repairing) {
          aliasesToCreate.push(planned);
        } else {
          blockers.push(
            initBlocker(
              "workspace-complete-alias-missing",
              "destination",
              `${JSON.stringify(planned.path)} is missing after managed integration reached complete`,
              "restore the exact completed alias before finalizing the prepared handoff",
            ),
          );
        }
      } else if (
        inspection.kind === "symbolic-link" &&
        toPosix(inspection.target) === toPosix(planned.target)
      ) {
        // Exact POSIX alias already completed.
      } else if (
        inspection.kind === "directory" &&
        directoryTreeIsExact(
          fs,
          isAbsolute(planned.target) ? planned.target : join(dirname(planned.path), planned.target),
          planned.path,
        )
      ) {
        // Exact Windows copy fallback already completed.
      } else {
        blockers.push(
          initBlocker(
            "workspace-partial-alias-conflict",
            "destination",
            `${JSON.stringify(planned.path)} is not the exact planned alias/copy`,
            "preserve or remove the conflicting alias output after establishing ownership, then retry",
          ),
        );
      }
    } catch (error) {
      blockers.push(
        initBlocker(
          "workspace-partial-alias-unreadable",
          "destination",
          `${JSON.stringify(planned.path)} cannot be verified: ${error instanceof Error ? error.message : String(error)}`,
          "make the planned alias destination inspectable before retrying",
        ),
      );
    }
  }

  let initialiseBacklog = !retrying;
  const existingTaskTitles = new Set<string>();
  const taskIdByIdentity = new Map<string, string>();
  let taskSetObserved = false;
  if (retrying) {
    try {
      const rootInspection = fs.inspectPath(authoringRoot);
      if (rootInspection.kind === "missing") {
        if (repairing) {
          initialiseBacklog = true;
        } else {
          blockers.push(
            initBlocker(
              "workspace-complete-backlog-missing",
              "backlog",
              "authoring backlog is missing after managed integration reached complete",
              "restore the exact completed authoring backlog before finalizing the prepared handoff",
            ),
          );
        }
      } else if (rootInspection.kind === "directory") {
        const inspected = backlog.inspectRoot(authoringRoot);
        if (inspected.valid && inspected.taskPrefix === AUTHORING_TASK_PREFIX) {
          const tasks = backlog.listTasks(authoringRoot);
          taskSetObserved = true;
          const inventory = backlog.inspectTaskInventory(authoringRoot);
          const listedIds = tasks.map(({ id }) => id).sort();
          if (
            !inventory.configurationMatchesFreshDefaults ||
            JSON.stringify([...inventory.activeEntries].sort()) !== JSON.stringify(listedIds) ||
            inventory.inactiveEntries.length > 0 ||
            inventory.unexpectedEntries.length > 0
          ) {
            blockers.push(
              initBlocker(
                "workspace-partial-backlog-conflict",
                "backlog",
                "partial authoring backlog contains inactive, unlisted, malformed, or unexpected task-store content",
                "preserve/recover the changed task history before retrying the exact init request",
              ),
            );
          }
          for (const [index, task] of tasks.entries()) {
            const expected = taskPlan[index];
            const record = backlog.readTask(authoringRoot, task.id);
            const criteriaMatch =
              expected !== undefined &&
              record.acceptanceCriteria.length === expected.acceptanceCriteria.length &&
              record.acceptanceCriteria.every(
                (criterion, index) =>
                  !criterion.checked && criterion.text === expected.acceptanceCriteria[index],
              );
            const expectedDependencyIds = expected?.dependencyIdentities.map((identity) =>
              taskIdByIdentity.get(identity),
            );
            const dependenciesResolved =
              expectedDependencyIds?.every((dependency) => dependency !== undefined) ?? false;
            const dependenciesMatch =
              dependenciesResolved &&
              record.dependencies.length === expectedDependencyIds?.length &&
              record.dependencies.every(
                (dependency, dependencyIndex) =>
                  dependency === expectedDependencyIds?.[dependencyIndex],
              );
            const labelsMatch =
              expected !== undefined &&
              record.labels.length === expected.labels.length &&
              record.labels.every((label, labelIndex) => label === expected.labels[labelIndex]);
            if (
              expected === undefined ||
              existingTaskTitles.has(task.title) ||
              task.title !== expected.title ||
              task.status !== "To Do" ||
              record.id !== task.id ||
              record.title !== task.title ||
              record.status !== task.status ||
              record.ordinal !== (index + 1) * 1000 ||
              record.description !== null ||
              record.definitionOfDone.length !== 0 ||
              !dependenciesMatch ||
              !labelsMatch ||
              record.extraMetadata.length !== 0 ||
              record.extraSections.length !== 0 ||
              !criteriaMatch
            ) {
              blockers.push(
                initBlocker(
                  "workspace-partial-backlog-conflict",
                  "backlog",
                  `partial authoring backlog contains an unexpected, duplicate, or changed task ${JSON.stringify(task.title)}`,
                  "preserve/recover the changed task history before retrying the exact init request",
                ),
              );
            }
            existingTaskTitles.add(task.title);
            if (expected !== undefined) {
              taskIdByIdentity.set(expected.identity, task.id);
            }
          }
        } else if (!inspected.valid) {
          const entries = fs.list(authoringRoot);
          if (
            repairing &&
            (entries.length === 0 || backlog.inspectEmptyInitialisationResidue(authoringRoot))
          ) {
            initialiseBacklog = true;
          } else {
            blockers.push(
              initBlocker(
                "workspace-partial-backlog-invalid",
                "backlog",
                `partial authoring backlog is not the exact root: ${inspected.reason}`,
                "restore or remove only the proven partial backlog before retrying",
              ),
            );
          }
        } else {
          blockers.push(
            initBlocker(
              "workspace-partial-backlog-invalid",
              "backlog",
              `partial authoring backlog uses task prefix ${JSON.stringify(inspected.taskPrefix)}`,
              "restore or remove only the proven partial backlog before retrying",
            ),
          );
        }
      }
    } catch (error) {
      blockers.push(
        initBlocker(
          "workspace-partial-backlog-unreadable",
          "backlog",
          error instanceof Error ? error.message : String(error),
          "make the exact partial authoring backlog inspectable before retrying",
        ),
      );
    }
  }

  if (retrying) {
    const allowedPaths = new Set<string>([
      targetDir,
      join(targetDir, WORKSPACE_INTEGRATION_STATE_PATH),
      ...kindByPath.keys(),
    ]);
    for (const path of [...allowedPaths]) {
      let parent = dirname(path);
      while (parent !== targetDir && isContained(targetDir, parent)) {
        allowedPaths.add(parent);
        const next = dirname(parent);
        if (next === parent) break;
        parent = next;
      }
    }
    inspectRetryTree(
      fs,
      targetDir,
      allowedPaths,
      new Set([authoringRoot, ...plannedAliases.keys()]),
      blockers,
    );
  }

  if (retrying && !repairing && taskSetObserved) {
    for (const planned of taskPlan) {
      if (existingTaskTitles.has(planned.title)) continue;
      blockers.push(
        initBlocker(
          "workspace-complete-task-missing",
          "backlog",
          `authoring task ${JSON.stringify(planned.title)} is missing after handoff preparation began`,
          "restore the exact completed authoring task plan before finalizing the prepared handoff",
        ),
      );
    }
  }

  if (blockers.length > 0) throw new WorkspaceIntegrationPreflightError(blockers);

  const actions: PlannedInitAction[] = [];
  if (!retrying) {
    actions.push(
      initAction(
        "managed-state:applying",
        managedStatePath,
        "record the exact whole-init applying request",
        () => fs.write(managedStatePath, authoringPlan.applyingStateText),
      ),
    );
  }
  for (const directory of directoriesToCreate) {
    actions.push(
      initAction(directory.id, directory.path, directory.description, () =>
        fs.makeDirectories(directory.path),
      ),
    );
  }
  for (const file of filesToWrite.filter(({ beat }) => beat !== "RERENDER")) {
    actions.push(
      initAction(file.id, file.path, file.description, () => fs.write(file.path, file.content)),
    );
  }
  for (const alias of aliasesToCreate.filter(({ beat }) => beat !== "RERENDER")) {
    actions.push(
      initAction(alias.id, alias.path, alias.description, () =>
        fs.ensureAlias(alias.target, alias.path),
      ),
    );
  }
  if (initialiseBacklog) {
    actions.push(
      initAction(
        "authoring-backlog:init",
        authoringRoot,
        "initialise the exact authoring backlog",
        () => backlog.init(authoringRoot, { taskPrefix: AUTHORING_TASK_PREFIX }),
      ),
    );
  }
  for (const file of filesToWrite.filter(({ beat }) => beat === "RERENDER")) {
    actions.push(
      initAction(
        file.id,
        file.path,
        file.description,
        () => fs.write(file.path, file.content),
        undefined,
        "RERENDER",
      ),
    );
  }
  for (const alias of aliasesToCreate.filter(({ beat }) => beat === "RERENDER")) {
    actions.push(
      initAction(
        alias.id,
        alias.path,
        alias.description,
        () => fs.ensureAlias(alias.target, alias.path),
        undefined,
        "RERENDER",
      ),
    );
  }
  for (const planned of taskPlan) {
    if (existingTaskTitles.has(planned.title)) continue;
    if (retrying && !repairing) continue;
    actions.push(
      initAction(
        `authoring-task:${planned.identity}`,
        authoringRoot,
        `materialise authoring task ${planned.title}`,
        () => {
          const dependencyIds = planned.dependencyIdentities.map((identity) => {
            const dependencyId = taskIdByIdentity.get(identity);
            if (dependencyId === undefined) {
              throw new Error(
                `internal: dependency ${JSON.stringify(identity)} was not materialised before ${JSON.stringify(planned.identity)}`,
              );
            }
            return dependencyId;
          });
          const created = backlog.createTask(authoringRoot, {
            title: planned.title,
            acceptanceCriteria: planned.acceptanceCriteria,
            ...(dependencyIds.length > 0 ? { dependencies: dependencyIds } : {}),
            ...(planned.labels.length > 0 ? { labels: planned.labels } : {}),
          });
          taskIdByIdentity.set(planned.identity, created.id);
        },
        planned.title,
        "MATERIALISE",
      ),
    );
  }
  actions.push(
    initAction(
      "authoring-task-plan:verify",
      authoringRoot,
      "verify the exact complete authoring task plan before handoff preparation",
      () => assertExactMaterialisedTaskPlan(backlog, authoringRoot, taskPlan, taskIdByIdentity),
      undefined,
      "MATERIALISE",
      false,
    ),
  );
  if (!handoffReceiptAlreadyPreparing) {
    actions.push(
      initAction(
        "handoff-receipt:preparing",
        handoffReceiptPath,
        "publish exact whole-init handoff preparation evidence",
        () => fs.write(handoffReceiptPath, preparingHandoffText),
        undefined,
        "MATERIALISE",
      ),
    );
  }
  if (retryStage !== "finalizing") {
    actions.push(
      initAction(
        "managed-state:complete",
        managedStatePath,
        "publish the complete workspace-authoring handshake",
        () => fs.write(managedStatePath, authoringPlan.completeStateText),
        undefined,
        "MATERIALISE",
      ),
    );
  }
  actions.push(
    initAction(
      "handoff-receipt:prepared",
      handoffReceiptPath,
      "publish the prepared fresh-agent handoff receipt",
      () => fs.write(handoffReceiptPath, preparedHandoffText),
      undefined,
      "MATERIALISE",
    ),
  );

  const executed = executeInitPlan(actions);
  const integrationPaths = new Set([
    toPosix(managedStatePath),
    ...authoringPlan.files.map(({ path }) => toPosix(join(targetDir, path))),
  ]);
  const integrationChangedPaths = executed.changedPaths.filter((path) =>
    integrationPaths.has(path),
  );
  const authoringIntegration: WorkspaceAuthoringIntegrationResult = {
    summary: `workspace authoring integration applied for ${authoringPlan.clients.join(", ")}`,
    selectedClients: authoringPlan.clients,
    integrationVersion: authoringPlan.integrationVersion,
    origin: "created",
    statePath: WORKSPACE_INTEGRATION_STATE_PATH,
    changedPaths: integrationChangedPaths,
    handoffPrepared: false,
  };
  const handoffChangedPaths = executed.changedPaths.filter(
    (path) => path === toPosix(handoffReceiptPath),
  );
  const handoff: PreparedWorkspaceHandoffResult = {
    status: "prepared",
    summary: `prepared fresh-agent handoff at ${toPosix(targetDir)} for ${preparedHandoffReceipt.configuredClients.join(", ")}`,
    handoffPrepared: true,
    workspaceRoot: preparedHandoffReceipt.workspaceRoot,
    receiptPath: WORKSPACE_HANDOFF_RECEIPT_PATH,
    configuredClients: preparedHandoffReceipt.configuredClients,
    clients: preparedHandoffReceipt.clients,
    changedPaths: handoffChangedPaths,
    materialisedTaskTitles: [],
  };

  return {
    summary: `created authoring workspace ${name} at ${targetDir} (deliverable under ${DELIVERABLE_DIR}/)`,
    changedPaths: executed.changedPaths,
    materialisedTaskTitles: executed.materialisedTaskTitles,
    authoringIntegration,
    handoff,
    handoffPrepared: true,
  };
}
