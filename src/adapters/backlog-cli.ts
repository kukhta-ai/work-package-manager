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
import { runSync } from "../util/shell.js";

/** The three statuses, used to recognize `list --plain` group headers and validate parsed values. */
const STATUSES: readonly TaskStatus[] = ["To Do", "In Progress", "Done"];

/**
 * The real {@link BacklogMd} adapter (doc 12: "shell-out, not library"). It invokes the installed
 * `backlog` CLI synchronously (`execaSync` via `src/util/shell.ts`) — the core is synchronous — always with
 * an explicit `cwd` (the backlog root), so it never resolves an ambient backlog (e.g. the repo's own). All
 * arguments are passed as an argv array (no shell), so values can never be interpreted as shell syntax.
 * Reads parse `--plain` output into {@link TaskSummary}; writes pass flags. Mapped to Backlog.md v1.45.2.
 *
 * It lives under `src/adapters/`, outside the pure core, so shelling out here is correct.
 */
export class BacklogCli implements BacklogMd {
  /**
   * @param executable - The `backlog` executable name/path; defaults to `"backlog"` (overridable for tests).
   * @param env - Optional environment-variable overrides applied to every `backlog` invocation, merged over
   *   the process environment. Tests use this to isolate Backlog.md's per-machine global state (pointing
   *   `HOME`/`XDG_*` at a sandbox) so concurrent invocations cannot collide; production leaves it unset.
   */
  constructor(
    private readonly executable: string = "backlog",
    private readonly env?: Readonly<Record<string, string>>,
  ) {}

  /** Build the {@link runSync} options for a call in this backlog `root`, including any env overlay. */
  private opts(root: string): { cwd: string; env?: Readonly<Record<string, string>> } {
    return this.env !== undefined ? { cwd: root, env: this.env } : { cwd: root };
  }

  /** @inheritdoc */
  init(root: string, options: InitOptions): void {
    const args = [
      "init",
      "Backlog",
      "--task-prefix",
      options.taskPrefix,
      "--defaults",
      "--integration-mode",
      "none",
    ];
    if (options.git !== true) {
      args.push("--no-git");
    }
    runSync(this.executable, args, this.opts(root));
  }

  /** @inheritdoc */
  createTask(root: string, input: CreateTaskInput): TaskSummary {
    const args = ["task", "create", input.title, "--plain"];
    if (input.description !== undefined) {
      args.push("--description", input.description);
    }
    for (const ac of input.acceptanceCriteria ?? []) {
      args.push("--ac", ac);
    }
    for (const dod of input.definitionOfDone ?? []) {
      args.push("--dod", dod);
    }
    if (input.dependencies && input.dependencies.length > 0) {
      args.push("--dep", input.dependencies.join(","));
    }
    if (input.labels && input.labels.length > 0) {
      args.push("--labels", input.labels.join(","));
    }
    const { stdout } = runSync(this.executable, args, this.opts(root));
    const summary = parseCreatedTask(stdout);
    if (summary === undefined) {
      throw new Error(`Could not parse the created task from backlog output:\n${stdout}`);
    }
    return summary;
  }

  /** @inheritdoc */
  listTasks(root: string, filter?: ListFilter): TaskSummary[] {
    const args = ["task", "list", "--plain"];
    if (filter?.status !== undefined) {
      args.push("--status", filter.status);
    }
    const { stdout } = runSync(this.executable, args, this.opts(root));
    return parseTaskList(stdout);
  }

  /** @inheritdoc */
  editTask(root: string, id: TaskId, changes: EditTaskChanges): void {
    const args = ["task", "edit", id];
    if (changes.status !== undefined) {
      args.push("--status", changes.status);
    }
    for (const idx of changes.checkAcceptanceCriteria ?? []) {
      args.push("--check-ac", String(idx));
    }
    for (const idx of changes.checkDefinitionOfDone ?? []) {
      args.push("--check-dod", String(idx));
    }
    if (changes.notes !== undefined) {
      args.push("--notes", changes.notes);
    }
    if (changes.appendNotes !== undefined) {
      args.push("--append-notes", changes.appendNotes);
    }
    for (const label of changes.addLabels ?? []) {
      args.push("--add-label", label);
    }
    for (const label of changes.removeLabels ?? []) {
      args.push("--remove-label", label);
    }
    runSync(this.executable, args, this.opts(root));
  }

  /** @inheritdoc */
  archiveTask(root: string, id: TaskId): void {
    runSync(this.executable, ["task", "archive", id], this.opts(root));
  }
}

/**
 * Parse the id from a Backlog.md display form (e.g. `AUTH-1`) into the lower-case form used on the CLI
 * (`auth-1`).
 */
function toCliId(displayId: string): TaskId {
  return displayId.toLowerCase();
}

/**
 * Parse the `task create --plain` detail block for the created task's summary. The block contains a
 * `Task <ID> - <title>` line and a `Status: <symbol> <status>` line.
 *
 * @param stdout - The create command's stdout.
 * @returns The parsed {@link TaskSummary}, or `undefined` if the expected lines were not found.
 */
export function parseCreatedTask(stdout: string): TaskSummary | undefined {
  const lines = stdout.split("\n");
  let id: TaskId | undefined;
  let title: string | undefined;
  let status: TaskStatus = "To Do";
  for (const line of lines) {
    const taskMatch = /^Task\s+(\S+)\s+-\s+(.*)$/.exec(line.trim());
    if (taskMatch?.[1] !== undefined && id === undefined) {
      id = toCliId(taskMatch[1]);
      title = taskMatch[2] ?? "";
      continue;
    }
    const statusMatch = /^Status:\s*(.*)$/.exec(line.trim());
    if (statusMatch?.[1] !== undefined) {
      const found = STATUSES.find((s) => statusMatch[1]?.includes(s));
      if (found !== undefined) {
        status = found;
      }
    }
  }
  if (id === undefined || title === undefined) {
    return undefined;
  }
  return { id, title, status };
}

/**
 * Parse `task list --plain` output into summaries. The output groups tasks under a `<Status>:` header,
 * followed by indented `<ID> - <title>` lines.
 *
 * @param stdout - The list command's stdout.
 * @returns The parsed tasks.
 */
export function parseTaskList(stdout: string): TaskSummary[] {
  const summaries: TaskSummary[] = [];
  let current: TaskStatus | undefined;
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.trim().length === 0) {
      continue;
    }
    // A status-group header is a known status followed by a colon, at column 0.
    const header = STATUSES.find((s) => line === `${s}:`);
    if (header !== undefined) {
      current = header;
      continue;
    }
    // A task line: indented `<ID> - <title>`.
    const taskMatch = /^\s+(\S+)\s+-\s+(.*)$/.exec(rawLine);
    if (taskMatch?.[1] !== undefined && current !== undefined) {
      summaries.push({ id: toCliId(taskMatch[1]), title: taskMatch[2] ?? "", status: current });
    }
  }
  return summaries;
}
