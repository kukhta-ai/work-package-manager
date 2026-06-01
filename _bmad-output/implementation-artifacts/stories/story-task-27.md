# Story task-27 — The commander composition root, registration pattern, DI, and error handler

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 12 §"CLI framework: commander"/§"Layered architecture"/§the directory scaffold, doc 10
> §"The command tree"/§"Per-command actions"/§"Project context resolution", doc 13 §1/§3/§7). THE IMPURE SHELL:
> the first module OUTSIDE `src/core/` — `src/cli.ts` (doc 12 line 73: "entry point: argv → commander dispatch
> → exit code") — importing commander + the REAL adapters + `node:process`.

## Story
As the `wpm` binary, present the doc-10 top-level command groups through one consistent registration approach,
assemble the real ports once at the entry point and inject them, route every failure through one error handler
that maps domain errors to clean exit codes (and shows stack detail only in debug mode), and refuse a bundle id
that collides with a reserved cross-bundle verb — establishing the FRAMEWORK that tasks 34–84 (the leaves) and
task-33 (the walking skeleton) build on.

## Acceptance criteria (the contract)
1. The command-line program presents the top-level command groups and dispatches to them through one
   consistent registration approach (doc 10 §"The command tree").
2. The real file-system, backlog, clock, and environment abstractions are assembled once at the program's
   entry point and supplied to the commands (doc 12 §"Layered architecture": DI; the CLI layer is thin).
3. A raised domain failure becomes the correct exit status with a readable message; an unexpected failure
   exits with the general-error status and shows detail only in a debug mode (doc 13 §7; doc 12 line 144).
4. A bundle id that collides with a reserved command verb is refused (doc 10 line 149 step 1).

## Developer context (the docs + the confirmed API)
- doc 12 line 73: `src/cli.ts` = `argv → commander dispatch → exit code`; line 47/334 `bin: { wpm, installer }
  → ./dist/cli.js` (already in the manifest). line 144: `src/util/exit.ts` = error formatting + exit codes.
  §"Layered architecture": CLI layer (commands + cli.ts) is THIN — read-flags → call-domain → format-output;
  the core stays pure over injected ports. §"CLI framework: commander": commander's `.command()` chain maps to
  doc 10's tree; `.helpInformation()`/`.helpOption()` for the (task-28) help contract.
- doc 10 §"The command tree": the top-level groups are `init`, `template`, `project`, `bundle`, `build`.
  §"Project context resolution": every project-bound command walks up for `manifest.yml` (task-24
  `resolveContext`), `-C/--project` overrides; a project-bound command run outside a project exits non-zero
  with one clear line. line 149 step 1: `bundle new <id>` refuses `<id>` ∈ `{new, enable, disable, remove,
  list, template}` (reserved cross-bundle verbs) — "otherwise `bundle <id> …` would be ambiguous".
- doc 13 §3: output is NOT a port — the core returns data (`OperationResult`); the CLI formats + prints.
  §7: the typed error model + `exitCodeFor` (usage→2; not-found/conflict/constraint/validation→1; unexpected→1).
- **commander@15 API (confirmed from the package typings — NOT guessed):**
  - `program.command('new <id>')` + `.option(...)` + `.argument(...)`; `.action(fn: (...args) => void |
    Promise<void>)`.
  - `program.exitOverride(cb?: (err: CommanderError) => never | void)` — replaces commander's `process.exit`;
    `CommanderError { exitCode: number; code: string }` (codes like `commander.unknownCommand`,
    `commander.help`, `commander.version`, `commander.helpDisplayed`).
  - `program.parseAsync(argv?, { from: 'user' | 'node' })` — `from:'user'` passes RAW user args (no node/script
    prefix); the default reads `process.argv`.
  - `program.configureOutput({ writeOut, writeErr, outputError })` — routes all commander output through an
    injected sink (so tests capture it and prod writes to the OutputSink).
  - `program.showHelpAfterError(...)`.

## Confirmed composition surfaces (read before writing)
- Real adapters: `new NodeFileSystem(aliasOptions?)`, `new BacklogCli(executable?='backlog', env?)`,
  `new SystemClock()`, `new ProcessEnvironment()` — all constructible with no required args for production.
- task-23 `exitCodeFor(error): 0|1|2` (usage→2, other domain→1, unexpected→1); `isDomainError`; `DomainError`
  (with `.category`/`.message`); the five subclasses incl. `UsageError` (category `usage` → exit 2) and
  `ValidationError` (category `validation` → exit 1).
- task-24 `resolveContext({fs, env}, {projectOverride?}): ProjectContext` (`{found:true, root}` |
  `{found:false}`) — the CLI maps `{found:false}` to a loud NotFoundError for a project-bound command.
- task-25 `runMutation(deps, {root}, spec, input): OperationResult`; `LifecycleDeps {fs, backlog,
  deriveArtefacts}`.
- task-26 `createBundleSpec({builtinTemplatesRoot, bundleTemplateName?}): OperationSpec<CreateBundleInput>`;
  `makeArtefactDeriver({fs, builtinTemplatesRoot, projectTemplatesRoot?, projectTemplateName?})`.
- task-10 `parseBundleId(raw)` ALREADY rejects `RESERVED_BUNDLE_VERBS` (kebab + reserved). `RESERVED_BUNDLE_VERBS`
  is exported from the model.

## Divergence to surface (the brief's assumption was wrong — the DOC wins)
- **commander was NOT in the manifest** (the brief said "already in the manifest"). doc 12 mandates commander,
  so it is added: `commander` pinned to the installed `15.0.0` (matching the project's exact-pin style for
  `execa`/`semver`/`yaml`), the lockfile regenerated, `npm ci` re-run. Recorded here per the user-gate rule
  (a tooling addition the doc requires, not a scope change).
- **`src/cli.ts` already exists as the bootstrap** from an early task — a pure `run(argv, out, err)` handling
  only `--version`/`--help`/bare, whose own JSDoc says "The real command surface (commander, the full command
  tree, the top-level error handler) replaces this in task-27." So this task REPLACES that bootstrap (and
  updates its `cli.smoke.test.ts`) — the planned hand-off, not a conflict.

## Design — the impure shell

### `src/cli.ts` — the composition root (impure; OUTSIDE `src/core/`)
The boundary rule forbids `src/core/**` from importing commander/execa/`node:fs`; THIS file is the shell where
those effects legitimately live (doc 13 §6). It imports commander + the real adapters + `node:process` freely —
but adds NO eff-import to anything under `src/core/` (the boundary stays intact; the lint scope is `src/core/**`
only). Shebang `#!/usr/bin/env node`; `argv → commander → exit code`.

- **`buildProgram(deps: CliDeps, io: CliIo): Command`** — constructs the commander `Command`, wires
  `exitOverride` + `configureOutput` (→ `io`), and registers the groups via the registration pattern below.
  Pure-ish (no process side effects); returns the program so tests can `parseAsync(args, {from:'user'})`.
- **`run(argv: readonly string[], deps: CliDeps, io: CliIo): Promise<number>`** — the testable entry: build the
  program, `await program.parseAsync(argv, { from: 'user' })` inside the error handler (`runWithExit`, below),
  return the exit code. NO `process.exit` here.
- **The impure tail (gated on `isMainModule`, reuse the existing realpath check):** assemble the REAL deps +
  io from `process`, `run(process.argv.slice(2), realDeps, realIo).then(code => process.exit(code))`. The ONLY
  part that touches the process.

### AC#2 — assemble the real adapters ONCE + inject (DI)
- `interface CliDeps { readonly fs: FileSystem; readonly backlog: BacklogMd; readonly clock: Clock; readonly
  env: Environment; readonly builtinTemplatesRoot: string }` (the four ports + the built-in templates root the
  operations need; resolved once from the package location).
- A `makeRealDeps(): CliDeps` factory (in `cli.ts`, the impure shell) constructs `new NodeFileSystem()`, `new
  BacklogCli()`, `new SystemClock()`, `new ProcessEnvironment()` EXACTLY ONCE and bundles them. The same
  instances flow to every command via the registration closure (AC#2: assert single construction + identity).
- `interface CliIo { readonly out: OutputSink; readonly err: OutputSink; readonly debug: boolean }` — output
  sinks + the debug flag (set from `--debug`/`WPM_DEBUG`). Reuse the existing `OutputSink {write}`.

### AC#1 — one consistent registration pattern for the top-level groups
- A `CommandModule` shape: `interface CommandModule { register(parent: Command, ctx: CommandContext): void }`
  where `ctx = { deps: CliDeps; io: CliIo }`. Each group is a module exposing `register`. `buildProgram` calls
  each group module's `register(program, ctx)` — ONE reusable approach (the pattern tasks 34–84 follow to add
  leaves). The doc-10 top-level groups registered: `init`, `template`, `project`, `bundle`, `build`. For
  task-27 the groups are created as commander subcommands (`program.command('bundle')`, etc.) with their
  description; their LEAVES are later tasks — EXCEPT the one proof leaf:
- **The proof-of-concept leaf: `bundle new <id>`** — wires the WHOLE path end-to-end through the existing
  task-26 operation: read flags (`--version`, `--disabled`, `--no-advisor`, the global `-C/--project`) →
  `resolveContext({fs, env}, {projectOverride})` → on `{found:false}` raise a project-bound NotFoundError →
  `runMutation({fs, backlog, deriveArtefacts: makeArtefactDeriver(...)}, {root}, createBundleSpec({...}),
  input)` → format the `OperationResult` to human text on `io.out` → exit 0. (doc 10 row `bundle new`'s `--no-
  advisor` maps to commander's negatable `--no-advisor` → `opts.advisor === false`.) The other groups' leaves
  are out of scope (tasks 34+); `bundle new` is the single proof that the framework + DI + dispatch + format +
  exit all compose.

### AC#3 — the top-level error handler (`src/util/exit.ts`)
- `src/util/exit.ts` is INFRASTRUCTURE (doc 12 line 144), not core — it may import nothing effectful itself
  except what it's given; it formats + maps. Exports:
  - `formatError(error: unknown, debug: boolean): string` — a `DomainError` → a clean one-line message (no
    stack), e.g. `error: <message>`; an unexpected error → `error: <message>` PLUS the stack ONLY when
    `debug`. A `CommanderError` with a help/version code → empty (commander already wrote help/version).
  - `runWithExit(io: CliIo, body: () => Promise<void>): Promise<number>` — runs `body`; on success returns 0;
    on a thrown error computes the exit code and writes the message:
      * a commander help/version display (`CommanderError` code `commander.help`/`commander.version`/
        `commander.helpDisplayed`) → exit `err.exitCode` (0) silently (commander already printed).
      * a commander usage error (unknown command/option, missing argument) → exit 2 (usage) with commander's
        message (already written via `outputError`/`configureOutput`).
      * a task-23 `DomainError` → `exitCodeFor(error)` (usage→2, else→1) + `formatError` (clean, no stack).
      * any other `Error` (unexpected) → exit 1 + `formatError` (+ stack iff `io.debug`).
  - `exitCodeFor` is reused from `src/core/errors.ts` (task-23) — NOT re-implemented.
- **Exit-code table (AC#3):**
  | Outcome | Exit |
  |---|---|
  | success | 0 |
  | commander help / version display | 0 |
  | `UsageError` (category `usage`) | 2 |
  | commander usage error (unknown cmd/opt, missing arg) | 2 |
  | `NotFoundError` / `ConflictError` / `ConstraintError` / `ValidationError` | 1 |
  | unexpected (plain `Error` / non-domain) | 1 |
- **Debug mode**: `io.debug = (--debug present) || (WPM_DEBUG env set)`. A `--debug` global option on the
  program + `env.getEnv("WPM_DEBUG")`. Stack detail shows ONLY for an UNEXPECTED error AND only when debug; a
  `DomainError` stays clean regardless (its message is the contract).
- **commander routing**: `program.exitOverride()` makes commander THROW a `CommanderError` instead of calling
  `process.exit`, so it flows into `runWithExit`. `configureOutput({writeOut: io.out.write, writeErr:
  io.err.write, outputError})` routes commander's own text through the sinks. Output formatting
  (`OperationResult` → human text) lives HERE / in the command, never in core (doc 13 §3).

### AC#4 — refuse a reserved-verb bundle id (placement decision — STATE IT)
- task-10 `parseBundleId` ALREADY rejects `RESERVED_BUNDLE_VERBS` (`new|enable|disable|remove|list|template`)
  with a `ValidationError`, and `createBundleSpec`'s ② CHECK calls it — so `bundle new new` already fails
  through the operation with a `ValidationError` (exit 1). **Decision:** the reserved-verb collision is a CLI
  *argument-grammar* problem (the id positional would shadow a sibling subcommand), so the CLEAN place to
  refuse it with a *usage* exit is the **bundle command layer** (`cli.ts`'s `bundle new` action), which raises
  a task-23 **`UsageError`** ("bundle id '<id>' is a reserved command verb …") BEFORE invoking the operation —
  giving exit 2 (usage), the correct status for "you misused the CLI grammar". The verb list comes from the
  model's exported `RESERVED_BUNDLE_VERBS` (the SAME source `parseBundleId` uses — no magic duplicate). The
  operation's `parseBundleId`/`ValidationError` remains the core's defense-in-depth (still correct if some
  future caller bypasses the CLI). State both: CLI raises `UsageError`→2 (grammar); core keeps
  `ValidationError`→1 (semantic). If the reviewer prefers the operation's exit-1 to be the single answer, that
  is a one-line change — but doc 10 frames it as a CLI-routing ambiguity, so usage→2 at the command layer fits
  best.

## Scope boundary (do NOT over-build)
- `--help` CONTENT contract = task-28 (only wire `exitOverride` so help/version exit 0 cleanly here; do not
  build the help renderer). Tab-completion = task-29 (no omelette). The full real-template vertical slice =
  task-33 (walking skeleton). task-27 = the FRAMEWORK: groups + registration pattern + DI + error handler +
  AC#4 + the single `bundle new` proof leaf. Do NOT implement other leaves.
- A real E2E of `bundle new` needs the real bundle template (task-31, not built) — so prove the path at the
  framework level: programmatic `run(argv, deps, io)` / `parseAsync` against a FIXTURE project + fixture bundle
  template seeded in a tmpdir (integration) OR with the in-memory fakes (unit), AND assert the reserved-verb
  refusal + the error-code mapping (which need no template).

## Tests (`test/unit/cli/*.test.ts` + `test/integration/cli.*.test.ts`)
- **AC#1 dispatch** (unit, in-memory): `run(["bundle","new","x"], deps, io)` reaches the bundle-new action (the
  operation runs); `run(["project"], …)`/`run(["bundle"], …)` show the group (commander lists subcommands);
  an unknown group `run(["nope"], …)` → exit 2.
- **AC#2 DI single-construction** (unit): a `makeRealDeps()` (or a spy wrapper) proves the four adapters are
  constructed ONCE and the SAME instances reach the command (e.g. inject a recording deps, assert identity in
  the action; or count constructor calls).
- **AC#3 error mapping** (unit, table-driven): each category → exit code + message shape — a `UsageError`→2;
  `NotFoundError`/`ConflictError`/`ValidationError`→1 (clean, no stack); an unexpected `Error`→1 (+ stack iff
  debug); commander unknown-command→2; commander `--help`/`--version`→0 (silent in handler). `--debug` and
  `WPM_DEBUG` both toggle the unexpected-error stack; a `DomainError` stays clean with debug on.
- **AC#4 reserved verb** (unit): `run(["bundle","new","new"], …)` (and `enable`/`disable`/`remove`/`list`/
  `template`) → a `UsageError`-mapped exit 2 with a message naming the reserved verb; a normal id like
  `web` does NOT trip it.
- **Integration** (real tmpdir, real `NodeFileSystem`): seed a fixture project + fixture bundle template on
  disk, run `bundle new web` via the built program with the real fs adapter (the backlog can be the fake or a
  skip-if-unavailable real-backlog guard, matching task-14/18's pattern), assert exit 0 + the scaffold on disk
  + the manifest updated. (This is the framework-level proof; the full real-template slice is task-33.)
- Replace the bootstrap `cli.smoke.test.ts` assertions with the commander-backed `--version`/`--help`/bare
  behaviour (now via commander: `--version` exits 0 printing the version; `--help` exits 0; bare shows help).

## DoD
- `tsc --noEmit` clean; `biome check src test` clean with **0 warnings**; `vitest run` green (SINGLE process);
  `npm ci` clean. The CORE boundary stays intact — `cli.ts`/`src/util/exit.ts` are the allowed-effects shell;
  NOTHING under `src/core/**` gains an effect import (verify `biome check` still passes the boundary rule).
  JSDoc every export (cite doc 12/10/13); no dead code. commander added to the manifest + lockfile (regenerate
  + `npm ci`).

## Previous-story intelligence (carried forward)
- task-26: `createBundleSpec`/`makeArtefactDeriver` exist and are pure-over-ports; `--no-advisor` →
  `advisor:false`. task-24 `resolveContext` returns `{found:false}` (not a throw) — the CLI maps it to a loud
  project-bound NotFoundError. task-23: `exitCodeFor` is the single mapping (usage→2, else→1). The existing
  `cli.ts` `isMainModule` realpath check + `OutputSink` interface are reusable. `apply`/handlers returning
  nothing must be typed `… | undefined`, not `void` (the noConfusingVoidType lesson) — applies to any new
  function types here. Single-process vitest (task-18). Run `biome check --write` before the gate. Pin
  commander to the exact installed version (project style) and `npm ci`.

## Boundaries (do NOT do here)
- No leaves beyond `bundle new` (tasks 34–84). No `--help` content renderer (task-28). No completion (task-29).
  No real templates (task-31/33). No new effect import under `src/core/**`. Don't edit docs/, AGENTS.md,
  backlog/, .bmad/ (incl. sprint-status), task-5's biome.json, task-10–26 source (compose them; surface a gap
  as a divergence rather than patching a prior task). If doc 10/12 differs from this sketch, the DOC wins —
  note it.
