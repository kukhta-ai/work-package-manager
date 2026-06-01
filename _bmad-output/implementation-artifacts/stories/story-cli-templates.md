# Story cli-templates — `template list` + `template show` (tasks 35 + 36)

Status: ready-for-dev

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 10 §"Per-command actions" rows 138–139 (the two `template` commands) + §"Project context
> resolution" (line 195: "`template list`/`show` fall back to built-ins only when no project is resolved") +
> the task-27 `CommandModule` registration/DI/exit pattern + task-28 `withExamples`/the help completeness guard
> + task-29 the completion-source registry). The FIRST family-grouped CLI build (epic tasks 34–84): two
> READ-only `template` leaves that ride the existing `listTemplates`/`resolveTemplate` services — no new core
> logic, just CLI wiring + read projections + formatting + help + completion.

## Story
As an author at the terminal, I want `wpm template list` to show every template I can scaffold from (built-in
+ my project's `templates/`, with shadowing made visible) and `wpm template show <name>` to print a template's
metadata + its file tree — both read-only, both working inside or outside a project — so I can discover and
inspect templates before `init`/`bundle new`.

## Acceptance criteria (verbatim from the backlog)
### TASK-35 — `template list [--scope project|bundle]`
1. Inside a project the listing includes both project-local templates and built-ins; outside any project it
   lists built-ins only.
2. When a project-local template shares a name with a built-in, the listing shows the project-local one
   shadowing the built-in.
3. The `--scope project` or `--scope bundle` option filters the listing to templates of that scope.
4. The command reads and reports only, with no change on disk, and exits 0 on success.
5. Help output is substantive (description, synopsis, the `--scope` flag and its values, an example) and
   `--scope` completes from the finite set `project` and `bundle`.
### TASK-36 — `template show <name> [--scope project|bundle]`
1. Given a template name, the command resolves it with project-local priority over built-in and prints its
   metadata from `template.yml` plus a tree summary of its `files/` tree.
2. The `--scope` option disambiguates when a project-scope and a bundle-scope template share a name.
3. A name matching no available template fails with a typed not-found error and a non-zero exit.
4. The command reads and reports only, with no change on disk, and exits 0 on success.
5. Help output is substantive (description, synopsis, the positional and `--scope`, an example); the `<name>`
   positional completes from available template names and `--scope` from `project` and `bundle`.

## doc-10 contract (cite the rows)
> `template list [--scope ...]` → "1. Enumerate templates from built-in + (project's `templates/`, if in one)
> 2. Apply `--scope` filter 3. Print grouped by source, indicating shadowing (project shadows built-in)".
> `template show <name> [--scope ...]` → "1. Resolve by name + scope (project → built-in priority) 2. Read
> `template.yml` 3. Print metadata + a tree summary of `files/`". [Source: docs/10 §"Per-command actions",
> the `template` rows.] Project-aware fallback: "`template list`/`show` fall back to built-ins only when no
> project is resolved." [Source: docs/10 §"Project context resolution".]

## The services ALREADY EXIST — reuse, don't rebuild (doc 13 §4; src/core/services/template-resolver.ts)
- `listTemplates(deps: ResolverDeps, filter?: { scope? }) → TemplateSummary[]` — lists `<root>/<scope>/<name>`
  across `builtinTemplatesRoot` (required) + `projectTemplatesRoot` (optional), **merged + de-duplicated**
  (project-local shadows a same-`scope/name` built-in), scope-filterable, sorted. `TemplateSummary = { name,
  scope }`. **It does NOT expose which source won or that shadowing happened** — so the CLI projection (below)
  lists per-source to render the shadowing.
- `resolveTemplate(name, scope, deps) → TemplateResolution` — `{ found: true, template }` (project-local
  priority over built-in) | `{ found: false, name, scope, searched: string[] }`. `Template = { name, scope,
  parameters: { name, description?, default? }[], files: { path, content }[], snippets: … }`.
- `ResolverDeps = { fs, builtinTemplatesRoot, projectTemplatesRoot? }`. `TemplateScope = "project" | "bundle"`.
- A malformed `template.yml` on a FOUND template is a thrown `Error` (template-authoring bug); a miss is the
  `found:false` DATA the CLI maps to `NotFoundError`.

## Design — the CLI wiring (`src/cli.ts`; the shell, output is not core — doc 13 §3)
Convert the `template` `groupOnly` placeholder into a real `templateModule: CommandModule` registering a
`template` group + two leaves. Both are READ commands: they call the resolver services directly + format +
return 0 — NO `runMutation`, NO `fs.write`, NO disk change.

### Context handling (tolerant — doc 10 line 195)
Both leaves resolve context with `resolveContext({ fs, env }, projectOverride?)` (task-24), reading the global
`-C/--project` via `parent.opts().project`. **No-project is NOT an error here** (unlike `bundle new`): when
`context.found`, pass `projectTemplatesRoot = join(context.root, "templates")`; else omit it (built-ins only).
A small shared helper, e.g. `resolveProjectTemplatesRoot(ctx, parent): string | undefined`, computes it.

### `--scope` parsing + validation
`--scope <scope>` is optional and must be `project` | `bundle`. A bad value → `UsageError` (exit 2, task-23).
- **Recommended:** use commander's `.choices(["project", "bundle"])` on the option IF it (a) renders the
  choices in `--help` and (b) does not break the task-29 completion (the `--scope` source is `"template-scopes"`
  in `COMPLETION_SPECS`, independent of commander's choices). VERIFY at dev time: `.choices()` makes commander
  reject a bad value with its own usage error → that surfaces as a `CommanderError` → exit 2 (the `runWithExit`
  table already maps commander usage errors to 2). If `.choices()` renders cleanly and exits 2 on a bad value,
  use it (less code). ELSE validate manually in the action: `if (scope !== undefined && scope !== "project" &&
  scope !== "bundle") throw new UsageError(...)`. STATE which you used.
- A validated `scope` is passed to `listTemplates`'s filter / as the `resolveTemplate` scope.

### `template list` leaf (task-35) — the read projection + formatting
1. Resolve the project-templates root (tolerant).
2. **Per-source listing to render shadowing (35 AC#2):** the existing `listTemplates` merges, so list each
   source SEPARATELY by reusing the SAME service:
   - built-ins: `listTemplates({ fs, builtinTemplatesRoot }, { scope? })`.
   - project (only if a project resolved): `listTemplates({ fs, builtinTemplatesRoot: projectRoot }, { scope? })`
     — passing the project root AS the `builtinTemplatesRoot` makes `listTemplates` enumerate `<projectRoot>/
     <scope>/<name>` (it just lists a root's `<scope>/` dirs; the param name is incidental). This REUSES the
     service without a new core function.
   - A `scope/name` present in BOTH the project list and the built-in list is **shadowing** (the project one
     wins; the built-in is shadowed).
3. **Format (CLI layer):** `formatTemplateList(builtins, projectLocals)` → grouped by source. Suggested shape:
   ```
   Project templates (./templates):
     project/single-bundle      (shadows built-in)
     bundle/adopts-tool
   Built-in templates:
     project/minimal
     project/single-bundle      (shadowed by project-local)
     bundle/default
   ```
   - Group "Project templates" only appears when a project resolved AND it has templates; otherwise just the
     built-in group (covers AC#1's outside-a-project case).
   - Mark each shadowing project entry `(shadows built-in)` and each shadowed built-in `(shadowed by
     project-local)` — so AC#2's shadowing is VISIBLE in the output, deterministically (the test asserts these
     markers). Show `scope/name` (or group by scope) so AC#3's `--scope` filtering is observable.
   - Empty result (no templates of the requested scope) → a clear "no templates found" line, still exit 0.
4. `ctx.io.out.write(formatTemplateList(...))`; the action returns (exit 0). NO disk write.

### `template show <name>` leaf (task-36) — the read projection + formatting
1. Resolve the project-templates root (tolerant).
2. **Resolve scopes:** if `--scope` given, resolve only that scope; else try BOTH scopes (`project` then
   `bundle`) and use the first hit — but if BOTH match the name, that is the clash `--scope` disambiguates (36
   AC#2): without `--scope`, prefer one deterministically AND note the other, OR (cleaner) require `--scope`
   when both match and emit a `UsageError` naming the clash. DECIDE + STATE: simplest faithful behavior — try
   `project` then `bundle`; if a name resolves in BOTH and no `--scope` was given, raise a `UsageError`
   ("template `<name>` exists as both project and bundle — pass `--scope project|bundle`"); with `--scope`,
   resolve exactly that scope. (This makes AC#2's disambiguation a real, tested behavior.)
3. `resolveTemplate(name, scope, { fs, builtinTemplatesRoot, projectTemplatesRoot? })`. `found:false` (no scope
   matched) → `throw new NotFoundError(\`template "<name>" not found (searched: …)\`)` → exit 1 (36 AC#3).
4. **Format (CLI layer):** `formatTemplateShow(template, source)` → metadata + the files tree. Suggested:
   ```
   Template: single-bundle  (scope: project, source: built-in)
   single-bundle — a minimal project plus a pre-included core bundle.   ← description if template.yml had one
   Parameters:
     project-name    the project's name (kebab-case)        ← name + description (+ "default: X" if set)
   Files:
     manifest.yml.tmpl
     installer-skills/{{project-name}}-installer/SKILL.md.tmpl
     …                                                       ← a tree/flat summary of template.files paths
   ```
   - Metadata from the `Template`: name, scope, the source (built-in vs project — known from which root
     resolved; resolveTemplate doesn't return it, so the CLI determines source by checking whether the
     project root produced a same name+scope first — reuse the per-source list, OR resolve against project-only
     then built-in-only to learn the source). Parameters: name + description + default. Files: the `template.
     files[].path` list (a tree summary — sort + print paths; AC#1 "tree summary of its files tree").
   - Note: `template.yml` itself isn't in `files`; `files` is the `files/` subtree the resolver read. Print the
     `files[].path` values. (Snippets are out of scope for the show output unless trivially added — keep to
     doc-10's "tree summary of `files/`".)
5. `ctx.io.out.write(...)`; return (exit 0). NO disk write.

### `withExamples` + completion (task-28 + task-29)
- Each leaf carries a `withExamples` worked example (the task-28 completeness guard REQUIRES one for a command
  with options/args): e.g. `wpm template list --scope bundle`; `wpm template show minimal --scope project`.
- `COMPLETION_SPECS` additions (reuse the existing task-29 sources — `"template-scopes"` enum + `"template-
  names"` state source):
  ```ts
  "template list": { options: { "--scope": "template-scopes" } },
  "template show": { options: { "--scope": "template-scopes" }, args: ["template-names"] },
  ```
  `<name>` → `"template-names"` (all template names, the existing source); `--scope` → `"template-scopes"`
  (`[project, bundle]`). Re-run the task-29 completion tests (the tree gains the `template list`/`show` leaves).

### Boundary
The read projections compose the PURE services (`listTemplates`/`resolveTemplate`/`resolveContext`) over the
ports; the **formatting helpers live in the CLI layer** (`src/cli.ts` or a small `src/help/`-style shell
module) — output is not a port (doc 13 §3). `src/core/**` is UNTOUCHED (no new core code; the boundary lint
test stays green).

## Files to change
- **CHANGE** `src/cli.ts` — convert the `template` `groupOnly` into `templateModule` (group + `list` + `show`
  leaves, the tolerant context helper, `--scope` validation, `withExamples`, the two `formatTemplate*` helpers);
  add `"template list"` + `"template show"` to `COMPLETION_SPECS`. Register `templateModule` in
  `TOP_LEVEL_MODULES` (replacing the `groupOnly("template", …)`).
- **ADD** `test/unit/cli/template-commands.test.ts` (or `test/integration/cli.template.test.ts` if it touches
  real templates) — the AC tests (below). Prefer IN-PROCESS via `run()` + `MemoryFileSystem` fixtures (the
  template roots are just dirs in memory; no real fs needed → unit). The existing built-in templates on real
  disk can be exercised via a small tmpdir/real-fs integration variant if desired, but the in-memory fixtures
  are the load-bearing, deterministic path.
- (No `docs/`/`templates/`/`package.json` change. No new core file.)

## Tests (AC-driven, in-process via `run()` + in-memory fakes; mirror `cli.acceptance.test.ts`/`completion.test.ts`)
Seed a `MemoryFileSystem` with a built-in templates root (`/builtin`) holding e.g. `project/minimal/template.
yml`, `project/single-bundle/template.yml`, `bundle/default/template.yml`, and a project root (`/proj`) with a
`manifest.yml` + `templates/project/single-bundle/template.yml` (shadowing) + `templates/bundle/adopts-tool/
template.yml`. Drive via `run(["template", …, "-C", "/proj"], deps, io)` capturing `io.out`.
### `template list` (task-35)
- **AC#1** inside a project: `template list -C /proj` output contains BOTH a project entry (`single-bundle` /
  `adopts-tool`) AND built-ins (`minimal`, `default`); exit 0.
- **AC#1** outside a project: with env cwd at a no-manifest dir and no `-C`, `template list` lists ONLY built-ins
  (no "Project templates" group); exit 0.
- **AC#2** shadowing: `single-bundle` exists in both → the output marks the project one as shadowing (`shadows
  built-in`) and/or the built-in as shadowed — assert the marker text is present.
- **AC#3** `--scope`: `template list --scope bundle -C /proj` lists only bundle-scope templates (`default`,
  `adopts-tool`) and NOT `minimal`/`single-bundle`; `--scope project` the inverse.
- **AC#4** read-only: snapshot the MemoryFileSystem's file set before/after → unchanged; exit 0.
- **AC#5** help: `template list --help` → 0, contains the description, `Usage:`, `--scope`, and an `Example:`.
### `template show` (task-36)
- **AC#1** metadata + files tree: `template show minimal -C /proj` → output contains the name, scope, the
  parameter names (e.g. `project-name`), and the `files/` paths (a tree summary); exit 0. (Use a fixture
  template whose `template.yml` declares a parameter + a couple of `files/` so the assertions are real.)
- **AC#1** project-over-builtin priority: `template show single-bundle -C /proj` resolves the PROJECT one (assert
  a project-only marker/content distinguishes it from the built-in — e.g. the project fixture's `template.yml`
  has a distinct description/param the built-in lacks).
- **AC#2** `--scope` disambiguation: seed a name that exists as BOTH a project-scope and a bundle-scope template;
  `template show <name>` without `--scope` → the disambiguation behavior chosen (UsageError exit 2 OR a
  deterministic pick — match what you implemented); `--scope project` vs `--scope bundle` each resolve the right
  one.
- **AC#3** missing name: `template show does-not-exist -C /proj` → exit 1, `io.err` matches `/^error: /`
  (NotFoundError, no stack).
- **AC#4** read-only: file set unchanged before/after; exit 0 on a hit.
- **AC#5** help: `template show --help` → 0, contains the description, `Usage:`, `<name>`, `--scope`, an
  `Example:`.
### Cross-cutting
- **help guard:** the existing `test/unit/cli/help-contract.test.ts` completeness guard now walks the
  `template`/`list`/`show` commands too — re-run it; both leaves have options/args so they MUST carry an example
  (they do via `withExamples`). Confirm green.
- **completion specs:** via `completeArgv` (or a `run(["--compbash","--compgen",…])` real-protocol call),
  `template show --scope <tab>` → `[project, bundle]`; `template show <tab>` (the positional) → the template
  names; `template list --scope <tab>` → `[project, bundle]`. Re-run the task-29 completion tests.

## DoD (the backlog DoD for tasks 35/36)
- `tsc --noEmit` clean; `biome check src test` clean **0/0** (run `biome check --write` first). `vitest run`
  green (SINGLE process). `npm ci` clean. **Core import-boundary intact** — no new core code; the projections
  compose existing pure services, the formatting is shell. No dead code; the `formatTemplate*` + the context
  helper documented. (No binary test required; if one is added, `npm run build` first — the task-29/33 lesson.)

## Previous-story intelligence (carried forward)
- **task-27** the composition root + `CommandModule`/`buildProgram`/`groupOnly`/`formatResult`; `run`/
  `runWithExit` map errors → exit codes (commander usage → 2; `NotFoundError`/`ConflictError`/… → 1; help/
  version → 0) and route output through `io` sinks. Wire `template` the SAME way; reuse the `seedDeps`/
  `collector`/`io` test harness from `cli.acceptance.test.ts`.
- **task-28** `withExamples` + `EXAMPLE_HEADING` + the guard (a command with options/args MUST carry an
  example) — both leaves trigger it. The guard walks ALL registered commands, so it auto-covers the new leaves.
- **task-29** `COMPLETION_SPECS` (a `Map<command-path, {options, args}>`) + the `template-scopes`/`template-
  names` sources already exist — just reference them by name; the dispatch needs no change (AC#3 of task-29).
- **task-33** init is a leaf now; the `template` group is still `groupOnly` until this story. `MemoryFileSystem`
  is POSIX-normalized; tests may use `node:fs`; single-process vitest.
- **read pattern:** these are reads — no `runMutation`, no `fs.write`; the action returns 0 and the no-disk-
  change assertion (file-set unchanged) proves read-only (AC#4 for both).

## Boundaries (do NOT do here)
- Do NOT add new CORE code — reuse `listTemplates`/`resolveTemplate`/`resolveContext` as-is. Do NOT make these
  mutating (no `runMutation`, no `fs.write`). Do NOT error on no-project (tolerate it — built-ins only, doc-10
  line 195). Do NOT implement other `template` subcommands (there are only `list` + `show`). Do NOT change the
  exit table, `configureOutput`, or any existing operation. Do NOT edit `docs/`, the repo-root `AGENTS.md`/
  `CLAUDE.md`, `.bmad/` (incl. sprint-status), or the dev `backlog/`. If doc-10 specifies something this sketch
  omits, the DOC wins — add it + note the divergence.

## Dev Agent Record
### Agent Model Used
(filled by dev-story)
### Completion Notes List
### File List
