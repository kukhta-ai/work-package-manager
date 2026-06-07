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
  type TemplateFile,
} from "../model/index.js";
import type { BacklogMd, FileSystem } from "../ports/index.js";
import { EXECUTOR_FRONT_DOOR_PATH } from "../services/derived-artefacts.js";
import { materialiseAuthoringTasks } from "../services/materialisation.js";
import { renderSnippet, renderTree } from "../services/render.js";
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
 * The canonical name of the workspace-root **authoring front door** (docs 04, 12) and its symlink alias.
 * The authoring front door addresses the *authoring* agent (AC#4); it ships nothing and is distinct from the
 * deliverable's executor front door.
 */
const AUTHORING_FRONT_DOOR = "AGENTS.md";
/** The symlink alias for the authoring front door (Claude Code reads `CLAUDE.md`; doc 12). */
const AUTHORING_FRONT_DOOR_ALIAS = "CLAUDE.md";
/**
 * The project-template snippet the authoring front door is rendered from (doc 10/12: front-door content is
 * builder-provided template content, mechanically substituted — never prose invented in the pure core). The
 * snippet path is matched tolerating a trailing `.tmpl` (the repo's template-content convention).
 */
const AUTHORING_FRONT_DOOR_SNIPPET = "authoring-front-door.md";
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
 * Select the **authoring front-door** snippet from a resolved project template's `snippets/` tree (doc 12: the
 * workspace-root front door that flips an agent into authoring mode). Matched by its conventional path,
 * tolerating a trailing `.tmpl`. A missing snippet is a template-authoring bug → a thrown {@link NotFoundError}.
 * Keeping the front-door PROSE in the template (not the core) is what keeps `init` pure (doc 13 §1): the core
 * only selects and substitutes, it never authors content.
 *
 * @param template - The resolved project template.
 * @returns The authoring front-door snippet (its `{{project-name}}` placeholder is substituted by the caller).
 * @throws {NotFoundError} If the template ships no authoring front-door snippet.
 */
function selectAuthoringFrontDoorSnippet(template: {
  snippets: readonly TemplateFile[];
}): TemplateFile {
  const snippet = template.snippets.find(
    (s) =>
      s.path === AUTHORING_FRONT_DOOR_SNIPPET || s.path === `${AUTHORING_FRONT_DOOR_SNIPPET}.tmpl`,
  );
  if (snippet === undefined) {
    throw new NotFoundError(
      `project template is missing the authoring front-door snippet ("${AUTHORING_FRONT_DOOR_SNIPPET}")`,
    );
  }
  return snippet;
}

/**
 * Create a new **authoring workspace** at `input.targetDir` from the chosen built-in project template (default
 * `minimal`). The shipped bundle-project skeleton nests under the deliverable subdirectory `wip/`.
 *
 * Steps (doc 10 §"Per-command actions" `init` row; docs 06/12 for the workspace layout):
 * 1. Resolve the chosen project template (→ {@link NotFoundError} if it is missing).
 * 2. Refuse if the target path already exists (→ {@link ConflictError}), creating nothing.
 * 3. Render the template's `files/` into the deliverable subdir `wip/`, substituting `{{project-name}}` + `--param`.
 * 4. (manifest) The template's `manifest.yml` snippet is part of `files/`, so it is instantiated by step 3.
 * 5. Materialise the default bundle template at `wip/bundles/bundle-template/` (its `files/` tree, verbatim).
 * 6. Create the empty `wip/installer-skills/` + `wip/templates/` dirs, the `.authoring-backlog/` Backlog.md root
 *    (at the workspace root), and the empty `builds/` build-output directory.
 * 7. Create one scope-alias per declared target (none for `minimal`) under `wip/`, via the deriver's alias plan.
 * 8. Render the `<name>-installer/SKILL.md` orchestrator under `wip/`, and the author-owned executor front door
 *    to `wip/_AGENTS.md` (the reserved build-stripped prefix — written once, not re-derived later).
 * 9. Render the **authoring** front door + its `CLAUDE.md` alias at the workspace root from a template snippet.
 * 10. Materialise the project-wide authoring task set (doc 11) into the workspace-root authoring backlog, plus a
 *     per-bundle set for every bundle the template pre-includes (idempotent by title).
 * 11. Record `.authoring-backlog/` and `builds/` in the workspace `.gitignore`.
 * 12. Return a summary naming the workspace path and the number of materialised tasks.
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

  // The deliverable subdir: everything the shipped skeleton needs nests under `<workspace>/wip` (docs 06/12).
  const wip = join(targetDir, DELIVERABLE_DIR);

  // 3. Render the template files/ into the DELIVERABLE subdir (`wip/`), substituting {{project-name}} + --param.
  const params = new Map<string, string>([["project-name", name]]);
  for (const [key, value] of input.params ?? []) {
    params.set(key, value);
  }
  for (const file of renderTree(resolution.template.files, params)) {
    const abs = join(wip, file.path);
    fs.write(abs, file.content);
    changedPaths.push(abs);
  }

  // 5. Materialise the default bundle template at wip/bundles/bundle-template/ (doc 10 step 5). Copy the default
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
  const bundleTemplateDir = join(wip, "bundles", BUNDLE_TEMPLATE_DIR);
  for (const file of bundleTemplate.template.files) {
    const abs = join(bundleTemplateDir, file.path);
    fs.write(abs, file.content);
    changedPaths.push(abs);
  }
  changedPaths.push(join(wip, "bundles"));

  // 6. Create the empty installer-skills/ + templates/ dirs under wip/ (the manifest's empty registries; the
  // .authoring-backlog/ root is created in step 10). makeDirectories is a no-op if a file already placed them.
  fs.makeDirectories(join(wip, "installer-skills"));
  fs.makeDirectories(join(wip, "templates"));
  changedPaths.push(join(wip, "installer-skills"), join(wip, "templates"));

  // 6. Create the empty build-output directory `builds/` at the workspace root (AC#2; docs 06/12). It stays
  // empty until `wpm build` writes archives into it — isolated from both the authoring surface and `wip/`.
  const buildsDir = join(targetDir, BUILDS_DIR);
  fs.makeDirectories(buildsDir);
  changedPaths.push(buildsDir);

  // 7 + 8. Build the project projection FROM `wip/` (its rendered manifest.yml lives there), then derive the
  // orchestrator + executor front door (step 8) AND the scope aliases (step 7) from ONE deriver call — keeping
  // the derived skill byte-identical to every later mutation (the single-source discipline). The deriver still
  // yields the executor front door at the canonical path `AGENTS.md`; init RELOCATES it to the reserved
  // `wip/_AGENTS.md` (author-owned, build-stripped; AC#8) so an authoring agent never reads it as a directive
  // (doc 12). Every other derived file (the orchestrator skill) is written under `wip/` as-is.
  const projection = buildProjection(fs, wip);
  const deriveArtefacts = makeArtefactDeriver({
    fs,
    builtinTemplatesRoot,
    projectTemplatesRoot: join(wip, "templates"),
    projectTemplateName: templateName,
  });
  const desired = deriveArtefacts(projection);
  for (const file of desired.files) {
    const abs =
      file.path === DERIVED_EXECUTOR_FRONT_DOOR_PATH
        ? join(wip, EXECUTOR_FRONT_DOOR)
        : join(wip, file.path);
    fs.write(abs, file.content);
    if (!changedPaths.includes(abs)) {
      changedPaths.push(abs);
    }
  }
  for (const alias of desired.aliasPlan.aliases) {
    fs.ensureAlias(join(wip, alias.aliasTo), join(wip, alias.linkPath));
    changedPaths.push(join(wip, alias.linkPath));
  }

  // 9. Render the AUTHORING front door (+ a CLAUDE.md symlink alias) at the WORKSPACE ROOT from the template's
  // authoring front-door snippet (AC#1/#4). Distinct from the deliverable's executor front door: it addresses
  // the AUTHORING agent (author the deliverable under wip/, not install it). Content is builder-provided
  // template prose substituted with {{project-name}} — the core authors nothing (doc 13 §1).
  const authoringFrontDoor = renderSnippet(
    selectAuthoringFrontDoorSnippet(resolution.template),
    params,
  );
  const authoringFrontDoorPath = join(targetDir, AUTHORING_FRONT_DOOR);
  fs.write(authoringFrontDoorPath, authoringFrontDoor.content);
  changedPaths.push(authoringFrontDoorPath);
  const authoringAliasPath = join(targetDir, AUTHORING_FRONT_DOOR_ALIAS);
  fs.ensureAlias(authoringFrontDoorPath, authoringAliasPath);
  changedPaths.push(authoringAliasPath);

  // 10. Initialise the .authoring-backlog/ Backlog.md root (task_prefix=authoring) at the WORKSPACE ROOT — it is
  // the authoring surface, never part of the deliverable, so it stays beside the authoring front door, not under
  // wip/ (docs 06/11). The directory must exist
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

  // 11. Record the builder-time regions in the workspace .gitignore (AC#3): both the authoring backlog AND the
  // build-output directory `builds/` — neither is part of what the deliverable ships (docs 06/12). Append any
  // missing entry to a template-shipped .gitignore (minimal ships none) or create it. Idempotent per line: a
  // .gitignore that already ignores an entry is left alone, so no entry can ever be duplicated.
  const gitignorePath = join(targetDir, ".gitignore");
  const ignoreLines = [`${AUTHORING_BACKLOG_DIR}/`, `${BUILDS_DIR}/`];
  let gitignore = fs.exists(gitignorePath) ? fs.read(gitignorePath) : undefined;
  for (const ignoreLine of ignoreLines) {
    if (gitignore === undefined) {
      gitignore = `${ignoreLine}\n`;
    } else if (!gitignore.split("\n").some((l) => l.trim() === ignoreLine)) {
      const sep = gitignore.endsWith("\n") || gitignore === "" ? "" : "\n";
      gitignore = `${gitignore}${sep}${ignoreLine}\n`;
    }
  }
  if (gitignore !== undefined) {
    fs.write(gitignorePath, gitignore);
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
    summary: `created authoring workspace ${name} at ${targetDir} (deliverable under ${DELIVERABLE_DIR}/)`,
    changedPaths: changedPaths.map(toPosix),
    materialisedTaskTitles: materialisedTitles,
  };
}
