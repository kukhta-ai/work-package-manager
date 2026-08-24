import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  BacklogAvailability,
  BacklogMd,
  BacklogRootInspection,
  BacklogTaskInventory,
  CreateTaskInput,
  EditTaskChanges,
  InitOptions,
  ListFilter,
  TaskId,
  TaskRecord,
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

  /** @inheritdoc */
  inspectAvailability(): BacklogAvailability {
    try {
      const { stdout } = runSync(
        this.executable,
        ["--version"],
        this.env !== undefined ? { env: this.env } : {},
      );
      return { available: true, version: stdout.trim() };
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** @inheritdoc */
  inspectRoot(root: string): BacklogRootInspection {
    try {
      // Backlog.md 1.45's `init` stores the folder-local configuration at `backlog/config.yml` when the
      // explicitly supplied project cwd is `root`. Inspecting that concrete child before invoking a read
      // prevents the CLI's upward discovery from accidentally validating an ambient parent project.
      for (const directory of [root, join(root, "backlog")]) {
        let inspection: ReturnType<typeof lstatSync>;
        try {
          inspection = lstatSync(directory);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return {
              valid: false,
              reason: "the exact backlog root has no real backlog directory",
            };
          }
          throw error;
        }
        if (!inspection.isDirectory() || inspection.isSymbolicLink()) {
          return {
            valid: false,
            reason: "the exact backlog root has no real backlog directory",
          };
        }
      }
      const wrapperEntries = readdirSync(root, { withFileTypes: true });
      if (
        wrapperEntries.length !== 1 ||
        wrapperEntries[0]?.name !== "backlog" ||
        !wrapperEntries[0].isDirectory()
      ) {
        return {
          valid: false,
          reason: "the exact backlog root does not contain only its real backlog directory",
        };
      }
      for (const relativeDirectory of [
        "backlog/archive",
        "backlog/archive/drafts",
        "backlog/archive/milestones",
        "backlog/archive/tasks",
        "backlog/completed",
        "backlog/decisions",
        "backlog/docs",
        "backlog/drafts",
        "backlog/milestones",
        "backlog/tasks",
      ]) {
        try {
          assertRegularDirectory(join(root, relativeDirectory));
        } catch (error) {
          return {
            valid: false,
            reason: error instanceof Error ? error.message : String(error),
          };
        }
      }
      const configPath = join(root, "backlog", "config.yml");
      let config: ReturnType<typeof lstatSync>;
      try {
        config = lstatSync(configPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return {
            valid: false,
            reason: "the exact backlog root has no regular backlog/config.yml",
          };
        }
        throw error;
      }
      if (!config.isFile()) {
        return {
          valid: false,
          reason: "the exact backlog root has no regular backlog/config.yml",
        };
      }
      const { stdout } = runSync(this.executable, ["config", "list"], this.opts(root));
      const match = /^\s*taskPrefix:\s*(.+?)\s*(?:\(read-only\))?\s*$/m.exec(stdout);
      if (match?.[1] === undefined) {
        return { valid: false, reason: "Backlog.md did not report taskPrefix for the exact root" };
      }
      return {
        valid: true,
        taskPrefix: match[1].replace(/\s+\(read-only\)\s*$/, "").trim(),
      };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

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
    const identity = this.inspectRoot(root);
    const inventory = identity.valid ? this.inspectTaskInventory(root) : undefined;
    if (
      !identity.valid ||
      inventory === undefined ||
      !inventory.configurationMatchesFreshDefaults ||
      inventory.activeEntries.length !== 0 ||
      inventory.inactiveEntries.length !== 0 ||
      inventory.unexpectedEntries.length !== 0
    ) {
      throw new Error(
        `Backlog.md init did not produce the exact deterministic empty root: ${identity.valid ? "unexpected generated structure/config" : identity.reason}`,
      );
    }
  }

  /** @inheritdoc */
  createTask(root: string, input: CreateTaskInput): TaskSummary {
    const args = ["task", "create", "--plain", "--no-dod-defaults"];
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
    // Template-defined titles are inert text and may legitimately begin with `-`. Keep every option before
    // Commander's end-of-options marker so such a title can never be reinterpreted as Backlog CLI authority.
    args.push("--", input.title);
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
  readTask(root: string, id: TaskId): TaskRecord {
    const { stdout } = runSync(this.executable, ["task", id, "--plain"], this.opts(root));
    const record = parseTaskRecord(stdout);
    if (record === undefined) {
      throw new Error(`Could not parse task '${id}' from backlog output:\n${stdout}`);
    }
    return record;
  }

  /** @inheritdoc */
  inspectTaskInventory(root: string): BacklogTaskInventory {
    const backlogRoot = join(root, "backlog");
    assertRegularDirectory(root);
    assertRegularDirectory(backlogRoot);

    const unexpectedEntries: string[] = [];
    const wrapperEntries = readdirSync(root, { withFileTypes: true });
    for (const entry of wrapperEntries) {
      if (entry.name !== "backlog") unexpectedEntries.push(entry.name);
      else if (!entry.isDirectory()) {
        throw new Error(`Backlog path '${backlogRoot}' is not a real directory`);
      }
    }

    const expectedTopLevel = new Map<string, "directory" | "file">([
      [".locks", "directory"],
      ["archive", "directory"],
      ["completed", "directory"],
      ["config.yml", "file"],
      ["decisions", "directory"],
      ["docs", "directory"],
      ["drafts", "directory"],
      ["milestones", "directory"],
      ["tasks", "directory"],
    ]);
    const actualTopLevel = readdirSync(backlogRoot, { withFileTypes: true });
    for (const entry of actualTopLevel) {
      const expected = expectedTopLevel.get(entry.name);
      const actual = entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "ambiguous";
      if (expected === undefined) {
        unexpectedEntries.push(entry.name);
      } else if (expected !== actual) {
        throw new Error(
          `Backlog path '${join(backlogRoot, entry.name)}' is ${actual}, expected ${expected}`,
        );
      }
    }
    for (const [name, kind] of expectedTopLevel) {
      if (name === ".locks") continue;
      if (!actualTopLevel.some((entry) => entry.name === name)) {
        throw new Error(`Backlog path '${join(backlogRoot, name)}' is missing (expected ${kind})`);
      }
    }

    const archiveRoot = join(backlogRoot, "archive");
    assertRegularDirectory(archiveRoot);
    const expectedArchive = new Set(["drafts", "milestones", "tasks"]);
    const archiveEntries = readdirSync(archiveRoot, { withFileTypes: true });
    for (const entry of archiveEntries) {
      if (!expectedArchive.has(entry.name)) {
        unexpectedEntries.push(`archive/${entry.name}`);
      } else if (!entry.isDirectory()) {
        throw new Error(`Backlog path '${join(archiveRoot, entry.name)}' is not a real directory`);
      }
    }
    for (const name of expectedArchive) {
      if (!archiveEntries.some((entry) => entry.name === name)) {
        throw new Error(`Backlog path '${join(archiveRoot, name)}' is missing`);
      }
    }

    const activeEntries = taskDirectoryEntries(backlogRoot, "tasks");
    const inactiveEntries = [
      ...taskDirectoryEntries(backlogRoot, "drafts"),
      ...taskDirectoryEntries(backlogRoot, "completed"),
      ...taskDirectoryEntries(backlogRoot, "archive/drafts"),
      ...taskDirectoryEntries(backlogRoot, "archive/tasks"),
    ];
    for (const relativeDirectory of ["decisions", "docs", "milestones", "archive/milestones"]) {
      const directory = join(backlogRoot, relativeDirectory);
      assertRegularDirectory(directory);
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        unexpectedEntries.push(`${relativeDirectory}/${entry.name}`);
      }
    }
    const lockDirectory = join(backlogRoot, ".locks");
    try {
      assertRegularDirectory(lockDirectory);
      for (const entry of readdirSync(lockDirectory, { withFileTypes: true })) {
        unexpectedEntries.push(`.locks/${entry.name}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const config = readFileSync(join(backlogRoot, "config.yml"), "utf8").replace(/\r\n/g, "\n");
    const prefixMatch = /^task_prefix:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(config);
    const expectedConfig =
      prefixMatch?.[1] === undefined ? undefined : freshBacklogConfig(prefixMatch[1].trim());
    return {
      configurationMatchesFreshDefaults: config === expectedConfig,
      activeEntries: activeEntries.sort(),
      inactiveEntries: inactiveEntries.sort(),
      unexpectedEntries: unexpectedEntries.sort(),
    };
  }

  /** @inheritdoc */
  inspectEmptyInitialisationResidue(root: string): boolean {
    assertRegularDirectory(root);
    const allowedDirectories = new Set([
      "backlog",
      "backlog/.locks",
      "backlog/archive",
      "backlog/archive/drafts",
      "backlog/archive/milestones",
      "backlog/archive/tasks",
      "backlog/completed",
      "backlog/decisions",
      "backlog/docs",
      "backlog/drafts",
      "backlog/milestones",
      "backlog/tasks",
    ]);
    const visit = (directory: string, relativeDirectory: string): boolean => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const relativePath =
          relativeDirectory.length === 0 ? entry.name : `${relativeDirectory}/${entry.name}`;
        if (!entry.isDirectory() || !allowedDirectories.has(relativePath)) return false;
        if (!visit(join(directory, entry.name), relativePath)) return false;
      }
      return true;
    };
    return visit(root, "");
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

/** Parse one `backlog task <id> --plain` record with exact acceptance-criterion text/check state. */
export function parseTaskRecord(stdout: string): TaskRecord | undefined {
  const summary = parseCreatedTask(stdout);
  if (summary === undefined) return undefined;
  const lines = stdout.split(/\r?\n/);
  const sections = new Map<string, string[]>();
  const extraMetadata: string[] = [];
  let currentSection: string | undefined;
  let ordinal: number | undefined;
  let labels: string[] = [];
  let dependencies: TaskId[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();
    const heading = /^(.+):$/.exec(line)?.[1];
    if (heading !== undefined && /^-+$/.test((lines[index + 1] ?? "").trim())) {
      currentSection = heading;
      sections.set(heading, []);
      index += 1;
      continue;
    }
    if (currentSection !== undefined) {
      sections.get(currentSection)?.push(rawLine);
      continue;
    }
    if (
      line.length === 0 ||
      /^=+$/.test(line) ||
      /^Task\s+\S+\s+-\s+/.test(line) ||
      line.startsWith("File:") ||
      line.startsWith("Status:") ||
      line.startsWith("Created:") ||
      line.startsWith("Updated:")
    ) {
      continue;
    }
    const ordinalMatch = /^Ordinal:\s*(-?\d+)\s*$/.exec(line);
    if (ordinalMatch?.[1] !== undefined) {
      ordinal = Number(ordinalMatch[1]);
      continue;
    }
    const labelsMatch = /^Labels:\s*(.*)$/.exec(line);
    if (labelsMatch?.[1] !== undefined) {
      labels = splitTaskListValue(labelsMatch[1]);
      continue;
    }
    const dependenciesMatch = /^Dependencies:\s*(.*)$/.exec(line);
    if (dependenciesMatch?.[1] !== undefined) {
      dependencies = splitTaskListValue(dependenciesMatch[1]).map(toCliId);
      continue;
    }
    extraMetadata.push(line);
  }

  if (ordinal === undefined || !Number.isFinite(ordinal)) return undefined;
  const descriptionText = sectionText(sections.get("Description"));
  const knownHeadings = new Set(["Description", "Acceptance Criteria", "Definition of Done"]);
  return {
    ...summary,
    ordinal,
    description: descriptionText === "No description provided" ? null : descriptionText || null,
    acceptanceCriteria: parseCriteriaSection(sections.get("Acceptance Criteria")),
    definitionOfDone: parseCriteriaSection(sections.get("Definition of Done")),
    dependencies,
    labels,
    extraMetadata,
    extraSections: [...sections]
      .filter(([heading]) => !knownHeadings.has(heading))
      .map(([heading, content]) => ({ heading, content: sectionText(content) })),
  };
}

function splitTaskListValue(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function sectionText(lines: readonly string[] | undefined): string {
  return (lines ?? []).join("\n").trim();
}

function parseCriteriaSection(
  lines: readonly string[] | undefined,
): { text: string; checked: boolean }[] {
  const criteria: { text: string; checked: boolean }[] = [];
  for (const rawLine of lines ?? []) {
    const match = /^-\s+\[([ xX])\]\s+(?:#\d+\s+)?(.*)$/.exec(rawLine.trim());
    if (match?.[2] !== undefined) {
      criteria.push({ text: match[2], checked: match[1]?.toLowerCase() === "x" });
    }
  }
  return criteria;
}

function assertRegularDirectory(path: string): void {
  const inspection = lstatSync(path);
  if (!inspection.isDirectory() || inspection.isSymbolicLink()) {
    throw new Error(`Backlog path '${path}' is not a real directory`);
  }
}

function taskDirectoryEntries(backlogRoot: string, relativeDirectory: string): string[] {
  const directory = join(backlogRoot, relativeDirectory);
  assertRegularDirectory(directory);
  return readdirSync(directory, { withFileTypes: true }).map((entry) => {
    const match = /^([A-Za-z]+-\d+)\s+-\s+.+\.md$/.exec(entry.name);
    return entry.isFile() && match?.[1] !== undefined
      ? toCliId(match[1])
      : `unrecognized:${relativeDirectory}/${entry.name}`;
  });
}

function freshBacklogConfig(taskPrefix: string): string {
  return [
    'project_name: "Backlog"',
    'default_status: "To Do"',
    'statuses: ["To Do", "In Progress", "Done"]',
    "labels: []",
    "date_format: yyyy-mm-dd",
    "max_column_width: 20",
    'default_editor: "vim"',
    "auto_open_browser: true",
    "default_port: 6420",
    "remote_operations: false",
    "auto_commit: false",
    "filesystem_only: true",
    "bypass_git_hooks: false",
    "check_active_branches: false",
    "active_branch_days: 30",
    `task_prefix: "${taskPrefix}"`,
    "",
  ].join("\n");
}
