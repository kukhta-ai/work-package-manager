import { join } from "node:path";
import { editYaml, stringifyYaml } from "../../util/yaml.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import {
  type AuthoringTaskSpec,
  type BundleManifest,
  parseBundleId,
  parseSemVer,
} from "../model/index.js";
import { renderTree } from "../services/render.js";
import { serializeBundleManifest } from "../services/schema/index.js";
import { resolveTemplate } from "../services/template-resolver.js";
import { scaffoldAdvisor } from "./advisor.js";
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
/** The default new-bundle version (doc 10 row `bundle new`: `--version` defaults to `0.1.0`). */
const DEFAULT_VERSION = "0.1.0";

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
export function perBundleAuthoringTasks(
  id: string,
  opts: { readonly advisor: boolean },
): AuthoringTaskSpec[] {
  const tasks: AuthoringTaskSpec[] = [
    {
      title: `Plan bundle ${id}`,
      acceptanceCriteria: [
        `bundles/${id}/bundle.yml has summary, version, confirmation-level set; the requires map declares any inter-bundle dependencies`,
      ],
    },
    {
      title: `Fill install-backlog for ${id}`,
      acceptanceCriteria: [
        `at least one kind:state task with a step:<slug> label exists; DoD is configured in install-backlog/config.yml; the detect/setup/verify trio is present`,
      ],
    },
    {
      title: `Author payload for ${id}`,
      acceptanceCriteria: [
        `payload/files/ and payload/templates/ are populated for whatever the install-backlog tasks reference via --ref`,
      ],
    },
    {
      title: `Scaffold payload skill for ${id}`,
      acceptanceCriteria: [
        `if the bundle delivers a runtime agent skill, at least one is registered via bundle ${id} skills add <name>; if the bundle delivers no runtime skill, the agent closes this with a note to that effect`,
      ],
    },
  ];

  if (opts.advisor) {
    tasks.push({
      title: `Write advisor content for ${id}`,
      acceptanceCriteria: [
        `installer-skills/${id}-advisor/SKILL.md has a real trigger description (firing on the user's need) and a recommendation body, replacing the template-rendered placeholder`,
      ],
    });
  }

  tasks.push(
    {
      title: `Verify step slug uniqueness for ${id}`,
      acceptanceCriteria: [
        `every step:<slug> label across bundles/${id}/install-backlog/tasks/ and archive/ is unique; no archived task's slug collides with an active one`,
      ],
    },
    {
      title: `Verify DoD compliance for ${id}`,
      acceptanceCriteria: [
        `every task in the bundle carries the DoD items declared in bundles/${id}/install-backlog/config.yml.dod`,
      ],
    },
    {
      title: `Verify payload references for ${id}`,
      acceptanceCriteria: [
        `every --ref <path> value in the bundle's tasks corresponds to a file registered under bundle ${id} files or bundle ${id} templates`,
      ],
    },
    {
      title: `Verify skill registration for ${id}`,
      acceptanceCriteria: [
        `every payload skill registered via bundle ${id} skills add and every install-time skill registered via bundle ${id} installer-skills add has its SKILL.md present at the expected path with valid frontmatter; the advisor (unless opted out) has been filled past its placeholder`,
      ],
    },
    {
      title: `Verify version constraints for ${id}`,
      acceptanceCriteria: [
        `every entry in bundles/${id}/bundle.yml.requires resolves against the depended-upon bundle's declared version`,
      ],
    },
    {
      title: `Review install-backlog independence for ${id}`,
      acceptanceCriteria: [
        `no hard-coded IDs from other bundles appear in this bundle's tasks; no undeclared host-environment assumptions`,
      ],
    },
    {
      title: `Simulate fresh-install executor for ${id}`,
      acceptanceCriteria: [
        `agent walks bundles/${id}/install-backlog/tasks/ as a context-less executor would, in dependency order, documenting any task whose AC would be ambiguous, whose --ref would resolve to nothing, or whose preconditions aren't established by earlier tasks`,
      ],
    },
  );

  return tasks;
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

      // (a) Resolve + scaffold the bundle template (project-local shadows built-in).
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
      const params = new Map<string, string>([
        ["bundle-id", id],
        ["version", version],
        ["project-name", project.manifest.meta.name],
      ]);
      for (const file of renderTree(resolution.template.files, params)) {
        const abs = join(root, "bundles", id, file.path);
        fs.write(abs, file.content);
        changedPaths.push(abs);
      }

      // (b) Write the canonical bundle.yml (the structural source of truth for id/version/requires).
      const manifest: BundleManifest = {
        id: bundleId.value,
        version: semver.value,
        summary: `${id} bundle`,
        confirmation: "safe",
        requires: new Map(),
        payload: { files: [], templates: [], scripts: [], skills: [] },
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
