import type {
  BacklogMd,
  CreateTaskInput,
  EditTaskChanges,
  InitOptions,
  ListFilter,
  TaskId,
  TaskStatus,
  TaskSummary,
} from "../core/ports/backlog.js";
import { toPosix } from "../util/posix-path.js";

/** The full in-memory record of a task, including fields the real `list` does not surface. */
interface FakeTask {
  id: TaskId;
  title: string;
  status: TaskStatus;
  description?: string;
  acceptanceCriteria: { text: string; checked: boolean }[];
  definitionOfDone: { text: string; checked: boolean }[];
  dependencies: TaskId[];
  labels: string[];
  notes: string;
  archived: boolean;
}

/** Per-root state: the task-prefix, a monotonic counter, and the tasks created in that root. */
interface FakeRoot {
  taskPrefix: string;
  counter: number;
  tasks: Map<TaskId, FakeTask>;
}

/**
 * An in-memory {@link BacklogMd} (doc 13 §1) — the fake that lets logic driving Backlog.md run in tests with
 * no subprocess (AC#3). It is **faithful to the real adapter's observable behavior** (the task-12 lesson):
 * the same {@link TaskSummary} shape, `<taskPrefix>-<n>` id assignment with a monotonic per-root counter
 * (ids are not reused while active), the default `"To Do"` status, status-filtered listing, and
 * create/list/edit/archive semantics matching {@link BacklogCli}. The operation/lifecycle tests (tasks 21,
 * 25, 26) reuse it, so it stores acceptance criteria, dependencies, labels, and DoD even though the real
 * `task list` does not surface them — that way a downstream test can't pass against the fake but differ for
 * real.
 *
 * Pure: no `node:fs`, no subprocess.
 */
export class FakeBacklog implements BacklogMd {
  private readonly roots = new Map<string, FakeRoot>();

  /**
   * The Map key for a root: its POSIX form. The real adapter resolves a single cwd regardless of how the caller
   * spelled the separators, so the fake must too — otherwise a root `init`-ed as `/proj/.authoring-backlog` and
   * later looked up as the OS-native `\proj\.authoring-backlog` (Windows `path.join`) would miss. Normalizing
   * EVERY key access collapses all separator forms of one logical root to a single entry. A no-op on POSIX.
   */
  private key(root: string): string {
    return toPosix(root);
  }

  /** Fetch an initialised root, throwing the way the real CLI would if the backlog was never initialised. */
  private requireRoot(root: string): FakeRoot {
    const r = this.roots.get(this.key(root));
    if (r === undefined) {
      throw new Error(`No backlog initialised at '${root}' (call init first)`);
    }
    return r;
  }

  /**
   * PARITY TRAP (recorded per the task-33 review): the REAL `BacklogCli.init` shells out to `backlog init`
   * with the root as the subprocess `cwd`, so it REQUIRES `root` to already exist as a directory — it fails
   * with a spawn/ENOENT error if it does not. This fake has no FileSystem reference (by design — it models
   * backlog STATE, not the disk), so it cannot enforce that; it just records the root in-memory and succeeds
   * even for a non-existent path. CONSEQUENCE: an operation that calls `init(root)` WITHOUT first
   * `fs.makeDirectories(root)` passes against this fake but fails against the real CLI (exactly the bug the
   * walking skeleton's real-`backlog` test caught in `initProject`). Operations MUST create the directory
   * before initialising a backlog in it; rely on a real-`BacklogCli` integration test (not this fake alone)
   * to guard that ordering. (Same parity-gap class as the task-25 memory-fs and task-27 symlink fixes, but
   * here the dir-existence is a filesystem fact the backlog fake can't model without over-coupling.)
   *
   * @inheritdoc
   */
  init(root: string, options: InitOptions): void {
    this.roots.set(this.key(root), {
      taskPrefix: options.taskPrefix,
      counter: 0,
      tasks: new Map(),
    });
  }

  /** @inheritdoc */
  createTask(root: string, input: CreateTaskInput): TaskSummary {
    const r = this.requireRoot(root);
    r.counter += 1;
    const id: TaskId = `${r.taskPrefix}-${r.counter}`;
    const task: FakeTask = {
      id,
      title: input.title,
      status: "To Do",
      ...(input.description !== undefined ? { description: input.description } : {}),
      acceptanceCriteria: (input.acceptanceCriteria ?? []).map((text) => ({
        text,
        checked: false,
      })),
      definitionOfDone: (input.definitionOfDone ?? []).map((text) => ({ text, checked: false })),
      dependencies: [...(input.dependencies ?? [])],
      labels: [...(input.labels ?? [])],
      notes: "",
      archived: false,
    };
    r.tasks.set(id, task);
    return { id, title: task.title, status: task.status };
  }

  /** @inheritdoc */
  listTasks(root: string, filter?: ListFilter): TaskSummary[] {
    const r = this.requireRoot(root);
    const result: TaskSummary[] = [];
    for (const task of r.tasks.values()) {
      if (task.archived) continue;
      if (filter?.status !== undefined && task.status !== filter.status) continue;
      result.push({ id: task.id, title: task.title, status: task.status });
    }
    return result;
  }

  /** @inheritdoc */
  editTask(root: string, id: TaskId, changes: EditTaskChanges): void {
    const r = this.requireRoot(root);
    const task = r.tasks.get(id);
    if (task === undefined || task.archived) {
      throw new Error(`Task '${id}' not found in backlog at '${root}'`);
    }
    if (changes.status !== undefined) {
      task.status = changes.status;
    }
    for (const idx of changes.checkAcceptanceCriteria ?? []) {
      const ac = task.acceptanceCriteria[idx - 1];
      if (ac !== undefined) ac.checked = true;
    }
    for (const idx of changes.checkDefinitionOfDone ?? []) {
      const dod = task.definitionOfDone[idx - 1];
      if (dod !== undefined) dod.checked = true;
    }
    if (changes.notes !== undefined) {
      task.notes = changes.notes;
    }
    if (changes.appendNotes !== undefined) {
      task.notes =
        task.notes.length > 0 ? `${task.notes}\n${changes.appendNotes}` : changes.appendNotes;
    }
    for (const label of changes.addLabels ?? []) {
      if (!task.labels.includes(label)) task.labels.push(label);
    }
    for (const label of changes.removeLabels ?? []) {
      task.labels = task.labels.filter((l) => l !== label);
    }
  }

  /** @inheritdoc */
  archiveTask(root: string, id: TaskId): void {
    const r = this.requireRoot(root);
    const task = r.tasks.get(id);
    if (task !== undefined) {
      task.archived = true;
    }
  }

  /**
   * Test-only accessor: a read-only snapshot of a task's full recorded state (including fields the real
   * `list` does not surface — acceptance criteria, dependencies, labels, DoD, notes), or `undefined` if no
   * such task exists. Lets tests assert that create/edit recorded what the real CLI would.
   *
   * @param root - The backlog root.
   * @param id - The task id.
   * @returns A frozen snapshot of the task, or `undefined`.
   */
  taskDetail(root: string, id: TaskId): Readonly<FakeTask> | undefined {
    const task = this.roots.get(this.key(root))?.tasks.get(id);
    return task === undefined ? undefined : structuredClone(task);
  }
}
