# Story cli-bundle-remove-list — `bundle remove <id>` / `bundle list` (tasks 53 + 54)

Status: ready-for-dev

> BMAD create-story output (skill-driven; BMAD sprint-status/epics auto-discovery suppressed — the real contract
> is the Backlog.md backlog tasks 53/54, read via `backlog task <id> --plain`, NOT the foundation-epic-1
> `epics.md`/`sprint-status.yaml`; the orchestrator owns sprint status and forbids touching it). Steered from doc
> 10 lines 153–154 (`bundle remove`/`bundle list`), doc 08 §"Task tagging system" (`kind:state`/`kind:migration`
> are Backlog.md **labels**), doc 07 line 67 (the install-backlog is NOT a discoverable Backlog.md root), doc 11
> §3 (the per-bundle authoring task titles that name `<id>`), doc 13 §1/§3/§5/§7/§8 (purity / ports / six-beat
> lifecycle / error model / read trace).
>
> These are the two remaining **top-level `bundle` verbs** in CLI epic-2 (group **G2**). `bundle remove` is the
> MEATIEST remaining leaf — DESTRUCTIVE — and the ONE genuinely-new mechanic across G2+H is **author
> confirmation** (no prompt exists in the spine yet; the only `--confirmation-level` matches are a bundle's
> METADATA, unrelated). Otherwise `remove` COMPOSES existing pieces. `bundle list` is a read-only enumeration.
> Both are FIXED bundle verbs (in `RESERVED_BUNDLE_VERBS`), registered as named subcommands of the `bundle` group
> in `bundleModule` (exactly like `bundle new`/`enable`/`disable`), NOT per-bundle-`<id>` modules.

## Acceptance criteria (verbatim from the backlog — read via `backlog task <id> --plain`)

### TASK-53 — `bundle remove <id>` (a MUTATION, DESTRUCTIVE; doc-10 row 153)
1. The command requires author confirmation before acting because the operation is destructive.
2. On confirmation it removes the id from `manifest.yml` bundles if present, deletes the bundle directory from
   disk, deletes the advisor stub at `installer-skills/id-advisor/` if present, and archives the authoring tasks
   whose titles name the bundle.
3. Derived artefacts are re-rendered and a summary of what was removed is printed.
4. Declining the confirmation makes no change and exits without error.
5. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting init or the `-C`
   override; the id positional completes from current bundles.
6. Help output is substantive (description, synopsis, the id positional, an example); on success exits 0.

### TASK-54 — `bundle list` (a READ; doc-10 row 154)
1. The command enumerates `manifest.yml` bundles and prints, per bundle, its id, the version from `bundle.yml`,
   and the counts of `kind:state` and `kind:migration` tasks in its install-backlog.
2. The command reads and reports only, with no change on disk, and exits 0 on success.
3. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting init or the `-C`
   override.
4. Help output is substantive (description, synopsis, an example).

## doc-10 contract (cite the rows)

> `bundle remove <id>` (row 153): "1. Confirm with the author (destructive). 2. Remove `<id>` from
> `manifest.yml.bundles` if present. 3. Delete `bundles/<id>/` from disk. 4. Delete the advisor stub
> `installer-skills/<id>-advisor/` if present. 5. Archive the bundle's authoring tasks in `.authoring-backlog/`
> (the ones whose titles name `<id>`). 6. Re-render derived artefacts. 7. Print what was removed." [Source: docs/10
> §Per-command actions row 153.]

> `bundle list` (row 154): "1. Enumerate `manifest.yml.bundles`. 2. For each: read `bundle.yml` (version), scan
> install-backlog for `kind:state` and `kind:migration` task counts. 3. Print table." [Source: docs/10 row 154.]

## ARCHITECTURE COMPLIANCE (doc 13 — the fixed principles)

- **Pure core, effects via injected ports** (doc 13 §1): the operation modules under `src/core/operations/` import
  only the model/errors/services + the ports + `node:path` — NEVER `node:fs`/`commander`/`execa`. The
  core-boundary lint test (`test/integration/core-boundary.test.ts`) fails the build on a violating import.
  [Source: architecture.md §"The enforced boundary"; AGENTS.md "Enforced architectural invariant".]
- **Six-beat lifecycle** (`lifecycle.ts`): `runMutation` = ①LOAD ②CHECK ③APPLY ④RERENDER ⑤MATERIALISE ⑥RESULT;
  `runRead` = ①LOAD → projection → ⑥RESULT (touches nothing). `remove` rides `runMutation`; `list` rides
  `runRead`. [Source: docs/13 §5/§8; `src/core/operations/lifecycle.ts`.]
- **Error model** (doc 13 §7): `UsageError` → exit 2 (a bad CLI argument); `NotFoundError`/`ValidationError`/
  `ConflictError` (DomainError) → exit 1; help/version → 0. The shared handler in `src/util/exit.ts` maps every
  outcome; the operations + the CLI shell never call `process.exit`. [Source: docs/13 §7.]
- **Output is not a port** (doc 13 §3): all human formatting (the removal summary, the list table) lives in the
  CLI shell `src/cli.ts`, never in the core.
- **The prompt + every `process.stdin` read lives in the CLI shell, NOT core** (the confirmation decision is made
  in the shell, like the existence-probe-in-CLI pattern; the pure op runs only when confirmed).

## Placement: G2 verbs are FIXED `bundle` subcommands in `bundleModule`

`new`/`enable`/`disable`/`remove`/`list`/`template` are the RESERVED bundle verbs (`RESERVED_BUNDLE_VERBS`,
`src/core/model/ids.ts:33`). `isPerBundleInvocation`/`dispatchPerBundle` already EXCLUDE reserved verbs (a token
that IS a reserved verb is NOT routed to the per-bundle space), so `remove`/`list` go through commander's main
program. Register them as `.command("remove")`/`.command("list")` on the `bundle` group inside `bundleModule`
(`src/cli.ts` ~line 1472), right beside `new`/`enable`/`disable`. [Source: docs/10 line 150 (the verb list);
`src/cli.ts` `bundleModule`, `isReservedBundleVerb`.]

No routing change is needed — the existing dispatch already handles the verb/`<id>` disambiguation. The completion
specs go in `COMPLETION_SPECS` (top-level), NOT `PER_BUNDLE_COMPLETION_SPECS`.

---

## PART A — `bundle remove <id>` (task-53) — THE DESTRUCTIVE LEAF

### A0. THE CENTRAL DESIGN DECISION — author confirmation (record in Completion Notes)

AC53#1 requires confirmation BEFORE acting; AC53#4 requires that DECLINING makes NO change and exits 0 (no error).
The spine has no prompt mechanism. **Design (decided here):**

- **Add a `--yes` flag** (commander `.option("-y, --yes", ...)`) to the `remove` leaf to SKIP the prompt (the
  scriptable / non-interactive affirmative).
- **When `--yes` is absent**, the CLI shell PROMPTS interactively: print a confirmation question to stderr and read
  one line from `process.stdin`; treat a `y`/`yes` (case-insensitive) answer as confirmation, anything else
  (including EOF / empty / a non-TTY with no input) as DECLINE.
- **The decision is made in the CLI shell** (the existence-probe-in-CLI pattern, doc 13 §3 — the pure op has no
  stdin port). The pure `removeBundleSpec` runs ONLY when confirmed. A declined run prints a friendly line (e.g.
  `aborted — nothing removed`) to stdout and **returns exit 0** (NOT an error — AC53#4 says "exits without error").
- **Testability:** the real-binary E2E passes `--yes` for the destructive path (deterministic, no TTY needed), and
  simulates DECLINING by invoking WITHOUT `--yes` and piping `"n\n"` (or empty) to stdin in a non-TTY — which the
  shell reads as a decline, asserting exit 0 + no change. The in-memory unit tests drive the pure
  `removeBundleSpec` directly (confirmation is a shell concern, so the spec is always "already confirmed").

> Why a flag PLUS a prompt (not just a flag)? AC53#1 says the command "requires author confirmation before acting"
> — a bare `--yes`-only design would NEVER prompt, so the *interactive* requirement would be unmet. Why read stdin
> rather than commander? commander has no built-in prompt; reading one line of stdin in the shell is the minimal,
> testable mechanism and keeps `process.stdin` out of the core. EOF/non-TTY-with-no-input ⇒ decline is the SAFE
> default for a destructive op (never destroy without an explicit yes).

#### The stdin read — a tiny shell helper (`src/util/confirm.ts`, NEW)

A small impure-shell util (it may import `node:*`; it is NOT under `src/core/`). It reads one line synchronously
from a provided input stream and resolves a boolean. To keep `run()`/the action testable WITHOUT a real TTY and
without coupling to `process.stdin` directly, thread an INPUT source through `CliIo` (see A1). Shape:

```ts
/** Read a y/N answer from `input`; resolves true iff the first line is y/yes (case-insensitive). EOF/empty ⇒ false. */
export async function readConfirmation(input: NodeJS.ReadableStream): Promise<boolean> { … }
```

Implementation: accumulate `data` chunks until the first newline or `end`, lowercase+trim the first line, return
`line === "y" || line === "yes"`. (Use the stream's async iterator or `once("data")`/`once("end")`; no readline
dependency needed.) Keep it dependency-free and synchronous-feeling (await a one-line read). It is exercised by a
focused unit test feeding a `Readable.from(["y\n"])` / `Readable.from(["n\n"])` / `Readable.from([])`.

### A1. Thread an input stream through `CliIo` (so the prompt is testable)

`CliIo` (`src/util/exit.ts`) currently bundles `out`/`err`/`debug`. Add an OPTIONAL `in?: NodeJS.ReadableStream`
(the confirmation input source). The real entry point (`cli.ts` tail, `isMainModule()`) sets `in: process.stdin`;
tests pass a `Readable.from([...])`. The `remove` action reads `ctx.io.in` for the prompt. Keep it OPTIONAL so
every existing `CliIo` construction (smoke tests, other commands) is unaffected — a command that never prompts
ignores it. [Source: the I/O-bundle pattern in `src/util/exit.ts` + `cli.ts`'s `io` construction.]

> If `ctx.io.in` is `undefined` AND `--yes` was not passed, treat as a decline (no input source ⇒ cannot confirm ⇒
> safe abort). This makes the behaviour total.

### A2. THE CORE OPERATION (`src/core/operations/bundle-remove.ts`, NEW)

A new operations file declaring ONE `OperationSpec<RemoveBundleInput>` ridden by `runMutation`. It COMPOSES the
existing teardown pieces — it is "the destructive twin of `disable` + `advisor remove`, generalised to the whole
bundle". Pure over the FileSystem + BacklogMd ports.

```ts
export interface RemoveBundleInput { readonly id: string; }

export function removeBundleSpec(): OperationSpec<RemoveBundleInput> {
  return {
    summary: (_project, { id }) => `removed bundle ${id}`,   // refine: see A6 (report what was removed)
    // ② CHECK — NO membership guard that rejects: `remove` must work whether or not the id is enabled.
    //   doc-10:153 step 2 says "remove from manifest IF PRESENT" + step 3 deletes the dir unconditionally. So a
    //   disabled-but-present bundle dir is still removable. The only hard failure is a totally-unknown id with NO
    //   dir AND NO manifest entry → a NotFoundError (exit 1, nothing changed). (Decide: raise NotFound when
    //   neither the manifest lists it NOR bundles/<id>/ exists — there is genuinely nothing to remove.)
    check: (project, { id }) => { /* if !enabled && !dirExists(...) → throw NotFoundError */ },
    apply: ({ fs, backlog, root }, project, { id }) => { /* steps 2–5, see A3 */ },
    // NO materialise — remove ARCHIVES tasks (an apply-time BacklogMd effect), it does not CREATE any.
  };
}
```

CAUTION on the CHECK `dirExists`: the pure `check` has NO port (its signature is `(project, input) => void`). So
the directory-existence half of the "nothing to remove" guard must be done in the CLI shell BEFORE `runMutation`
(the existence-probe-in-CLI pattern — exactly how `bundle enable` does its dir-existence guard in `apply`'s first
line, and how `files add` probes on-disk existence in the shell). **Resolution:** the shell probes
`fs.exists(join(root, "bundles", id, "bundle.yml"))` OR manifest-membership; if NEITHER, raise `NotFoundError`
(exit 1) in the shell before confirming/running. The spec's `check` can additionally assert (defense-in-depth) but
the load-bearing probe is in the shell where the fs port lives. (Simpler: do the whole "does this bundle exist at
all" probe in the shell; let the spec assume it exists.)

### A3. ③ APPLY — the four teardown steps (doc-10:153 steps 2–5)

All effects go through the injected `fs`/`backlog` ports on `ApplyContext`. Accumulate `changedPaths`.

**Step 2 — drop `<id>` from `manifest.yml.bundles` IF PRESENT** (reuse the `disable` manifest edit):
```ts
const manifestPath = join(root, "manifest.yml");
const bundles = project.manifest.bundles as readonly string[];
const index = bundles.indexOf(id);
if (index >= 0) {
  const next = editYaml(fs.read(manifestPath), (doc) => { doc.deleteIn(["bundles", index]); });
  fs.write(manifestPath, next);
  changedPaths.push(manifestPath);
}
```
This is byte-for-byte the `disableBundleSpec` edit (`bundle-lifecycle.ts` ~line 152), guarded by `index >= 0` so a
disabled bundle (absent from the manifest) is fine. Comment-preserving via the task-13 `editYaml`.

**Step 3 — delete `bundles/<id>/` from disk** (the fs port `remove` is recursive + no-op-if-absent):
```ts
const bundleDir = join(root, "bundles", id);
fs.remove(bundleDir);
changedPaths.push(bundleDir);
```

**Step 4 — delete the advisor stub `installer-skills/<id>-advisor/` IF PRESENT** (reuse `advisorSkillDir`):
```ts
const advisorDir = join(root, advisorSkillDir(id));   // advisorSkillDir from ./advisor.js
const advisorRemoved = fs.exists(advisorDir);
if (advisorRemoved) { fs.remove(advisorDir); changedPaths.push(advisorDir); }
```
Probe existence first so the summary can report whether an advisor WAS removed (AC53#2 says "if present"); `remove`
is no-op-if-absent anyway, but the report needs the boolean.

**Step 5 — archive the bundle's authoring tasks whose titles name `<id>`** (generalise `advisor remove`'s
archive-by-title to ALL per-bundle tasks). THIS IS THE PREFIX-COLLISION-SENSITIVE STEP — see A4.
```ts
const authoringRoot = join(root, AUTHORING_BACKLOG_DIR);   // the project's own Backlog.md root
let archivedCount = 0;
for (const task of backlog.listTasks(authoringRoot)) {
  if (titleNamesBundle(task.title, id) && task.status !== "Done") {   // see A4 for titleNamesBundle
    backlog.archiveTask(authoringRoot, task.id);
    archivedCount += 1;
  }
}
```
(Decide whether to archive Done tasks too. doc-10:153 says "archive the bundle's authoring tasks". `advisor remove`
only archives OPEN tasks — leaving a Done task as the author closed it. For consistency, ARCHIVE only non-Done
tasks here too, OR archive all that name the bundle since the bundle is being destroyed. RECOMMEND: archive ALL
tasks that name the bundle regardless of status — the bundle is gone, so its authoring tasks are tombstones; but
`listTasks` already excludes already-archived ones, so re-runs are idempotent. Pick one, record it in Completion
Notes, and TEST the chosen behaviour. The prefix-safety test does not depend on this choice.)

### A4. PREFIX-COLLISION SAFETY — the `titleNamesBundle(title, id)` predicate (CRITICAL — the Q review caught this class)

doc-11 §3 authoring-task titles that name a bundle take these shapes (all observed in
`perBundleAuthoringTasks`/`bundle-version`/`bundle-requires`/`advisor`):
- `Plan bundle <id>`                                  (id at the END)
- `Fill install-backlog for <id>`                     (`for <id>`, id at the END)
- `Author payload for <id>`, `Verify DoD compliance for <id>`, `Simulate fresh-install executor for <id>`, …
- `Write advisor content for <id>`                    (id at the END)
- `Write payload skill <name> for <id>`               (`for <id>`, id at the END, but `<name>` is mid-title)
- `Review state-tasks for <id> at <new-version>`      (id NOT at the end — trailed by `at <ver>`)
- `Consider migration tasks for <id> <prev>→<new>`    (id NOT at the end — trailed by the version arrow)
- `Review version constraint on <id> at <new-version>`(id mid-title, `on <id> at …`)
- `Adapt <id>'s install-backlog and payload to use <dep>` (id followed by `'s` — a possessive!)
- `Verify <id> no longer references <dep>`            (id mid-title)
- `Verify <id>'s install-backlog works on <agent>`   (id followed by `'s`)

So the id can appear: at the end, mid-title, or with a trailing `'s` possessive or version/word. A **bare substring
match is WRONG**: removing `web` would archive `web-extra`'s "Plan bundle web-extra" (substring `web` ⊂
`web-extra`). The DANGER token is a HYPHEN continuation (`web` vs `web-extra`) and an alphanumeric continuation.

**Robust predicate — match `<id>` as a WHOLE TOKEN bounded by a non-id-character (or string end), where an
id-character is `[A-Za-z0-9-]` (kebab-case ids contain hyphens):**

```ts
/** True iff `title` names `id` as a whole bundle token (not a prefix of a longer id like web ⊂ web-extra). */
function titleNamesBundle(title: string, id: string): boolean {
  // Escape regex metacharacters in id (ids are kebab-case [a-z0-9-], but escape defensively).
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Boundary: the char before id is start-or-non-[A-Za-z0-9-]; the char after id is end-or-non-[A-Za-z0-9-].
  // The "after" boundary is what stops `web` from matching inside `web-extra` (the `-` is an id char ⇒ no boundary).
  // A trailing possessive `'s`, a space, `→`, end-of-string all satisfy the after-boundary (none is [A-Za-z0-9-]).
  return new RegExp(`(^|[^A-Za-z0-9-])${esc}([^A-Za-z0-9-]|$)`).test(title);
}
```

WHY `[A-Za-z0-9-]` as the id-character class (not `\b`): JS `\b` treats `-` as a boundary, so `\bweb\b` WOULD match
inside `web-extra` (there's a word boundary at the hyphen) — exactly the bug. Excluding `-` from the boundary
character set is what makes `web` NOT match `web-extra` while still matching `web's`, `web `, `web→`, and `web` at
end-of-string. **This is the precise boundary the Q review's advisor-task class demanded.** TEST: a project with
bundles `web` AND `web-extra`, each with materialised tasks; `bundle remove web --yes` archives ONLY `web`'s tasks
(every `web-extra` task survives). Cover both at-end (`Plan bundle web`) and possessive (`Adapt web's … to use …`)
forms, and confirm `web-extra`'s same-shaped tasks are untouched.

> Export `titleNamesBundle` (or keep it module-private with a unit test) — a focused unit test over a hand-built
> list of the doc-11 titles for `web` vs `web-extra` is the cheapest proof of the boundary logic, independent of
> the real backlog.

### A5. ④ RERENDER — the bundle drops out of the menu (AC53#3)

`runMutation` reloads the POST-apply project (the manifest no longer lists `<id>`, and `bundles/<id>/` is gone) and
re-derives the front-door artefacts, so the removed bundle drops out of `AGENTS.md`/the installer menu
automatically (the same ④ beat `disable` relies on). The op adds NO rerender code. ASSERT in E2E: after
`bundle remove web --yes`, `AGENTS.md` no longer contains `web`.

> One caveat: ④ RERENDER reloads the project via `loadProject`, which reads EACH enabled bundle's `bundle.yml`. By
> step 2 the manifest no longer lists `<id>`, and step 3 deleted its dir — so the post-apply load does not try to
> read the deleted bundle's `bundle.yml` (it is no longer enabled). Order matters: drop-from-manifest (step 2) must
> precede or accompany delete-dir (step 3) so the reload is consistent. The apply runs steps 2→3→4→5 in order, then
> the harness reloads — consistent. (If the id was disabled-but-present, it was never in the manifest, so the
> reload never referenced it.)

### A6. ⑥ RESULT + the printed summary (AC53#3 step 7)

The summary must report WHAT was removed (the dir, whether an advisor was removed, N tasks archived). The
`OperationResult` carries `summary` + `changedPaths` + `materialisedTaskTitles`. To convey the advisor-removed
boolean + the archived count, EITHER:
- (a) fold them into the `summary` string the spec computes (the spec has the booleans/count in `apply` but the
  `summary` thunk runs over the post-apply project + input, NOT the apply outcome) — so this is awkward; OR
- (b) RECOMMENDED: thread the detail through the result by having `apply` build a precise summary is not possible
  (summary is separate). Instead, return the structured facts via `changedPaths` (the dir + advisor dir are in
  there) and let the CLI shell FORMAT the human summary from the result: count `changedPaths`, and the shell knows
  it called `remove`. Simpler still: have the spec's `summary` be a plain `removed bundle <id>` and let
  `formatResult` (already prints `changed: N path(s)` + `materialised: N`) carry the rest; ADD a bespoke
  shell-side line for the archived-task count by reading it off the result.

DECISION (record it): add an OPTIONAL field to the op's reporting by returning the archived count + advisor-removed
flag as part of the `ApplyOutcome.warnings`? No — warnings are for problems. CLEANEST: extend the printed summary
in the SHELL: the `remove` action prints `formatResult(result)` PLUS, if needed, the specifics. Since
`formatResult` already shows `changed: N path(s)`, and the dir + advisor + manifest are all in `changedPaths`, the
minimal compliant approach is: spec `summary` = `removed bundle <id>` and the shell prints `formatResult(result)`
(which lists changed-path count). To satisfy "a summary of WHAT was removed", make the spec's `summary` richer by
having `apply` stash the facts: return them via a small extension — OR compute the summary string inside `apply`
and pass it out. Since `OperationSpec.summary` is a separate thunk, the pragmatic move is: the spec returns the
counts by ALSO writing them into a field. **Final approach:** compute the summary in the spec's `summary` thunk
from what is DERIVABLE post-apply is impossible for the archived count → so the spec exposes the count by returning
it on the result through a thin mechanism: have `removeBundleSpec` close over a mutable `report` object its `apply`
fills, and its `summary` reads — both run within the same `runMutation` call, apply BEFORE summary. This is a known
in-repo idiom? CHECK: prefer the simplest thing that passes the AC. The AC only requires "a summary of what was
removed is printed" — listing the removed dir + advisor + archived-count in the shell output suffices.

SIMPLEST COMPLIANT IMPLEMENTATION: the spec's `apply` builds the human detail and the spec's `summary` is a static
`removed bundle <id>`; the SHELL prints `formatResult(result)` and the op ALSO returns `warnings: []`. Then add ONE
extra shell line listing specifics IF the result exposes them. To expose the archived count cleanly without
contorting the spec, **prefer the closure-report idiom**: `removeBundleSpec` returns a spec whose `summary` thunk
and `apply` share a closure variable; `apply` sets `report.archived`/`report.advisorRemoved`/`report.dirRemoved`,
and `summary` returns e.g. `removed bundle ${id}: deleted bundles/${id}/${advisorRemoved ? " + advisor" : ""},
archived ${archived} authoring task(s)`. Verify nothing else relies on `summary` being pure of apply state (it is
called AFTER apply in `runMutation` — `resolveSummary(spec.summary, postApply, input)` at ⑥, so the closure is set
by then). This keeps formatting policy in the shell while letting the spec state the precise outcome. Record the
chosen mechanism in Completion Notes.

### A7. THE CLI LEAF (`src/cli.ts` — inside `bundleModule`, beside `disable`)

```ts
const removeLeaf = group
  .command("remove")
  .description("remove a bundle entirely: drop it from the manifest, delete its dir + advisor, archive its tasks (doc 10)")
  .argument("<id>", "the bundle id to remove (its directory, advisor, and authoring tasks are deleted)")
  .option("-y, --yes", "skip the destructive-action confirmation prompt")
  .action(async (id: string, opts: { yes?: boolean }) => {
    const root = requireProject(ctx, parent);                      // AC53#5 (canonical no-project NotFound)
    // Probe existence (the shell owns the fs port): neither enabled NOR a present dir ⇒ NotFound (exit 1).
    const manifest = parseManifest(parseYaml(ctx.deps.fs.read(join(root, MANIFEST_FILE))));
    const enabled = manifest.ok && (manifest.value.bundles as readonly string[]).includes(id);
    const dirExists = ctx.deps.fs.exists(join(root, "bundles", id, "bundle.yml"))
                   || ctx.deps.fs.exists(join(root, "bundles", id));
    if (!enabled && !dirExists) {
      throw new NotFoundError(`bundle "${id}" not found — it is neither enabled nor present under bundles/${id}`);
    }
    // AC53#1/#4 — confirm unless --yes; decline ⇒ no change, exit 0.
    const confirmed = opts.yes === true
      ? true
      : (ctx.io.in !== undefined
          ? (ctx.io.err.write(`remove bundle "${id}"? this deletes bundles/${id}/ and its advisor. [y/N] `),
             await readConfirmation(ctx.io.in))
          : false);
    if (!confirmed) { ctx.io.out.write(`aborted — nothing removed\n`); return; }   // exit 0, AC53#4

    const result = runMutation(lifecycleDepsFor(ctx, root), { root }, removeBundleSpec(), { id });
    ctx.io.out.write(formatResult(result));                         // AC53#3 (summary of what was removed)
  });
withExamples(removeLeaf, [
  { command: "wpm bundle remove web-handoff --yes", note: "delete a bundle and all its scaffolding without prompting" },
]);
```

Notes:
- The action is `async` (the prompt awaits stdin). commander supports async actions, and `dispatchPerBundle`/`run`
  already `await program.parseAsync(...)` — so an async action's rejection still flows through `runWithExit`.
  (A fixed `bundle` verb goes through the MAIN program's `parseAsync`, which is awaited in `run()`'s final branch.)
- `MANIFEST_FILE` constant already exists in `cli.ts` (= `"manifest.yml"`).
- AC53#6 (help) is delivered by commander's auto-help + the `withExamples` block (the task-28 guard requires a
  description, a synopsis, the `<id>` positional with its meaning, and an example — all present).

### A8. COMPLETION — `bundle remove <id>` completes the id from current bundles (AC53#5)

Add to `COMPLETION_SPECS` (top-level):
```ts
"bundle remove": { args: ["bundle-ids"] },   // <id> — the currently-enabled bundles (same source `bundle disable` uses)
```
[Source: `src/completion/bundle-ids.ts` (the enabled-bundle source) + the existing `"bundle disable"` entry.]

> AC53#5 says "completes from current bundles". `bundle-ids` lists ENABLED bundles. A disabled-but-present bundle
> is removable too — but the completion contract says "current bundles", and `bundle-ids` (enabled) is the
> established, tested source the symmetric `disable` uses. Use `bundle-ids` for parity (record that disabled dirs
> are removable by typing the id even though completion lists only enabled ones — same as `disable`'s asymmetry is
> acceptable). If a `current-bundle-dirs` (enabled ∪ on-disk) source were wanted it would be a new source; NOT in
> scope — `bundle-ids` satisfies "current bundles".

---

## PART B — `bundle list` (task-54) — THE READ-ONLY ENUMERATION

### B0. WHAT IT PRINTS (AC54#1)

Per enabled bundle (`manifest.yml.bundles`): its `id`, the `version` from `bundles/<id>/bundle.yml`, and the COUNT
of `kind:state` vs `kind:migration` tasks in `bundles/<id>/install-backlog/`. Print a table (columns: id, version,
#state, #migration). Read-only, exit 0 (AC54#2).

### B1. READING THE `kind:` LABELS — fs-SCAN the install-backlog task files (doc 07:67 / doc 08)

`kind:state`/`kind:migration` are Backlog.md **labels** (doc 08 §"Task tagging system": "Kind | `kind:state` or
`kind:migration` (label, immutable)"; written `-l "kind:state,…"`). **CRITICAL — the install-backlog is NOT a
discoverable Backlog.md root** (doc 07 line 67): it is a recipe directory that ships to users, not a root the
`backlog` CLI auto-discovers from the project. So DO NOT use the `BacklogMd` port (it targets the
`.authoring-backlog` root only — see the no-mirror boundary in `src/core/ports/backlog.ts`). Instead **fs-SCAN**
`bundles/<id>/install-backlog/tasks/*.md` through the FileSystem port and count the label occurrences.

**HOW THE LABEL APPEARS IN A TASK FILE — verify empirically at build time:** Backlog.md writes task `.md` files
with YAML frontmatter; a `-l "kind:state,step:foo"` lands as a `labels:` frontmatter line (commonly
`labels: ["kind:state", "step:foo"]` or `labels:\n  - kind:state`). **Before writing the counter, create a real
labelled task with the `backlog` CLI in a tmp root and READ the resulting `.md`** to confirm the exact rendering,
then make the matcher tolerant of the forms Backlog.md actually emits. A robust matcher: read each task file's
text and test for the label token with a frontmatter-aware regex, e.g. count a file as `kind:state` iff its
frontmatter `labels` contains the exact token `kind:state` (match `\bkind:state\b` within the labels region, or
simply `/(^|[^\w:])kind:state(?![\w-])/m` over the whole file — `kind:state` is distinctive enough that a
whole-file token match is safe, but PREFER scoping to the `labels:` line/region to avoid a false hit from a task
body that mentions the literal string). Decide the exact matcher AFTER inspecting a real file; record it.

> The starter bundle template (`templates/bundle/default/files/install-backlog/tasks/`) ships a detect→setup→verify
> trio — but the shipped sample task `.md.tmpl` files may or may not carry `kind:` labels. CHECK whether the
> scaffolded `install-backlog/tasks/*.md` (post `bundle new`) carry any `kind:` labels; a fresh bundle may report
> `0 state, 0 migration` (correct — the author adds labelled tasks via `backlog` per doc 11 "Fill install-backlog").
> The E2E therefore creates a bundle, then CREATES a couple of labelled install-backlog tasks with the real
> `backlog` CLI (a `kind:state` and a `kind:migration`) so list reports non-zero counts (proving the scan).

### B2. THE READ — pure projection + the scanned counts threaded in (mirror `bundle <id> show`)

The pure projection cannot read disk (`fs` is not a read-spec input). So, exactly as `bundleFileTree` feeds
`showBundleSpec`, the CLI shell SCANS the install-backlogs through the fs port and threads the per-bundle counts
into the pure read spec as INPUT. NEW operations file `src/core/operations/bundle-list.ts`:

```ts
export interface BundleListRow { readonly id: string; readonly version: string;
                                 readonly stateCount: number; readonly migrationCount: number; }
export interface ListBundlesInput { /** per-bundle install-backlog label counts, scanned by the shell */
  readonly counts: ReadonlyMap<string, { state: number; migration: number }>; }

export function listBundlesSpec(): ReadSpec<ListBundlesInput, BundleListRow[]> {
  return {
    summary: "bundle list",
    project: (project, { counts }) => {
      const rows: BundleListRow[] = [];
      for (const [id, bundle] of project.bundles as ReadonlyMap<string, BundleManifest>) {
        const c = counts.get(id) ?? { state: 0, migration: 0 };
        rows.push({ id, version: bundle.version as string, stateCount: c.state, migrationCount: c.migration });
      }
      rows.sort((a, b) => a.id.localeCompare(b.id));   // deterministic order
      return rows;
    },
  };
}
```

`project.bundles` already holds each ENABLED bundle's parsed `bundle.yml` (the version comes from there — no extra
read needed for the version). The shell only needs to scan the install-backlogs for the label counts.

### B3. THE SHELL — scan counts + format the table (`src/cli.ts`)

A shell helper scans one bundle's install-backlog (the fs walk lives in the shell — it owns the port):
```ts
/** Count kind:state / kind:migration tasks under bundles/<id>/install-backlog/tasks/ via the fs port. */
function installBacklogKindCounts(fs: FileSystem, root: string, id: string): { state: number; migration: number } {
  const tasksDir = join(root, "bundles", id, "install-backlog", "tasks");
  if (!fs.exists(tasksDir)) return { state: 0, migration: 0 };
  let state = 0, migration = 0;
  for (const entry of fs.list(tasksDir)) {
    if (entry.kind !== "file" || !entry.name.endsWith(".md")) continue;
    const text = fs.read(join(tasksDir, entry.name));
    if (hasKindLabel(text, "state")) state += 1;          // hasKindLabel: the verified matcher from B1
    if (hasKindLabel(text, "migration")) migration += 1;
  }
  return { state, migration };
}
```
The `list` action:
```ts
const listLeaf = group
  .command("list")
  .description("list each enabled bundle with its version and its install-backlog state/migration task counts (doc 10)")
  .action(() => {
    const root = requireProject(ctx, parent);                       // AC54#3
    const manifest = parseManifest(parseYaml(ctx.deps.fs.read(join(root, MANIFEST_FILE))));
    const ids = manifest.ok ? (manifest.value.bundles as readonly string[]) : [];
    const counts = new Map(ids.map((id) => [id, installBacklogKindCounts(ctx.deps.fs, root, id)]));
    const { value: rows } = runRead(ctx.deps.fs, { root }, listBundlesSpec(), { counts });
    ctx.io.out.write(formatBundleList(rows));                        // AC54#1 table
  });
withExamples(listLeaf, [{ command: "wpm bundle list", note: "show each bundle's version + install-backlog task counts" }]);
```
`formatBundleList(rows)` renders an aligned table with a header (`id  version  state  migration`) and a `(no
bundles)` line when empty. Output lives in the shell (doc 13 §3). Read-only — `runRead` writes nothing (AC54#2).

### B4. AC54#3 / AC54#4

- AC54#3: `requireProject` raises the canonical `NotFoundError` (exit 1) naming `manifest.yml` + suggesting
  `init`/`-C` — the SAME message every project-bound read uses.
- AC54#4 (help): commander auto-help + `withExamples`. `list` has no positional/flags, so the task-28 guard needs
  only description + synopsis + example — present. (Per `withExamples`: a command with a trivial flag set still
  attaches an example here because the guard asserts one.)
- No completion spec needed (no positional/option value).

---

## TASKS / SUBTASKS

- [ ] **T1 (AC53#1/#4)** — confirmation mechanism: `src/util/confirm.ts` (`readConfirmation`) + add optional
  `in?: NodeJS.ReadableStream` to `CliIo` (`src/util/exit.ts`); set `in: process.stdin` in the `cli.ts` entry tail.
  Unit-test `readConfirmation` over `y\n`/`n\n`/empty.
- [ ] **T2 (AC53#2/#3)** — `src/core/operations/bundle-remove.ts` (`removeBundleSpec`): apply steps 2–5 composing
  `editYaml`(manifest) + `fs.remove`(dir) + `fs.remove`(advisor via `advisorSkillDir`) + archive-by-title; the
  closure-report summary. Unit-test the spec over the memory-fs + fake-backlog.
- [ ] **T3 (AC53#2 — prefix safety)** — `titleNamesBundle(title, id)` whole-token matcher; unit-test `web` vs
  `web-extra` over the doc-11 title shapes.
- [ ] **T4 (AC53 wiring)** — the `remove` leaf in `bundleModule` (async action, existence probe, confirm-or-abort,
  `runMutation`); `withExamples`; `"bundle remove": { args: ["bundle-ids"] }` in `COMPLETION_SPECS`.
- [ ] **T5 (AC54#1/#2)** — `src/core/operations/bundle-list.ts` (`listBundlesSpec`) + the shell scan
  (`installBacklogKindCounts`, the verified `hasKindLabel` matcher) + the `list` leaf + `formatBundleList`.
- [ ] **T6 (tests)** — in-process unit AC tests (memory ports) for both; real-binary E2E
  (`test/integration/cli.bundle-remove-list.e2e.test.ts`): remove `--yes` full teardown / remove declined (exit 0,
  no change) / `web` vs `web-extra` prefix collision / list with labelled install-backlog tasks. Help-contract +
  dispatch-DI assertions for the new leaves.
- [ ] **T7 (DoD)** — tsc clean, biome clean (incl. core-boundary), all green; public fns documented; no dead code.

## Dev Notes

### Files to CREATE
- `src/core/operations/bundle-remove.ts` — `removeBundleSpec` + `titleNamesBundle` (the prefix-safe matcher).
- `src/core/operations/bundle-list.ts` — `listBundlesSpec` + `BundleListRow`/`ListBundlesInput`.
- `src/util/confirm.ts` — `readConfirmation` (shell stdin read).
- `test/integration/cli.bundle-remove-list.e2e.test.ts` — the real-binary E2E (the brief's required scenarios).
- `test/unit/cli/bundle-remove-list-commands.test.ts` — in-memory AC tests.
- `test/unit/operations/bundle-remove.test.ts` (+ a `titleNamesBundle` unit) and a `bundle-list` projection unit,
  or fold into the cli unit file — match the repo's existing test layout (per-family unit file under
  `test/unit/cli/`, plus operation-level units where the logic warrants — `titleNamesBundle` DOES warrant one).

### Files to UPDATE (read first — see "current state / changes / preserve")
- `src/cli.ts` — `bundleModule` gains `remove` + `list` leaves; `COMPLETION_SPECS` gains `"bundle remove"`; add the
  shell helpers (`installBacklogKindCounts`, `formatBundleList`, `hasKindLabel`). PRESERVE: the existing
  `new`/`enable`/`disable` leaves, the routing, `requireProject`/`lifecycleDepsFor`/`formatResult`. The async
  `remove` action is new — confirm the main-program `parseAsync` await in `run()` covers it (it does).
- `src/util/exit.ts` — `CliIo` gains optional `in`. PRESERVE every existing field + all existing constructions
  (the new field is optional, so nothing else changes).

### Current state of the key UPDATE files (analysed)
- `src/cli.ts` `bundleModule` (~1472): registers `new`/`enable`/`disable` via `.command(...)` on the `bundle`
  group; each resolves the project via `requireProject` and rides `runMutation` with `lifecycleDepsFor`. The
  `remove`/`list` leaves slot in identically. The dynamic `bundle <id>` routing is UNAFFECTED (it excludes reserved
  verbs). PRESERVE the `formatResult`/`writeWarnings` helpers.
- `src/core/operations/bundle-lifecycle.ts` `disableBundleSpec.apply` (~152): the EXACT manifest-delete-by-index +
  `editYaml` pattern step 2 reuses. PRESERVE — `remove` does NOT modify this file; it copies the idiom.
- `src/core/operations/advisor-commands.ts` `advisorRemoveSpec.apply` (~118): the archive-by-title idiom
  (`listTasks(authoringRoot).find(t => t.title === title && t.status !== "Done")` → `archiveTask`). `remove`
  GENERALISES this from one exact-title to the `titleNamesBundle(title, id)` predicate over ALL tasks. PRESERVE the
  file; copy+generalise the idiom into `bundle-remove.ts`.
- `src/core/operations/advisor.ts` `advisorSkillDir(id)` (~52): the project-relative advisor dir — reused by step 4.
- `src/core/operations/lifecycle.ts` `runMutation`/`runRead` — the harness. `summary` thunk runs at ⑥ (AFTER apply),
  so the closure-report idiom for the rich `remove` summary is safe. PRESERVE.
- `src/core/ports/filesystem.ts` — `remove(path)` (recursive, no-op-if-absent), `list(path)`, `read`, `exists` —
  ALL the fs ops both commands need ALREADY EXIST. **No FileSystem port additions.** [Confirmed by reading the port.]
- `src/core/ports/backlog.ts` — `listTasks(root)`/`archiveTask(root, id)` — both present; targets the
  `.authoring-backlog` root only (the no-mirror boundary), which is exactly where `remove`'s archive runs. The
  install-backlog scan does NOT use this port (doc 07:67) — it is an fs scan.

### Testing standards summary
- vitest two projects (`unit` parallel in-memory; `integration` serial `fileParallelism:false` over the real
  `backlog` CLI + the built `dist/cli.js`). RUN ONE vitest process at a time (concurrent runs collide into false
  failures over shared real-`backlog`/`dist` state).
- E2E pattern: copy `test/integration/cli.bundle-lifecycle.e2e.test.ts` (the `cli()`/`wpm()`/`initProjectAt`/
  `authoringTaskTitles` helpers, `describeIfBuilt`). For the DECLINE path, drive stdin via `spawnSync(..., { input:
  "n\n" })` (a non-TTY) and assert exit 0 + no change. For `--yes`, no stdin needed. The
  `authoringTaskTitles(proj)` helper (lists `.authoring-backlog` tasks via the real `backlog`) verifies the
  archive (the bundle's tasks vanish from the active list; `web-extra`'s remain).

### Project structure notes
- G2 verbs are FIXED `bundle` subcommands (in `bundleModule`), NOT per-bundle modules — they do not touch
  `PER_BUNDLE_MODULES`/`buildPerBundleProgram`.
- The core import-boundary applies to `bundle-remove.ts` + `bundle-list.ts` (no `node:fs`/`commander`/`execa`).
  `src/util/confirm.ts` is shell (may import `node:*`).

### References
- [Source: docs/10 §Per-command actions rows 153 (`bundle remove`) + 154 (`bundle list`); line 150 (the reserved
  verb list).]
- [Source: docs/08 §"Task tagging system" + §"How these tags ride on Backlog.md" — `kind:state`/`kind:migration`
  are labels written `-l "kind:state,…"`; labels do not accumulate across `-l` flags.]
- [Source: docs/07 line 67 — the install-backlog is a shipped recipe dir, NOT a discoverable Backlog.md root ⇒ scan
  the files, don't use the BacklogMd port.]
- [Source: docs/11 §3 — the per-bundle authoring task titles (`Plan bundle <id>`, `… for <id>`, `Adapt <id>'s …`,
  `Verify <id> …`, the version-bump titles) that `remove` archives by `titleNamesBundle`.]
- [Source: docs/13 §1 (purity), §3 (ports + output-not-a-port), §5 (six-beat lifecycle), §7 (error model →
  exit codes), §8 (read trace).]
- [Source: src/cli.ts `bundleModule`/`disable`/`COMPLETION_SPECS`; src/core/operations/bundle-lifecycle.ts;
  src/core/operations/advisor-commands.ts; src/core/operations/advisor.ts; src/core/operations/lifecycle.ts;
  src/core/ports/filesystem.ts; src/core/ports/backlog.ts.]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.8 (1M context) — BMAD build worker.

### Completion Notes List
- RECORD: the confirmation mechanism actually built (`--yes` flag + the stdin-prompt-on-absence + how decline is
  detected: y/yes ⇒ confirm, else/EOF/no-input-stream ⇒ decline, exit 0).
- RECORD: the `titleNamesBundle` boundary regex (`[A-Za-z0-9-]` id-char class so `web` ≠ `web-extra`) and the
  archive-status policy chosen (archive non-Done only, or all-naming-the-bundle).
- RECORD: how `hasKindLabel` matches the label after inspecting a real Backlog.md task `.md` file; the
  fresh-bundle count (likely 0/0) vs the labelled-task E2E.
- RECORD: any FileSystem/CliIo additions (expected: none to FileSystem; one optional `in` on `CliIo`).
- RECORD: per-AC evidence (each of 53#1–6, 54#1–4 → a test or a real-binary command+output).

### File List
(to be filled by dev-story)
