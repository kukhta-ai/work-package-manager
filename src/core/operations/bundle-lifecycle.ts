import { join } from "node:path";
import { editYaml } from "../../util/yaml.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { type AuthoringTaskSpec, parseBundleId } from "../model/index.js";
import { scaffoldAdvisor } from "./advisor.js";
import { perBundleAuthoringTasks } from "./create-bundle.js";
import type { ApplyContext, ApplyOutcome, OperationSpec } from "./lifecycle.js";

/**
 * The `bundle enable` / `bundle disable` use cases (doc 10 rows 150/151) — the rest of the bundle-MEMBERSHIP
 * lifecycle alongside `bundle new` (task-26 `createBundleSpec`). Both are mutations that ride the task-25
 * `runMutation` six-beat harness, so ④ RERENDER re-derives the front-door menu around them automatically (the
 * load-bearing effect both rows call out): enable's id re-appears in the menu, disable's drops out. Membership
 * is the only thing they touch — neither scaffolds the bundle dir (that is `bundle new`) nor deletes it (that is
 * `bundle remove`, task-53).
 *
 * Pure over the FileSystem port (doc 13 §1): the manifest edit goes through the task-13 comment-preserving
 * `editYaml`; enable composes the shared {@link scaffoldAdvisor} + the shared {@link perBundleAuthoringTasks}
 * plan. They import only the model/errors/services + the port + `node:path` — never `node:fs`/`commander`/`execa`.
 */

/** The project manifest filename at the root. */
const MANIFEST_FILE = "manifest.yml";
/** A bundle's manifest filename, under `bundles/<id>/` — its presence is how enable proves the dir exists. */
const BUNDLE_MANIFEST_FILE = "bundle.yml";

/** The input to {@link enableBundleSpec}: the bundle id, plus whether to scaffold its advisor. */
export interface EnableBundleInput {
  /** The id of the disabled-but-present bundle to enable. */
  readonly id: string;
  /** Whether the advisor add action runs (default `true`; `--no-advisor` sets it `false`; doc 10 row 150). */
  readonly advisor?: boolean;
}

/** The non-port dependencies {@link enableBundleSpec} needs for the advisor scaffold (doc 10 row 150 step 3). */
export interface EnableBundleDeps {
  /** The built-in templates root (shipped with the CLI), searched after the project-local `templates/`. */
  readonly builtinTemplatesRoot: string;
  /** The project template whose advisor snippet is rendered (default `minimal`). */
  readonly projectTemplateName?: string;
}

/** The input to {@link disableBundleSpec}: the bundle id to remove from the manifest. */
export interface DisableBundleInput {
  /** The id of the enabled bundle to disable (its directory stays on disk untouched). */
  readonly id: string;
}

/**
 * `bundle enable <id> [--no-advisor]` (doc 10 row 150), a mutation. ② CHECK validates the id and rejects an
 * already-enabled one (a no-op {@link ConflictError}). ③ APPLY first guards that the directory exists (else a
 * {@link NotFoundError}, before any write), then appends `<id>` to `manifest.yml.bundles` comment-preservingly
 * and — unless `--no-advisor` or an advisor already exists — runs the shared advisor scaffold. ④ RERENDER
 * re-includes the bundle in the menu; ⑤ MATERIALISE the per-bundle authoring set idempotently (re-enabling a
 * previously-authored bundle de-dupes by title → a no-op).
 *
 * @param deps - The built-in templates root + optional project template name for the advisor scaffold.
 * @returns The operation spec.
 */
export function enableBundleSpec(deps: EnableBundleDeps): OperationSpec<EnableBundleInput> {
  return {
    summary: (_project, input) =>
      `enabled bundle ${input.id}${input.advisor !== false ? " (advisor scaffolded)" : ""}`,

    /**
     * ② CHECK — the project-only validations (doc 10 row 150 step 1, the manifest half): the id is well-formed
     * and not already enabled. The directory-existence half needs the FileSystem port (absent from `check`'s
     * signature), so it is the first guard in `apply` — which throws before any write, preserving "creates
     * nothing" on failure (51#4).
     */
    check: (project, input) => {
      const parsed = parseBundleId(input.id);
      if (!parsed.ok) {
        throw new ValidationError(parsed.problem.message);
      }
      if (project.manifest.bundles.includes(parsed.value)) {
        throw new ConflictError(`bundle "${input.id}" is already enabled in the manifest`);
      }
    },

    /** ③ APPLY — guard the dir exists, append to the manifest, then scaffold the advisor (unless opted out). */
    apply: ({ fs, root }: ApplyContext, _project, input): ApplyOutcome => {
      const id = input.id;
      const changedPaths: string[] = [];

      // Directory-existence guard (doc 10 row 150 step 1): a bundle.yml under bundles/<id>/ is the proof the
      // dir exists and is a real bundle. Thrown BEFORE any write, so nothing mutates on failure (51#4).
      const bundleManifestAbs = join(root, "bundles", id, BUNDLE_MANIFEST_FILE);
      if (!fs.exists(bundleManifestAbs)) {
        throw new NotFoundError(
          `bundle directory "bundles/${id}" does not exist — create it with \`wpm bundle new ${id}\` first`,
        );
      }

      // Append <id> to manifest.bundles, comment-preservingly (the flat-list model — same as `bundle new`).
      const manifestPath = join(root, MANIFEST_FILE);
      const next = editYaml(fs.read(manifestPath), (doc) => {
        doc.addIn(["bundles"], id);
      });
      fs.write(manifestPath, next);
      changedPaths.push(manifestPath);

      // Advisor (doc 10 row 150 step 3): unless --no-advisor, run the shared scaffold — which itself no-ops if
      // an advisor already exists, so "unless ... an advisor already exists" falls out for free (51#2).
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

    /** ⑤ MATERIALISE plan — the SAME doc-11 §3 per-bundle set `bundle new` uses (title-idempotent re-enable). */
    materialise: (_project, input): readonly AuthoringTaskSpec[] =>
      perBundleAuthoringTasks(input.id, { advisor: input.advisor !== false }),
  };
}

/**
 * `bundle disable <id>` (doc 10 row 151), a mutation. ② CHECK rejects an id not in the manifest (a typed
 * {@link NotFoundError}, exit 1). ③ APPLY removes `<id>` from `manifest.yml.bundles` comment-preservingly and
 * does nothing else — **the directory stays on disk untouched** (52#1; that is the whole point, so re-enable
 * restores it for free). ④ RERENDER then re-derives the front-door without the bundle, dropping it from the
 * menu (52#2). No advisor/file teardown (that is `bundle remove`), and no materialisation (disable queues no
 * authoring work).
 *
 * @returns The operation spec.
 */
export function disableBundleSpec(): OperationSpec<DisableBundleInput> {
  return {
    summary: (_project, input) => `disabled bundle ${input.id}`,

    check: (project, input) => {
      // `manifest.bundles` is a `BundleId[]`; compare as strings since `input.id` is the raw (possibly invalid)
      // user argument — disable validates membership, not id well-formedness (doc 10 row 151).
      if (!(project.manifest.bundles as readonly string[]).includes(input.id)) {
        throw new NotFoundError(`bundle "${input.id}" is not enabled in the manifest`);
      }
    },

    apply: ({ fs, root }: ApplyContext, project, input): ApplyOutcome => {
      // Remove the entry from manifest.bundles by its index, comment-preservingly. The directory under
      // bundles/<id>/ is deliberately left in place (52#1) — disable affects only manifest membership.
      const manifestPath = join(root, MANIFEST_FILE);
      const index = (project.manifest.bundles as readonly string[]).indexOf(input.id);
      const next = editYaml(fs.read(manifestPath), (doc) => {
        doc.deleteIn(["bundles", index]);
      });
      fs.write(manifestPath, next);
      return { changedPaths: [manifestPath] };
    },
  };
}
