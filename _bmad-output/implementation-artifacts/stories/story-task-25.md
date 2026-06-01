# Story task-25 — Implement the shared mutation lifecycle harness

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 13 §5 (the six-beat lifecycle) + §8 (the two data-flow traces) + the AC). Introduces the
> **`src/core/operations/`** tier — the use-case layer above the services. PURE over the PORTS (boundary rule
> applies). Synchronous.

## Story
As every state-changing command (`init`, `bundle new`, `add`, `enable`, …) and every read-only command
(`show`, `list`, `validate`), I need a single shared lifecycle harness that runs the **same six beats** around
an operation's structural effect — load the project, check the change, apply it, re-derive the front-door
artefacts, materialise authoring tasks, report a result — so that no individual operation re-arranges currency
(④) or task-materialisation (⑤), reads run without mutating, and a repeated operation is a no-op (doc 13 §5/§8).

## Acceptance criteria (the contract)
1. Every state-changing operation runs the same sequence: load the project, check the requested change, apply
   it, re-derive the front-door artefacts, materialise any authoring tasks, and report a result (doc 13 §5).
2. Re-deriving artefacts and materialising tasks happen automatically around an operation's change, without
   each operation arranging them (doc 13 §5: the lifecycle handles ④/⑤ around the operation's ③).
3. A read-only operation loads and reports without changing anything (doc 13 §8 read trace).
4. Repeating an operation whose effect is already present makes no further change (idempotency).

## Developer context (the docs)
- doc 13 §5 (the six-beat lifecycle): a mutating operation runs ① LOAD → ② CHECK → ③ APPLY → ④ RERENDER
  (re-derive currency) → ⑤ MATERIALISE (authoring tasks) → ⑥ RESULT. "An operation declares its structural
  effect in ③ and the lifecycle handles currency (④) and task materialisation (⑤) around it." A read runs
  ① LOAD → … → ⑥ RESULT with no ③④⑤.
- doc 13 §8 (the two data-flow traces): the write trace threads project → check → apply → re-derive → diff →
  write/alias → materialise → result; the read trace threads project → projection → result, touching nothing.
- The harness composes existing services/ports only — it is PURE GLUE: it imports the services (task-19
  `deriveArtefacts`/`planChanges`/`scopePlan`, task-21 `materialiseAuthoringTasks`), the schema parsers
  (task-11), the yaml leaf (task-13), the ports (FileSystem/BacklogMd — task-12/14), the model (task-10), and
  the errors (task-23). NEVER `node:fs`/`commander`/`execa`.

## Confirmed composition surfaces (read before writing)
- task-10 `Project = { rootPath; manifest: Manifest; bundles: ReadonlyMap<BundleId, BundleManifest> }`;
  `Manifest.meta.name`, `.targets: AgentName[]`, `.bundles: BundleId[]`.
- task-10 `OperationResult = { summary; changedPaths: readonly string[]; materialisedTaskTitles: readonly
  string[] }` — ⑥ builds this.
- task-10 `AuthoringTaskSpec = { title; acceptanceCriteria: readonly string[] }` — ⑤ feeds these.
- task-11 `parseManifest(data): Parsed<Manifest>`, `parseBundleManifest(data): Parsed<BundleManifest>` (from
  `services/schema/`); task-13 `parseYaml(text)`. A malformed manifest THROWS (authoring/parse bug = plain
  Error) — the harness lets that surface; a MISSING project is already handled by task-24 at the command layer
  (NotFoundError before the harness runs), so ① LOAD assumes a resolved root with a real manifest.
- task-19 `deriveArtefacts(project, snippets): DesiredArtefacts {files: RenderedFile[]; aliasPlan: AliasPlan}`;
  `planChanges(desired, current: CurrentState {files: ReadonlyMap; aliases: ReadonlySet}): ChangeSet
  {filesToWrite: RenderedFile[]; aliasesToCreate: AliasPlanEntry[]}`. `RenderedFile = {path; content}`
  (project-relative path). `AliasPlanEntry = {target; linkPath; aliasTo}` (project-relative paths).
- task-21 `materialiseAuthoringTasks(backlog, root, specs): MaterialiseResult {created: TaskSummary[];
  skipped: string[]}` — title-idempotent.
- task-12 `FileSystem.read/write/exists/ensureAlias`; task-14 `BacklogMd.listTasks/createTask`.

## Design — `src/core/operations/lifecycle.ts` (the harness)

### Injected harness dependencies (the ports + capabilities)
```
interface LifecycleDeps {
  readonly fs: FileSystem;            // task-12 port
  readonly backlog: BacklogMd;        // task-14 port
  // The artefact-derivation capability (AC#2): encapsulates resolving the project's template snippets +
  // calling task-19 deriveArtefacts. Injected so the harness stays generic; task-26/33 supply the concrete
  // deriver (snippets come from the real templates, tasks 30–31). Tested with a fixture deriver.
  readonly deriveArtefacts: (project: Project) => DesiredArtefacts;
}
```

### The operation plug-in shape (AC#2 — the operation supplies ②③⑤ inputs only)
```
interface OperationSpec<I = void> {
  readonly summary: string | ((project: Project, input: I) => string);  // for ⑥
  // ② CHECK: validate the requested change vs current state; raise a task-23 DomainError on failure. Pure
  //   read of the loaded project; returns void on success.
  readonly check?: (project: Project, input: I) => void;
  // ③ APPLY: the structural effect via the FS/BacklogMd ports (YAML writes, dirs, task_prefix, backlog init).
  //   Returns the paths it changed (folded into ⑥'s changedPaths alongside ④'s).
  readonly apply: (ctx: { fs: FileSystem; backlog: BacklogMd; root: string }, project: Project, input: I)
    => { readonly changedPaths?: readonly string[] } | void;
  // ⑤ MATERIALISE plan: which authoring tasks this operation produces (default none). The harness runs the
  //   title-idempotent materialiser around it — the operation does NOT call task-21 itself.
  readonly materialise?: (project: Project, input: I) => readonly AuthoringTaskSpec[];
}
```

### `runMutation` — the six-beat MUTATION runner
`function runMutation<I>(deps: LifecycleDeps, ctx: { root: string }, spec: OperationSpec<I>, input: I):
OperationResult` (the `ctx.root` is the already-resolved project root from task-24's `resolveContext` — the
harness does NOT re-resolve it).
- ① **LOAD** — `loadProject(deps.fs, ctx.root)`: read `manifest.yml` (`fs.read` → `parseYaml` →
  `parseManifest`); for each enabled `manifest.bundles` id, read `bundles/<id>/bundle.yml` (→ `parseYaml` →
  `parseBundleManifest`); build the `Project`. Fresh per call (no cache).
- ② **CHECK** — `spec.check?.(project, input)`; a failure raises a task-23 DomainError (Conflict/NotFound/
  Constraint/Validation) and ABORTS (③④⑤ do NOT run).
- ③ **APPLY** — `const applied = spec.apply({fs, backlog, root}, project, input)`; collect
  `applied?.changedPaths`.
- ④ **RERENDER (AUTOMATIC, AC#2)** — `const desired = deps.deriveArtefacts(reloadedProject)` (RELOAD the
  project after ③ so the re-derivation reflects the applied change — the write trace re-derives from the
  *post-apply* project, doc 13 §8); build `CurrentState` by reading the desired files' current content via
  `fs.read`/`fs.exists` (absent ⇒ omitted) and the existing alias link paths via `fs.exists`; `const change =
  planChanges(desired, current)`; apply ONLY the delta — `fs.write(join(root, f.path), f.content)` for each
  `change.filesToWrite`, `fs.ensureAlias(join(root, a.aliasTo), join(root, a.linkPath))` for each
  `change.aliasesToCreate` (note task-12 ensureAlias(target, linkPath) order). Collect the written paths +
  created link paths into `changedPaths`. (Order is deterministic — task-19 fixes it.)
- ⑤ **MATERIALISE (AUTOMATIC, AC#2)** — `const specs = spec.materialise?.(reloadedProject, input) ?? []`;
  `const mat = materialiseAuthoringTasks(deps.backlog, root, specs)`; the created task TITLES feed ⑥.
- ⑥ **RESULT** — return `OperationResult { summary: <resolved>, changedPaths: <③ ∪ ④, de-duped, order
  preserved>, materialisedTaskTitles: mat.created.map(t => t.title) }`. The harness RETURNS it; the command
  layer formats + prints (output is NOT a port — doc 13 §3).

### `runRead` — the READ-ONLY runner (AC#3)
`function runRead<I, T>(deps: LifecycleDeps_or_{fs}, ctx: {root}, read: { summary; project→projection },
input): { result: OperationResult; value: T }` — runs ① LOAD → the read's PURE projection (`project → T`) →
⑥ RESULT, with NO ③④⑤. It NEVER writes a file, creates an alias, or touches the backlog —
`changedPaths`/`materialisedTaskTitles` are EMPTY. (Shape: a `ReadSpec<I,T> = { summary; project(project,
input): T }`; the runner returns both the projected value and an empty-effect OperationResult.)

### Idempotency (AC#4)
A re-run of a mutation whose effect is already present makes NO further change: ② CHECK guards non-idempotent
ops (Conflict on re-creating an existing id), ③ APPLY is written idempotently by its operation, ④ `planChanges`
is EMPTY when the artefacts already match (task-19), ⑤ skips already-present titles (task-21). Demonstrated:
run a mutation twice → the second `OperationResult` has empty `changedPaths` + empty `materialisedTaskTitles`,
and the on-disk + backlog state is byte-identical.

### Errors / purity
- ② raises task-23 `DomainError`s; the harness NEVER calls `process.exit` and NEVER prints. A malformed
  manifest in ① surfaces as the parser's thrown plain Error (authoring bug), unchanged.
- PURE-over-ports: imports services + ports + model + errors + `node:path` — NO `node:fs`/`commander`/`execa`.
  Boundary clean on `src/core/operations/`.

## Tests (`test/unit/operations/lifecycle.test.ts` + `lifecycle.acceptance.test.ts`)
In-memory `MemoryFileSystem` + `FakeBacklog` + a FIXTURE deriver (returns a small `DesiredArtefacts`: one
front-door `RenderedFile` + a tiny alias plan) and a representative mutation `OperationSpec`:
- **AC#1 six beats IN ORDER** — instrument the spec/deriver (e.g. push to a `calls: string[]`) and assert the
  recorded order is exactly LOAD→CHECK→APPLY→RERENDER→MATERIALISE→RESULT; assert the project loaded (a known
  manifest), the change applied (the spec's file on disk), the artefacts re-derived (the fixture front-door
  written), the authoring tasks materialised (in `FakeBacklog`), and the `OperationResult.changedPaths`
  (apply's + rerender's) + `materialisedTaskTitles`.
- **AC#2 ④⑤ automatic** — the `OperationSpec` does NOT call `deriveArtefacts`/`planChanges`/
  `materialiseAuthoringTasks` itself (its `apply` only does its own structural write), yet the front-door is
  re-derived and the tasks materialised — proving the harness arranges ④⑤.
- **AC#3 read-only** — a `ReadSpec` run through `runRead` returns its projected value + an empty-effect
  `OperationResult`, and the `MemoryFileSystem` snapshot + `FakeBacklog` task list are UNCHANGED before/after.
- **AC#4 idempotency** — run the mutation TWICE: second `OperationResult.changedPaths` is empty and
  `materialisedTaskTitles` is empty; the FS snapshot + backlog list are identical to after the first run.
- **CHECK failure** — a spec whose `check` raises a `ConflictError` (task-23): `runMutation` throws that
  `DomainError`, and ③④⑤ did NOT run (no file written, no task created — assert via the recorder + snapshots).

## DoD
- Pure-over-ports (boundary clean — verify `biome check` on `src/core/operations/`; only the services/ports/
  model/errors + `node:path` imported). `tsc --noEmit` clean, `biome check .` clean, `vitest run` green
  (SINGLE process), `npm ci` clean (no new deps). JSDoc every public type/fn (cite doc 13 §5/§8); no dead code.

## Previous-story intelligence (carried forward)
- task-19 `RenderedFile.path` / `AliasPlanEntry.linkPath`/`aliasTo` are PROJECT-RELATIVE — join with `root`
  before the FS call. task-12 `ensureAlias(target, linkPath)` arg order (target first). task-12
  `MemoryFileSystem` normalizes POSIX — use `/`-rooted roots in tests. task-14 `FakeBacklog` is the in-memory
  port fake (`listTasks`/`createTask`/`taskDetail`); single-process vitest (task-18 caveat). task-17/20/23:
  normal "no" is DATA; ② raises typed DomainErrors; the harness never prints/exits. Run `biome check --write`
  before the gate.

## Boundaries (do NOT do here)
- No CONCRETE operation (that's task-26 — `add`/etc.): the representative spec here is a TEST fixture, not a
  shipped command. No template resolution wired in (the deriver is injected; real snippets are tasks 30–31).
  No CLI/commander wiring (task-27). No re-resolving context (task-24 did it; the harness takes `root`). No
  new deps. Don't edit docs/, AGENTS.md, backlog/, .bmad/ (incl. sprint-status), task-5's biome.json,
  task-10–24.
