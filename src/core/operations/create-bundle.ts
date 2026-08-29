import { join } from "node:path";
import { editYaml, stringifyYaml } from "../../util/yaml.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import {
  type AuthoringTaskSpec,
  type BundleManifest,
  type MandatoryAuthoringTask,
  parseBundleId,
  parseSemVer,
  type TemplateFile,
} from "../model/index.js";
import type { FileSystem } from "../ports/index.js";
import { renderTree } from "../services/render.js";
import { serializeBundleManifest } from "../services/schema/index.js";
import { resolveTemplate } from "../services/template-resolver.js";
import { advisorContentTaskTitle, scaffoldAdvisor } from "./advisor.js";
import type { ApplyContext, OperationSpec } from "./lifecycle.js";

/**
 * `createBundle` — the `bundle new` use case (doc 10 row `bundle new <id>`), built as an {@link OperationSpec}
 * to run through the task-25 lifecycle harness. doc 13 §5 names it as THE example of an operation: it supplies
 * ② CHECK (validate the id), ③ APPLY (scaffold `bundles/<id>/` from a template + append `<id>` to the
 * manifest), and a ⑤ MATERIALISE plan (the per-bundle authoring tasks + the advisor task, doc 11 §3); ④ RERENDER
 * "falls out of the changed Project for free" — the harness re-derives the front-door (whose bundle menu now
 * lists `<id>`) and the per-bundle scope aliases around this operation, so `createBundle` never arranges them.
 *
 * It is **pure over the ports** (doc 13 §1): it composes the task-17 template-resolver, the task-16 render
 * service, the task-13 yaml leaf, the task-10 model/parsers, and the FileSystem port — importing only those +
 * `node:path`, never `node:fs`/`commander`/`execa`. Failures are raised as typed task-23 `DomainError`s; the
 * harness/command layer reports them.
 *
 * This is the composition proof (task-26): one real mutating operation observable end-to-end with no CLI, ahead
 * of the per-command wiring (tasks 34+).
 */

/** The default bundle template name (doc 10 §Templates: bundle templates include `default`). */
const DEFAULT_BUNDLE_TEMPLATE = "default";
/** The project's default bundle scaffold directory under `bundles/` (doc 10:150 step 2; `bundle template set`). */
const BUNDLE_TEMPLATE_DIR = "bundle-template";
/** The default new-bundle version (doc 10 row `bundle new`: `--version` defaults to `0.1.0`). */
const DEFAULT_VERSION = "0.1.0";
/** A bundle's recipe directory (doc 06): the shipped, versioned install-backlog the executor works. */
const INSTALL_BACKLOG_DIR = "install-backlog";
/**
 * The per-bundle alias name the Backlog.md CLI resolves a project by (TASK-102). The CLI walks up from cwd for a
 * directory **named `backlog/`**; a bundle keeps its recipe under `install-backlog/`, so a relative
 * `backlog → install-backlog` link makes `cd bundles/<id> && backlog …` operate on the recipe — at authoring
 * time and from the extracted archive (doc 06). The link is RELATIVE for archive portability.
 */
const BACKLOG_ALIAS_DIR = "backlog";

/**
 * Create the per-bundle `backlog → install-backlog` alias so the Backlog.md CLI resolves a bundle's recipe from
 * within the bundle (TASK-102; doc 06). Unconditional — every bundle ships an install-backlog, so every bundle
 * ships this link. The target is the **relative** string `install-backlog` (not an absolute path) so the link
 * survives extraction to any path. Pure over the FileSystem port (the symlink/copy mechanism is the adapter's).
 *
 * @param fs - The filesystem port.
 * @param bundleDir - The absolute bundle directory (`<root>/bundles/<id>`).
 * @returns The absolute link path created (for `changedPaths`).
 */
export function ensureBundleBacklogAlias(fs: FileSystem, bundleDir: string): string {
  const linkPath = join(bundleDir, BACKLOG_ALIAS_DIR);
  fs.ensureAlias(INSTALL_BACKLOG_DIR, linkPath);
  return linkPath;
}

/**
 * Read every file under `dir` (recursively) through the FileSystem port into relative-path
 * {@link TemplateFile}s. Returns `[]` if `dir` does not exist. Used to scaffold from the project's
 * `bundles/bundle-template/` directory, which is a `files/`-tree COPY carrying no `template.yml` of its own (so it
 * cannot be read by the template-resolver). Pure over the port.
 *
 * The scaffold's own `backlog → install-backlog` alias (TASK-102) is **skipped**: it is a symlink, not a file
 * (reading it would hit the install-backlog directory it points at), and the cloned bundle gets its OWN link
 * created fresh in ③ APPLY — so copying the scaffold's is both impossible (it has no file content) and redundant.
 *
 * @param fs - The filesystem port.
 * @param dir - The directory whose tree is read.
 * @returns The files under `dir`, each with a path relative to `dir`.
 */
function readDirTree(fs: FileSystem, dir: string): TemplateFile[] {
  if (!fs.exists(dir)) {
    return [];
  }
  const files: TemplateFile[] = [];
  const walk = (current: string, relPrefix: string): void => {
    for (const entry of fs.list(current)) {
      // Never clone the per-bundle `backlog` alias (a symlink): the new bundle's own is made in APPLY.
      if (entry.name === BACKLOG_ALIAS_DIR) {
        continue;
      }
      const childAbs = join(current, entry.name);
      const childRel = relPrefix === "" ? entry.name : `${relPrefix}/${entry.name}`;
      if (entry.kind === "directory") {
        walk(childAbs, childRel);
      } else {
        files.push({ path: childRel, content: fs.read(childAbs) });
      }
    }
  };
  walk(dir, "");
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

/** The input to {@link createBundleSpec}'s operation: the raw bundle id plus the `bundle new` flags. */
export interface CreateBundleInput {
  /** The new bundle's id (validated as a {@link parseBundleId}: kebab-case, not a reserved verb). */
  readonly id: string;
  /** The bundle's initial version (default `0.1.0`). */
  readonly version?: string;
  /** When `true`, create the dir without enabling it in the manifest (doc 10 `--disabled`; rare). */
  readonly disabled?: boolean;
  /** Whether the auto-advisor task is materialised (default `true`; `--no-advisor` sets it `false`). */
  readonly advisor?: boolean;
}

/** The non-port dependencies {@link createBundleSpec} needs for ③ APPLY's template resolution. */
export interface CreateBundleDeps {
  /** The built-in templates root (shipped with the CLI), searched after the project-local `templates/`. */
  readonly builtinTemplatesRoot: string;
  /** The bundle template name to scaffold from (default `default`; doc 10 `--template`). */
  readonly bundleTemplateName?: string;
  /**
   * The project template whose advisor snippet is rendered for the auto-advisor (default `minimal`; doc 10 step
   * 6 → the `bundle <id> advisor add` action). Only used when the advisor is scaffolded (`advisor !== false`).
   */
  readonly projectTemplateName?: string;
}

/**
 * The per-bundle authoring tasks `bundle new <id>` materialises (doc 11 §3 "Materialised by `wpm bundle new
 * <id>`"). Titles carry `<id>`; the acceptance criteria are the free-text criteria from doc 11 §3 verbatim (the
 * agent self-attests against them — they are not machine-evaluated). With the auto-advisor on this is the full
 * 12-task set; `--no-advisor` (`opts.advisor === false`) omits the "Write advisor content" task → 11.
 * Materialisation is title-idempotent (the harness's ⑤), so a re-invocation never duplicates.
 *
 * @param id - The bundle id to substitute into each title.
 * @param opts - `advisor`: whether to include the "Write advisor content" task.
 * @returns The authoring-task specs, in natural reading order (plan → fill → payload → skill → advisor →
 *   verify/review/simulate).
 */
export function perBundleAuthoringTaskCatalog(
  id: string,
  opts: { readonly advisor: boolean },
): MandatoryAuthoringTask[] {
  const tasks: MandatoryAuthoringTask[] = [
    {
      reference: "wpm:bundle:plan",
      title: `Plan bundle ${id}`,
      acceptanceCriteria: [
        `bundles/${id}/bundle.yml has summary, version, confirmation-level set; the requires map declares any inter-bundle dependencies`,
      ],
    },
    {
      reference: "wpm:bundle:fill-install-backlog",
      title: `Fill install-backlog for ${id}`,
      acceptanceCriteria: [
        `at least one kind:state task with a step:<slug> label exists; DoD is configured in install-backlog/config.yml; the detect/setup/verify trio is present`,
      ],
    },
    {
      reference: "wpm:bundle:author-payload",
      title: `Author payload for ${id}`,
      acceptanceCriteria: [
        `payload/files/ and payload/templates/ are populated for whatever the install-backlog tasks reference via --ref`,
      ],
    },
    {
      reference: "wpm:bundle:scaffold-payload-skill",
      title: `Scaffold payload skill for ${id}`,
      acceptanceCriteria: [
        `if the bundle delivers a runtime agent skill, at least one is registered via bundle ${id} skills add <name>; if the bundle delivers no runtime skill, the agent closes this with a note to that effect`,
      ],
    },
  ];

  if (opts.advisor) {
    tasks.push({
      reference: "wpm:bundle:write-advisor-content",
      // The title is sourced from `advisorContentTaskTitle` (advisor.ts) so `bundle new`/`enable` and
      // `bundle <id> advisor add`/`remove` all materialise/archive the IDENTICAL title (doc 11 idempotency-by-title).
      title: advisorContentTaskTitle(id),
      acceptanceCriteria: [
        `installer-skills/${id}-advisor/SKILL.md has a real trigger description (firing on the user's need) and a recommendation body, replacing the template-rendered placeholder`,
      ],
    });
  }

  tasks.push(
    {
      reference: "wpm:bundle:verify-step-slugs",
      title: `Verify step slug uniqueness for ${id}`,
      acceptanceCriteria: [
        `every step:<slug> label across bundles/${id}/install-backlog/tasks/ and archive/ is unique; no archived task's slug collides with an active one`,
      ],
    },
    {
      reference: "wpm:bundle:verify-dod",
      title: `Verify DoD compliance for ${id}`,
      acceptanceCriteria: [
        `every task in the bundle carries the DoD items declared in bundles/${id}/install-backlog/config.yml.dod`,
      ],
    },
    {
      reference: "wpm:bundle:verify-payload-references",
      title: `Verify payload references for ${id}`,
      acceptanceCriteria: [
        `every --ref <path> value in the bundle's tasks corresponds to a file registered under bundle ${id} files or bundle ${id} templates`,
      ],
    },
    {
      reference: "wpm:bundle:verify-skill-registration",
      title: `Verify skill registration for ${id}`,
      acceptanceCriteria: [
        `every payload skill registered via bundle ${id} skills add and every install-time skill registered via bundle ${id} installer-skills add has its SKILL.md present at the expected path with valid frontmatter; the advisor (unless opted out) has been filled past its placeholder`,
      ],
    },
    {
      reference: "wpm:bundle:verify-version-constraints",
      title: `Verify version constraints for ${id}`,
      acceptanceCriteria: [
        `every entry in bundles/${id}/bundle.yml.requires resolves against the depended-upon bundle's declared version`,
      ],
    },
    {
      reference: "wpm:bundle:review-install-backlog-independence",
      title: `Review install-backlog independence for ${id}`,
      acceptanceCriteria: [
        `no hard-coded IDs from other bundles appear in this bundle's tasks; no undeclared host-environment assumptions`,
      ],
    },
    {
      reference: "wpm:bundle:simulate-fresh-install",
      title: `Simulate fresh-install executor for ${id}`,
      acceptanceCriteria: [
        `agent walks bundles/${id}/install-backlog/tasks/ as a context-less executor would, in dependency order, documenting any task whose AC would be ambiguous, whose --ref would resolve to nothing, or whose preconditions aren't established by earlier tasks`,
      ],
    },
  );

  return tasks;
}

/** Mandatory bundle task specs with stable-reference metadata removed for the existing materialiser. */
export function perBundleAuthoringTasks(
  id: string,
  opts: { readonly advisor: boolean },
): AuthoringTaskSpec[] {
  return perBundleAuthoringTaskCatalog(id, opts).map(({ title, acceptanceCriteria }) => ({
    title,
    acceptanceCriteria,
  }));
}

/**
 * Build the `createBundle` {@link OperationSpec} (doc 10 row `bundle new`; doc 13 §5). Run it through the
 * task-25 `runMutation` with a {@link CreateBundleInput}; the harness performs ① LOAD, ④ RERENDER, ⑤
 * MATERIALISE, and ⑥ RESULT around the beats declared here.
 *
 * @param deps - The built-in templates root + optional bundle template name for ③'s scaffold.
 * @returns The operation spec.
 */
export function createBundleSpec(deps: CreateBundleDeps): OperationSpec<CreateBundleInput> {
  // Whether `--template` was given explicitly. When it was NOT, `bundle new` defaults to the PROJECT's
  // `bundles/bundle-template/` scaffold if present (doc 10:150 step 2), falling back to the registry `default`;
  // an EXPLICIT `--template <name>` always resolves from the registry (doc 10 row `bundle new` step 2).
  const explicitTemplate = deps.bundleTemplateName !== undefined;
  const bundleTemplateName = deps.bundleTemplateName ?? DEFAULT_BUNDLE_TEMPLATE;

  return {
    summary: (_project, input) =>
      `created bundle ${input.id}${input.advisor !== false ? " (advisor scaffolded)" : ""}`,

    /**
     * ② CHECK — validate all requested input (the id AND the version) and reject a duplicate, before any
     * effect (doc 13 §5: CHECK validates the requested change before APPLY runs). Pure read; raises a task-23
     * DomainError on failure.
     */
    check: (project, input) => {
      const parsed = parseBundleId(input.id);
      if (!parsed.ok) {
        throw new ValidationError(parsed.problem.message);
      }
      if (project.manifest.bundles.includes(parsed.value)) {
        throw new ConflictError(`bundle '${input.id}' already exists in the manifest`);
      }
      const version = input.version ?? DEFAULT_VERSION;
      const semver = parseSemVer(version);
      if (!semver.ok) {
        throw new ValidationError(`invalid bundle version "${version}": ${semver.problem.message}`);
      }
    },

    /** ③ APPLY — scaffold the bundle dir from the template, write its bundle.yml, append it to the manifest. */
    apply: ({ fs, root }: ApplyContext, project, input): { changedPaths: string[] } => {
      const id = input.id;
      const version = input.version ?? DEFAULT_VERSION;

      // The version was already validated in CHECK; re-parse to recover the branded value for the manifest.
      const semver = parseSemVer(version);
      if (!semver.ok) {
        throw new ValidationError(`invalid bundle version "${version}": ${semver.problem.message}`);
      }
      // The id was already validated in CHECK; re-parse to recover the branded value for the manifest.
      const bundleId = parseBundleId(id);
      if (!bundleId.ok) {
        throw new ValidationError(bundleId.problem.message);
      }

      const changedPaths: string[] = [];

      // (a) Resolve the scaffold tree. When `--template` was NOT given AND the project's
      // `bundles/bundle-template/` scaffold exists, clone THAT directory's tree directly (doc 10:150 step 2 —
      // the project default `bundle new` clones, which `init`/`bundle template set` materialise there). It is a
      // `files/`-tree copy with no `template.yml`, so it is read via the port, not the resolver. Otherwise (an
      // explicit `--template`, or no project scaffold) resolve from the registry (project-local shadows built-in).
      const projectScaffold = join(root, "bundles", BUNDLE_TEMPLATE_DIR);
      let scaffoldFiles: readonly TemplateFile[];
      if (!explicitTemplate && fs.exists(projectScaffold)) {
        scaffoldFiles = readDirTree(fs, projectScaffold);
      } else {
        const resolution = resolveTemplate(bundleTemplateName, "bundle", {
          fs,
          builtinTemplatesRoot: deps.builtinTemplatesRoot,
          projectTemplatesRoot: join(root, "templates"),
        });
        if (!resolution.found) {
          throw new NotFoundError(
            `bundle template "${bundleTemplateName}" not found (searched: ${resolution.searched.join(", ")})`,
          );
        }
        scaffoldFiles = resolution.template.files;
      }
      const params = new Map<string, string>([
        ["bundle-id", id],
        ["version", version],
        ["project-name", project.manifest.meta.name],
      ]);
      for (const file of renderTree(scaffoldFiles, params)) {
        const abs = join(root, "bundles", id, file.path);
        fs.write(abs, file.content);
        changedPaths.push(abs);
      }

      // (a′) Create the per-bundle `backlog → install-backlog` relative alias (TASK-102): the scaffold has just
      // written install-backlog/, so the link now resolves; the Backlog.md CLI can be run inside the bundle.
      changedPaths.push(ensureBundleBacklogAlias(fs, join(root, "bundles", id)));

      // (b) Write the canonical bundle.yml (the structural source of truth for id/version/requires).
      const manifest: BundleManifest = {
        id: bundleId.value,
        version: semver.value,
        summary: `${id} bundle`,
        confirmation: "safe",
        requires: new Map(),
        payload: { files: [], templates: [], scripts: [], skills: [] },
        installerSkills: [],
      };
      const bundleYmlPath = join(root, "bundles", id, "bundle.yml");
      fs.write(bundleYmlPath, stringifyYaml(serializeBundleManifest(manifest)));
      if (!changedPaths.includes(bundleYmlPath)) {
        changedPaths.push(bundleYmlPath);
      }

      // (c) Append <id> to manifest.bundles, comment-preservingly, unless creating disabled.
      if (input.disabled !== true) {
        const manifestPath = join(root, "manifest.yml");
        const next = editYaml(fs.read(manifestPath), (doc) => {
          doc.addIn(["bundles"], id);
        });
        fs.write(manifestPath, next);
        changedPaths.push(manifestPath);
      }

      // (d) Auto-advisor (doc 10 step 6): unless `--no-advisor` (`advisor === false`), render the advisor stub
      // at installer-skills/<id>-advisor/SKILL.md via the shared scaffold (no-op if it already exists). The
      // matching "Write advisor content for <id>" authoring task is added by ⑤ MATERIALISE below.
      if (input.advisor !== false) {
        for (const path of scaffoldAdvisor(
          {
            builtinTemplatesRoot: deps.builtinTemplatesRoot,
            ...(deps.projectTemplateName !== undefined
              ? { projectTemplateName: deps.projectTemplateName }
              : {}),
          },
          fs,
          root,
          id,
        )) {
          changedPaths.push(path);
        }
      }

      return { changedPaths };
    },

    /** ⑤ MATERIALISE plan — the doc-11 §3 per-bundle authoring tasks (advisor task unless `--no-advisor`). */
    materialise: (_project, input) =>
      perBundleAuthoringTasks(input.id, { advisor: input.advisor !== false }),
  };
}
