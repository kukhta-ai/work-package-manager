import type { AuthoringTaskSpec } from "../model/index.js";
import type { BacklogMd, TaskSummary } from "../ports/index.js";

/**
 * The `materialisation` service (doc 13 §4; §5 step ⑤ MATERIALISE): the **title-idempotent** creation engine
 * for authoring tasks. Given a set of {@link AuthoringTaskSpec}s, it creates a Backlog.md task for each whose
 * title does not already exist in the authoring backlog, and skips the rest — so re-running a mutating
 * operation never duplicates its authoring tasks (doc 11: "Idempotency, where it matters, is by title … the
 * title is the identity").
 *
 * It is a service **over the BacklogMd port** (like the resolver is over the FileSystem port): it imports only
 * the port interface and the model — never the `backlog-cli` adapter, `execa`, or `node:fs` — so the
 * import-boundary rule on `src/core/services/` is satisfied.
 *
 * This task is the creation **mechanism** only. Deciding *which* specs a given operation produces (doc 11's
 * per-originating-operation catalog) is supplied by each operation later (tasks 25/26 onward); this engine
 * takes the specs and materialises them idempotently.
 */

/** The result of a materialisation: the tasks created this run, and the titles that already existed. */
export interface MaterialiseResult {
  /** The tasks newly created this run (e.g. for the operation result's "materialised task titles"). */
  readonly created: TaskSummary[];
  /** The titles that were skipped because a task with that title already existed. */
  readonly skipped: string[];
}

/**
 * Materialise authoring tasks into the backlog at `root`, idempotently by title (doc 13 §5 step ⑤; doc 11).
 *
 * Existing task titles are read once via {@link BacklogMd.listTasks}; each spec whose title is already present
 * is skipped, and each new title is created via {@link BacklogMd.createTask} (carrying its acceptance
 * criteria). A title seen earlier in the same `specs` batch is also treated as present, so a duplicate title
 * within one call is created only once. The first run over a fresh set of specs creates them all; a second,
 * identical run creates nothing and leaves the backlog unchanged.
 *
 * @param backlog - The BacklogMd port (real adapter in production, fake in tests).
 * @param root - The authoring backlog root to materialise into.
 * @param specs - The authoring-task specifications to materialise.
 * @returns The {@link MaterialiseResult}: the tasks created and the titles skipped.
 */
export function materialiseAuthoringTasks(
  backlog: BacklogMd,
  root: string,
  specs: readonly AuthoringTaskSpec[],
): MaterialiseResult {
  const existingTitles = new Set<string>(backlog.listTasks(root).map((task) => task.title));
  const created: TaskSummary[] = [];
  const skipped: string[] = [];

  for (const spec of specs) {
    if (existingTitles.has(spec.title)) {
      skipped.push(spec.title);
      continue;
    }
    const task = backlog.createTask(root, {
      title: spec.title,
      acceptanceCriteria: spec.acceptanceCriteria,
    });
    created.push(task);
    // Record the title so a duplicate later in this same batch is skipped, not created twice.
    existingTitles.add(spec.title);
  }

  return { created, skipped };
}
