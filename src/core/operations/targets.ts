import { join } from "node:path";
import { editYaml } from "../../util/yaml.js";
import { ConflictError, NotFoundError } from "../errors.js";
import type { AgentName, AuthoringTaskSpec, Project } from "../model/index.js";
import { aliasPathFor } from "../services/agent-aliases.js";
import type { ApplyContext, ApplyOutcome, OperationSpec, ReadSpec } from "./lifecycle.js";

/**
 * The `project targets` command family (doc 10 rows `project targets add`/`list`/`remove`) — the
 * **list-management exemplar**. `add` and `remove` are mutations that ride the task-25 `runMutation` six-beat
 * lifecycle (so ④ RERENDER re-derives the front-door + scope aliases and ⑤ materialises the doc-11 per-bundle
 * verify task automatically); `list` is a read that rides `runRead`. Pure over the FileSystem port: the manifest
 * edit goes through the task-13 comment-preserving `editYaml`, the alias removal through the port, never
 * `node:fs`/`commander`.
 *
 * Two reusable mechanisms this family establishes for the 7 repeat add/list/remove families (doc 10):
 * - **The warning channel** — `apply` returns non-fatal {@link ApplyOutcome.warnings} (alias-didn't-exist,
 *   last-target), and the harness additionally derives the unknown-agent warning from the deriver's
 *   `unknownTargets`; the command prints `result.warnings` and still exits 0.
 * - **The alias asymmetry** — ④ RERENDER only *adds* missing aliases (it never removes an orphan), so `remove`
 *   must delete the scope-alias itself in ③ (the deriver won't), warning if it was not there. Every `remove` in
 *   the repeat families owns the reverse effect ④ does not.
 */

/** The project manifest filename at the root. */
const MANIFEST_FILE = "manifest.yml";

/** The input shared by `add`/`remove`: the (already kebab-validated) target agent. */
export interface TargetInput {
  /** The target agent to add or remove. */
  readonly agent: AgentName;
}

/**
 * Build the per-bundle "Verify `<id>`'s install-backlog works on `<agent>`" authoring tasks (doc 11 §3,
 * materialised by `project targets add`) — one per enabled bundle. The harness materialises them
 * title-idempotently.
 *
 * @param project - The loaded project (its enabled bundles).
 * @param agent - The newly-added agent.
 * @returns The authoring-task specs.
 */
function verifyTasksFor(project: Project, agent: AgentName): AuthoringTaskSpec[] {
  return project.manifest.bundles.map((id) => ({
    title: `Verify ${id}'s install-backlog works on ${agent}`,
    acceptanceCriteria: [
      `install-backlog tasks in ${id} make no hard-coded other-agent assumptions; the bundle's flow is compatible with ${agent}'s capabilities`,
    ],
  }));
}

/**
 * `project targets add <agent>` (doc 10 row 145), a mutation. ② CHECK the agent is not already a target (else a
 * {@link ConflictError} — a no-op conflict). ③ APPLY appends it to `manifest.yml.targets`, comment-preservingly;
 * it does NOT touch the scope-alias — ④ RERENDER creates a *known* agent's alias for free, and an *unknown*
 * agent's skipped-alias warning falls out of the harness's `unknownTargets` folding. ⑤ MATERIALISE the
 * per-bundle verify task.
 *
 * @returns The operation spec.
 */
export function addTargetSpec(): OperationSpec<TargetInput> {
  return {
    summary: (_project, { agent }) => `added target ${agent}`,

    check: (project, { agent }) => {
      if (project.manifest.targets.includes(agent)) {
        throw new ConflictError(`target "${agent}" is already present`);
      }
    },

    apply: ({ fs, root }: ApplyContext, _project, { agent }): ApplyOutcome => {
      const manifestPath = join(root, MANIFEST_FILE);
      const next = editYaml(fs.read(manifestPath), (doc) => {
        doc.addIn(["targets"], agent);
      });
      fs.write(manifestPath, next);
      return { changedPaths: [manifestPath] };
    },

    materialise: (project, { agent }) => verifyTasksFor(project, agent),
  };
}

/**
 * `project targets remove <agent>` (doc 10 row 147), a mutation. ② CHECK the agent IS a current target (else a
 * {@link NotFoundError}). ③ APPLY removes it from `manifest.yml.targets` AND **deletes its scope-alias** (the
 * deriver's ④ never removes an orphan — this is the alias asymmetry), warning if the alias did not exist; it
 * also warns if it was the last target. ④ RERENDER then re-renders the front-door without the agent.
 *
 * @returns The operation spec.
 */
export function removeTargetSpec(): OperationSpec<TargetInput> {
  return {
    summary: (_project, { agent }) => `removed target ${agent}`,

    check: (project, { agent }) => {
      if (!project.manifest.targets.includes(agent)) {
        throw new NotFoundError(`target "${agent}" is not a current target`);
      }
    },

    apply: ({ fs, root }: ApplyContext, project, { agent }): ApplyOutcome => {
      const warnings: string[] = [];
      const changedPaths: string[] = [];

      // Remove the entry from manifest.yml.targets, comment-preservingly (by its index).
      const manifestPath = join(root, MANIFEST_FILE);
      const index = project.manifest.targets.indexOf(agent);
      const next = editYaml(fs.read(manifestPath), (doc) => {
        doc.deleteIn(["targets", index]);
      });
      fs.write(manifestPath, next);
      changedPaths.push(manifestPath);

      // Delete the scope-alias (④ won't) — warn if it was not there. An unknown agent has no built-in alias
      // path (`aliasPathFor` → undefined); treat that as "did not exist".
      const aliasPath = aliasPathFor(agent);
      const aliasAbs = aliasPath !== undefined ? join(root, aliasPath) : undefined;
      if (aliasAbs !== undefined && fs.exists(aliasAbs)) {
        fs.remove(aliasAbs);
        changedPaths.push(aliasAbs);
      } else {
        warnings.push(`scope-alias for "${agent}" did not exist — nothing to remove`);
      }

      // Warn when it was the last target (the project now targets no agents) — checked pre-removal length.
      if (project.manifest.targets.length === 1) {
        warnings.push(`"${agent}" was the last target — the project now targets no agents`);
      }

      return { changedPaths, warnings };
    },
  };
}

/**
 * `project targets list` (doc 10 row 146), a read. Projects `manifest.yml.targets`; the command prints them.
 * Changes nothing.
 *
 * @returns The read spec.
 */
export function listTargetsSpec(): ReadSpec<void, readonly AgentName[]> {
  return {
    summary: "project targets",
    project: (project) => project.manifest.targets,
  };
}
