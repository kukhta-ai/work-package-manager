# Story cli-bundle-id — `bundle <id> show` / `bundle <id> meta` (tasks 57 + 58)

Status: review

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 10 §"command tree → per-bundle operations (after `bundle <id>`, a fresh subcommand space)" +
> rows 157 (`bundle <id> show`) / 158 (`bundle <id> meta`) + line 34 (implicit re-render), and doc 12's
> commander dispatch). **THE LOAD-BEARING DELIVERABLE IS THE `bundle <id> <subcommand>` ROUTING** — the
> pattern-setter the **21 later bundle-`<id>` repeats** inherit (version/requires/files/templates/scripts/
> skills/installer-skills/advisor; tasks 59-81). `show`/`meta` are the first two leaves; the routing + the
> reusable per-bundle registration are the real output. Build them right; a focused review follows.

## Acceptance criteria (verbatim from the backlog)

### TASK-57 — `bundle <id> show` (a READ)
1. For an enabled bundle id, the command prints its `bundle.yml` metadata and a tree summary of the bundle.
2. An id that is not an enabled bundle fails with a typed not-found error and a non-zero exit.
3. The command reads and reports only, with no change on disk, and exits 0 on success.
4. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the
   `-C` override; the id completes from enabled bundles.
5. Help output is substantive (description, synopsis, an example).

### TASK-58 — `bundle <id> meta [--version <v>] [--summary <s>] [--confirmation-level safe|dangerous]` (a MUTATION)
1. Each provided flag (`--version`, `--summary`, `--confirmation-level`) updates the matching `bundle.yml`
   field; omitted flags leave their fields unchanged.
2. The `--confirmation-level` value is accepted only as `safe` or `dangerous`; any other value fails as a usage
   error with exit code 2.
3. Existing comments and key order in `bundle.yml` are preserved across the edit.
4. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the
   `-C` override; the id completes from enabled bundles and `--confirmation-level` from `safe` and `dangerous`.
5. Help output is substantive (description, synopsis, every flag with its effect, an example); on success exits 0.

## doc-10 contract (cite the rows)
> `bundle <id> show` (row 157) → "1. Read `bundles/<id>/bundle.yml` 2. Print bundle metadata + tree summary".
> `bundle <id> meta [--version <v>] [--summary <s>] [--confirmation-level safe|dangerous]` (row 158) → "1. Read
> `bundle.yml` 2. Update fields from flags (omitted untouched) 3. Write back". The command tree: "── per-bundle
> operations (after `bundle <id>`, a fresh subcommand space on that bundle): `<id>` enters per-bundle context →
> `show` (bundle.yml + tree summary), `meta` (edit bundle.yml: --version/--summary/--confirmation-level
> <safe|dangerous>), `version`, `requires …`, `files …`, …". [Source: docs/10 §command tree + §Per-command
> actions rows 157/158.] Auto-rerender: "`bundle <id> meta` … carry this implicit re-render." [docs/10 line 34.]

## Both are project-BOUND
Each operates on a resolved project. The routing's catch-all calls the existing `requireProject(ctx, parent)`
(in `cli.ts`) → the canonical `NotFoundError(NO_PROJECT_MESSAGE)` (exit 1) when no project resolves — satisfying
57#4 / 58#4. The resolved `root` is threaded INTO the per-bundle sub-program (it does NOT re-resolve).

---

## PART 1 — THE ROUTING (the pattern-setter; empirically validated against commander v15 — implement exactly)

**The problem.** `bundle <id> <subcommand>` where `<id>` is a DYNAMIC enabled-bundle id (e.g. `bundle web
show`), DISTINCT from the FIXED `bundle` verbs already wired as named subcommands (`new`/`enable`/`disable`;
`remove`/`list`/`template` come later). Disambiguation is clean because ids are validated to NOT be reserved
verbs (`parseBundleId` + `RESERVED_BUNDLE_VERBS`, task-26/27). commander resolves a NAMED subcommand before a
default, so `bundle new web` still routes to `new`; only a non-verb first token enters the per-bundle space.

**The mechanism (validated for: `-C` in EVERY position, the reserved-verb refusal intact, native per-leaf
parsing, and invalid-choice → exit 2). In `bundleModule.register`, after the `new`/`enable`/`disable` leaves:**

1. Register a **hidden variadic default catch-all** on the `bundle` group:
   ```ts
   const perBundle = group
     .command("* [args...]", { hidden: true })
     .description("operate on a specific bundle: `bundle <id> <show|meta|…>` (doc 10)")
     .allowUnknownOption(true) // forward --summary/--confirmation-level/etc to the inner sub-program verbatim
     .action(async (args: string[] | undefined) => {
       const [id, ...rest] = args ?? [];
       if (id === undefined) {
         // bare `bundle` with no id/subcommand: show the group's help (or a hint). Reuse commander's help.
         group.help(); // throws commander.help → exit 0 via runWithExit
         return;
       }
       const root = requireProject(ctx, parent);     // NotFoundError (exit 1) when no project — 57#4/58#4
       requireEnabledBundle(ctx, root, id);           // NotFoundError (exit 1) when id is not an enabled bundle
       const sub = buildPerBundleProgram(ctx, root, id);
       await sub.parseAsync(rest, { from: "user" });  // inner parse: native per-leaf options/choices
     });
   ```
   - `"* [args...]"` is commander's **default command** matched only when no named subcommand matches (commander
     `_dispatchSubcommand('*', …)`); `{ hidden: true }` keeps it out of help. `allowUnknownOption(true)` is what
     lets the post-id options (`--summary`, `--confirmation-level`, …) reach the action as part of `args` instead
     of erroring at the `bundle` level. **Do NOT use `enablePositionalOptions`/`passThroughOptions`** — they
     require turning on positional options at the PROGRAM level, which breaks `-C` placement (the prior-worker
     regression; re-confirmed). commander strips the global `-C/--project` from ANY position BEFORE computing the
     variadic `args` (validated: `-C` before / mid / after the dynamic route all set `program.opts().project`),
     so the inner program never sees `-C` and the outer `requireProject` reads it correctly.

2. **`buildPerBundleProgram(ctx, root, id)`** — a fresh commander `Command` carrying the per-bundle subcommands,
   parsed NATIVELY (each leaf owns its options/choices/help):
   ```ts
   function buildPerBundleProgram(ctx, root, id): Command {
     const sub = new Command();
     sub.name(`bundle ${id}`).description(`operate on bundle ${id} (doc 10)`);
     sub.exitOverride();                              // throw CommanderError instead of process.exit
     sub.configureOutput({                            // route help/errors to the SAME io sinks (57#5/58#5)
       writeOut: (s) => ctx.io.out.write(s),
       writeErr: (s) => ctx.io.err.write(s),
       outputError: (s) => ctx.io.err.write(s),
     });
     sub.showHelpAfterError();
     for (const mod of PER_BUNDLE_MODULES) {
       mod.register(sub, ctx, root, id);              // the reusable registration (PART 1a)
     }
     return sub;
   }
   ```
   - Inner errors propagate: the inner `parseAsync` is `await`ed inside the catch-all action, which is `await`ed
     by commander's outer `parseAsync` inside `run()`'s `runWithExit`. A `commander.invalidArgument` (bad
     `--confirmation-level`) / `commander.unknownOption` → exit 2; `commander.help`/`commander.version` → exit 0
     (already mapped by `src/util/exit.ts` `runWithExit`). A `DomainError` from a leaf action → exit 1. **No new
     error-mapping code is needed** — the existing handler covers nested CommanderErrors (same type) + domain
     errors.

3. **`requireEnabledBundle(ctx, root, id)`** — the shared bundle-context guard (NEW helper in `cli.ts`,
   alongside `requireProject`): throw `NotFoundError` (exit 1) when `<id>` is not an enabled bundle. Use the
   loaded project as the source of truth (the same load the read/mutation will do), OR a lightweight check:
   read `manifest.yml`, parse it, and require `id ∈ manifest.bundles` AND `fs.exists(bundles/<id>/bundle.yml)`.
   Prefer reading the manifest once here (pure, via the FileSystem port) so a non-enabled id fails BEFORE the
   sub-program parses its subcommand — message e.g. `bundle "<id>" is not an enabled bundle — run \`wpm bundle
   list\` to see enabled bundles, or \`wpm bundle enable <id>\``. (57#2 / 58 implied: meta on a non-enabled id
   must also NotFound.) NOTE: `show`/`meta`'s own operation also loads the project; the guard makes the failure
   precise + uniform for every per-bundle leaf (the 21 repeats reuse it). Keep it ONE place.
   - Edge: a valid-but-reserved-verb-ish first token can't reach here (a reserved verb routes to its named
     command first). A first token that is a malformed id (e.g. `Web`) is simply "not an enabled bundle" →
     NotFound — acceptable (no separate kebab error needed for the show/meta read path; the enabled-set check
     subsumes it).

### PART 1a — THE REUSABLE PER-BUNDLE REGISTRATION (the extension point for tasks 59-81)
Mirror `TOP_LEVEL_MODULES`/`CommandModule` but for the bundle-`<id>` space. Define:
```ts
interface PerBundleCommandModule {
  /** Attach this per-bundle subcommand(s) to the bundle's sub-program, with the resolved root + id. */
  register(sub: Command, ctx: CommandContext, root: string, id: string): void;
}
const PER_BUNDLE_MODULES: readonly PerBundleCommandModule[] = [
  bundleShowModule,   // task-57 (this story)
  bundleMetaModule,   // task-58 (this story)
  // tasks 59-81 (version/requires/files/templates/scripts/skills/installer-skills/advisor) APPEND here.
];
```
This is the spine the 21 repeats extend by adding ONE entry (like the project subgroups). **Spec it as the
documented extension point**: a future family registers its `bundle <id> <sub>` by adding a
`PerBundleCommandModule` to this list — no change to the routing/catch-all. (J-Q families will also need the
per-leaf completion path — see PART 4.)

### PART 1b — WHY this design (record in the story `--notes` for the reviewer)
- `enablePositionalOptions`/`passThroughOptions` on the program → breaks `-C` after a subcommand (prior-worker
  regression, re-confirmed empirically). Rejected.
- a parent `bundle.action` with `argument("[id]").argument("[args...]")` (no `*` command) → commander parses
  `--summary` as the `bundle` group's own option and errors `unknown option`. Rejected.
- the hidden `* [args...]` + `allowUnknownOption(true)` + a forwarded sub-program → each leaf is parsed natively
  (choices, required-args, help all work), `-C` is stripped by commander from any position before the variadic
  args, and the reserved verbs match as named subcommands first. **This is the chosen design.**

---

## PART 2 — `bundle <id> show` (task-57): a READ

**Operation (`src/core/operations/bundle-reads.ts`, NEW — pure over ports, a `ReadSpec`):**
`showBundleSpec(): ReadSpec<ShowBundleInput, BundleView>` where the READ INPUT carries what the pure projection
can't read itself — the target id AND the bundle's directory tree (the CLI shell lists `bundles/<id>/` via the
FileSystem port and threads it in, exactly as `validateProjectSpec` threads `bundleDirectoryNames`).
- `ShowBundleInput = { id: string; tree: readonly string[] }` (tree = relative paths under `bundles/<id>/`).
- `project(project, { id, tree })`:
  - `const bundle = project.bundles.get(id)` — the loaded `Project` holds a bundle in `project.bundles` ONLY if
    it's enabled (the loader reads each enabled bundle's `bundle.yml`). `bundle === undefined` → **the NotFound
    signal**: `throw new NotFoundError(\`bundle "${id}" is not an enabled bundle\`)` (57#2). (The routing's
    `requireEnabledBundle` already guards this, but keep the read total/defensive.)
  - project a render-agnostic `BundleView`: `{ id, version (string), summary, confirmation, requires: Array<{ id,
    range }> , tree }`. `requires` is the `ReadonlyMap<BundleId, VersionRange>` → an ordered array of `{ id,
    range }` (stringified) so the formatter and a future `--json` can't diverge.
- Read-only (57#3): `runRead` writes nothing.

**CLI leaf (`bundleShowModule`, a `PerBundleCommandModule`):**
- `sub.command("show").description("print this bundle's bundle.yml metadata and a tree summary (doc 10)")` +
  `.action(() => { … })`. It needs NO positional (`<id>` is already captured by the routing + threaded in).
- Action: list the bundle dir via the port (`bundleFileTree(ctx.deps.fs, root, id)` — a small helper that walks
  `bundles/<id>/` and returns sorted relative paths; reuse/mirror the `template show` tree-listing shape and the
  `bundleDirectoryNames` port pattern). Then `runRead(ctx.deps.fs, { root }, showBundleSpec(), { id, tree })`,
  and `ctx.io.out.write(formatBundleView(value))`.
- `formatBundleView(view)` (shell formatter, output-not-a-port): an `id/version/summary/confirmation` block +
  `requires:` (each `dep range` or `(none)`) + `Files:` tree (sorted relative paths, or `(none)`), mirroring
  `formatTemplateShow`'s style. Keep it readable; this is the human read.
- `withExamples([{ command: "wpm bundle web-handoff show", note: "inspect a bundle's metadata + files" }])`
  (57#5 needs an example). NOTE the example form is `wpm bundle <id> show` (id BEFORE the subcommand).

---

## PART 3 — `bundle <id> meta` (task-58): a MUTATION

**Operation (`src/core/operations/bundle-meta.ts` NEW, or extend `bundle-lifecycle.ts` — pure over ports, an
`OperationSpec`):** `editBundleMetaSpec(): OperationSpec<EditBundleMetaInput>` where
`EditBundleMetaInput = { id: string; version?: SemVer; summary?: string; confirmation?: ConfirmationLevel }`
(the version is ALREADY parsed at the CLI boundary — see below).
- `summary`: `(_p, { id }) => \`updated bundle ${id} metadata\``.
- **CHECK**: `if (project.bundles.get(id) === undefined) throw new NotFoundError(\`bundle "${id}" is not an
  enabled bundle\`)` (defense-in-depth with the routing guard).
- **APPLY** (`{ fs, root }`, _project, input): read `bundles/<id>/bundle.yml`; `editYaml(text, doc => { … })`
  updating ONLY the provided fields, comment-AND-key-order-preservingly (task-13 — 58#3):
  ```ts
  if (input.version !== undefined)      doc.setIn(["version"], input.version);
  if (input.summary !== undefined)      doc.setIn(["summary"], input.summary);
  if (input.confirmation !== undefined) doc.setIn(["confirmation"], input.confirmation);
  ```
  `editYaml`'s eemeli/yaml `Document` `setIn` REPLACES a scalar in place — preserving surrounding comments and the
  key ORDER (it does not re-serialise the whole doc) — so omitted flags leave their fields byte-untouched (58#1).
  Write back; `return { changedPaths: [bundleYmlPath] }`.
  - The field name is `confirmation` in `bundle.yml` (the model `BundleManifest.confirmation`; doc-10's flag is
    `--confirmation-level` but the YAML key is `confirmation` — VERIFY against the real bundle template/schema
    `serializeBundleManifest`; use whatever key the schema reads, so the round-trip parses). [Check
    `src/core/services/schema/bundle.ts` for the exact key — if it is `confirmation`, `setIn(["confirmation"],
    …)`; if `confirmation-level`, use that. The DOC says `--confirmation-level <safe|dangerous>`; the model field
    is `confirmation`. Match the on-disk key the parser expects.]
- **NO `materialise`** (meta queues no authoring work). ④ RERENDER is automatic: a changed `summary` flows to the
  front-door bundle menu (doc-10:34 / 58 the re-render is implicit). The harness re-derives from the reloaded
  project, whose bundle now has the new summary.

**CLI leaf (`bundleMetaModule`, a `PerBundleCommandModule`):**
- `sub.command("meta").description("edit this bundle's bundle.yml metadata (doc 10)")`
  `.option("--version <version>", "set the bundle's version (semver)")`
  `.option("--summary <summary>", "set the bundle's one-line menu summary")`
  `.addOption(new Option("--confirmation-level <level>", "how much consent this bundle's steps need")
     .choices([...CONFIRMATION_LEVELS]))`  // safe|dangerous; a bad value → commander usage error exit 2 (58#2)
- Action `(opts: { version?: string; summary?: string; confirmationLevel?: ConfirmationLevel })`:
  - **at least one flag** — if none of the three is provided, this is a usage error: `throw new UsageError(
    "bundle <id> meta needs at least one of --version, --summary, --confirmation-level")` (exit 2). (doc-10:158
    "Update fields from flags" implies flags drive the edit; a no-flag invocation would write nothing — surface
    it rather than silently no-op.)
  - parse `--version` at the boundary: `if (opts.version !== undefined) { const p = parseSemVer(opts.version); if
    (!p.ok) throw new UsageError(p.problem.message); version = p.value; }` (exit 2 on a bad semver, like `project
    version set`). This SETS the bundle version field — the same `bundle.yml.version` a future `bundle <id>
    version set` writes. **The program `--version` fix does NOT interfere**: this `--version` is parsed by the
    inner per-bundle sub-program, not the program, and the program version is `-V`-only — verified that `bundle
    <id> meta --version <v>` reaches the leaf.
  - `runMutation(lifecycleDepsFor(ctx, root), { root }, editBundleMetaSpec(), { id, version?, summary?,
    confirmation? })` → `formatResult` + (optionally) `writeWarnings` (meta emits none, but keep the uniform call
    harmless OR omit — your call).
  - map `opts.confirmationLevel` → `confirmation` in the input (the commander camelCase of `--confirmation-level`
    is `confirmationLevel`).
- `withExamples([{ command: "wpm bundle web-handoff meta --summary \"web handoff installer\" --confirmation-level
  dangerous", note: "set a bundle's summary + consent level" }])` (58#5 needs an example + every flag described).

---

## PART 4 — COMPLETION (the dynamic `<id>` segment defeats the path walker — spec the fix)
`completeArgv` (`src/completion/complete.ts`) resolves a completion by walking the commander tree via
`descend`/`commandPath` and looking the path up in `COMPLETION_SPECS`. The per-bundle subcommands live on a
SEPARATE sub-program (built per-id at dispatch), NOT in the outer tree — so by default `descend("bundle web meta
--confirmation-level <tab>")` stays at the `bundle` group (it can't see `meta`/`--confirmation-level`), and the
hidden `*` command would even leak into the `bundle <tab>` subcommand suggestions. Two minimal fixes:

1. **Exclude hidden commands from subcommand-name suggestions** (so `*` never appears): in `completeArgv` step
   (3) and `descend`'s subcommand match, filter `!c._hidden` in addition to `!== "help"`. (Small, correct, and
   needed regardless.) Add a `visibleSubcommandNames(cmd)` that excludes hidden + help.

2. **Recurse into the per-bundle sub-program for `bundle <id> …`** — the dynamic-segment handler. The cleanest
   minimal change: in `completeArgv`, BEFORE the generic resolution, detect the per-bundle prefix: if the typed
   words begin with `bundle <X>` where `<X>` is NOT a visible `bundle` subcommand name and NOT a flag, treat
   `<X>` as the id and **recurse** into a per-bundle program built for completion:
   ```
   if (words[0] === "bundle" && words.length >= 2 && !words[1].startsWith("-")
       && visibleSubcommandNames(bundleGroup).indexOf(words[1]) < 0) {
     // <id> position: if the partial IS words[1] (completing the id) → suggest enabled bundle ids.
     // else recurse with a per-bundle program over words.slice(2), under a synthetic path prefix
     // `bundle <id>` so the per-bundle COMPLETION_SPECS resolve.
   }
   ```
   - **The `bundle <tab>` id position** (completing the first token after `bundle`, i.e. `prior` ends at
     `bundle`): suggest **enabled bundle ids** (`bundle-ids` source) — NOT the subcommand names. So at the
     `bundle` group, the completion offers BOTH the fixed verbs AND the enabled bundle ids. SIMPLEST robust
     approach: register a `COMPLETION_SPECS["bundle"] = { args: ["bundle-ids"] }` AND make step (3) at the
     `bundle` group MERGE the visible subcommand names with the positional source for index 0 (the verbs + the
     ids), since `bundle` is both a group (has verbs) and takes a dynamic id. Spec this merge precisely: at a
     command that has BOTH subcommands and an `args[0]` source, union the (visible) subcommand names with the
     source's suggestions, prefix-filtered. (This makes `bundle <tab>` → `new enable disable web-handoff
     doc-handoff …`.)
   - **The per-bundle subcommand/flag positions** (`bundle web <tab>` → `show meta …`; `bundle web meta
     --confirmation-level <tab>` → `safe dangerous`): build a per-bundle program (the SAME `buildPerBundleProgram`
     shape, but it needs no real root/ctx for completion — it only needs the command TREE: subcommands + their
     options/choices) and recurse `completeArgv(perBundleProgram, words.slice(2), deps)` with a specs view keyed
     under the per-bundle paths (`"show"`, `"meta"`). Register the per-bundle completion specs as a nested map
     and resolve them by the inner path. `meta`'s `--confirmation-level` → `confirmation-levels` (existing
     source). Keep the per-bundle completion specs co-located with `PER_BUNDLE_MODULES` (each module can expose
     its completion fragment), so the J-Q families add theirs alongside their subcommand.
   - **If a clean recursion proves fiddly within this story's scope**, the ACCEPTABLE MINIMUM (record as a noted,
     justified partial): (a) `bundle <tab>` completes enabled bundle ids (57#4/58#4 — the AC explicitly requires
     "the id completes from enabled bundles"); (b) `bundle <id> meta --confirmation-level <tab>` completes
     `safe|dangerous` (58#4 explicitly requires this) via a targeted special-case in `completeArgv` for the
     `… meta --confirmation-level` tail. Both ACs (57#4, 58#4) name SPECIFIC completions that MUST work; the
     general per-bundle subcommand-name completion (`bundle web <tab>` → `show meta`) is desirable but only
     57#4/58#4 are AC-bound. Get the AC-bound completions working; if the full recursion is in reach, do it (the
     J-Q families benefit) — but do not block the story on the general case if it risks the gate. **Whatever you
     choose, the two AC-named completions (enabled-bundle-id at `bundle <tab>`; confirmation-levels at `meta
     --confirmation-level`) MUST pass a test.**

> The completion is the one genuinely tricky part (the dynamic segment is new). Prefer the clean recursion (it's
> the reusable answer for 21 families). Record exactly what you implemented + any deferral in `--notes`.

---

## Files to change
- **CHANGE** `src/cli.ts` — the `* [args...]` catch-all + `buildPerBundleProgram` + `requireEnabledBundle` +
  the `PerBundleCommandModule` interface + `PER_BUNDLE_MODULES` (with `bundleShowModule`/`bundleMetaModule`) +
  the `formatBundleView` shell formatter + the `bundleFileTree` port helper; the completion `COMPLETION_SPECS`
  for the per-bundle paths + the `bundle` id-position source.
- **ADD** `src/core/operations/bundle-reads.ts` — `showBundleSpec` (+ the `BundleView`/`ShowBundleInput` types).
- **ADD** `src/core/operations/bundle-meta.ts` (or extend `bundle-lifecycle.ts`) — `editBundleMetaSpec`.
- **CHANGE** `src/completion/complete.ts` — exclude hidden commands from suggestions; the per-bundle recursion /
  the AC-named special-cases; the `bundle`-group verbs+ids merge.
- **ADD** `test/unit/cli/bundle-id-commands.test.ts` — the in-process AC + routing tests.
- **CHANGE/ADD** `test/integration/cli.bundle-id.e2e.test.ts` (or extend an existing integration file) — the
  real-binary routing verification.
- (No `docs/`/`templates/`/`package.json`/`.bmad/`/`backlog/` change.)

## Tests (AC-driven, in-process via `run()` + `MemoryFileSystem` fixtures; mirror the bundle-lifecycle tests)
Seed a realistic project at `/proj` (copy the seed shape from `bundle-lifecycle-commands.test.ts`): `manifest.yml`
with `bundles: [web]`; `bundles/web/bundle.yml` (full schema — id/version/summary/confirmation/requires) WITH a
COMMENT and a specific key order (so 58#3's comment+order preservation is testable); the project template snippets
at the builtin root (front-door + orchestrator + advisor) so ④ RERENDER resolves; `installer-skills/` exists;
FakeBacklog `init`'d at `.authoring-backlog`. Drive via `run(["bundle", …, "-C", "/proj"], deps, io)`.

### THE ROUTING (the pattern-setter — test it directly)
- a FIXED verb still routes to its command: `bundle new acme -C /proj` → exit 0, creates `bundles/acme` (the `*`
  catch-all did NOT swallow it).
- a NON-verb id enters the per-bundle space: `bundle web show -C /proj` → exit 0, prints metadata (routed to the
  show leaf, not treated as a bad `bundle` subcommand).
- `-C` works around the dynamic route: `bundle web show` with `-C /proj` placed AFTER the subcommand → exit 0
  (and a no-`-C` run from a cwd inside the project also resolves). Also `-C /proj bundle web show` (before).
- a non-enabled id is NotFound: `bundle ghost show -C /proj` → exit 1 (`requireEnabledBundle`), `io.err` matches
  `/not an enabled bundle/i`.

### `bundle <id> show` (task-57)
- **AC#1**: `bundle web show -C /proj` → exit 0; stdout contains the id, version, summary, confirmation, and the
  tree (e.g. `bundle.yml` appears in the Files list). Seed an extra file under `bundles/web/` (e.g.
  `bundles/web/payload/files/x.txt`) and assert it appears in the tree summary.
- **AC#2**: a non-enabled id → exit 1, NotFound. (Also: an id present on disk but DISABLED — seed
  `bundles/draft/` but `bundles: [web]` — `bundle draft show` → exit 1, since draft is not enabled.)
- **AC#3 read-only**: snapshot the fs (or assert `result.changedPaths` empty / the manifest+bundle.yml unchanged)
  after `show`.
- **AC#4 no-project**: cwd a no-manifest dir, no `-C` → exit 1 naming `manifest.yml` + `init`. **completion**:
  `completeArgv` for `bundle <tab>` (the id position) includes `web` (enabled-bundle ids).
- **AC#5 help**: `bundle web show --help` → exit 0, has description / `Usage:` / `Example`. (The help routes
  through the inner sub-program's `configureOutput` to `io.out`.)

### `bundle <id> meta` (task-58)
- **AC#1 update only provided fields**: seed `bundle.yml` with `version: 0.1.0`, `summary: old`, `confirmation:
  safe`. `bundle web meta --summary new -C /proj` → exit 0; re-parse `bundle.yml`: `summary === "new"`, AND
  `version` STILL `0.1.0`, `confirmation` STILL `safe` (omitted untouched). Separately `--version 2.0.0` →
  version updated, summary/confirmation untouched; `--confirmation-level dangerous` → confirmation updated only.
- **AC#2 bad confirmation-level → exit 2**: `bundle web meta --confirmation-level bogus -C /proj` → exit 2
  (commander invalidArgument); `bundle.yml` unchanged.
- **AC#3 comments + key order preserved**: seed `bundle.yml` with a leading comment line and a known key order;
  after `bundle web meta --summary new`, assert the comment line is STILL present and the key order is unchanged
  (compare the key sequence, or assert the comment substring survives + the non-edited lines are byte-identical).
- **AC#1 --version sets the BUNDLE version**: `bundle web meta --version 3.1.4` → `bundle.yml.version === "3.1.4"`
  (NOT the program version; the inner sub-program parsed it). Bad semver `--version notsemver` → exit 2.
- **at-least-one-flag**: `bundle web meta -C /proj` (no flags) → exit 2 (UsageError), nothing changed.
- **rerender**: after `meta --summary new`, the front-door menu reflects the new summary (or assert the rerender
  ran — `AGENTS.md` in changedPaths / contains `new`).
- **AC#4 no-project** → exit 1 naming `manifest.yml`. **completion**: `completeArgv` for `bundle web meta
  --confirmation-level <tab>` → `["safe","dangerous"]`; and `bundle <tab>` → includes `web`.
- **AC#5 help**: `bundle web meta --help` → exit 0; has description / `Usage:` / every flag (`--version`,
  `--summary`, `--confirmation-level`) / `Example`.

### Cross-cutting
- the task-28 help-completeness guard (`help-contract.test.ts`) walks the commander tree — the hidden `*`
  catch-all has a description but is hidden; ensure the guard does not trip on it (the per-bundle leaves live on
  a sub-program the top-level guard won't see — the guard checks the MAIN tree; the `*` command needs a
  description + an example IF the guard inspects hidden commands; verify the guard's behavior and satisfy it, OR
  confirm hidden commands are exempt). If the guard inspects the `*` command, give it a `withExamples`.
- the task-29 completion tests pass (the tree gained the hidden `*`; the dispatch gained the per-bundle handling).
- **real-binary** (`describeIfBuilt` + `execFileSync`, the `cli.bundle-lifecycle.e2e.test.ts` pattern): on a real
  init'd project with a real bundle (`init` → `bundle new web`), `node dist/cli.js bundle web show` prints the
  metadata + tree; `node dist/cli.js bundle web meta --summary "X" --confirmation-level dangerous` updates
  `bundle.yml` (re-read it); `node dist/cli.js bundle web meta --confirmation-level bogus` exits 2; a fixed verb
  (`bundle new …`) still works; `__complete bundle web meta --confirmation-level ""` → `safe`/`dangerous`.
  Requires `npm run build` before the gate.

## DoD (the backlog DoD for tasks 57/58)
- `tsc --noEmit` clean; `biome check src test` clean **0/0** (run `--write` first). `vitest run` green (SINGLE
  process). `npm ci` clean. **Core import-boundary intact** — `bundle-reads.ts`/`bundle-meta.ts` import nothing
  effectful (the bundle.yml edit goes through the FileSystem port; `editYaml`/`parseSemVer`/the schema are pure).
  The routing/sub-program/completion changes live in `src/cli.ts` + `src/completion/` (the sanctioned impure
  shell). No dead code; the routing, `requireEnabledBundle`, `PerBundleCommandModule`, and the specs documented.
  **Run `npm run build` before the final gate** so the real-binary tests execute.

## Previous-story intelligence (carried forward)
- **Group G (bundle lifecycle, just merged)** established: the `bundleModule` `new`/`enable`/`disable` leaves;
  `requireProject`/`lifecycleDepsFor`/`formatResult`/`writeWarnings`; the `--version` fix (program version
  `-V`-only + top-level interception) — **this is why `bundle <id> meta --version` works** (the program no longer
  shadows a subcommand `--version`). Seed shape + `complete()` helper (cwd=PROJ) from
  `bundle-lifecycle-commands.test.ts`; the real-binary `describeIfBuilt` E2E shape from
  `cli.bundle-lifecycle.e2e.test.ts`.
- **task-25 `runMutation`/`runRead`**: ① LOAD reads `manifest.yml` + each ENABLED bundle's `bundle.yml` → so a
  non-enabled id is absent from `project.bundles` (the NotFound signal for show/meta). ④ RERENDER re-derives the
  front-door from the post-apply project (meta's summary change flows to the menu). `runRead` writes nothing.
- **task-13 `editYaml(text, doc => doc.setIn([...], value))`** is comment-AND-key-order preserving (eemeli/yaml
  `Document`; `setIn` replaces a scalar in place) — the mechanism for 58#3. `parseSemVer` validates `--version`
  at the boundary (UsageError → exit 2). `CONFIRMATION_LEVELS` + the `confirmation-levels` completion source
  already exist (task-29/enums). The bundle.yml key for the confirmation level is `confirmation` (model field) —
  verify against `serializeBundleManifest`/`parseBundleManifest`.
- **task-29 completion**: `completeArgv` descends the commander tree by NAME — it can't see the per-bundle
  sub-program (built per-id at dispatch); the dynamic `<id>` segment is the new completion concern (PART 4).
- `formatTemplateShow`/`formatOrientation` are the shell-formatter models for `formatBundleView`. The exit
  handler (`src/util/exit.ts`) maps nested `CommanderError`s (invalid→2, help/version→0) + domain errors (→1)
  with NO new code.

## Boundaries (do NOT do here)
- Implement ONLY `show` + `meta` leaves — NOT `version`/`requires`/`files`/`templates`/`scripts`/`skills`/
  `installer-skills`/`advisor` (tasks 59-81). BUT DO build the reusable `PerBundleCommandModule`/
  `PER_BUNDLE_MODULES` registration they extend (that's the point). Do NOT break `-C` placement or the
  reserved-verb refusal (the `new`/`enable`/`disable` named subcommands must still match first). Do NOT use
  `enablePositionalOptions`/`passThroughOptions` (breaks `-C`). Do NOT let the bundle.yml edit re-serialise the
  whole document (use `setIn` for in-place field edits → comments + key order preserved). Do NOT import
  `node:fs`/`commander` under `src/core/**`. Do NOT edit `docs/`, the repo-root `AGENTS.md`/`CLAUDE.md`, `.bmad/`,
  `templates/`, or the dev `backlog/`. If doc-10 specifies something this sketch omits, the DOC wins — add it +
  note the divergence.

## Dev Agent Record
### Agent Model Used
Opus 4.8 (1M) — bmad-dev-story.

### Completion Notes List
- **THE ROUTING — final design DIVERGED from the story's `*`-catch-all sketch (and it's better).** The story
  proposed a hidden `* [args...]` catch-all ON the bundle group. Implemented and validated it for dispatch/`-C`/
  exit-codes — but it FAILED the help contract: commander's GROUP-level auto-help is greedy and fires for ANY
  `--help` in the group's args, so `bundle web meta --help` showed the GROUP help, not the leaf's (AC#5). Every
  attempt to disable/forward help at the group/star level broke a different case (`bundle new --help` →
  unknown-option, or `bundle --help` → unknown-option). **Resolved by routing the per-bundle space at `run()`
  level, BEFORE commander** (the same proven pattern as the `--version` interception): `isPerBundleInvocation`
  detects `bundle <non-verb-id> …` (skipping a leading `-C/--project/--debug`), and `dispatchPerBundle` extracts
  the global `-C`, resolves the project + the enabled bundle, and parses the per-bundle tail with a per-bundle
  sub-program. This FULLY separates the dynamic space from commander's group, so: per-bundle leaf `--help` →
  the leaf's help; `bundle --help`/`bundle new --help` → the main program (group/leaf help); the named verbs are
  untouched. A `--help`/`-h` request is dispatched to the sub-program BEFORE requiring a project (help is help,
  consistent with the named verbs). Recorded as the divergence; the `*`-catch-all is NOT used.
- **The reusable per-bundle registration (the extension point for tasks 59-81):** `PerBundleCommandModule`
  (`register(sub, ctx, root, id)`) + `PER_BUNDLE_MODULES: [bundleShowModule, bundleMetaModule]` +
  `buildPerBundleProgram(ctx, root, id)` (a fresh `Command`, name `bundle <id>`, `exitOverride`, output routed to
  the same io sinks, each module registered). A future family ADDS one `PerBundleCommandModule` + (if it has
  completable options) one entry to `PER_BUNDLE_COMPLETION_SPECS` — the routing/dispatch needs NO change. This is
  the bundle-`<id>` analogue of `TOP_LEVEL_MODULES`. `requireEnabledBundle(ctx, root, id)` is the shared
  enabled-bundle guard (NotFound exit 1) every per-bundle leaf inherits.
- **Error mapping reuse:** the inner sub-program's `parseAsync` runs under the outer `runWithExit`, so a
  per-bundle leaf's `commander.invalidArgument` (bad `--confirmation-level`) → exit 2, `commander.help` → exit 0,
  a `DomainError` → exit 1 — NO new error-mapping code (the existing `src/util/exit.ts` handler covers nested
  CommanderErrors, same type).
- **`bundle <id> show` (57):** `showBundleSpec` (READ) projects the bundle metadata + threads the file tree in as
  input (the CLI's `bundleFileTree` walks `bundles/<id>/` via the FileSystem port — the `validateProjectSpec`
  pattern). A non-enabled id → `project.bundles.get(id)===undefined` → NotFound (AC#2). `formatBundleView`
  renders id/version/summary/confirmation + requires + the file tree. Read-only (AC#3).
- **`bundle <id> meta` (58):** `editBundleMetaSpec` (MUTATION) updates ONLY the provided fields via `editYaml`
  `setIn(["version"]/["summary"]/["confirmation"])` — in-place, so omitted fields are byte-untouched (AC#1) and
  comments + key order survive (AC#3, tested against a `bundle.yml` seeded with a leading comment + known order).
  `--version` is parsed at the boundary (`parseSemVer` → UsageError exit 2 on a bad value); `--confirmation-level`
  uses `.choices(["safe","dangerous"])` → exit 2 on a bad value (AC#2). At-least-one-flag is enforced (else a
  UsageError, exit 2). ④ RERENDER (the harness) flows a changed summary to the front-door menu (verified). The
  YAML key is `confirmation` (the model field; the doc flag is `--confirmation-level`) — confirmed against
  `parseBundleManifest`/`serializeBundleManifest` + a real `bundle.yml`.
- **`--version` does NOT interfere:** `bundle <id> meta --version <v>` is parsed by the inner sub-program (the
  program version is `-V`-only from the prior story), so it sets the BUNDLE version — verified in-process + on
  the real binary.
- **Completion (the dynamic `<id>` segment, the tricky part):** (1) `complete.ts` now excludes HIDDEN commands
  (`_hidden`) AND, at a command that has both subcommands and an `args[index]` source, UNIONS the visible
  subcommand names with the positional source — so `bundle <tab>` offers the verbs (`new`/`enable`/`disable`)
  UNIONED with the enabled-bundle ids (`bundle-ids`), via `COMPLETION_SPECS["bundle"] = { args: ["bundle-ids"] }`.
  (2) The CLI's `computeCompletions` (in `emitCompletions`) detects `bundle <id> <tail…>` (id complete, non-verb)
  and RECURSES `completeArgv` into the per-bundle sub-program with `PER_BUNDLE_COMPLETION_SPECS` — so `bundle web
  <tab>` → `show`/`meta`, and `bundle web meta --confirmation-level <tab>` → `safe`/`dangerous`. Both AC-named
  completions (57#4 enabled ids; 58#4 confirmation-levels) pass tests (the id-position in-process; the per-bundle
  recursion via the real-binary `__complete` E2E). Full per-bundle recursion implemented (not the minimal
  fallback) — the J-Q families inherit it.
- **Gate (cold, CI order):** `npm ci` 0 vulns / `tsc` 0 / `biome ci src test` 0/0 (137 files, no info) / `npm run
  build` 0 / `npm test` 676 passed (68 files; the real-binary + real-backlog E2E executed against fresh `dist/`).
  Core import-boundary intact (`bundle-reads.ts`/`bundle-meta.ts` import nothing effectful).

### File List
- ADD `src/core/operations/bundle-reads.ts` — `showBundleSpec` (+ `BundleView`/`ShowBundleInput`).
- ADD `src/core/operations/bundle-meta.ts` — `editBundleMetaSpec` (+ `EditBundleMetaInput`).
- ADD `test/unit/cli/bundle-id-commands.test.ts` — 21 in-process routing + show + meta AC tests.
- ADD `test/integration/cli.bundle-id.e2e.test.ts` — 6 real-binary E2E tests (routing/show/meta/help/completion).
- CHANGE `src/cli.ts` — the `run()`-level per-bundle routing (`isPerBundleInvocation`/`dispatchPerBundle`/
  `extractProjectOption`); `requireEnabledBundle`; `PerBundleCommandModule`/`PER_BUNDLE_MODULES`/
  `buildPerBundleProgram`; `bundleShowModule`/`bundleMetaModule`; `formatBundleView`/`bundleFileTree`;
  `computeCompletions` per-bundle recursion; `COMPLETION_SPECS["bundle"]` + `PER_BUNDLE_COMPLETION_SPECS`.
- CHANGE `src/completion/complete.ts` — `visibleSubcommandNames` (exclude hidden + help); the subcommands ∪
  positional-source union at a group that also takes a dynamic positional.

### Review Follow-ups (AI) — applied
- ✅ **S1 (SHOULD) — completion ≠ dispatch on `-C/--project` placement.** `computeCompletions` checked
  `words[0] === "bundle"` WITHOUT stripping leading globals, so `wpm -C <dir> bundle web <tab>` (real omelette
  line: `["-C","<dir>","bundle","web",""]`) skipped the per-bundle recursion and mis-suggested the GROUP verbs
  (`new`/`enable`/`disable`) instead of the per-bundle leaves (`show`/`meta`). **Fix — one shared helper so
  completion and dispatch CANNOT drift:** added `stripGlobalOptions(tokens)` (removes every `-C <val>` /
  `--project <val>` / `--debug`), and refactored ALL THREE call sites to use it — `isPerBundleInvocation`,
  `dispatchPerBundle` (its `positional` build), and `computeCompletions` (the per-bundle detection + the recursion
  now run on the STRIPPED words; the post-id tail is sliced from the stripped words). The non-per-bundle
  fall-through still uses the ORIGINAL words, so `-C <tab>` value completion is unaffected (it returns nothing
  either way — verified). **Second, related asymmetry found + fixed at the id position:** `completeArgv`'s
  `descend` (in `complete.ts`) treated a `-C` VALUE (`<dir>`) as a positional operand, so `wpm -C <dir> bundle
  <tab>` descended wrong and dropped the enabled-bundle ids. `descend` now skips the value token after a
  value-taking PROGRAM-root option (the `-C`/`--project` globals), so `bundle <tab>` with a leading `-C` resolves
  verbs ∪ enabled ids correctly (the `-C` stays in `words` for `extractProjectOverride` to resolve the project).
  **Real-binary before → after** (`__complete -C <dir> bundle web ""`): before = `new enable disable`; after =
  `show meta`. Also verified `--project <dir>` form, `meta --confirmation-level` with a `-C` prefix → `safe
  dangerous`, and `bundle <tab>` with `-C` → verbs + ids. **Tests:** a `-C`-prefix completion E2E case in
  `cli.bundle-id.e2e.test.ts` (asserts the per-bundle leaves + the option-value + the id position over the real
  binary, from a cwd OUTSIDE the project so only `-C` can resolve it) + an in-process unit assertion in
  `bundle-id-commands.test.ts` (the `descend` global-value-skip at the id position). **Re-gate (cold):** `npm ci`
  0 / `tsc` 0 / `biome ci` 0/0 (137 files) / build 0 / `npm test` 682 passed (68 files).

### Status
review
