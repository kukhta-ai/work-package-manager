import { join } from "node:path";
import { toPosix } from "../../util/posix-path.js";
import { parseYaml } from "../../util/yaml.js";
import { ConflictError, NotFoundError } from "../errors.js";
import {
  AUTHORING_BACKLOG_DIR,
  AUTHORING_TASK_PREFIX,
  type AuthoringTaskSpec,
  type BundleManifest,
  type OperationResult,
  type Project,
} from "../model/index.js";
import type { BacklogMd, FileSystem } from "../ports/index.js";
import { materialiseAuthoringTasks } from "../services/materialisation.js";
import { renderTree } from "../services/render.js";
import { parseBundleManifest, parseManifest } from "../services/schema/index.js";
import { resolveTemplate } from "../services/template-resolver.js";
import { perBundleAuthoringTasks } from "./create-bundle.js";
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
 * the task-16 render service, the task-19/26 derived-artefacts deriver, and the task-21 materialiser, importing
 * only those + the model + `node:path` — never `node:fs`/`commander`/`omelette`. Failures are raised as typed
 * task-23 `DomainError`s.
 *
 * This is the COMPLETE `init` (task-34), extending the task-33 walking-skeleton slice. It performs all 12 steps of
 * doc-10:137's `init` row: resolve the chosen project template (default `minimal`); refuse if the target path
 * already exists; copy the template `files/` with `{{placeholder}}` substitution; materialise the default bundle
 * template at `bundles/bundle-template/`; create the empty `installer-skills/`, `templates/`, and
 * `.authoring-backlog/` (a Backlog.md root, `task_prefix=authoring`); create one scope-alias per declared target;
 * render the derived `AGENTS.md` + `<project>-installer/SKILL.md`; materialise the project-wide authoring task set
 * (doc 11) plus a per-bundle set for every bundle the template pre-includes; record `.authoring-backlog/` in
 * `.gitignore`; and return a summary with the count of materialised tasks.
 */

/** The default project template `init` instantiates when `--template` is not given (doc 10: `init`'s default). */
const DEFAULT_PROJECT_TEMPLATE = "minimal";
/** The default bundle template whose tree is materialised at `bundles/bundle-template/` (doc 10:137 step 5). */
const DEFAULT_BUNDLE_TEMPLATE = "default";
/** The project's default bundle scaffold directory, under `bundles/` (doc 10:150 step 2; `bundle template`). */
const BUNDLE_TEMPLATE_DIR = "bundle-template";
/**
 * The hidden authoring-backlog root + its task-prefix (doc 10 step 6; doc 11) come from the shared model
 * constants ({@link AUTHORING_BACKLOG_DIR}, {@link AUTHORING_TASK_PREFIX}) so `init` (which creates the root)
 * and the task-25 lifecycle (which materialises into it) can never disagree about where it lives — the
 * root-mismatch bug that broke every materialising command.
 */

/** The input to {@link initProject}: where to create the project, its name, the chosen template, and extra params. */
export interface InitProjectInput {
  /** The directory that becomes the project root (the CLI resolves it from `--at`/cwd; doc 10). */
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
}

/** The dependencies {@link initProject} needs: the two ports + the built-in templates root. */
export interface InitProjectDeps {
  /** The filesystem port (real `NodeFileSystem` in production). */
  readonly fs: FileSystem;
  /** The Backlog.md port — used to initialise + materialise into the `.authoring-backlog/` root (doc 13 §3). */
  readonly backlog: BacklogMd;
  /** The built-in templates root shipped with the package. */
  readonly builtinTemplatesRoot: string;
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
export function projectWideAuthoringTasks(): AuthoringTaskSpec[] {
  return [
    {
      title: "Set project metadata",
      acceptanceCriteria: [
        "manifest.yml.project has description, license (and ideally repository, author) set via `wpm project meta`",
      ],
    },
    {
      title: "Confirm target agents",
      acceptanceCriteria: [
        "manifest.yml.targets has at least one entry, added via `wpm project targets add`",
      ],
    },
    {
      title: "Verify manifest coherence",
      acceptanceCriteria: [
        "`wpm project validate` exits clean (deps resolve, targets non-empty, valid semver, no orphan bundle dirs)",
      ],
    },
    {
      title: "Verify scope-alias symlinks",
      acceptanceCriteria: [
        "each scope-alias under the project root corresponds to a target agent in manifest.yml.targets and points at installer-skills/; no bare skills/ aliases exist",
      ],
    },
    {
      title: "Verify AGENTS.md and main installer skill are current",
      acceptanceCriteria: [
        "AGENTS.md and the <project>-installer/SKILL.md reflect the current manifest.yml and each enabled bundle.yml",
      ],
    },
    {
      title: "Verify helpers and advisors registered",
      acceptanceCriteria: [
        "every SKILL.md under installer-skills/ at root scope corresponds to a registered helper or advisor",
      ],
    },
    {
      title: "Bump project release version",
      acceptanceCriteria: [
        "manifest.yml.project.version has been advanced since the previous release tag (or set explicitly for the first release)",
      ],
    },
    {
      title: "Build dry-run",
      acceptanceCriteria: ["`wpm build dry-run` exits clean"],
    },
  ];
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
function buildProjection(fs: FileSystem, targetDir: string): Project {
  const manifestResult = parseManifest(parseYaml(fs.read(join(targetDir, "manifest.yml"))));
  if (!manifestResult.ok) {
    throw new NotFoundError(
      `internal: rendered manifest.yml is invalid: ${manifestResult.problem.message}`,
    );
  }
  const manifest = manifestResult.value;

  const bundles = new Map<(typeof manifest.bundles)[number], BundleManifest>();
  for (const id of manifest.bundles) {
    const bundleResult = parseBundleManifest(
      parseYaml(fs.read(join(targetDir, "bundles", id, "bundle.yml"))),
    );
    if (!bundleResult.ok) {
      throw new NotFoundError(
        `internal: pre-included bundle '${id}' has an invalid bundle.yml: ${bundleResult.problem.message}`,
      );
    }
    bundles.set(id, bundleResult.value);
  }

  return { rootPath: targetDir, manifest, bundles };
}

/**
 * Create a new project at `input.targetDir` from the chosen built-in project template (default `minimal`).
 *
 * Steps (doc 10 §"Per-command actions" `init` row, lines 137 / all 12):
 * 1. Resolve the chosen project template (→ {@link NotFoundError} if it is missing).
 * 2. Refuse if the target path already exists (→ {@link ConflictError}), creating nothing.
 * 3. Copy the template's `files/` into the target, substituting `{{project-name}}` + any `--param` pairs.
 * 4. (manifest) The template's `manifest.yml` snippet is part of `files/`, so it is instantiated by step 3.
 * 5. Materialise the default bundle template at `bundles/bundle-template/` (its `files/` tree, verbatim).
 * 6. Create the empty `installer-skills/` + `templates/` dirs and the `.authoring-backlog/` Backlog.md root.
 * 7. Create one scope-alias per declared target (none for `minimal`), via the deriver's alias plan.
 * 8. Render the front-door `AGENTS.md` and the `<name>-installer/SKILL.md` orchestrator and write them.
 * 9. Materialise the project-wide authoring task set (doc 11).
 * 10. For each bundle the template pre-includes, materialise its per-bundle authoring set (idempotent by title).
 * 11. Record `.authoring-backlog/` in `.gitignore`.
 * 12. Return a summary naming the path and the number of materialised tasks.
 *
 * @param deps - The filesystem + backlog ports and the built-in templates root.
 * @param input - The target directory, the project name, the chosen template, and extra `--param` substitutions.
 * @returns The {@link OperationResult}: a summary, the changed paths, and the materialised authoring-task titles.
 * @throws {NotFoundError} If the chosen project (or default bundle) template cannot be resolved.
 * @throws {ConflictError} If the target directory already exists.
 */
export function initProject(deps: InitProjectDeps, input: InitProjectInput): OperationResult {
  const { fs, backlog, builtinTemplatesRoot } = deps;
  const { targetDir, name } = input;
  const templateName = input.templateName ?? DEFAULT_PROJECT_TEMPLATE;

  // 1. Resolve the chosen project template (project-local would shadow built-in, but init has no project yet).
  const resolution = resolveTemplate(templateName, "project", { fs, builtinTemplatesRoot });
  if (!resolution.found) {
    throw new NotFoundError(
      `project template "${templateName}" not found (searched: ${resolution.searched.join(", ")})`,
    );
  }

  // 2. Refuse if the target path already exists (AC#5) — creating NOTHING. The skeleton refused only on a
  // manifest.yml; the contract is to refuse when the target PATH exists, so the check is broadened to that.
  if (fs.exists(targetDir)) {
    throw new ConflictError(
      `cannot create a project at "${targetDir}": the path already exists — pick a target that does not exist`,
    );
  }

  const changedPaths: string[] = [];

  // 3. Copy the template files/ into the target, substituting {{project-name}} + any --param pairs.
  const params = new Map<string, string>([["project-name", name]]);
  for (const [key, value] of input.params ?? []) {
    params.set(key, value);
  }
  for (const file of renderTree(resolution.template.files, params)) {
    const abs = join(targetDir, file.path);
    fs.write(abs, file.content);
    changedPaths.push(abs);
  }

  // 5. Materialise the default bundle template at bundles/bundle-template/ (doc 10:137 step 5). Copy the default
  // bundle template's files/ tree VERBATIM (no substitution — the scaffold keeps its placeholders for `bundle
  // new` to fill). This is the live default `bundle new` clones (closing the create-bundle divergence).
  const bundleTemplate = resolveTemplate(DEFAULT_BUNDLE_TEMPLATE, "bundle", {
    fs,
    builtinTemplatesRoot,
  });
  if (!bundleTemplate.found) {
    throw new NotFoundError(
      `bundle template "${DEFAULT_BUNDLE_TEMPLATE}" not found (searched: ${bundleTemplate.searched.join(", ")})`,
    );
  }
  const bundleTemplateDir = join(targetDir, "bundles", BUNDLE_TEMPLATE_DIR);
  for (const file of bundleTemplate.template.files) {
    const abs = join(bundleTemplateDir, file.path);
    fs.write(abs, file.content);
    changedPaths.push(abs);
  }
  changedPaths.push(join(targetDir, "bundles"));

  // 6. Create the empty installer-skills/ + templates/ dirs (the manifest's empty registries; the
  // .authoring-backlog/ root is created in step 9). makeDirectories is a no-op if a file already placed them.
  fs.makeDirectories(join(targetDir, "installer-skills"));
  fs.makeDirectories(join(targetDir, "templates"));
  changedPaths.push(join(targetDir, "installer-skills"), join(targetDir, "templates"));

  // 7 + 8. Build the project projection, then derive the front-door + orchestrator (step 8 / AC#2) AND the scope
  // aliases (step 7 / AC#3) from ONE deriver call — keeping the derived artefacts byte-identical to every later
  // mutation (the single-source discipline) and the alias creation identical to the lifecycle's RERENDER.
  const projection = buildProjection(fs, targetDir);
  const deriveArtefacts = makeArtefactDeriver({
    fs,
    builtinTemplatesRoot,
    projectTemplatesRoot: join(targetDir, "templates"),
    projectTemplateName: templateName,
  });
  const desired = deriveArtefacts(projection);
  for (const file of desired.files) {
    const abs = join(targetDir, file.path);
    fs.write(abs, file.content);
    if (!changedPaths.includes(abs)) {
      changedPaths.push(abs);
    }
  }
  for (const alias of desired.aliasPlan.aliases) {
    fs.ensureAlias(join(targetDir, alias.aliasTo), join(targetDir, alias.linkPath));
    changedPaths.push(join(targetDir, alias.linkPath));
  }

  // 9. Initialise the .authoring-backlog/ Backlog.md root (task_prefix=authoring). The directory must exist
  // before the backlog is initialised in it (the real adapter shells out to `backlog init` with the root as
  // cwd), so create it through the FileSystem port first.
  const authoringRoot = join(targetDir, AUTHORING_BACKLOG_DIR);
  fs.makeDirectories(authoringRoot);
  backlog.init(authoringRoot, { taskPrefix: AUTHORING_TASK_PREFIX });
  changedPaths.push(authoringRoot);

  // 9 + 10. Materialise the project-wide authoring task set (doc 11) plus, for every bundle the template
  // pre-includes (projection.manifest.bundles — empty for `minimal`), its per-bundle set. The task-21
  // materialiser is title-idempotent (the same engine the six-beat ⑤ uses), so an overlapping title is created
  // once and a re-run would create nothing.
  const specs: AuthoringTaskSpec[] = [...projectWideAuthoringTasks()];
  for (const id of projection.manifest.bundles) {
    specs.push(...perBundleAuthoringTasks(id, { advisor: true }));
  }
  const materialised = materialiseAuthoringTasks(backlog, authoringRoot, specs);
  const materialisedTitles = materialised.created.map((task) => task.title);

  // 11. Record .authoring-backlog/ in .gitignore (AC#7). Append the entry if a template-shipped .gitignore exists
  // (minimal ships none); otherwise create it. Idempotent: a .gitignore that already ignores the dir is left
  // alone, so the entry can never be duplicated.
  const gitignorePath = join(targetDir, ".gitignore");
  const ignoreLine = `${AUTHORING_BACKLOG_DIR}/`;
  const existing = fs.exists(gitignorePath) ? fs.read(gitignorePath) : undefined;
  if (existing === undefined) {
    fs.write(gitignorePath, `${ignoreLine}\n`);
    changedPaths.push(gitignorePath);
  } else if (!existing.split("\n").some((l) => l.trim() === ignoreLine)) {
    const sep = existing.endsWith("\n") || existing === "" ? "" : "\n";
    fs.write(gitignorePath, `${existing}${sep}${ignoreLine}\n`);
    if (!changedPaths.includes(gitignorePath)) {
      changedPaths.push(gitignorePath);
    }
  }

  // 12. Return the structured result; the command layer formats the summary (incl. the `materialised: N` line).
  // `changedPaths` is a LOGICAL observability list (the command prints its count; tests compare its entries as
  // portable strings). The real fs writes/aliases above already used the OS-native absolute paths; here we only
  // RECORD them, so each is POSIX-normalized to read with `/` on every OS (a no-op on Linux/macOS). This matches
  // how the six-beat lifecycle normalizes its own `changedPaths`.
  return {
    summary: `created project ${name} at ${targetDir}`,
    changedPaths: changedPaths.map(toPosix),
    materialisedTaskTitles: materialisedTitles,
  };
}
