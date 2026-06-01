# Story task-14 — Implement the BacklogMd port (real shell-out + fake)

> Lean implementation spec (BMAD create-story output). doc 13 §3 (the BacklogMd port + its no-mirror scope
> boundary) + doc 12 §"Backlog.md adapter: shell-out, not library". SYNC (use `execaSync`). The PORT lives
> under `src/core/ports/` (pure interface, boundary rule applies); ADAPTERS in `src/adapters/` (may use the
> subprocess lib). Mapped to the ACTUALLY-installed Backlog.md **v1.45.2** (inspected live).

## Acceptance criteria (the contract)
1. The builder can initialise a backlog and create/list/edit/archive tasks through one replaceable
   abstraction.
2. Tasks created carry the AC, dependencies, labels, and prefixed ids Backlog.md records (doc 08 flags).
3. Logic using this abstraction runs in tests without invoking the real Backlog.md tool.
4. Through this abstraction there is NO way to create/edit a bundle's install-backlog CONTENT — only
   authoring-side backlogs (doc 13 no-mirror).

## REAL CLI flag mapping (inspected live, backlog v1.45.2)
- `backlog init [name] --task-prefix <p> --no-git --defaults --integration-mode none` — initialise; creates
  a `backlog/` dir at cwd. (We pass cwd = the backlog root so it never touches the repo's own backlog.)
- `backlog task create [title] --ac <c> (repeatable) --dod <i> (repeatable) -l/--labels <csv> --dep <csv>
  -s/--status <s> -d/--description <t> --notes <t> --plain` — create. Default status "To Do". `--plain`
  prints a detail block: `Task AUTH-1 - <title>`, `Status: ○ To Do`, `Labels: a, b`, AC list. Assigned id is
  `<prefix>-<n>` (file lowercase `auth-1`, displayed `AUTH-1`).
- `backlog task edit <id> -s/--status <s> --check-ac <n> --check-dod <n> --notes <t> --append-notes <t>
  --add-label <l> --remove-label <l> --ac <c> --dod <i> -t/--title <t>` — edit (1-based indices).
- `backlog task list [--status <s>] --plain` — groups by status: a `To Do:`/`In Progress:`/`Done:` header,
  then `  <ID> - <title>` indented lines. **list does NOT expose labels** — only id+title+(group)status. So
  `listTasks` → `TaskSummary{ id, title, status }`. (Per-task labels/AC need `task <id> --plain`, out of
  scope for the list op.)
- `backlog task archive <id>` — removes from the active board (exit 0).
- IDs: referenced lower-case on the CLI (`auth-1`), displayed upper-case in output (`AUTH-1`).

## Port surface (`src/core/ports/backlog.ts`, pure)
- `type TaskId = string` (the prefixed id, e.g. `"authoring-3"` — lower-case form used on the CLI).
- `type TaskStatus = "To Do" | "In Progress" | "Done"` (the three Backlog.md statuses we use).
- `interface TaskSummary { id: TaskId; title: string; status: TaskStatus }` (what `list --plain` yields).
- `interface InitOptions { taskPrefix: string; git?: boolean }` (git defaults false; we set `--no-git`).
- `interface CreateTaskInput { title; description?; acceptanceCriteria?: string[]; definitionOfDone?:
  string[]; dependencies?: TaskId[]; labels?: string[] }`.
- `interface EditTaskChanges { status?: TaskStatus; checkAcceptanceCriteria?: number[]; checkDefinitionOfDone
  ?: number[]; notes?: string; appendNotes?: string; addLabels?: string[]; removeLabels?: string[] }`.
- `interface ListFilter { status?: TaskStatus }`.
- `interface BacklogMd {`
  - `init(root: string, options: InitOptions): void` — root = the dir to init in (explicit, never resolved).
  - `createTask(root: string, input: CreateTaskInput): TaskSummary` — returns the created task (incl. id).
  - `listTasks(root: string, filter?: ListFilter): TaskSummary[]` — parsed summaries, NOT raw text.
  - `editTask(root: string, id: TaskId, changes: EditTaskChanges): void`.
  - `archiveTask(root: string, id: TaskId): void` `}`
- Every op takes an explicit `root` so the abstraction always targets a SPECIFIC authoring backlog the
  caller names — never an ambient/auto-resolved one.

## AC#4 — structural no-mirror enforcement (how the SURFACE prevents it)
The port is incapable of authoring/editing install-backlog CONTENT, by surface design (doc 13 §3):
1. **No "author an install/recipe task" operation exists.** The ops are generic create/list/edit/archive of
   the builder's OWN authoring tasks. There is deliberately no method that writes a bundle's recipe content,
   no `kind:state`/`kind:migration` recipe-authoring verb — those tasks are authored by the human/agent
   calling `backlog` directly inside `bundles/<id>/install-backlog/` (doc 10/11), never via this port.
2. **`init`'s only knob is the prefix + git** — it initialises an authoring backlog root. Setting a bundle's
   `install-backlog/config.yml` task-prefix is a YAML write through the **FileSystem** port (task-12/13),
   NOT a backlog op — so even that scaffolding doesn't go through here.
3. **Every op names its `root` explicitly** — the caller (an operation) passes the authoring backlog's path;
   the port offers no way to discover/target install-backlogs, and the operations that use it only ever pass
   the authoring root. The port "simply offers no operation that targets install-backlog content," so the
   principle can't be violated by accident.
Document this in the port JSDoc so the reviewer confirms it by reading the surface.

## Real adapter (`src/adapters/backlog-cli.ts`, outside core)
- `BacklogCli implements BacklogMd`, shelling out via `execaSync` through `src/util/shell.ts`
  (`runSync(file, args, {cwd})` → `{ stdout, stderr, exitCode }`, throwing a clear error with command +
  stderr on failure — doc 12 "consistent error reporting"). Always passes `cwd: root`.
- Build args from the input (map each field to the real flag). Parse `create --plain` for the new id
  (`Task <ID> - ...` → lower-case) + status + title. Parse `list --plain` (status-group headers + indented
  `<ID> - <title>` lines) into `TaskSummary[]`. Robust to blank lines/sections.
- `execa` added to `dependencies` (exact `9.6.1`, ESM). `npm install` then verify `npm ci`.

## Fake adapter (`src/adapters/fake-backlog.ts`, in-memory, no subprocess — AC#3)
- `FakeBacklog implements BacklogMd`, faithful to the real adapter's observable behavior (task-12 lesson):
  per-root in-memory stores; `createTask` assigns `<taskPrefix>-<n>` (n increments per root, never recycled
  while active — matches the real monotonic assignment within a session); default status "To Do";
  `listTasks` returns the same `{id,title,status}` shape + honors the status filter; `editTask` mutates
  status/labels/checks/notes; `archiveTask` removes from the active list. Stores AC/deps/labels/DoD so
  faithfulness holds even though `list` doesn't surface them. This is what task-21/25/26 reuse.
- Optional test-only accessor (e.g. `taskDetail(root,id)`) so tests can assert AC/deps/labels were recorded.

## Tests
- `test/unit/adapters/fake-backlog.test.ts` (no subprocess, AC#3): init; create (with AC/deps/labels/DoD) →
  assert prefixed-id + TaskSummary; list (+ status filter); edit (status→Done, check-ac, notes, add/remove
  label); archive (leaves the list); id monotonic assignment.
- `test/integration/adapters/backlog-cli.test.ts` (real `backlog` in a tmpdir via task-6 `withTempDir`):
  init (task_prefix); create a task w/ AC + deps + labels; list+parse → assert it carries the AC/deps/labels
  + **prefixed id** Backlog.md records (AC#2 — verify via `task <id> --plain` read-back for AC/labels, and
  the parsed list for id+status); edit (status→Done); archive. Isolated to the tmpdir cwd. (If `backlog` is
  unavailable, skip gracefully like cli.bin — but it IS installed, so it runs.)
- Parity check: fake vs real return the same `TaskSummary` shape for an equivalent create→list.

## Gate / DoD
- PORT pure (no execa — interface only; boundary clean). Adapters/util outside core may use execa.
  `tsc --noEmit` clean, `biome check .` clean, `vitest run` green, `npm ci` clean (new execa dep). JSDoc
  every public method/type; no dead code.

## Boundaries (do NOT do here)
- No install-backlog content authoring (the whole AC#4 point). No Clock/Environment ports (task-15). No
  operations wiring (task-21/25/26). Don't touch the repo's own `backlog/`; only a tmpdir. Don't edit docs/,
  AGENTS.md, .bmad/, task-5's biome.json, task-10–13.
