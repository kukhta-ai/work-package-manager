import { join } from "node:path";
import { ConflictError, NotFoundError } from "../errors.js";
import {
  AUTHORING_BACKLOG_DIR,
  AUTHORING_TASK_PREFIX,
  type OperationResult,
  type Project,
  parseSemVer,
} from "../model/index.js";
import type { BacklogMd, FileSystem } from "../ports/index.js";
import { renderTree } from "../services/render.js";
import { resolveTemplate } from "../services/template-resolver.js";
import { makeArtefactDeriver } from "./derive-artefacts-capability.js";

/**
 * `initProject` — the `wpm init` use case (doc 10 §"Per-command actions", the `init` row), and the architecture's
 * **bootstrap** operation. Unlike every other operation, init does NOT run the task-25 `runMutation` six-beat
 * lifecycle and does NOT call `resolveContext`: those LOAD an existing project, and context resolution runs
 * "before any project-**bound** operation" (doc 13 §7), but `init` is **project-creating** (doc 10 line 17) —
 * there is no project to load, it builds one from a template. So this is its own small operation that composes
 * the same services + ports and returns the same {@link OperationResult}.
 *
 * It is **pure over the FileSystem + BacklogMd ports** (doc 13 §1): it composes the task-17 template-resolver,
 * the task-16 render service, and the task-19/26 derived-artefacts deriver, importing only those + the model +
 * `node:path` — never `node:fs`/`commander`/`omelette`. Failures are raised as typed task-23 `DomainError`s.
 *
 * **This is the WALKING SKELETON's slice (task-33): the SMALLEST meaningful `init`** — doc-10 init steps 1–4 + 8
 * (resolve the `minimal` template, refuse if the target is already a project, copy `files/` with substitution,
 * render the derived front-door + orchestrator from the template `snippets/`), plus a `.authoring-backlog/`
 * Backlog.md root so the slice exercises BOTH ports. The fuller init steps (5–7, 9–12: `bundles/` scaffold,
 * scope aliases, authoring-task materialisation, `.gitignore`, alternate templates) belong to the COMPLETE
 * `init` command — a later task. The point of the skeleton is to drive a real change through every layer.
 */

/** The project template this slice instantiates (doc 10: `init`'s default template). */
const PROJECT_TEMPLATE = "minimal";
/** The marker file that makes a directory a project root (doc 13 §7 `PROJECT_MARKER`); its presence = "exists". */
const PROJECT_MARKER = "manifest.yml";
/**
 * The hidden authoring-backlog root + its task-prefix (doc 10 step 6; doc 11) come from the shared model
 * constants ({@link AUTHORING_BACKLOG_DIR}, {@link AUTHORING_TASK_PREFIX}) so `init` (which creates the root)
 * and the task-25 lifecycle (which materialises into it) can never disagree about where it lives — the
 * root-mismatch bug that broke every materialising command.
 */
/** A nominal version for the in-memory projection the deriver renders against (the deriver reads only name + bundles). */
const PROJECTION_VERSION = "0.1.0";

/** The input to {@link initProject}: where to create the project, and its name. */
export interface InitProjectInput {
  /** The directory that becomes the project root (the CLI resolves it from `--at`/cwd; doc 10). */
  readonly targetDir: string;
  /** The project name (kebab-case); written into the manifest and the installer-skill name. */
  readonly name: string;
}

/** The dependencies {@link initProject} needs: the two ports + the built-in templates root. */
export interface InitProjectDeps {
  /** The filesystem port (real `NodeFileSystem` in production). */
  readonly fs: FileSystem;
  /** The Backlog.md port — used to initialise the empty `.authoring-backlog/` root (doc 13 §3). */
  readonly backlog: BacklogMd;
  /** The built-in templates root shipped with the package. */
  readonly builtinTemplatesRoot: string;
}

/**
 * Create a new project at `input.targetDir` from the built-in `minimal` template (the walking-skeleton slice).
 *
 * Steps (doc 10 `init` row, the minimal subset):
 * 1. Resolve the `minimal` project template (→ {@link NotFoundError} if it is missing).
 * 2. Refuse if the target is already a project — a `manifest.yml` exists there (→ {@link ConflictError}).
 * 3. Copy the template's `files/` into the target, substituting `{{project-name}}` (task-16 `renderTree`) — the
 *    manifest, README, loop instructions, and the orchestrator's static `references/journaling.md`.
 * 4. Render the front-door `AGENTS.md` and the `<name>-installer/SKILL.md` orchestrator from the template's
 *    `snippets/` (the SINGLE SOURCE for the two derived artefacts) via the task-26 deriver, and write them.
 * 5. Initialise the empty `.authoring-backlog/` Backlog.md root (`task_prefix=authoring`) through the BacklogMd
 *    port — so the slice threads both ports.
 *
 * @param deps - The filesystem + backlog ports and the built-in templates root.
 * @param input - The target directory and the project name.
 * @returns The {@link OperationResult}: a summary, the changed paths, and an empty materialised-task list (this
 *   slice materialises no authoring tasks — that is the full `init`).
 * @throws {NotFoundError} If the `minimal` template cannot be resolved.
 * @throws {ConflictError} If the target directory already contains a `manifest.yml`.
 */
export function initProject(deps: InitProjectDeps, input: InitProjectInput): OperationResult {
  const { fs, backlog, builtinTemplatesRoot } = deps;
  const { targetDir, name } = input;

  // 1. Resolve the minimal project template (built-in).
  const resolution = resolveTemplate(PROJECT_TEMPLATE, "project", { fs, builtinTemplatesRoot });
  if (!resolution.found) {
    throw new NotFoundError(
      `project template "${PROJECT_TEMPLATE}" not found (searched: ${resolution.searched.join(", ")})`,
    );
  }

  // 2. Refuse if the target is already a project (a manifest.yml is present).
  if (fs.exists(join(targetDir, PROJECT_MARKER))) {
    throw new ConflictError(
      `a project already exists at "${targetDir}" (found ${PROJECT_MARKER}) — pick an empty target`,
    );
  }

  const changedPaths: string[] = [];

  // 3. Copy the template files/ into the target, substituting {{project-name}}.
  const params = new Map<string, string>([["project-name", name]]);
  for (const file of renderTree(resolution.template.files, params)) {
    const abs = join(targetDir, file.path);
    fs.write(abs, file.content);
    changedPaths.push(abs);
  }

  // 4. Render the derived front-door + orchestrator from the template snippets (the single source) and write.
  const semver = parseSemVer(PROJECTION_VERSION);
  if (!semver.ok) {
    // PROJECTION_VERSION is a constant valid semver; this is unreachable, but keeps the value un-cast.
    throw new NotFoundError(`internal: invalid projection version "${PROJECTION_VERSION}"`);
  }
  const projection: Project = {
    rootPath: targetDir,
    manifest: { meta: { name, version: semver.value }, targets: [], bundles: [] },
    bundles: new Map(),
  };
  const deriveArtefacts = makeArtefactDeriver({
    fs,
    builtinTemplatesRoot,
    projectTemplatesRoot: join(targetDir, "templates"),
    projectTemplateName: PROJECT_TEMPLATE,
  });
  for (const file of deriveArtefacts(projection).files) {
    const abs = join(targetDir, file.path);
    fs.write(abs, file.content);
    if (!changedPaths.includes(abs)) {
      changedPaths.push(abs);
    }
  }

  // 5. Initialise the empty .authoring-backlog/ Backlog.md root (exercise the BacklogMd port). The directory
  // must exist before the backlog is initialised in it (the real adapter shells out to `backlog init` with the
  // root as cwd), so create it through the FileSystem port first.
  const authoringRoot = join(targetDir, AUTHORING_BACKLOG_DIR);
  fs.makeDirectories(authoringRoot);
  backlog.init(authoringRoot, { taskPrefix: AUTHORING_TASK_PREFIX });
  changedPaths.push(authoringRoot);

  return {
    summary: `created project ${name} at ${targetDir}`,
    changedPaths,
    materialisedTaskTitles: [],
  };
}
