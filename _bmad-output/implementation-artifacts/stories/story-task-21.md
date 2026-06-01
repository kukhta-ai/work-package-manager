# Story task-21 — Implement the authoring-task materialisation service

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned
> — steered from docs 13 §4/§5 + 11 + the BacklogMd port (task-14) + the task-10 model). Phase C services
> tier. doc 13 §4 `materialisation` + §5 step ⑤ MATERIALISE. A service over the BacklogMd PORT (no adapter).
> Synchronous.

## Story
As the §5 MATERIALISE step of every mutating operation, I need a title-idempotent engine that creates a
Backlog.md authoring task for each `AuthoringTaskSpec` whose title does not already exist in the authoring
backlog — so commands like `bundle new`/`enable`/`init`/`targets add` can declare their authoring tasks and
re-running never duplicates them (doc 11: "the title is the identity").

## Acceptance criteria (the contract)
1. Given a set of authoring-task specifications, a task is created for each whose title does not already
   exist (doc 11).
2. Running the same materialisation again creates nothing and changes nothing.

## Scope (FOUNDATION boundary)
task-21 is the materialisation **ENGINE/MECHANISM** — the title-idempotent creation of `AuthoringTaskSpec[]`
via the BacklogMd port. The per-command **catalogs** (which specs each intent like `bundle new`/`init`/
`targets add` produces — doc 11's catalog) ship with each command leaf LATER (tasks 25/26+). Do NOT build the
full per-command catalogs now. A thin pure `planAuthoringTasks(intent, project)` framework is OPTIONAL —
DECISION: SKIP it (the catalogs don't exist yet; an empty planner would be premature/dead-code). The
must-have is the idempotent creation engine.

## Developer context (the docs)
- doc 13 §4 (line 94): "`materialisation` — `(intent, Project) → AuthoringTaskSpec[]`. Pure: decides *which*
  authoring tasks a given command should create. The operation creates them idempotently (title-based, 11)
  via `BacklogMd`." (The "decides which" half is the per-command catalog, later; THIS task is the "creates
  them idempotently" half.)
- doc 13 §5 step ⑤ (lines 114, 120): "MATERIALISE … authoring tasks, **title-idempotent (skip those already
  present)**"; "⑤ skips any task whose title already exists."
- doc 11 (lines 31/33/212): an authoring task is an ordinary Backlog.md task (title + AC free-text +
  status); "Idempotency, where it matters, is **by title**: before creating a task, a command checks whether
  one with that title already exists … and skips if so. That's the entire mechanism — no dedicated metadata."
  The title is the identity.
- BacklogMd port (task-14): `listTasks(root): TaskSummary[]` (each `{id, title, status}`); `createTask(root,
  { title, acceptanceCriteria? }): TaskSummary`. The port's scope is authoring-backlog only (doc 13 §3
  no-mirror) — exactly right.
- task-10 model: `AuthoringTaskSpec { title: string; acceptanceCriteria: readonly string[] }`.

## Design — `src/core/services/materialisation.ts` (over the BacklogMd PORT; boundary rule applies)
- **`materialiseAuthoringTasks(backlog: BacklogMd, root: string, specs: readonly AuthoringTaskSpec[]):
  MaterialiseResult`**:
  1. `existing = backlog.listTasks(root)`; `existingTitles = new Set(existing.map(t => t.title))`.
  2. For each spec, in order: if `existingTitles.has(spec.title)` → push the title to `skipped`; else →
     `const created = backlog.createTask(root, { title: spec.title, acceptanceCriteria:
     spec.acceptanceCriteria })`, push `created` to `created`, AND add `spec.title` to `existingTitles` (so a
     duplicate title WITHIN the same `specs` array is created once — defensive de-dup within the batch too).
  3. Return `MaterialiseResult { created: TaskSummary[]; skipped: string[] }`.
- **`interface MaterialiseResult { created: TaskSummary[]; skipped: string[] }`** — `created` are the new
  `TaskSummary`s (feeding the OperationResult's "materialised task titles"); `skipped` are the titles that
  already existed.
- **Title-idempotent (AC#1, AC#2):** first run → every title new → all created; a second identical run →
  every title now present → `created` empty, `skipped` = all, and the backlog is unchanged (no duplicates).
  The title is the idempotency key (doc 11).
- **PURE over the port**: import ONLY the BacklogMd port (`src/core/ports/`) + the task-10 model
  (`AuthoringTaskSpec`; `TaskSummary` as a type) — NOT the `backlog-cli` adapter, NOT `execa`/`node:fs`.
  Boundary clean on `src/core/services/`.
- Export: `materialiseAuthoringTasks`, `MaterialiseResult`.

## Tests (`test/unit/services/materialisation.test.ts` — pure, FakeBacklog, no subprocess)
- AC#1: init a `FakeBacklog` root; materialise 3 specs (each with title + AC) → `created.length === 3`,
  `skipped === []`; each created task carries its title + AC (verify via `FakeBacklog.taskDetail` /
  `listTasks`).
- AC#2: run the SAME materialise again → `created === []`, `skipped` = all 3 titles, and `listTasks(root)`
  still has exactly 3 tasks (no duplicates).
- partial overlap: pre-create one spec's title, then materialise all 3 → only the 2 genuinely-new created,
  the pre-existing one skipped.
- empty specs → `{ created: [], skipped: [] }`, backlog unchanged.
- within-batch duplicate titles (same title twice in `specs`) → created once.
- (OPTIONAL) `test/integration/...` real `backlog` round-trip, env-isolated per the task-14 fix — fake tests
  are the core; include only if it adds value cheaply.

## DoD
- Service uses only the BacklogMd port + model (boundary clean — no adapter/execa import; verify biome on
  `src/core/services/`). `tsc --noEmit` clean, `biome check .` clean, `vitest run` green (SINGLE process),
  `npm ci` clean (no new deps). JSDoc; no dead code.

## Previous-story intelligence (carried forward)
- task-14: `FakeBacklog` is the in-memory port fake (no subprocess) — `init`/`createTask`/`listTasks` +
  test-only `taskDetail(root, id)` exposing AC/labels. `createTask` assigns `<prefix>-<n>` monotonic ids;
  default status "To Do". task-17/20 pattern: a service that USES a port imports the port interface, never
  the adapter (boundary clean). Run `biome check --write` before the gate; vitest SINGLE process (task-18
  concurrency caveat).

## Boundaries (do NOT do here)
- No per-command catalogs (tasks 25/26+). No `planAuthoringTasks` framework (skipped — premature). No
  adapter/execa/fs import. No wiring into operations. No new deps. Don't edit docs/, AGENTS.md, backlog/,
  .bmad/ (incl. sprint-status), task-5's biome.json, task-10–20.
