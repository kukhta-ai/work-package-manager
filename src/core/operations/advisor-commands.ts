import { join } from "node:path";
import { NotFoundError } from "../errors.js";
import type { BundleManifest } from "../model/index.js";
import { AUTHORING_BACKLOG_DIR } from "../model/index.js";
import {
  type AdvisorDeps,
  advisorContentTaskTitle,
  advisorSkillDir,
  scaffoldAdvisor,
} from "./advisor.js";
import type { ApplyContext, ApplyOutcome, OperationSpec } from "./lifecycle.js";

/**
 * The `bundle <id> advisor add` / `bundle <id> advisor remove` use cases (doc 10 rows 176/177) — the per-bundle
 * ADVISOR family (Family Q). The advisor is the bundle's ONE pull-UX skill (its recommend-on-match installer-skill
 * at the project root's `installer-skills/<id>-advisor/`), so the command has only `add` and `remove` — no
 * `<name>`, no `list`, no `--path` (contrast the bundle's MANY payload/installer skills, families O/P).
 *
 * Both ride the task-25 `runMutation` six-beat harness. `add` is **the same action `bundle new` step 6 and
 * `bundle enable` step 3 already run, exposed standalone**: its ③ APPLY is the shared {@link scaffoldAdvisor}
 * (render-unless-exists — so AC80#1 + AC80#3 fall out of that one function), and its ⑤ MATERIALISE is the single
 * "Write advisor content for `<id>`" task — the SAME-titled task `bundle new` materialises (via
 * `perBundleAuthoringTasks`), so the harness's title-idempotent ⑤ de-dupes it (AC80#2). `remove` is the
 * genuinely-new half: ③ APPLY deletes the advisor directory through the FileSystem port and archives the open
 * content task through the BacklogMd port (AC81#1/#2), and is a no-op-with-a-message when no advisor exists
 * (AC81#3).
 *
 * Pure over the FileSystem + BacklogMd ports (doc 13 §1): imports only the model, the lifecycle types, the
 * shared advisor helpers, the typed error, and `node:path` — never `node:fs`/`commander`/`execa`. The
 * directory delete and the task archive are apply-time effects performed through the injected ports the
 * harness hands the operation on {@link ApplyContext} (doc 13 §1: operations orchestrate effects).
 */

/** The input to both advisor commands: the target bundle id (selected by the `bundle <id>` routing). */
export interface AdvisorInput {
  /** The enabled bundle id whose advisor is added or removed. */
  readonly id: string;
}

/** The acceptance criterion of the "Write advisor content for `<id>`" task (doc 11 §3) — shared with `bundle new`. */
function advisorContentAcceptanceCriterion(id: string): string {
  return `installer-skills/${id}-advisor/SKILL.md has a real trigger description (firing on the user's need) and a recommendation body, replacing the template-rendered placeholder`;
}

/** Guard that `id` is an enabled bundle in the loaded project, raising a {@link NotFoundError} otherwise. */
function requireEnabledBundle(
  project: { bundles: ReadonlyMap<string, BundleManifest> },
  id: string,
): void {
  if (!project.bundles.has(id)) {
    throw new NotFoundError(`bundle "${id}" is not an enabled bundle`);
  }
}

/**
 * `bundle <id> advisor add` (doc 10 row 176), a mutation. ② CHECK the id is an enabled bundle. ③ APPLY renders the
 * advisor stub via the shared {@link scaffoldAdvisor} — which **no-ops when the advisor already exists** (returns
 * `[]`), delivering AC80#1 (render with the placeholder, no invented prose) and the structural half of AC80#3.
 * ⑤ MATERIALISE the single "Write advisor content for `<id>`" task, which the harness de-dupes by title (AC80#2);
 * on a re-run the task already exists, so nothing new is created — and with an empty ③ change set the command is
 * observably a no-op (AC80#3; the command layer prints the no-op message). ④ RERENDER runs (harness) but the
 * advisor is not a front-door artefact, so its diff is benign.
 *
 * @param deps - The built-in templates root + optional project template name for the advisor scaffold.
 * @returns The operation spec.
 */
export function advisorAddSpec(deps: AdvisorDeps): OperationSpec<AdvisorInput> {
  return {
    summary: (_project, { id }) => `advisor scaffolded for ${id}`,

    /** ② CHECK — the id must be an enabled bundle (defense-in-depth with the routing's enabled-bundle guard). */
    check: (project, { id }) => requireEnabledBundle(project, id),

    /** ③ APPLY — render the advisor stub unless it already exists (the shared scaffold no-ops if present). */
    apply: ({ fs, root }: ApplyContext, _project, { id }): ApplyOutcome => ({
      changedPaths: scaffoldAdvisor(
        {
          builtinTemplatesRoot: deps.builtinTemplatesRoot,
          ...(deps.projectTemplateName !== undefined
            ? { projectTemplateName: deps.projectTemplateName }
            : {}),
        },
        fs,
        root,
        id,
      ),
    }),

    /** ⑤ MATERIALISE — the single doc-11 §3 "Write advisor content for `<id>`" task (title-idempotent). */
    materialise: (_project, { id }) => [
      {
        title: advisorContentTaskTitle(id),
        acceptanceCriteria: [advisorContentAcceptanceCriterion(id)],
      },
    ],
  };
}

/**
 * `bundle <id> advisor remove` (doc 10 row 177), a mutation. ② CHECK the id is an enabled bundle. ③ APPLY: when the
 * advisor directory is ABSENT, make **no change** and report "nothing to remove" (AC81#3) — it returns only a
 * warning, touching neither the disk nor the task. When present, it deletes `installer-skills/<id>-advisor/`
 * recursively through the FileSystem port (AC81#1) and archives the "Write advisor content for `<id>`" task **if
 * it is still open** through the BacklogMd port (AC81#2) — a Done task is left as the author closed it, and
 * `listTasks` already excludes archived tasks, so a second `remove` finds nothing to archive (idempotent). No
 * ⑤ MATERIALISE (the close is an apply-time effect, not task creation).
 *
 * @returns The operation spec.
 */
export function advisorRemoveSpec(): OperationSpec<AdvisorInput> {
  return {
    summary: (_project, { id }) => `advisor removed for ${id}`,

    /** ② CHECK — the id must be an enabled bundle. */
    check: (project, { id }) => requireEnabledBundle(project, id),

    /** ③ APPLY — delete the advisor dir if present + archive its open content task; no-op-with-message if absent. */
    apply: ({ fs, backlog, root, workspaceRoot }: ApplyContext, _project, { id }): ApplyOutcome => {
      const dirAbs = join(root, advisorSkillDir(id));
      if (!fs.exists(dirAbs)) {
        // AC81#3: no advisor → make NO change (do not delete, do not touch the task); report "nothing to remove".
        return { warnings: [`no advisor for "${id}" — nothing to remove`] };
      }

      // AC81#1: delete the advisor directory (recursive; the SKILL.md and any siblings go with it).
      fs.remove(dirAbs);

      // AC81#2: archive the "Write advisor content for <id>" task if it is still OPEN (not Done/archived). The
      // authoring backlog is the workspace's own Backlog.md root at `<workspace>/.authoring-backlog` — at the
      // WORKSPACE root, beside `wip/`, the SAME root the harness materialises into (task-88); `listTasks` already
      // excludes archived tasks, so this is idempotent.
      const authoringRoot = join(workspaceRoot, AUTHORING_BACKLOG_DIR);
      const title = advisorContentTaskTitle(id);
      const open = backlog
        .listTasks(authoringRoot)
        .find((task) => task.title === title && task.status !== "Done");
      if (open !== undefined) {
        backlog.archiveTask(authoringRoot, open.id);
      }

      return { changedPaths: [dirAbs] };
    },
  };
}
