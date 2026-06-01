# Story cli-bundle-lifecycle — `bundle new` / `enable` / `disable` (tasks 50 + 51 + 52)

Status: review

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 10 §"Per-command actions" rows 149 (`bundle new`), 150 (`bundle enable`), 151 (`bundle
> disable`), row 176 (`bundle <id> advisor add` — the advisor scaffold these reuse), §"Derived artefacts stay
> current automatically" (line 34), §"Where a command appears to write content" (lines 27/32), and doc 11 §3
> the per-bundle authoring task catalog). **This is Group G (the bundle-membership lifecycle).** `bundle new`
> mostly EXISTS (the task-26 `createBundleSpec` + the task-27 proof-of-concept leaf); this story COMPLETES it
> (the `--version` shadow bug, `--disabled`, `--no-advisor`, the advisor STUB render) and ADDS `enable`/`disable`
> (two new operations). The advisor-scaffold helper built here is REUSED by task-80 (`bundle <id> advisor add`).

## Acceptance criteria (verbatim from the backlog)

### TASK-50 — `bundle new <id> [--template <name>] [--disabled] [--version 0.1.0] [--no-advisor]` (a MUTATION)
1. A new id is validated as kebab-case, not already in the manifest, and not a reserved cross-bundle verb (`new`,
   `enable`, `disable`, `remove`, `list`, `template`); a violation fails with a typed error and a non-zero exit,
   creating nothing.
2. The bundle directory is created from the resolved bundle template (default the project
   `bundles/bundle-template/`) with placeholders substituted mechanically, and `bundle.yml` plus
   `install-backlog/config.yml` are written with id, version, empty requires, and `task_prefix` set to the id.
3. Unless `--disabled`, the id is appended to `manifest.yml` bundles; unless `--no-advisor`, the advisor add
   action runs (stub plus its content task).
4. The per-bundle authoring task set from the doc 11 catalog is materialised with stable titles so re-invocation
   de-dupes by title, and derived artefacts are re-rendered to include the new bundle.
5. A summary naming the created bundle, whether an advisor was scaffolded, and the count of materialised tasks is
   printed; on success exits 0.
6. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; `--template` completes from bundle-scope templates.

### TASK-51 — `bundle enable <id> [--no-advisor]` (a MUTATION)
1. When the directory exists and the id is not already in the manifest, the id is appended to `manifest.yml`
   bundles and derived artefacts re-render to include it.
2. Unless `--no-advisor` or an advisor already exists, the advisor add action runs.
3. The per-bundle authoring task set is materialised idempotently (any task whose title already exists is
   skipped), so re-enabling a previously-authored bundle is a no-op.
4. Enabling a non-existent directory or an already-enabled id fails with a typed error and a non-zero exit.
5. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the id positional completes from disabled-but-present bundle directories.
6. Help output is substantive (description, synopsis, the id positional and `--no-advisor`, an example); on
   success exits 0.

### TASK-52 — `bundle disable <id>` (a MUTATION)
1. The id is removed from `manifest.yml` bundles while its directory stays on disk untouched.
2. Derived artefacts are re-rendered so the disabled bundle no longer appears in the menu.
3. Disabling an id not present in the manifest fails with a typed not-found error and a non-zero exit.
4. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override; the id positional completes from enabled bundles.
5. Help output is substantive (description, synopsis, the id positional, an example); on success exits 0.

## doc-10 contract (cite the rows)
> `bundle new <id>` (row 149) → "1. Validate `<id>`: kebab-case, not already in manifest, not a reserved
> cross-bundle verb 2. Resolve bundle template (default project `bundles/bundle-template/`) 3. **Template-driven**:
> create `bundles/<id>/` from template with placeholders substituted (`{{bundle-id}}`→`<id>`, `{{version}}`→
> `--version` value) 4. Set `id`, `version`, empty `requires: {}`, `task_prefix=<id>` in `bundle.yml` and in
> `install-backlog/config.yml` 5. Unless `--disabled`: append `<id>` to `manifest.yml.bundles` 6. Unless
> `--no-advisor`: run the `bundle <id> advisor add` action (template-render the advisor stub + materialise its
> content task) 7. **Task-driven**: materialise the per-bundle authoring task set 8. Print summary".
> `bundle enable <id> [--no-advisor]` (row 150) → "1. Validate dir exists and id not already in manifest
> 2. Append `<id>` to `manifest.yml.bundles` 3. Unless `--no-advisor` or an advisor already exists: run `bundle
> <id> advisor add` 4. **Task-driven**: idempotently materialise the per-bundle authoring task set (skips any
> task whose title already exists)".
> `bundle disable <id>` (row 151) → "1. Remove from `manifest.yml.bundles` (dir stays on disk; effect is inert)
> 2. Re-render derived artefacts (bundle drops out of the menu)".
> `bundle <id> advisor add` (row 176) → "1. **Template-driven**: render the advisor stub
> `installer-skills/<id>-advisor/SKILL.md` from the project template's advisor snippet (frontmatter `name:
> <id>-advisor` + a placeholder description/body) 2. **Task-driven**: materialise authoring task 'Write advisor
> content for `<id>`' 3. No-op if the advisor already exists." [Source: docs/10 §"Per-command actions".]
> Auto-rerender: "`project targets add/remove`, `bundle new/enable/disable`, … all carry this implicit
> re-render." [Source: docs/10 line 34.]

### DIVERGENCE NOTE (doc row 150 vs the established model)
Row 150 step 2 literally says "Append `{id: <id>}` to `manifest.yml.bundles`". The committed MODEL (task-10/11)
made `manifest.bundles` a **flat list of ids** (`bundles: [web, doc]`), NOT a list of `{id: …}` maps — confirmed
by `parseManifest`, the `bundleModule`/`createBundleSpec` append (`doc.addIn(["bundles"], id)`), and every
existing test. **Follow the established flat-list model** (append the bare id string), consistent with `bundle
new`. This is the same `{id: <id>}`-vs-flat phrasing the task-51 description itself flags as "the table behaviour"
inconsistency. Record this in `--notes`: row 150's `{id:}` phrasing is stale relative to the implemented flat
list; the flat list is authoritative and uniform with `bundle new`. (No goal/vocabulary change → not a user
gate.)

## All three are project-BOUND
Each operates on a resolved project. The CLI action calls the shared `requireProject(ctx, parent)` helper (already
in `cli.ts`) which runs `resolveContext({ fs, env }, projectOverride)` and, when no project resolves, throws the
canonical `NotFoundError(NO_PROJECT_MESSAGE)` (exit 1) — satisfying 50#6 / 51#5 / 52#4 ("outside any project").
On success the action builds `lifecycleDepsFor(ctx, root)` (already in `cli.ts`) and calls `runMutation`.

---

## PART 1 — `bundle new` (task-50): COMPLETE the existing leaf

`createBundleSpec` (src/core/operations/create-bundle.ts) already does CHECK (validate id + version, reject
duplicate), APPLY (resolve+scaffold the bundle template, write canonical `bundle.yml`, append `<id>` to the
manifest unless `disabled`), and the MATERIALISE plan (the doc-11 §3 set, advisor task included when
`advisor !== false`). The task-27 leaf already wires it with `--template/--version/--disabled/--no-advisor` and
the reserved-verb pre-check. **What is MISSING and must be added here:**

### 1a. THE `--version` SHADOWING BUG (the load-bearing fix — get it exactly right)
**Symptom (real binary):** `node dist/cli.js bundle new web --version 0.2.0 -C <proj>` prints the PROGRAM version
(`0.1.0`) and creates NOTHING (no `bundles/web/`), exit 0. The in-process `run()` tests passed because they
exercised `-v`/positional paths, not the long `--version` — a binary-only gap.

**Root cause (confirmed by reading commander 15's `command.js` + empirical repro):** `program.version(VERSION,
"-V, --version", …)` registers a version option **on the program** with a listener (`on('option:version', …)`)
that prints the version and exits. That option is GLOBAL — when commander parses `bundle new web --version 0.2.0`
it matches `--version` against the program's version option FIRST (listener fires → print program version + exit)
before the subcommand's own `-v, --version <version>` is consulted. The short `-v` never collides (program uses
`-V`), which is why `-v 0.2.0` always worked and hid the bug.

**The fix (confirmed across all six relevant invocations — do NOT use `enablePositionalOptions`):**
1. In `buildProgram`, change the program version flags to **`-V` only**:
   ```ts
   .version(VERSION, "-V", "print the version")
   ```
   With the long `--version` no longer a program option, `bundle new <id> --version <v>` reaches the subcommand's
   `-v, --version <version>` option and sets the BUNDLE version. `-C/--project` placement is **untouched** (this
   is why `enablePositionalOptions` is rejected — it makes `-C` after a subcommand an "unknown option", the
   regression a prior worker hit; the state file records it too).
2. Restore `wpm --version` (the program's own version — 50 keeps it working "ideally") by **intercepting a
   top-level `--version`/`-V` request in `run()` BEFORE commander parses**, mirroring the existing
   completion-callback interception block. A bare leading `--version` or `-V` (i.e. `argv[0]` is `--version` or
   `-V`, optionally only after the global `--debug`) prints `${VERSION}\n` to `io.out` and returns exit 0. Use a
   small `isTopLevelVersionRequest(argv)` predicate: true iff the first token is `--version` or `-V`. (Because a
   subcommand line like `bundle new web --version 0.2.0` does NOT start with `--version`/`-V`, it is NOT
   intercepted and flows to the subcommand — verified.)
   - Place the interception alongside the `isCompletionCallback(argv)` / `__complete` checks at the top of
     `run()`, e.g.:
     ```ts
     if (isTopLevelVersionRequest(argv)) {
       return runWithExit(io, async () => { io.out.write(`${VERSION}\n`); });
     }
     ```
   - Document WHY (one comment): the program version is `-V`-only so it never shadows a subcommand's `--version`;
     the program's own long-`--version` is handled here at the top level (a stable surface), keeping `wpm
     --version` working without a global option that would shadow `bundle new --version`.
3. **Regression tests** (the tests that would have caught this — REQUIRED):
   - in-process `run()`: `bundle new acme --version 1.2.3 -C <proj>` → exit 0; parse `bundles/acme/bundle.yml`
     and assert `version === "1.2.3"` (NOT the program version; nothing printed to stdout except the summary).
   - in-process `run()`: `--version` (top level) → exit 0, stdout is exactly the program `VERSION`.
   - **real binary** (`describeIfBuilt`, the `cli.bin.test.ts` pattern): `node dist/cli.js bundle new <id>
     --version 1.2.3 -C <tmpproj>` → exit 0 and `bundles/<id>/bundle.yml` on real disk has `version: 1.2.3`;
     AND `node dist/cli.js --version` prints the program version. (Requires `npm run build` before the gate so
     `dist/cli.js` exists — `describeIfBuilt` SKIPS silently otherwise; the task-29/33 lesson.)

**Empirical confirmation already done** (paste into `--notes`): with `-V`-only + top-level interception, all of
`wpm --version`, `wpm -V`, `bundle new web --version 0.2.0`, `bundle new web --version 0.2.0 -C /x`, `-C /x
bundle new web --version 0.2.0`, `bundle new web -v 0.2.0` behave correctly.

### 1b. THE ADVISOR STUB RENDER (the new part of step 6; build it as a SHARED helper for task-80)
doc-10:149 step 6 + doc-10:176 step 1: unless `--no-advisor`, `bundle new` renders the advisor stub at
`installer-skills/<id>-advisor/SKILL.md` from the **project template's** advisor snippet. The MATERIALISE plan
already adds the "Write advisor content for `<id>`" task when `advisor !== false` (`perBundleAuthoringTasks`); the
**stub render** is what's missing. Build it as a reusable pure helper so task-80 reuses it verbatim:

**`scaffoldAdvisor(deps, { fs, root }, project, id)` → returns the changed path(s)** (new function, e.g. in a new
`src/core/operations/advisor.ts`, or co-located in create-bundle.ts — your call; a dedicated `advisor.ts` reads
best since task-80 will add `advisor add`/`remove` there):
- Resolve the project template (the SAME way `makeArtefactDeriver` does): `resolveTemplate(projectTemplateName,
  "project", { fs, builtinTemplatesRoot, projectTemplatesRoot: join(root, "templates") })`. The
  `projectTemplateName` defaults to `"minimal"` (the `DEFAULT_PROJECT_TEMPLATE` constant — reuse/export it).
- From `resolution.template.snippets`, find the snippet whose `path` is `"advisor.SKILL.md.tmpl"` (the
  `readTree`-relative path under `snippets/`; confirmed it ships there). A missing snippet is a
  template-authoring bug → throw a clear `Error`/`NotFoundError` naming it.
- `renderSnippet(snippet, new Map([["bundle-id", id]]))` → the `RenderedFile` (its `.path` is `advisor.SKILL.md`
  after `.tmpl` stripping; we IGNORE that path and write to the conventional location).
- Write the rendered content via the port to `join(root, "installer-skills", \`${id}-advisor\`, "SKILL.md")`.
  Return that absolute path (the caller folds it into `changedPaths`).
- **No-op-if-exists** (doc-10:176 step 3): if `fs.exists(join(root, "installer-skills", \`${id}-advisor\`,
  "SKILL.md"))` already, do nothing and return `[]` (this is what makes `enable`'s "unless an advisor already
  exists" fall out — 51#2).
- **Pure over the FileSystem port** — imports only `resolveTemplate`/`renderSnippet`/the model/errors/the port +
  `node:path`. NEVER `node:fs`. (The advisor snippet's frontmatter `name: {{bundle-id}}-advisor` renders to
  `name: <id>-advisor`, satisfying doc-10:176's "frontmatter `name: <id>-advisor`".)

**Wire `scaffoldAdvisor` into the `bundle new` flow:** the cleanest place is `createBundleSpec`'s `apply` — after
writing the bundle + manifest, when `input.advisor !== false`, call `scaffoldAdvisor` and push its path into
`changedPaths`. (Pass the project template name + roots into `createBundleSpec`'s deps so `apply` can resolve the
snippet; the deps already carry `builtinTemplatesRoot`. Add an optional `projectTemplateName`.) The advisor render
must happen in `apply` (③) so the materialise/rerender beats see it. **Verify** the MATERIALISE already includes
the advisor task when on (it does) and OMITS it under `--no-advisor` (it does, via `advisor !== false` → 11
tasks). 50#3 needs BOTH the stub render AND the content task; `--no-advisor` skips both.

### 1c. `--disabled` and the `config.yml` `task_prefix` (50#2/#3)
- `--disabled` already wires through (`createBundleSpec` skips the manifest append when `input.disabled === true`).
  **Verify** with a test: `bundle new draft --disabled` creates `bundles/draft/` but `manifest.bundles` does NOT
  include `draft`. (Per doc-10:149 step 5 the dir is still scaffolded; only the manifest membership is skipped.)
  Under `--disabled` the advisor: doc-10:149 step 6 is unconditional except for `--no-advisor`, so a disabled
  bundle still gets its advisor stub + content task (the dir exists; it's just not enabled). Keep the advisor
  tied to `--no-advisor` only, independent of `--disabled`.
- `install-backlog/config.yml` `task_prefix=<id>` (50#2): this comes from the bundle TEMPLATE rendering
  (`config.yml` ships `task_prefix: {{bundle-id}}` → rendered to `<id>`). **Verify** the real default bundle
  template ships `install-backlog/config.yml` with `task_prefix: {{bundle-id}}` so the rendered file lands with
  `task_prefix: <id>` (the existing fixture in create-bundle.acceptance already asserts the file EXISTS — add an
  assertion the rendered `task_prefix` equals the id, on a real-template or fixture run). If the real template
  does NOT ship it, that's a `templates/` gap — but `templates/` is OUT OF BOUNDS for this story; if missing,
  record it in `--notes` and surface (do NOT edit `templates/`). (Check `templates/bundle/default/files/` first.)

### 1d. `bundle new` summary (50#5)
50#5 wants the summary to name the bundle, whether an advisor was scaffolded, and the materialised-task count.
The shared `formatResult` already prints the summary line + the materialised count. ENHANCE the operation's
`summary` (or the CLI formatting) so the advisor state is visible — e.g. the operation result's summary stays
`created bundle <id>`, and `formatResult` already appends `materialised: N authoring task(s)`. For the advisor:
either thread an "advisor scaffolded" note (a small addition to the summary string when `advisor !== false`) or
print it as a line. Minimal: make the operation `summary` `created bundle <id>${advisor ? " (advisor scaffolded)"
: ""}`. Keep it observable so 50#5's "whether an advisor was scaffolded" is satisfied. (Don't over-engineer; one
clear line.)

---

## PART 2 — `bundle enable <id>` (task-51): a NEW operation `enableBundleSpec`

`enable` ≈ `bundle new` MINUS the template scaffold (the dir already exists). A mutation riding `runMutation`.

**`enableBundleSpec(deps): OperationSpec<EnableBundleInput>`** where `EnableBundleInput = { id: string; advisor?:
boolean }`, `deps` carries `builtinTemplatesRoot` (+ optional `projectTemplateName`) for the advisor scaffold:
- `summary`: `(_p, { id }) => \`enabled bundle ${id}\`` (optionally `+ (advisor ? " (advisor scaffolded)" : "")`).
- **CHECK** (51#4 — typed error, exit 1, nothing changed):
  - validate `id` via `parseBundleId` (kebab + reserved-verb) → `ValidationError` on failure (defense-in-depth;
    the CLI pre-check also fires for the reserved verb).
  - if `project.manifest.bundles.includes(id)` → `throw new ConflictError(\`bundle "${id}" is already enabled\`)`.
  - **the directory must exist**: `if (!fs.exists(join(root, "bundles", id, "bundle.yml")))` (or the dir itself)
    → `throw new NotFoundError(\`bundle directory "bundles/${id}" does not exist — create it with 'wpm bundle new
    ${id}' first\`)`. NOTE: `check(project, input)` has no `fs`/`root` in its signature — see "fs-in-CHECK" below;
    do the dir-existence check in `apply` as a guard at the TOP (before any write), throwing the same
    `NotFoundError` so nothing mutates. (CHECK does the manifest/id checks that need only the project; APPLY's
    first action is the dir-existence guard. Both abort before any effect — `runMutation` runs CHECK then APPLY,
    and APPLY's guard throws before `editYaml`.)
- **APPLY** (51#1/#2): (1) dir-existence guard (above). (2) append `id` to `manifest.bundles` comment-preservingly
  (`editYaml(read, doc => doc.addIn(["bundles"], id))` + write; push the manifest path). (3) advisor: unless
  `input.advisor === false` OR an advisor already exists, call `scaffoldAdvisor(...)` and push its path
  (`scaffoldAdvisor` already no-ops if the SKILL.md exists — so "already exists" is handled inside it; the
  `--no-advisor` skip is the `advisor === false` guard). Return `{ changedPaths }`.
- **MATERIALISE** (51#3): `perBundleAuthoringTasks(id, { advisor: input.advisor !== false })` — the SAME plan
  `bundle new` uses, so re-enabling a previously-authored bundle de-dupes by title (the harness ⑤ skips existing
  titles → a no-op). Reuse the exported `perBundleAuthoringTasks`.
- ④ RERENDER is automatic (the harness re-derives the front-door from the post-apply project, which now lists
  `id` → the menu re-includes it — 51#1).

> Why APPLY-guard for dir-existence (not CHECK): the `OperationSpec.check` signature is `(project, input) =>
> void` (no ports). Rather than widen the harness contract, do the project-only checks (already-enabled, id
> validity) in CHECK and the fs-dependent dir-existence check as the FIRST statement of APPLY (it throws before
> any write, so the "nothing changed" guarantee of 51#4 holds). This keeps the lifecycle contract unchanged.

---

## PART 3 — `bundle disable <id>` (task-52): a NEW operation `disableBundleSpec`

The simplest of the three: remove the id from the manifest; the dir stays on disk untouched; ④ drops it from the
menu. No advisor/file teardown (that's `bundle remove`, task-53, NOT here).

**`disableBundleSpec(): OperationSpec<DisableBundleInput>`** where `DisableBundleInput = { id: string }`:
- `summary`: `(_p, { id }) => \`disabled bundle ${id}\``.
- **CHECK** (52#3 — typed not-found, exit 1, nothing changed): `if (!project.manifest.bundles.includes(id)) throw
  new NotFoundError(\`bundle "${id}" is not enabled in the manifest\`)`.
- **APPLY** (52#1): find the index `const idx = project.manifest.bundles.indexOf(id)`; `editYaml(read, doc =>
  doc.deleteIn(["bundles", idx]))` + write; return `{ changedPaths: [manifestPath] }`. **The dir stays on disk** —
  `disable` touches ONLY the manifest membership (no `fs.remove` of `bundles/<id>/`). 52#1's "directory stays on
  disk untouched" is satisfied by simply not removing it.
- **No MATERIALISE** (disable queues no authoring work). **No advisor teardown.**
- ④ RERENDER is automatic → the post-apply project no longer lists `id` → the menu drops it (52#2).

> NOTE on the alias asymmetry: `disable` does NOT need to remove any alias. The per-bundle scope-alias
> (`bundles/<id>/.claude/skills`) lives INSIDE `bundles/<id>/`, which stays on disk; and the front-door menu is
> re-derived from the (now-shorter) manifest by ④. Unlike `targets remove` (which deletes a project-level alias
> the deriver won't), `disable` leaves everything in `bundles/<id>/` intact — that's the whole point (re-enable
> must restore it for free). So no `apply`-side teardown.

---

## CLI wiring (`src/cli.ts`; the shell)
The `bundleModule` already exists with the `new` leaf. EXTEND it: keep `new` (with the completions below), ADD
`enable` and `disable` leaves to the SAME `group` (`const group = parent.command("bundle")…`).
- **`new`**: keep the existing leaf; the reserved-verb pre-check stays (50#1 → `UsageError` exit 2); after the
  `--version` fix, the `-v, --version <version>` option now actually works. Add `(advisor scaffolded)` to the
  summary when applicable (PART 1d). Its `withExamples` already exists.
- **`enable <id> [--no-advisor]`**: `.argument("<id>", "the disabled bundle's id to enable")` + `.option(
  "--no-advisor", "skip the advisor scaffold")`. The reserved-verb pre-check is moot for `enable` (you can't have
  created a reserved-id dir), but `parseBundleId` in the op's CHECK still guards. Action: `requireProject` →
  `runMutation(lifecycleDepsFor(ctx, root), { root }, enableBundleSpec({ builtinTemplatesRoot:
  ctx.deps.builtinTemplatesRoot }), { id, advisor: opts.advisor })` → `formatResult` + `writeWarnings`.
  `withExamples([{ command: "wpm bundle enable web-handoff", note: "enable a previously-created bundle" }])`
  (51#6 needs an example).
- **`disable <id>`**: `.argument("<id>", "the enabled bundle's id to disable")`. Action: `requireProject` →
  `runMutation(lifecycleDepsFor(ctx, root), { root }, disableBundleSpec(), { id })` → `formatResult`.
  `withExamples([{ command: "wpm bundle disable web-handoff", note: "remove a bundle from the menu (keeps its
  files)" }])` (52#5 needs an example).
- Commander parses `bundle enable`/`bundle disable` as subcommands of `bundle` — they do NOT collide with `bundle
  <id> …` because `enable`/`disable` are reserved verbs (that's WHY they're reserved). Confirm dispatch: `bundle
  enable web` routes to the `enable` leaf, not to a `bundle <id=enable>` group (there is no `bundle <id>` group
  yet; later tasks add it as a catch-all — but the reserved verbs are matched as explicit subcommands first).

### Completion (`COMPLETION_SPECS`)
```ts
"bundle new":     { options: { "--template": "bundle-template-names" }, args: [undefined] }, // EXISTS — keep
"bundle enable":  { args: ["disabled-bundle-ids"] },  // NEW source: bundle dirs on disk NOT in the manifest
"bundle disable": { args: ["bundle-ids"] },           // EXISTING source: enabled bundles from manifest.bundles
```
- `bundle disable <id>` reuses the **existing** `"bundle-ids"` source (`src/completion/bundle-ids.ts` — completes
  from `manifest.bundles`), satisfying 52#4 ("completes from enabled bundles").
- `bundle enable <id>` needs a **NEW** source `"disabled-bundle-ids"` (51#5 — "disabled-but-present bundle
  directories"): list the directory names under `<root>/bundles/` that are NOT in `manifest.bundles` (and not the
  `bundle-template` scaffold dir). Add `src/completion/disabled-bundle-ids.ts` mirroring `bundle-ids.ts`'s shape
  (resolve project via `resolveContext`, read manifest, `fs.list(join(root,"bundles"))` filtered to directories
  minus the enabled set minus `bundle-template`, `prefixFilter` by partial; `[]` on no project / malformed).
  Register it in `defaultRegistry()` (`registry.register("disabled-bundle-ids", disabledBundleIds)`). Pure over
  ports; never `node:fs`/`commander`.
  - Exclude `bundle-template` (the project's own scaffold template dir under `bundles/`, doc-10:149 step 2) from
    the disabled-but-present list — it's not an enable-able bundle. (Confirm the dir name via doc-10: default
    bundle template is the project `bundles/bundle-template/`.)

---

## Files to change
- **CHANGE** `src/cli.ts` — (1) `.version(VERSION, "-V", …)` + the top-level `--version`/`-V` interception in
  `run()` (the bug fix); (2) extend `bundleModule` with `enable`/`disable` leaves + the `new` summary tweak;
  (3) add the 2 `COMPLETION_SPECS` entries.
- **CHANGE** `src/core/operations/create-bundle.ts` — wire `scaffoldAdvisor` into `apply` (advisor stub render
  when `advisor !== false`); add `projectTemplateName?` to `CreateBundleDeps`; export `DEFAULT_PROJECT_TEMPLATE`
  if you co-locate, or import it.
- **ADD** `src/core/operations/advisor.ts` — the shared `scaffoldAdvisor` helper (pure over ports). (task-80
  reuses it.)
- **ADD** `src/core/operations/bundle-lifecycle.ts` (or extend create-bundle.ts) — `enableBundleSpec` +
  `disableBundleSpec`. Pure over ports (errors/model/services/ports + `node:path` + `editYaml` + `scaffoldAdvisor`
  + `perBundleAuthoringTasks`; never `node:fs`/`commander`).
- **ADD** `src/completion/disabled-bundle-ids.ts` — the new completion source; register in `registry.ts`.
- **ADD** `test/unit/cli/bundle-lifecycle-commands.test.ts` — the in-process AC tests (below).
- **CHANGE/ADD** `test/integration/cli.bundle-new.test.ts` (or a sibling) — the `--version` real-binary
  regression + the advisor-render + `--disabled` integration cases.
- **CHANGE** `test/unit/completion/completion.test.ts` — the tree gained `enable`/`disable`; assert the new
  completions resolve.
- (No `docs/`/`templates/`/`package.json`/`.bmad/`/`backlog/` change. If `templates/bundle/default` lacks
  `install-backlog/config.yml` with `task_prefix: {{bundle-id}}`, record + surface — do NOT edit `templates/`.)

## Tests (AC-driven, in-process via `run()` + `MemoryFileSystem` fixtures; mirror Group A/E + create-bundle)
Seed a realistic project at `/proj` (copy the seed shape from `create-bundle.acceptance.test.ts` /
`cli.bundle-new.test.ts`): `manifest.yml` (name/version/`targets: [claude-code]`/`bundles: []` or `[existing]`);
the built-in `minimal` project template snippets at the builtin root **including `advisor.SKILL.md.tmpl`** (so
`scaffoldAdvisor` resolves it — the existing fixtures DON'T ship the advisor snippet; ADD it to the test seed,
content e.g. `---\nname: {{bundle-id}}-advisor\n---\nadvise {{bundle-id}}\n`); the default `bundle` template at
the builtin root WITH `install-backlog/config.yml: task_prefix: {{bundle-id}}`; `installer-skills/` dir EXISTS
(non-broken root alias — the task-25/27 lesson); the FakeBacklog `init`'d at `/proj/.authoring-backlog` (the
materialise root — mirror reality). Drive via `run(["bundle", …, "-C", "/proj"], deps, io)`.

### `bundle new` (task-50)
- **AC#1 reserved verb**: `bundle new list` → exit **2** (UsageError), `io.err` matches the reserved-verb message;
  nothing created (`fs.exists("/proj/bundles/list")` false). **AC#1 bad kebab**: `bundle new Web` → non-zero,
  nothing created. **AC#1 duplicate**: pre-seed `bundles: [web]` + `bundles/web/bundle.yml`; `bundle new web` →
  exit 1 (ConflictError), manifest unchanged.
- **AC#2 scaffold + config**: `bundle new acme` → exit 0; `bundles/acme/bundle.yml` parses with `id: acme`,
  `version: 0.1.0`, `requires` empty; `bundles/acme/install-backlog/config.yml` exists and its `task_prefix`
  equals `acme` (parse the YAML, assert `task_prefix: acme`).
- **AC#2/AC#1c `--version`**: `bundle new acme --version 1.2.3` → exit 0; `bundles/acme/bundle.yml` version is
  `1.2.3` (THE bug regression, in-process). PLUS the real-binary case (PART 1a §3).
- **AC#3 `--disabled`**: `bundle new draft --disabled` → exit 0; `bundles/draft/` scaffolded but
  `manifest.bundles` does NOT include `draft` (parse manifest).
- **AC#3 advisor ON (default)**: `bundle new acme` → `installer-skills/acme-advisor/SKILL.md` EXISTS and contains
  `name: acme-advisor` (the rendered frontmatter); AND the "Write advisor content for acme" task is in the
  authoring backlog (`backlog.listTasks(AUTHORING)` titles).
- **AC#3 `--no-advisor`**: `bundle new acme --no-advisor` → `installer-skills/acme-advisor/SKILL.md` does NOT
  exist; AND "Write advisor content for acme" is NOT among the materialised titles (11 tasks, not 12).
- **AC#4 materialise + rerender**: `bundle new acme` → 12 materialised titles incl. "Plan bundle acme"; the
  front-door `AGENTS.md` re-rendered to include `acme` (read it / it's in changedPaths). Re-run (idempotency): a
  second `bundle new` of a DIFFERENT id leaves the first's tasks + menu entry intact and adds the new ones.
- **AC#5 summary**: stdout contains `created bundle acme`, the materialised count, and (advisor on) an indication
  an advisor was scaffolded; exit 0.
- **AC#6 outside a project**: no `-C`, cwd a no-manifest dir → exit 1, `io.err` contains `manifest.yml` + `init`.
  **AC#6 completion**: `completeArgv` for `bundle new --template <tab>` → bundle-scope template names (existing).
- **top-level `--version`**: `run(["--version"], …)` → exit 0, stdout is exactly the program `VERSION`.

### `bundle enable` (task-51)
- **AC#1 enable a disabled dir**: pre-seed `bundles/web/bundle.yml` on disk + `manifest.bundles: []` (web present
  but disabled); `bundle enable web` → exit 0; `manifest.bundles` now includes `web`; the front-door re-rendered
  to include web (changedPaths/read).
- **AC#3 idempotent materialise / re-enable no-op**: after enable, the per-bundle tasks exist; `bundle disable
  web` then `bundle enable web` again → the second enable materialises NO duplicate titles (the harness de-dupes;
  assert `result.materialisedTaskTitles` for the 2nd enable is empty OR the backlog title-count is unchanged).
- **AC#2 advisor**: `bundle enable web` with no existing advisor → `installer-skills/web-advisor/SKILL.md`
  created. With `--no-advisor` → not created. With an advisor ALREADY present (pre-seed the SKILL.md) → enable
  does NOT overwrite it (content unchanged; `scaffoldAdvisor` no-ops).
- **AC#4 already-enabled**: pre-seed `manifest.bundles: [web]` + `bundles/web/`; `bundle enable web` → exit 1
  (ConflictError "already enabled"), manifest unchanged. **AC#4 non-existent dir**: `bundle enable ghost` (no
  `bundles/ghost/`) → exit 1 (NotFoundError naming the dir), manifest unchanged.
- **AC#5 outside a project** → exit 1 naming `manifest.yml`. **AC#5 completion**: seed `bundles/web/` +
  `bundles/doc/` on disk, `manifest.bundles: [web]`; `completeArgv` for `bundle enable <tab>` → `[doc]` (the
  disabled-but-present dir), NOT `web` (enabled) and NOT `bundle-template`.
- **AC#6 help**: `bundle enable --help` → 0, has description / `Usage:` / `<id>` / `--no-advisor` / `Example:`.

### `bundle disable` (task-52)
- **AC#1 remove from manifest, dir stays**: seed `manifest.bundles: [web]` + `bundles/web/bundle.yml`; `bundle
  disable web` → exit 0; `manifest.bundles` no longer includes `web`; `fs.exists("/proj/bundles/web/bundle.yml")`
  STILL true (dir untouched).
- **AC#2 rerender drops from menu**: after disable, the re-rendered front-door no longer lists web (or the
  rerender ran — `AGENTS.md` in changedPaths and the manifest no longer has web).
- **AC#3 not present**: `bundle disable ghost` (not in manifest) → exit 1 (NotFoundError), manifest unchanged.
- **AC#4 outside a project** → exit 1 naming `manifest.yml`. **AC#4 completion**: seed `manifest.bundles: [web,
  doc]`; `completeArgv` for `bundle disable <tab>` → `[web, doc]` (enabled bundles).
- **AC#5 help**: `bundle disable --help` → 0, has description / `Usage:` / `<id>` / `Example:`.

### Cross-cutting
- the task-28 help-completeness guard (`help-contract.test.ts`) walks the new `bundle enable`/`bundle disable`
  commands — re-run; both leaves carry examples + arg descriptions, so it stays green.
- the task-29 completion tests pass; the tree gained the leaves; `disabled-bundle-ids` is registered.
- **real-binary** (`describeIfBuilt` in `cli.bin.test.ts` or `cli.bundle-new.test.ts`): the `--version` bundle-new
  regression (PART 1a §3) on real disk + real `dist/cli.js`; AND a real `bundle new`/`enable`/`disable` round-trip
  against a real tmpdir project (NodeFileSystem + FakeBacklog at `.authoring-backlog`) exercising the materialise
  path. Requires `npm run build` before the gate.

## DoD (the backlog DoD for tasks 50/51/52)
- `tsc --noEmit` clean; `biome check src test` clean **0/0** (run `biome check --write` first). `vitest run` green
  (SINGLE process). `npm ci` clean. **Core import-boundary intact** — `advisor.ts`, `bundle-lifecycle.ts`, the
  `create-bundle.ts` change, and `disabled-bundle-ids.ts` import nothing effectful (advisor render goes through
  the FileSystem port; `editYaml`/`resolveTemplate`/`renderSnippet`/`perBundleAuthoringTasks` are pure
  leaves/services). No dead code; the operations + `scaffoldAdvisor` + the new completion source documented. **Run
  `npm run build` before the final gate** so the `describeIfBuilt` binary tests execute (the task-29/33/Group-A/E
  lesson — they SKIP silently against a stale/absent `dist/`).

## Previous-story intelligence (carried forward)
- **Group E (targets)** is the list-mgmt exemplar: the warning channel (`result.warnings` → `io.err` as
  `warning:`), the `requireProject`/`lifecycleDepsFor`/`formatResult`/`writeWarnings` shell helpers, and the
  `CommandModule`-per-family pattern — all reused here. (enable/disable need NO warnings; disable removes nothing
  the deriver won't, and enable adds — so `writeWarnings` is harmless/no-op for them but keep it on enable for
  the unknown-target folding consistency, optional.)
- **task-26 `createBundleSpec`** is the `OperationSpec` template (check/apply/materialise + `editYaml` for the
  comment-preserving manifest edit + the materialise plan) — `enable`/`disable` mirror it. **task-25
  `runMutation`** does ①④⑤⑥; ④ re-derives the front-door from the post-apply manifest (so enable's menu-include
  and disable's menu-drop are automatic); ⑤ is title-idempotent (re-enable = no-op). The non-broken-alias lesson:
  the alias TARGET (`installer-skills/`) must exist in the fixture.
- **MATERIALISE root** is `<project>/.authoring-backlog` (`AUTHORING_BACKLOG_DIR`), NOT the project root — the
  FakeBacklog must `init` there or every materialising command fails. Real-binary tests use the real `backlog`
  CLI against a real `.authoring-backlog` (the materialise-root fix that rides feature/cli).
- **task-29** `COMPLETION_SPECS` + the `bundle-ids`/`bundle-template-names` sources exist — reference by name; add
  `disabled-bundle-ids`. **task-28** `withExamples` + the guard (commands with args MUST carry an example).
- **The `--version` bug** is a binary-vs-`run()` gap: the in-process tests passed because they used `-v`. ALWAYS
  test the real binary for option-shadowing (the carry-forward lesson: "test the real binary/loop-closure path").
- `renderSnippet(file, params)` renders one `.tmpl` (substitute + strip `.tmpl`); `resolveTemplate(name, scope,
  {fs, builtinTemplatesRoot, projectTemplatesRoot})` resolves project-local-shadows-built-in and returns
  `.snippets` (paths relative to `snippets/`). `editYaml(text, doc => …)` is comment-preserving;
  `doc.addIn(["bundles"], id)` / `doc.deleteIn(["bundles", idx])`. Single-process vitest; `MemoryFileSystem`
  POSIX-normalized + `fs.aliasTarget(linkPath)` accessor.

## Boundaries (do NOT do here)
- Do NOT implement `bundle remove` (task-53), `bundle list` (task-54), or any `bundle <id> …` subcommand — only
  `new` (completion + bug + advisor), `enable`, `disable`. Do NOT delete `bundles/<id>/` on `disable` (the dir
  stays — that's `bundle remove`). Do NOT use `enablePositionalOptions` for the version fix (it breaks `-C`
  placement). Do NOT let the advisor render touch `node:fs` (port only). Do NOT import `node:fs`/`commander` under
  `src/core/**` (or `src/completion/*` source bodies — they use the port + pure services). Do NOT edit `docs/`,
  the repo-root `AGENTS.md`/`CLAUDE.md`, `.bmad/` (incl. sprint-status), `templates/`, or the dev `backlog/`. If
  doc-10 specifies something this sketch omits, the DOC wins — add it + note the divergence (e.g. the row-150
  `{id:}`-vs-flat-list divergence already recorded above).

## Dev Agent Record
### Agent Model Used
Opus 4.8 (1M) — bmad-dev-story.

### Completion Notes List
- **The `--version` bug — root cause + fix (verified on the real binary, before/after).** commander 15's
  `.version(VERSION, "-V, --version", …)` registers a GLOBAL version option whose listener short-circuits
  `bundle new <id> --version <v>` to print the program version + exit (before the subcommand's own `-v,
  --version <version>` is consulted). The `-v` short form never collided, which is why the in-process `run()`
  tests passed and the bug was binary-only. FIX: program version is now `-V`-only (`.version(VERSION, "-V",
  …)`), so subcommands own their `--version`; `-C/--project` placement is untouched. `wpm --version` is kept
  working by a top-level interception in `run()` (`isProgramVersionRequest`), placed beside the existing
  completion-callback interception. Rejected `enablePositionalOptions` (empirically breaks `-C` after a
  subcommand — the prior-worker regression). BEFORE: `bundle new web --version 0.2.0` → printed `0.1.0`, created
  nothing. AFTER: `created bundle web (advisor scaffolded)`, `bundles/web/bundle.yml` has `version: 0.2.0`; `wpm
  --version`/`wpm -V` still print `0.1.0`. All six relevant invocations verified (incl. `-C` before & after the
  subcommand). Caught by a real-binary `describeIfBuilt` test (`cli.bundle-new.test.ts`) + an in-process `run()`
  regression.
- **Advisor scaffold = a shared helper (`src/core/operations/advisor.ts` `scaffoldAdvisor`).** Resolves the
  project template (project-local shadows built-in) → finds `advisor.SKILL.md.tmpl` → `renderSnippet` with
  `{{bundle-id}}` → writes `installer-skills/<id>-advisor/SKILL.md` via the FileSystem port. No-op when the stub
  already exists (so `enable`'s "unless an advisor already exists" and `bundle new`/`advisor add` idempotency
  fall out for free). Pure over ports. Wired into `createBundleSpec.apply` (auto-advisor, `advisor !== false`)
  and `enableBundleSpec.apply`; **task-80** (`bundle <id> advisor add`) will reuse it verbatim. Exposes
  `DEFAULT_PROJECT_TEMPLATE` + `advisorSkillPath(id)`.
- **enable/disable operations (`src/core/operations/bundle-lifecycle.ts`).** `enableBundleSpec`: CHECK
  validates id + rejects already-enabled (ConflictError); APPLY guards the dir exists (NotFoundError, before any
  write — the dir-existence check needs `fs`, absent from `check`'s signature, so it is APPLY's first statement,
  preserving "nothing changed" on failure), appends to `manifest.bundles`, scaffolds the advisor unless
  `--no-advisor`/already-present; MATERIALISE reuses `perBundleAuthoringTasks` (title-idempotent → re-enable is a
  no-op). `disableBundleSpec`: CHECK rejects a non-member (NotFoundError); APPLY removes the id from
  `manifest.bundles` only — **the directory stays on disk untouched**; no materialise/advisor teardown. ④
  RERENDER (the harness) does the menu include/drop automatically for both.
- **DIVERGENCE (recorded — docs win, but the implemented model is authoritative):** doc-10 row 150 step 2 says
  "Append `{id: <id>}` to `manifest.yml.bundles`", but the committed model (task-10/11) made `manifest.bundles` a
  FLAT list of ids — confirmed by `parseManifest`, `createBundleSpec`, and every test. enable/disable follow the
  flat-list model (append/remove the bare id), uniform with `bundle new`. The task-51 description itself flags
  this `{id:}`-vs-table inconsistency. No goal/vocabulary change → not a user gate. (Surfaced here.)
- **Completion:** `bundle disable <id>` → existing `bundle-ids` source (enabled bundles). `bundle enable <id>` →
  NEW `disabled-bundle-ids` source (`src/completion/disabled-bundle-ids.ts`): bundle dirs under `bundles/` NOT in
  `manifest.bundles`, excluding `bundle-template`. Registered in `registry.ts`. Pure over ports.
- **`--disabled` keeps the advisor:** doc-10:149 step 6 ties the advisor to `--no-advisor` only, so a disabled
  bundle still gets its advisor stub + content task (the dir exists, it's just not enabled). Verified.
- **`config.yml task_prefix` (50#2):** the REAL bundle template ships `install-backlog/config.yml.tmpl` with
  `task_prefix: "{{bundle-id}}"` → renders to `task_prefix: "<id>"`. No `templates/` change needed.
- **Existing tests updated (behavior I changed, not workarounds):** the auto-advisor now runs in
  `createBundleSpec.apply`, so fixtures that seed the project template had to add the `advisor.SKILL.md.tmpl`
  snippet (create-bundle.test.ts, create-bundle.acceptance.test.ts, cli.acceptance.test.ts, dispatch-di.test.ts,
  cli.bundle-new.test.ts seedOnDisk); and three `.toBe("created bundle X")` summary assertions became `… (advisor
  scaffolded)`. `default-bundle.test.ts` mirrors the real template tree (advisor snippet already present).
- **Minor seam exposed:** `COMPLETION_SPECS` is now exported from `cli.ts` so the new tests verify the REAL
  completion wiring (not a re-declared copy, as the targets test had to).
- **Gate (cold, CI order):** `npm ci` 0 vulns / `tsc` 0 / `biome ci src test` 0/0 (132 files) / `npm run build` 0
  / `npm test` 643 passed (65 files; the real-binary `describeIfBuilt` block executed against fresh `dist/`). Core
  import-boundary intact (new core files import nothing effectful).

### File List
- ADD `src/core/operations/advisor.ts` — the shared `scaffoldAdvisor` helper.
- ADD `src/core/operations/bundle-lifecycle.ts` — `enableBundleSpec` + `disableBundleSpec`.
- ADD `src/completion/disabled-bundle-ids.ts` — the `disabled-bundle-ids` completion source.
- ADD `test/unit/cli/bundle-lifecycle-commands.test.ts` — 27 in-process AC tests for new/enable/disable.
- CHANGE `src/cli.ts` — program version `-V`-only + top-level `--version` interception; `bundle enable`/`disable`
  leaves; `bundle new` summary; `bundle enable`/`disable` completion specs; export `COMPLETION_SPECS`.
- CHANGE `src/core/operations/create-bundle.ts` — wire `scaffoldAdvisor` into `apply`; `projectTemplateName?` dep;
  advisor-aware summary.
- CHANGE `src/completion/registry.ts` — register `disabled-bundle-ids`; doc comment.
- CHANGE `test/integration/cli.bundle-new.test.ts` — advisor snippet in `seedOnDisk`; real-binary `describeIfBuilt`
  block (the `--version` regression + a new→disable→enable round-trip over the real backlog).
- CHANGE `test/unit/operations/create-bundle.test.ts`, `test/unit/operations/create-bundle.acceptance.test.ts`,
  `test/unit/cli/cli.acceptance.test.ts`, `test/unit/cli/dispatch-di.test.ts` — advisor snippet in fixtures + the
  updated summary assertions.
- CHANGE `test/unit/templates/default-bundle.test.ts` — updated summary assertion.

### Status
review
