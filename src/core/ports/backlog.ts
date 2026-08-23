/**
 * The BacklogMd port (doc 13 §3) — the abstraction through which the builder drives Backlog.md for its OWN
 * work tracking. Like every port it is synchronous (the real adapter shells out with `execaSync`), pure as
 * an interface, and has both a real adapter (`backlog-cli`) and a fake (`fake-backlog`).
 *
 * **The no-mirror scope boundary (doc 13 §3) is structural, enforced by what this surface does NOT offer.**
 * The builder uses this port only to materialise its *authoring* tasks (the builder's own development /
 * recipe-authoring work) and to initialise an authoring backlog root with a task-prefix. It can never
 * create or edit the *content* of a bundle's install-backlog, because:
 *
 * 1. **There is no operation that authors an install/recipe task.** The methods are generic
 *    create/list/edit/archive of the builder's authoring tasks — there is deliberately no "write a bundle's
 *    recipe step" verb, no `kind:state`/`kind:migration` recipe-authoring operation. Those install-backlog
 *    tasks are authored by the human or agent calling the `backlog` CLI directly inside
 *    `bundles/<id>/install-backlog/` (doc 10, doc 11), never through this port.
 * 2. **`init` only sets the prefix (and whether to use git).** Setting a *bundle's*
 *    `install-backlog/config.yml` task-prefix is a YAML write through the FileSystem port, not a backlog op
 *    — so even that scaffolding does not flow through here.
 * 3. **Every operation names its backlog `root` explicitly.** The caller passes the authoring backlog's
 *    path; the port offers no way to discover or target an install-backlog, and the operations that use it
 *    only ever pass the authoring root.
 *
 * Reads come back as parsed {@link TaskSummary} values, never raw CLI text (doc 13 §3).
 */

/** A Backlog.md task id, in its prefixed lower-case form as used on the CLI (e.g. `"authoring-3"`). */
export type TaskId = string;

/** The task statuses the builder uses (Backlog.md's default lifecycle). */
export type TaskStatus = "To Do" | "In Progress" | "Done";

/**
 * A parsed summary of one task, as {@link BacklogMd.listTasks} yields it. These are the fields Backlog.md's
 * `task list --plain` exposes — id, title, and status. (Per-task labels / acceptance criteria are not in the
 * list output; they live in the single-task view, which the builder does not need through this port.)
 */
export interface TaskSummary {
  /** The task's prefixed id (lower-case form). */
  readonly id: TaskId;
  /** The task title. */
  readonly title: string;
  /** The task's current status. */
  readonly status: TaskStatus;
}

/** One acceptance-criterion record as rendered by Backlog.md's exact task view. */
export interface TaskCriterion {
  readonly text: string;
  readonly checked: boolean;
}

/** Concrete task identity/content evidence needed to verify an interrupted materialisation. */
export interface TaskRecord extends TaskSummary {
  /** Backlog.md's stable ordering value; fresh materialisation assigns 1000, 2000, ... in plan order. */
  readonly ordinal: number;
  /** The authored description, or `null` when Backlog.md reports no description. */
  readonly description: string | null;
  readonly acceptanceCriteria: readonly TaskCriterion[];
  readonly definitionOfDone: readonly TaskCriterion[];
  readonly dependencies: readonly TaskId[];
  readonly labels: readonly string[];
  /** Any user-editable metadata not otherwise represented above (assignee, priority, parent, and so on). */
  readonly extraMetadata: readonly string[];
  /** Any additional authored sections such as implementation notes, plan, references, or final summary. */
  readonly extraSections: readonly {
    readonly heading: string;
    readonly content: string;
  }[];
}

/** Exact active/inactive task-store inventory used to reject ambiguous interrupted materialisation. */
export interface BacklogTaskInventory {
  /** Whether config.yml still has the exact deterministic defaults emitted by this adapter's init contract. */
  readonly configurationMatchesFreshDefaults: boolean;
  /** One entry per regular active task file; duplicate ids remain duplicated and malformed entries are named. */
  readonly activeEntries: readonly string[];
  /** Entries in archive/draft/completed task stores; a fresh authoring plan expects none. */
  readonly inactiveEntries: readonly string[];
  /** Any path outside the deterministic Backlog.md task-store layout expected immediately after init. */
  readonly unexpectedEntries: readonly string[];
}

/** Options for initialising an authoring backlog root. */
export interface InitOptions {
  /** The `task_prefix` for the backlog (its tasks become `<taskPrefix>-<n>`). */
  readonly taskPrefix: string;
  /** Whether to initialise with git integration; defaults to `false` (the builder inits without git). */
  readonly git?: boolean;
}

/**
 * The input for creating a task. Optional fields map to the corresponding Backlog.md `task create` flags
 * (`--ac`, `--dod`, `--dep`, `-l`, `-d`); each acceptance criterion / DoD item / dependency / label is a
 * separate value (doc 08 flag mechanics).
 */
export interface CreateTaskInput {
  /** The task title. */
  readonly title: string;
  /** Optional task description. */
  readonly description?: string;
  /** Acceptance criteria (each becomes one `--ac`). */
  readonly acceptanceCriteria?: readonly string[];
  /** Definition-of-Done items (each becomes one `--dod`). */
  readonly definitionOfDone?: readonly string[];
  /** Task dependencies by id (passed as `--dep`). */
  readonly dependencies?: readonly TaskId[];
  /** Labels (passed as a comma-separated `-l`). */
  readonly labels?: readonly string[];
}

/** The changes for editing a task; every field is optional and maps to a Backlog.md `task edit` flag. */
export interface EditTaskChanges {
  /** New status (`-s`). */
  readonly status?: TaskStatus;
  /** 1-based acceptance-criteria indices to check (`--check-ac`). */
  readonly checkAcceptanceCriteria?: readonly number[];
  /** 1-based Definition-of-Done indices to check (`--check-dod`). */
  readonly checkDefinitionOfDone?: readonly number[];
  /** Replace the implementation notes (`--notes`). */
  readonly notes?: string;
  /** Append to the implementation notes (`--append-notes`). */
  readonly appendNotes?: string;
  /** Labels to add (`--add-label`). */
  readonly addLabels?: readonly string[];
  /** Labels to remove (`--remove-label`). */
  readonly removeLabels?: readonly string[];
}

/** A filter for {@link BacklogMd.listTasks}. */
export interface ListFilter {
  /** Only return tasks in this status. */
  readonly status?: TaskStatus;
}

/** Side-effect-free evidence that the configured Backlog.md executable is callable. */
export type BacklogAvailability =
  | { readonly available: true; readonly version: string }
  | { readonly available: false; readonly reason: string };

/** Exact-root identity/config evidence used before workspace integration mutates anything. */
export type BacklogRootInspection =
  | { readonly valid: true; readonly taskPrefix: string }
  | { readonly valid: false; readonly reason: string };

/**
 * The operations the builder needs from Backlog.md (doc 13 §3), each targeting an explicitly-named authoring
 * backlog `root`. See the no-mirror boundary in this module's documentation: the surface intentionally has
 * no operation that authors install-backlog content.
 */
export interface BacklogMd {
  /**
   * Probe the configured Backlog.md executable without opening or mutating a backlog root.
   *
   * @returns Stable availability/version evidence for complete preflight.
   */
  inspectAvailability(): BacklogAvailability;

  /** Inspect the backlog rooted at exactly `root` and report its configured task prefix. */
  inspectRoot(root: string): BacklogRootInspection;

  /**
   * Initialise an authoring backlog at `root` with the given options.
   *
   * @param root - The directory to initialise the backlog in (an explicit path the caller controls).
   * @param options - The init options (task-prefix, git).
   */
  init(root: string, options: InitOptions): void;

  /**
   * Create a task in the backlog at `root` and return its parsed summary (including the id Backlog.md
   * assigned).
   *
   * @param root - The backlog root.
   * @param input - The task to create.
   * @returns The created task's {@link TaskSummary}.
   */
  createTask(root: string, input: CreateTaskInput): TaskSummary;

  /**
   * List the tasks in the backlog at `root`, returning parsed summaries (not raw text).
   *
   * @param root - The backlog root.
   * @param filter - Optional filter (e.g. by status).
   * @returns The matching tasks' summaries.
   */
  listTasks(root: string, filter?: ListFilter): TaskSummary[];

  /** Read one exact task record, including acceptance-criterion text/check state. */
  readTask(root: string, id: TaskId): TaskRecord;

  /** Inventory exact active and inactive task-store entries without ambient-root discovery. */
  inspectTaskInventory(root: string): BacklogTaskInventory;

  /**
   * Recognize only an empty, no-follow subset of the deterministic directory skeleton that Backlog.md init
   * may leave before publishing config.yml. Used solely to retry that applying init boundary.
   */
  inspectEmptyInitialisationResidue(root: string): boolean;

  /**
   * Edit a task in the backlog at `root`.
   *
   * @param root - The backlog root.
   * @param id - The task id to edit.
   * @param changes - The changes to apply.
   */
  editTask(root: string, id: TaskId, changes: EditTaskChanges): void;

  /**
   * Archive a task in the backlog at `root` (removing it from the active board).
   *
   * @param root - The backlog root.
   * @param id - The task id to archive.
   */
  archiveTask(root: string, id: TaskId): void;
}
