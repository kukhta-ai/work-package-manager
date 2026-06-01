# Story cli-advisor — `bundle <id> advisor add` / `remove` (tasks 80 + 81)

Status: ready-for-dev

> BMAD create-story output (skill-driven; BMAD sprint-status/epics auto-discovery suppressed — the real contract
> is the Backlog.md backlog tasks 80/81, read via `backlog task <id> --plain`, NOT the foundation-epic-1
> `epics.md`/`sprint-status.yaml`; the orchestrator owns sprint status and forbids touching it). Steered from doc
> 10 rows 176–177 (`bundle <id> advisor add`/`remove`), doc 10 line 32 (the structure-not-content "scaffold +
> queue the writing" principle), doc 10 command-tree, doc 11 §3 (the "Write advisor content for `<id>`" authoring
> task), doc 13 §1/§5/§7/§8 (purity / six-beat lifecycle / error model).
>
> This is **per-bundle family Q** in the CLI epic-2 — the SMALLEST per-bundle family and the one with the HEAVIEST
> reuse. The advisor is the bundle's ONE pull-UX skill (exactly one per bundle), so the command has only `add` and
> `remove` — **no `<name>`, no `list`, no `--path`**. The `add` action is the SAME action `bundle new` step 6 and
> `bundle enable` step 3 already run, exposed as a standalone command: it reuses `scaffoldAdvisor`
> (`src/core/operations/advisor.ts`) + the "Write advisor content for `<id>`" entry of `perBundleAuthoringTasks`
> (`src/core/operations/create-bundle.ts`) UNCHANGED. No model/schema change is needed.

## Acceptance criteria (verbatim from the backlog — read via `backlog task <id> --plain`)

### TASK-80 — `bundle <id> advisor add` (a MUTATION; doc-10 row 176)
1. The advisor stub at `installer-skills/<id>-advisor/SKILL.md` is rendered from the project template advisor
   snippet with frontmatter plus a placeholder description and body and no invented prose.
2. A write-advisor-content task for the bundle is materialised, idempotent by title.
3. When the advisor already exists the command is a no-op.
4. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the id completes from enabled bundles.
5. Help output is substantive (description, synopsis, an example); on success exits 0.

### TASK-81 — `bundle <id> advisor remove` (a MUTATION; doc-10 row 177)
1. The advisor stub directory `installer-skills/<id>-advisor/` is deleted.
2. The write-advisor-content task for the bundle is closed or archived if still open.
3. Removing an advisor that does not exist reports that there was nothing to remove and makes no change.
4. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the id completes from enabled bundles.
5. Help output is substantive (description, synopsis, an example); on success exits 0.

## doc-10 contract (cite the rows)

> `bundle <id> advisor add` (row 176): "1. **Template-driven**: render the advisor stub
> `installer-skills/<id>-advisor/SKILL.md` from the project template's advisor snippet (frontmatter `name:
> <id>-advisor` + a placeholder description/body — no sense-dependent prose). 2. **Task-driven**: materialise
> authoring task 'Write advisor content for `<id>`' — the agent fills the trigger description + recommendation
> body. 3. No-op if the advisor already exists." [Source: docs/10 §Per-command actions row 176; also line 32 (the
> scaffold-or-queue principle: `bundle <id> advisor add` is "template-driven render of a structural stub … plus
> task-driven materialisation of the prose-writing work … never silently author a finished skill").]

> `bundle <id> advisor remove` (row 177): "1. Delete `installer-skills/<id>-advisor/`. 2. Close/archive the 'Write
> advisor content for `<id>`' task if still open." [Source: docs/10 row 177.]

> The advisor is the bundle's ONE pull-UX skill (doc 00/06 vocabulary): an installer-skill at the project root's
> `installer-skills/<id>-advisor/` that recommends the bundle to the user when their need matches. Exactly one per
> bundle ⇒ no `<name>` and no `list` (contrast the bundle's MANY payload/installer skills, families O/P which DO
> take `<name>`). [Source: docs/10 command tree — the advisor row carries only `add`/`remove`; docs/06 the advisor
> is the bundle's recommend-on-match pull-UX skill, lives at the project root `installer-skills/<id>-advisor/`.]

## THE CENTRAL DESIGN DECISION — `advisor add` IS the `bundle new` step-6 action, exposed (record in Completion Notes)

doc-10 row 176 says `advisor add` does the SAME two things `bundle new` step 6 already does (the row even calls it
"the `bundle <id> advisor add` action"): render the advisor stub + materialise the "Write advisor content for
`<id>`" task. Both halves ALREADY exist and are ALREADY composed by `bundle new` and `bundle enable`:

- The stub render is `scaffoldAdvisor(deps, fs, root, id)` (`src/core/operations/advisor.ts`) — it renders
  `installer-skills/<id>-advisor/SKILL.md` from the project template's `advisor.SKILL.md.tmpl` snippet
  (substituting `{{bundle-id}}` → `<id>`), and is **a no-op when the SKILL.md already exists** (returns `[]`).
  `create-bundle.ts` calls it at ~line 268; `bundle-lifecycle.ts` (enable) calls it too. AC80#1 + AC80#3 fall out
  of this function unchanged.
- The task is the `Write advisor content for ${id}` entry of `perBundleAuthoringTasks(id, { advisor: true })`
  (`create-bundle.ts` ~line 108). It already carries the doc-11 §3 acceptance criterion. AC80#2's "idempotent by
  title" is delivered by the harness's ⑤ MATERIALISE (`materialiseAuthoringTasks` de-dupes by title).

**RESOLUTION:** Q adds NO new core logic for the add path. It adds a thin `OperationSpec` (`advisorAddSpec`) whose
③ APPLY is exactly `scaffoldAdvisor(...)` and whose ⑤ MATERIALISE is exactly the single "Write advisor content
for `<id>`" task spec — the SAME pieces, re-composed as a standalone operation. Riding `runMutation` gives ④
RERENDER for free (harmless — the advisor is not in the front-door menu, so the diff is usually empty; correct,
not a violation). `remove` is the genuinely-new half (delete the dir + archive the task), a small new spec.

> Why not call `scaffoldAdvisor` directly from the CLI leaf (no operation)? Because the task materialisation
> (AC80#2) must ride the harness's ⑤ MATERIALISE to be title-idempotent against the REAL `.authoring-backlog`
> (`join(root, AUTHORING_BACKLOG_DIR)`) — and the harness is `runMutation`, which takes an `OperationSpec`. So the
> add path is a spec: APPLY = scaffold (changed paths threaded into the result), MATERIALISE = the one task. This
> matches how `bundle new`/`enable` already drive the advisor through `runMutation` (they don't call
> `materialiseAuthoringTasks` by hand either).

## THE ADVISOR PATHS (cite the existing helper)

`src/core/operations/advisor.ts` already exports:
- `advisorSkillPath(id)` = `join("installer-skills", `${id}-advisor`, "SKILL.md")` — the stub file
  (project-relative).
- `scaffoldAdvisor(deps, fs, root, id)` — render-unless-exists; returns the absolute path written, or `[]`.

`remove` deletes the **directory** `installer-skills/<id>-advisor/` (the parent of the SKILL.md), not just the
file (AC81#1). Derive it once: `advisorSkillDir(id)` = `join("installer-skills", `${id}-advisor`)` (add this tiny
export to `advisor.ts`, beside `advisorSkillPath`, so the dir and file paths cannot drift). Delete via the fs
port's `remove(path)` (recursive, no-op-if-absent — doc 13 §3 / `filesystem.ts`).

## THE "Write advisor content for `<id>`" TASK TITLE — single source

The title is `Write advisor content for ${id}` — produced TODAY by `perBundleAuthoringTasks` (create-bundle.ts
~line 108). To guarantee `add` (materialise) and `remove` (archive-by-title) use the IDENTICAL string (a typo
divergence would orphan the task on remove), expose ONE helper and use it from BOTH places:

- Add `export function advisorContentTaskTitle(id: string): string { return `Write advisor content for ${id}`; }`
  to `advisor.ts` (it owns the advisor vocabulary).
- In `create-bundle.ts`, the existing `Write advisor content for ${id}` literal in `perBundleAuthoringTasks` SHOULD
  call `advisorContentTaskTitle(id)` so there is one source. (The acceptance-criteria text stays inline; only the
  TITLE is centralised.) This is a pure refactor with no behaviour change — assert the existing create-bundle/
  bundle-lifecycle tests still pass (they assert the literal title; it is byte-identical).
- `advisorAddSpec`'s materialise builds its single `AuthoringTaskSpec` with `title: advisorContentTaskTitle(id)`
  and the SAME acceptance criterion the create-bundle task uses (copy the one-line AC verbatim so a bundle created
  via `bundle new` and one whose advisor is added via `advisor add` materialise the identical task — title AND
  AC).

## PART 1 — THE CORE OPERATION (`src/core/operations/advisor-commands.ts`, NEW)

A new small operations file (the advisor *commands*, distinct from `advisor.ts` which is the shared *scaffold
helper*). It declares two `OperationSpec`s riding `runMutation`. Pure over the FileSystem + BacklogMd ports
(doc 13 §1): imports only the model, the lifecycle types, `scaffoldAdvisor`/`advisorSkillDir`/
`advisorContentTaskTitle` from `./advisor.js`, `node:path` — NEVER `node:fs`/`commander`/`execa`.

### `advisorAddSpec(deps: AdvisorDeps)` — the `bundle <id> advisor add` mutation
```ts
export function advisorAddSpec(deps: AdvisorDeps): OperationSpec<AdvisorInput> {
  return {
    // The summary reflects whether the stub was (re)written or already present (drives the no-op message, AC80#3).
    summary: (_project, { id }) => `advisor add for ${id}`,   // refine to report scaffolded-vs-noop (see below)

    // ② CHECK — the id must be an enabled bundle (defense-in-depth with the routing's requireEnabledBundle).
    check: (project, { id }) => {
      if (!(project.bundles as ReadonlyMap<string, BundleManifest>).has(id))
        throw new NotFoundError(`bundle "${id}" is not an enabled bundle`);
    },

    // ③ APPLY — render the stub UNLESS it exists (scaffoldAdvisor no-ops if present — AC80#1 + AC80#3).
    apply: ({ fs, root }, _project, { id }) => ({
      changedPaths: scaffoldAdvisor(
        { builtinTemplatesRoot: deps.builtinTemplatesRoot,
          ...(deps.projectTemplateName !== undefined ? { projectTemplateName: deps.projectTemplateName } : {}) },
        fs, root, id),
    }),

    // ⑤ MATERIALISE — the SINGLE "Write advisor content for <id>" task; the harness de-dupes by title (AC80#2).
    materialise: (_project, { id }) => [{
      title: advisorContentTaskTitle(id),
      acceptanceCriteria: [
        `installer-skills/${id}-advisor/SKILL.md has a real trigger description (firing on the user's need) and a recommendation body, replacing the template-rendered placeholder`,
      ],
    }],
  };
}
```
**AC80#3 no-op reporting:** `scaffoldAdvisor` returns `[]` when the advisor already exists, so `changedPaths` is
empty and `formatResult` prints no "changed:" line — but the task may STILL be (idempotently) materialised, and
the harness will report `materialised: 0` (already present) on a re-run. To make the no-op observable and exact
(AC80#3 "the command is a no-op"), the CLI leaf compares the result and prints a friendly "advisor already exists
(no changes)" when BOTH `changedPaths` is empty AND `materialisedTaskTitles` is empty (a true second run);
otherwise it prints the scaffolded summary + the materialised line. (Keep the spec's `summary` neutral; the leaf
formats the no-op vs first-run distinction — output is not a port, doc 13 §3.)

### `advisorRemoveSpec()` — the `bundle <id> advisor remove` mutation
```ts
export function advisorRemoveSpec(): OperationSpec<AdvisorInput> {
  return {
    summary: (_project, { id }) => `advisor remove for ${id}`,   // refine to report removed-vs-nothing (see below)

    check: (project, { id }) => {
      if (!(project.bundles as ReadonlyMap<string, BundleManifest>).has(id))
        throw new NotFoundError(`bundle "${id}" is not an enabled bundle`);
    },

    // ③ APPLY — delete the advisor dir if present; "nothing to remove" + no change when absent (AC81#1/#3).
    apply: ({ fs, backlog, root }, _project, { id }) => {
      const dirAbs = join(root, advisorSkillDir(id));
      if (!fs.exists(dirAbs)) {
        // AC81#3: absent → make NO change (do not delete, do not touch the task) and report "nothing to remove".
        return { warnings: [`no advisor for "${id}" — nothing to remove`] };   // the leaf prints this; exit 0
      }
      fs.remove(dirAbs);                                                        // AC81#1: recursive delete of the dir
      // AC81#2: archive the "Write advisor content for <id>" task if still OPEN (not Done/archived).
      const authoringRoot = join(root, AUTHORING_BACKLOG_DIR);
      const title = advisorContentTaskTitle(id);
      const open = backlog.listTasks(authoringRoot).find((t) => t.title === title && t.status !== "Done");
      if (open !== undefined) backlog.archiveTask(authoringRoot, open.id);
      return { changedPaths: [dirAbs] };
    },
  };
}
```
**Notes on `remove`:**
- `apply` MAY take + call the `backlog` port (it is on `ApplyContext` — `{ fs, backlog, root }`). doc 13 §1:
  operations orchestrate effects; this is a legitimate use (mirrors how `init`'s apply uses `backlog`). The archive
  is NOT a ⑤ MATERIALISE concern (that beat only CREATES tasks); closing a task is an APPLY-time effect.
- `listTasks` (FakeBacklog + BacklogCli) already EXCLUDES archived tasks, so a second `remove` finds no open task —
  idempotent. The `t.status !== "Done"` guard implements "if still OPEN" (doc-10 row 177 step 2): a Done task is
  left as-is (the author already closed it). [Brief permits "set Done OR archive — pick one"; this picks ARCHIVE
  via `archiveTask`, matching doc-10's "close/archive" and the destructive `bundle remove` precedent (doc-10 row
  153 step 5 archives the bundle's authoring tasks).]
- AC81#3 absent case: returns ONLY a warning (no `changedPaths`, no task touch). The leaf prints the warning to
  stderr and the summary "nothing to remove" to stdout; exit 0 (a no-op success, like a clean re-run — NOT an
  error). The advisor dir is NOT created, and the task (if any) is NOT touched.

> ④ RERENDER on `remove`: the advisor is not part of the front-door/menu derivation, so deleting it leaves the
> rerender diff empty (it re-renders `AGENTS.md`/installer SKILL.md from the manifest, which the advisor does not
> feed). Harmless. (The advisor SKILL.md is a *bundle* recommend-skill, scanned at install via the project's
> installer-skills scope — it is not a derived front-door artefact.)

### Shared input type
```ts
/** The input to both advisor commands: the target bundle id (selected by the `bundle <id>` routing). */
export interface AdvisorInput { readonly id: string; }
```
Reuse `AdvisorDeps` from `advisor.ts` (it already carries `builtinTemplatesRoot` + optional `projectTemplateName`).

## PART 2 — TINY ADDITIONS TO `src/core/operations/advisor.ts`

- `export function advisorSkillDir(id: string): string` = `join("installer-skills", `${id}-advisor`)` (the dir
  `remove` deletes; `advisorSkillPath` is `join(advisorSkillDir(id), "SKILL.md")` — refactor `advisorSkillPath` to
  build on it so they cannot drift).
- `export function advisorContentTaskTitle(id: string): string` = `Write advisor content for ${id}` (the single
  source of the task title, used by `create-bundle.ts`'s `perBundleAuthoringTasks` AND both advisor commands).

These stay PURE (string/path only) — the import-boundary rule is trivially satisfied.

## PART 3 — THE CLI MODULE (`src/cli.ts`, add ONE `bundleAdvisorModule`)

A `PerBundleCommandModule` with ONLY `add` and `remove` leaves (no `<name>`, no `--path`, no `list`). Model it on
the SHAPE of `bundleMetaModule`/`bundleSkillsModule` but simpler (the subcommands take NO positional). The host
`<id>` is already resolved + enabled-guarded by the per-bundle routing and threaded in.

```ts
const bundleAdvisorModule: PerBundleCommandModule = {
  register(sub, ctx, root, id) {
    const advisor = sub
      .command("advisor")
      .description("scaffold or remove this bundle's pull-UX advisor (the one recommend-on-match skill) (doc 10)");

    // ── advisor add ───────────────────────────────────────────────────────────────────────────────────────────
    // Render the advisor stub (no-op if it already exists) + materialise the "Write advisor content" task. The
    // SAME action `bundle new` step 6 runs, exposed standalone. No positional, no flags.
    const addLeaf = advisor
      .command("add")
      .description("render the advisor stub + queue its content-writing task (no-op if it already exists) (doc 10)")
      .action(() => {
        const result = runMutation(
          lifecycleDepsFor(ctx, root), { root },
          advisorAddSpec({ builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot }),
          { id });
        // AC80#3: a true no-op (advisor already present AND the task already materialised) prints a friendly line;
        // otherwise the normal result (scaffolded path + materialised: N).
        if (result.changedPaths.length === 0 && result.materialisedTaskTitles.length === 0) {
          ctx.io.out.write(`advisor for ${id} already exists — nothing to do\n`);
        } else {
          ctx.io.out.write(formatResult(result));
        }
      });
    withExamples(addLeaf, [
      { command: `wpm bundle ${id} advisor add`, note: "scaffold the advisor stub + queue writing its content" },
    ]);

    // ── advisor remove ────────────────────────────────────────────────────────────────────────────────────────
    // Delete installer-skills/<id>-advisor/ + archive the open content task; "nothing to remove" when absent.
    const removeLeaf = advisor
      .command("remove")
      .description("delete this bundle's advisor stub + archive its content-writing task (doc 10)")
      .action(() => {
        const result = runMutation(
          lifecycleDepsFor(ctx, root), { root }, advisorRemoveSpec(), { id });
        // AC81#3: absent → the spec returns only a warning, no changed paths → print "nothing to remove".
        if (result.changedPaths.length === 0) {
          ctx.io.out.write(`no advisor for ${id} — nothing to remove\n`);
        } else {
          ctx.io.out.write(formatResult(result));
        }
        writeWarnings(ctx, result.warnings);
      });
    withExamples(removeLeaf, [
      { command: `wpm bundle ${id} advisor remove`, note: "delete the advisor stub + close its content task" },
    ]);
  },
};
```
- Append `bundleAdvisorModule` to `PER_BUNDLE_MODULES` (after `bundleInstallerSkillsModule`).
- Import `advisorAddSpec`, `advisorRemoveSpec` from `./core/operations/advisor-commands.js`.
- NO new completion specs: `add`/`remove` take no positional argument to complete. The `<id>` already completes via
  the `bundle` spec (`bundle-ids`). The subcommand NAMES (`add`/`remove`) are auto-completed by commander's tree
  (the existing `computeCompletions` per-bundle recursion offers them on `bundle <id> advisor <tab>`).

> The advisor group itself (`advisor` with no sub) prints help listing add/remove (commander auto). A bare `bundle
> <id> advisor` with no subcommand → commander's "help / missing subcommand" (exit ≠ 0 is acceptable; not an AC).

## PART 4 — TEST PLAN (unit in-process + real-binary E2E; every AC mapped)

### CLI unit (`test/unit/cli/bundle-advisor-commands.test.ts`, NEW — mirror `bundle-version-commands.test.ts`)
Seed `/proj` with bundle `a` (a target `claude-code` in the manifest), init the authoring backlog, and seed the
project template snippets INCLUDING `advisor.SKILL.md.tmpl` + the front-door/orchestrator snippets the ④ RERENDER
needs (copy the `bundle-version-commands.test.ts` seed — it already seeds `advisor.SKILL.md.tmpl`). Use `run()`
in-process over `MemoryFileSystem` + `FakeBacklog`.

- **80#1 scaffold** — `bundle a advisor add` (no advisor yet) → exit 0; the stub exists at
  `${PROJ}/installer-skills/a-advisor/SKILL.md`; its content has the substituted `name: a-advisor` frontmatter +
  the snippet's placeholder body (assert the rendered snippet markers; NO invented prose); the summary/changed
  line printed.
- **80#2 materialise** — the SAME `add` materialised the **"Write advisor content for a"** task (assert via the
  FakeBacklog `listTasks(AUTHORING)` titles); `materialised: 1` in stdout. AND **idempotent by title**: a SECOND
  `add` materialises NO duplicate (the title appears exactly once); the no-op message is printed (changedPaths
  empty AND no new task) — AC80#3.
- **80#3 no-op** — pre-create the advisor (run `add` once), then `add` again → exit 0; stdout says "already exists
  — nothing to do"; the SKILL.md bytes are UNCHANGED (capture before/after); the task count is unchanged (still
  exactly one "Write advisor content for a").
- **80#4 outside-project** — `bundle a advisor add` from `/nowhere` → exit 1; stderr names `manifest.yml` + `init`.
  **id completes from enabled bundles** (`__complete bundle <tab>` includes `a`).
- **80#5 help** — `bundle a advisor add --help` → Usage + Example; exit 0.
- **81#1 delete-dir** — after an `add`, `bundle a advisor remove` → exit 0; the directory
  `${PROJ}/installer-skills/a-advisor/` no longer exists (and its SKILL.md is gone).
- **81#2 archive-open-task** — after `add` (task OPEN), `remove` → the "Write advisor content for a" task is
  archived (assert `listTasks(AUTHORING)` — which excludes archived — no longer contains the title; AND
  `taskDetail` shows `archived: true`). EDGE: if the task was already `Done` before `remove`, the task is LEFT (not
  archived) — seed a Done task via `editTask(...,{status:"Done"})` then `remove` and assert it is still present
  (not archived). [doc-10 "if still open".]
- **81#3 absent** — on a bundle with NO advisor, `bundle a advisor remove` → exit 0; stdout/stderr says "nothing to
  remove"; NO directory is created; the manifest + bundle.yml unchanged; the authoring backlog unchanged (no task
  archived — there was none). ALSO: removing when the advisor dir is absent but a stray "Write advisor content for
  a" task somehow exists → the task is NOT touched (AC81#3 "makes no change") because the dir-absence short-circuits
  BEFORE the task lookup.
- **81#4 outside-project** — `bundle a advisor remove` from `/nowhere` → exit 1; stderr names `manifest.yml`. id
  completes.
- **81#5 help** — `bundle a advisor remove --help` → Usage + Example; exit 0.
- **end-to-end in-process** — `add` (scaffold + task) → `remove` (dir gone + task archived) → `add` AGAIN (the
  advisor is re-scaffolded AND the task re-materialised, since the prior one was archived — a fresh title-idempotent
  create because the archived task is excluded from `listTasks`). Assert the round-trip; note in a comment that
  re-add after remove gets a fresh task (archived ≠ present).
- **rerender** — after `add`, `${PROJ}/AGENTS.md` exists (the harness re-rendered; the advisor does not change it,
  but the beat ran).
- **advisor group help** — `bundle a advisor --help` lists `add` and `remove`.
- **completion** — `__complete bundle a advisor <tab>` offers `add` and `remove` (commander's subcommand names).

### Real-binary E2E (append to `test/integration/cli.bundle-id.e2e.test.ts`, `describeIfBuilt`)
Through `dist/cli.js` + real `NodeFileSystem` tmpdir + real `backlog` (the materialise/archive path MUST run, not
skip). Reuse `projectWithWeb(dir)` + `authoringTaskTitles(proj)` (already in the file). Add a helper to read the
advisor SKILL.md path. NOTE: a fresh `bundle new web` ALREADY scaffolds the advisor (step 6) AND materialises the
"Write advisor content for web" task — so the E2E must account for that baseline:

- **advisor add (idempotent on a fresh bundle)** — `projectWithWeb` already created the advisor via `bundle new`.
  Assert the stub EXISTS at `bundles/web`'s project root `installer-skills/web-advisor/SKILL.md` with `name:
  web-advisor`; the "Write advisor content for web" task is already in `.authoring-backlog` (from `bundle new`).
  Then `bundle web advisor add` → exit 0; stdout says "already exists — nothing to do" (the no-op, AC80#3); the
  task count for "Write advisor content for web" is STILL exactly one (idempotent, AC80#2).
- **advisor add (scaffold cold) — the `--no-advisor` path** — `bundle new doc --no-advisor` (creates `doc` WITHOUT
  the advisor + WITHOUT the task). Assert NO `installer-skills/doc-advisor/` and NO "Write advisor content for doc"
  task. Then `bundle doc advisor add` → exit 0; stdout shows the scaffolded path + `materialised: 1`; the stub now
  EXISTS at `installer-skills/doc-advisor/SKILL.md` with `name: doc-advisor` + the placeholder body (NO invented
  prose); **the "Write advisor content for doc" task is NOW materialised in `.authoring-backlog`** (assert via
  `authoringTaskTitles(proj)`). The loop-closure proof (AC80#1 + AC80#2, cold).
- **advisor remove (dir gone + task archived)** — on the `doc` bundle (advisor added above, task OPEN), `bundle doc
  advisor remove` → exit 0; the directory `installer-skills/doc-advisor/` no longer exists (existsSync false); AND
  the "Write advisor content for doc" task is no longer in `backlog task list --plain` for `<proj>/.authoring-
  backlog` (archived — assert via `authoringTaskTitles`). [If `backlog` keeps archived tasks visible in a separate
  view, assert the ACTIVE list excludes it — `authoringTaskTitles` runs `task list --plain`, which shows active
  only.]
- **advisor remove (nothing to remove)** — `bundle new doc2 --no-advisor` (no advisor); `bundle doc2 advisor
  remove` → exit 0; stdout says "nothing to remove"; NO directory created; the `.authoring-backlog` unchanged.
- **advisor add → remove → add round-trip (real binary)** — on a `--no-advisor` bundle: `add` (scaffold + task) →
  `remove` (dir gone + task archived) → `add` AGAIN → the stub is re-scaffolded AND a FRESH "Write advisor content"
  task is materialised (the archived one does not block the title-idempotent create). Assert exit 0 each step + the
  final stub present.
- **help** — `bundle web advisor add --help` → contains `bundle web advisor add`, Usage, Example;
  `bundle web advisor remove --help` likewise.
- **completion** — `__complete bundle web advisor` → offers `add` and `remove`.

> IMPORTANT (per the worker brief): run vitest ONE process at a time. The integration project is
> `fileParallelism:false` over the shared real-backlog + dist state; never launch two vitest runs concurrently.

---

## Dev Notes

### Files to ADD
- `src/core/operations/advisor-commands.ts` — `advisorAddSpec` + `advisorRemoveSpec` + `AdvisorInput` (the two
  command operations; the shared scaffold helper stays in `advisor.ts`).
- `test/unit/cli/bundle-advisor-commands.test.ts` — the new in-process CLI suite.
- (No new model/service files — Q needs NO model/schema change.)

### Files to CHANGE
- `src/core/operations/advisor.ts` — add `advisorSkillDir(id)` + `advisorContentTaskTitle(id)` (refactor
  `advisorSkillPath` to build on `advisorSkillDir`).
- `src/core/operations/create-bundle.ts` — `perBundleAuthoringTasks` uses `advisorContentTaskTitle(id)` for the
  advisor task TITLE (pure refactor; byte-identical string).
- `src/cli.ts` — add `bundleAdvisorModule`; append to `PER_BUNDLE_MODULES`; import the two specs.
- `test/integration/cli.bundle-id.e2e.test.ts` — append the advisor real-binary E2E block.

### Architecture constraints (doc 13 — HARD)
- **Core boundary**: the new operations file + the advisor.ts additions stay PURE — import only
  model/lifecycle-types/`node:path` + the sibling `advisor.ts`/`create-bundle.ts` helpers, NEVER
  `node:fs`/`commander`/`execa`. (`core-boundary.test.ts` + Biome `noRestrictedImports` enforce.) The dir-existence
  PROBE + the delete + the archive all go through the injected `fs`/`backlog` ports inside the spec's `apply` (which
  RECEIVES them on `ApplyContext`) — NOT direct node calls.
- **Core is synchronous**; all actions sync.
- **Error model** (doc 13 §7): a non-enabled id → the routing's + the spec's `NotFoundError` (exit 1). Absent
  advisor on `remove` is NOT an error (AC81#3) — exit 0 with a "nothing to remove" message. Outside-project → the
  routing's `NotFoundError` (exit 1). No `UsageError` path (the subcommands take no validated argument).
- **Lifecycle**: both `add` and `remove` ride `runMutation`. `add` has ⑤ MATERIALISE (the one advisor-content
  task); `remove` has NO materialise (it ARCHIVES, an apply-time effect via the backlog port). ④ RERENDER runs on
  both but the advisor does not feed the front-door, so the diff is benign.
- **⑤ MATERIALISE target**: the harness materialises into `join(root, AUTHORING_BACKLOG_DIR)` — already handled by
  `runMutation`. The `remove` archive also targets `join(root, AUTHORING_BACKLOG_DIR)` (the SAME authoring root) —
  match the constant, do not hardcode the dir.

### Reuse — do NOT reinvent
- `scaffoldAdvisor` (`advisor.ts`) — the stub render-unless-exists. AC80#1 + AC80#3 are this function. UNCHANGED.
- The "Write advisor content for `<id>`" task spec — the SAME one `perBundleAuthoringTasks` (create-bundle.ts) +
  `bundle-lifecycle.ts` (enable) already materialise. Centralise its TITLE via `advisorContentTaskTitle`.
- `runMutation` / `materialiseAuthoringTasks` (title-idempotent ⑤) — the harness gives AC80#2 for free.
- `archiveTask` / `listTasks` (BacklogMd port) — the deregister-by-title for `remove` (AC81#2); `listTasks` already
  excludes archived, giving idempotency.
- `fs.remove(dir)` (FileSystem port) — recursive, no-op-if-absent dir delete for `remove` (AC81#1).
- The CLI module shape: `bundleMetaModule`/`bundleSkillsModule` (a `PerBundleCommandModule` in `PER_BUNDLE_MODULES`,
  with `withExamples` on each leaf — but advisor's leaves take NO positional).
- The per-bundle routing (`requireEnabledBundle` + the threaded `root`/`id`): UNCHANGED — Q adds ONE module, no
  routing change (exactly as the J–P repeats did).

### Project Structure Notes
- Q is the LAST per-bundle family and the lightest: it ADDS no model/schema, REUSES the advisor scaffold + the
  doc-11 advisor task verbatim, and proves the per-bundle module registry scales to a command with NO positional
  argument (only `add`/`remove`). The genuinely-new code is `advisorRemoveSpec` (delete dir + archive task) — a
  ~15-line spec.
- The advisor is the bundle's ONE pull-UX skill — hence NO `<name>`/`list`/`--path` (contrast O/P which manage MANY
  named skills). This is a deliberate doc-10 asymmetry, not an omission.
- `advisor add` and `bundle new` step 6 are the SAME action by construction (they call the SAME `scaffoldAdvisor` +
  materialise the SAME-titled task) — so a bundle whose advisor was skipped at `new` (`--no-advisor`) and later
  added via `advisor add` is indistinguishable from one created with the advisor. Verified by the E2E `--no-advisor`
  → `advisor add` test.

### References
- [Source: docs/10-authoring-cli.md §Per-command actions rows 176/177 (`bundle <id> advisor add`/`remove`); line
  32 (the scaffold-or-queue principle: advisor add = template-driven stub + task-driven content, never authoring
  finished prose); line 25 (Structure, not content); line 34 (implicit re-render).]
- [Source: docs/11-authoring-process.md §3 (the "Write advisor content for `<id>`" authoring task, materialised by
  the advisor add action and by `bundle new`).]
- [Source: docs/06-project-skeleton.md (the advisor is the bundle's recommend-on-match pull-UX skill at the project
  root `installer-skills/<id>-advisor/`; installer-skills are install-time helpers union-scanned at install);
  docs/00 (vocabulary: the advisor / pull-UX).]
- [Source: docs/13-core-architecture.md §1 (ports/purity; operations MAY call the fs/backlog ports; the archive is
  an apply-time effect), §5/§8 (six-beat lifecycle: ④ RERENDER + ⑤ MATERIALISE title-idempotent), §7 (error model
  → exit codes; absent-on-remove is a no-op success, not an error).]
- [Source: src/core/operations/advisor.ts (`scaffoldAdvisor` + `advisorSkillPath` — the REUSED scaffold; Q adds
  `advisorSkillDir` + `advisorContentTaskTitle`); src/core/operations/create-bundle.ts (`perBundleAuthoringTasks`
  — the advisor task title source, centralised; the `bundle new` step-6 advisor scaffold call); src/core/
  operations/bundle-lifecycle.ts (enable's advisor scaffold composition — the same action); src/core/operations/
  lifecycle.ts (`runMutation` six-beat harness + `materialiseAuthoringTasks` — title-idempotent ⑤); src/core/
  ports/backlog.ts (`archiveTask`/`listTasks` — the close-task contract); src/core/ports/filesystem.ts
  (`remove` — recursive dir delete); src/cli.ts `bundleMetaModule` + `PER_BUNDLE_MODULES` (the module shape +
  registry).]
- [Source: _bmad-output/implementation-artifacts/stories/story-cli-bundle-installer-skills.md — Family P, the most
  recent per-bundle module; this story is the per-bundle-module pattern applied to the no-positional advisor pair.]

## Dev Agent Record

### Agent Model Used
Opus 4.8 (1M context) — BMAD build worker. Skills actually run (Rule 3 evidence): `bmad-create-story` (this
story), `bmad-dev-story` (the two advisor command specs + the advisor.ts additions + the create-bundle title
refactor + the CLI module + unit tests), `bmad-qa-generate-e2e-tests` (the real-binary E2E block: add-idempotent /
scaffold-cold via `--no-advisor` / remove-dir-gone+task-archived / remove-nothing-to-remove / add→remove→add
round-trip).

### Completion Notes List
(to be filled by dev-story / qa)

### File List
(to be filled by dev-story / qa)

### Status
ready-for-dev
