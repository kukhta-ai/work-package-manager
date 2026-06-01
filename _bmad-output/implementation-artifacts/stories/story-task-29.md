# Story task-29 — Wire tab-completion plumbing

Status: ready-for-dev

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 10 §"Design principles" → "Every command is discoverable from the terminal" (the
> Tab-completion paragraph + the completable-value list) + doc 12 §"Tab completion: omelette" + the directory
> slots `src/completion/` (bundle-ids/agent-names/template-names/file-paths/enums), `completions/`, and
> §"Layered architecture" ("shell completion script emission" → the infra/`src/util/` layer), against the
> task-27 root `src/cli.ts` (the `CommandModule.register` pattern, `buildProgram`, `groupOnly`, the `bundle new`
> leaf) + the task-28 `withExamples` helper + omelette 0.4.17's REAL source/README I read). Builds the
> tab-completion plumbing: a `completion install` command, fixed-enum value completion, and a NAMED-SOURCE
> registry for state-dependent completions that the 51 leaves (tasks 34–84) extend without rewiring.

## Story
As a user of the `wpm` CLI, I want to install shell completion (bash/zsh/fish) so that pressing TAB completes
commands, flags, and values — fixed enums (like `major|minor|patch`) and project-state values (bundle ids,
template names, target agents) alike. And as the project, I want state-dependent completions produced by NAMED
SOURCES in a registry so that a leaf added in tasks 34–84 wires a new completion by referencing a source name,
without restructuring the completion plumbing.

## Acceptance criteria (the contract — verbatim from the backlog)
1. A user can install shell completion for the common shells (doc 12).
2. Options with a fixed set of valid values complete to those values.
3. Completions that depend on project state are produced by named sources that later command work can supply,
   without restructuring the completion wiring.

## doc 10's completable-value contract (the target)
> "**Tab completion** completes commands, subcommands, flags, and positional arguments wherever a value set is
> knowable. Bundle IDs come from `manifest.yml.bundles`. Target agent names from `manifest.yml.targets` (for
> `remove`) or from the CLI's built-in well-known list (for `add`). Template names from the available templates
> (built-in + project's `templates/`), filterable by `template.yml.scope`. File paths inside a bundle from
> filesystem context. Version-bump levels (`major|minor|patch`), format choices (`zip|tarball|git`),
> confirmation levels (`safe|dangerous`), kind values (`kind:state|kind:migration`) — every finite enum,
> completed. Unknown-value positionals (a new `<id>` on `bundle new`) get no suggestions but still complete
> flags after the positional is typed." [Source: docs/10 §"Design principles" → "Every command is discoverable
> from the terminal"]

Doc 12 names where this lives: "**Tab completion: omelette.** Generates bash/zsh/fish completion scripts and
dispatches dynamic completions back to the CLI via a `__complete` hook … the shell calls `installer __complete
bundle <partial>`, the CLI loads the manifest, prints suggestions." The directory slots are `src/completion/`
(`bundle-ids.ts`, `agent-names.ts`, `template-names.ts`, `file-paths.ts`, `enums.ts`), `completions/` ("installed
via `wpm completion install`"), and the script **emission** belongs to the infra layer
(`src/util/`). [Source: docs/12 §"Tab completion: omelette"; §directory scaffold; §"Layered architecture"]

## DIVERGENCE / FINDING — omelette's runtime model vs. the task-27 architecture (docs win; recorded)
I read omelette 0.4.17's real source (`node_modules/omelette/src/omelette.js`). Two facts shape the whole design
and are surfaced here the way task-31 surfaced the Backlog.md folder finding:

1. **omelette is `process.argv`/`process.env`-driven and calls `process.exit()` everywhere** — in `reply()`,
   `generate()`, and crucially `checkInstall()` (which runs at CONSTRUCTION and `process.exit()`s if
   `--completion`/`--completion-fish` is in argv), `setupShellInitFile()`, `cleanupShellInitFile()`. The
   task-27 architecture routes EVERYTHING through `run()` → exit codes, never `process.exit` directly, and is
   in-process testable. Letting omelette's construction-time/exit behaviour into `run()` would break that.
2. **omelette's completion logic is fragment/position-based via EventEmitter** (`emit("complete")`,
   `emit(fragmentName)`, `emit($N)`), **NOT commander-tree-aware**. It cannot, by itself, complete commander
   subcommands/flags or "value depends on which option" — that derivation is ours to write.

**RESOLUTION (omelette STAYS — doc 12 mandates it; we use the parts that fit):**
- **Script emission/shell wiring (AC#1):** use omelette's PURE, no-exit methods `generateCompletionCode()`
  (bash + zsh) and `generateCompletionCodeFish()` (fish) to get the script TEXT, then write/install it through
  the **FileSystem port** in `src/util/` — NOT omelette's `setupShellInitFile()` (which `process.exit()`s and
  uses raw `node:fs`). The generated scripts call back into the CLI via omelette's `--compgen`/`__complete`
  convention. So the shell-side wiring is omelette's; the install side-effect is ours, testable, ports-clean.
- **Value resolution (AC#2/AC#3):** build OUR OWN testable resolution — a `completeArgv(words, deps)` function
  that derives command/subcommand/flag suggestions from the commander tree (stays in sync as leaves are added)
  and, for a value position, looks up the declared NAMED SOURCE in a registry and runs it — rather than
  relying on omelette's `emit`/`process.exit` dispatch. The `wpm __complete …` subcommand calls `completeArgv`.

This honours doc 12 (omelette is the completion tool; emission lives in `src/util/`) while staying inside the
task-27 testable/ports architecture. Recorded in the final report as a divergence-with-resolution.

## Confirmed mechanics (omelette 0.4.17 + the codebase — NOT guessed)
- **omelette factory:** `omelette("wpm <fragment> …")` or `omelette\`wpm ${[...]} …\`` → an instance. `.setProgram`
  /`.setFragments` set the program + fragment names; `.tree(obj)`/`.on(name, ({reply,before,line,fragment})=>…)`
  define completions; `.init()` dispatches (reads argv `--compgen`) OR runs `mainProgram`. We do NOT call
  `.init()` on the hot path (it `process.exit`s); we only use the script-text generators.
- **Pure script-text methods (verified — no `process.exit`):** `instance.generateCompletionCode()` → the
  bash/zsh script (compdef/complete/compctl branches); `instance.generateCompletionCodeFish()` → the fish
  script. `checkInstall()` (the exit-y one) runs in the factory only when `--completion*` is in argv — so we
  construct the instance WITHOUT those argv flags present and call the generators directly. (VERIFY at dev time:
  construct `omelette("wpm")`, assert `.generateCompletionCode()` returns a non-empty string containing
  `complete -F` / `compdef`, and `.generateCompletionCodeFish()` contains `complete -f -c wpm`.)
- **No omelette typings** (no bundled `.d.ts`, no `@types/omelette`). Add a minimal local
  `src/completion/omelette.d.ts` declaring only what we use (the default-export factory returning an instance
  with `generateCompletionCode(): string`, `generateCompletionCodeFish(): string`, `setProgram`, `tree`, `on`,
  `init`). Note this in the report. (Set `"esModuleInterop"`/`"allowJs"` are not needed — a `declare module
  "omelette"` ambient file suffices; CONFIRM tsconfig picks up `src/**/*.d.ts`.)
- **task-27 `src/cli.ts`:** `buildProgram(deps, io)` returns the commander program; `run([...], deps, io)` drives
  in-process; `groupOnly(name, desc)` registers a description-only group; the 5 groups are
  `init`/`template`/`project`/`build` + the `bundle` module; `bundle new` is the one wired leaf. `withExamples`
  (`src/help/examples.ts`, task-28) attaches a worked example + `EXAMPLE_HEADING`; the task-28 completeness
  guard requires any command with its own options/args to carry an example.
- **Named-source building blocks (ALL pure core services over the ports):**
  - `resolveContext({fs, env}, {projectOverride?})` (task-24, `src/core/services/context.ts`) → `{found:true,
    root}` | `{found:false}` by walking up for `manifest.yml`.
  - `parseManifest(parseYaml(fs.read(root+"/manifest.yml")))` → `Manifest` with `.bundles: BundleId[]` and
    `.targets: AgentName[]`.
  - `listTemplates({fs, builtinTemplatesRoot, projectTemplatesRoot?}, {scope?})` (task-17,
    `src/core/services/template-resolver.ts`) → `TemplateSummary[] {name, scope}` (built-in + project-local,
    de-duplicated, filterable by scope).
  - `ALIAS_PATHS` keys in `src/core/services/agent-aliases.ts` = the built-in well-known agents
    (`claude-code`, `codex`, `hermes`, `openclaw`) — the source for `target-names` on the `add` side.
  - `FileSystem` port = `read`/`write`/`exists`/`makeDirectories`/`list`/`copyTree`/`remove`/`ensureAlias`
    (NO `append` — `completion install` must write whole files, or read-modify-write for any loader block).
- **Biome:** `biome.json` globs are `src/**`/`test/**`/`*.json`/`*.ts` — the new `.ts` IS linted; a `.d.ts` is
  under `src/**` so it's covered too (keep it clean). `completions/` (if we ship static scripts) is outside
  globs. The new files are the impure shell + tests; `src/core/**` is untouched.

## The design to build

### 1. `src/completion/sources.ts` — the NAMED-SOURCE REGISTRY (AC#3, the load-bearing deliverable)
A registry mapping a source NAME → a resolver that produces `string[]` suggestions. State-dependent resolvers
receive the completion deps (the ports + template roots + the parsed partial). The KEY property: a command
declares its completion BY NAME; the dispatch looks the name up. Adding a source = `register("my-source", fn)`
or adding to the built-in map — NO change to the dispatch.

```ts
// src/completion/sources.ts  (impure shell — uses ports + pure core services; may NOT import omelette here,
// keep omelette in the wiring module so sources stay testable as plain functions)
import type { Environment, FileSystem } from "../core/ports/index.js";

/** What a completion source sees: the ports + template roots + the word being completed. */
export interface CompletionContext {
  readonly fs: FileSystem;
  readonly env: Environment;
  readonly builtinTemplatesRoot: string;
  /** The `-C/--project` override, if the command line carried one (so completion respects it). */
  readonly projectOverride?: string;
  /** The partial token the user is completing (may be ""); a source MAY prefix-filter on it. */
  readonly partial: string;
}

/** A completion source: name → resolver. Pure-ish: reads project state via the ports, returns suggestions. */
export type CompletionSource = (ctx: CompletionContext) => string[];

/** A mutable registry so tasks 34–84 (and tests) can register new named sources without rewiring dispatch. */
export class CompletionRegistry {
  private readonly sources = new Map<string, CompletionSource>();
  register(name: string, source: CompletionSource): void { /* set; last wins or throw on dup — pick + document */ }
  has(name: string): boolean { /* */ }
  /** Resolve by name; unknown name → [] (a missing source completes to nothing, never throws). */
  resolve(name: string, ctx: CompletionContext): string[] { /* lookup + run, or [] */ }
}

/** Build the registry pre-loaded with the built-in sources (the fixed enums + the state-dependent ones). */
export function defaultRegistry(): CompletionRegistry { /* register enums + bundle-ids + template-names + … */ }
```
- **Built-in state-dependent sources (provide these now):**
  - `"bundle-ids"` (`src/completion/bundle-ids.ts`) — `resolveContext` → read+parseManifest → `manifest.bundles`
    (prefix-filtered by `partial`). No project → `[]`.
  - `"template-names"` (`src/completion/template-names.ts`) — `listTemplates({fs, builtinTemplatesRoot,
    projectTemplatesRoot: root+"/templates"})` → the names. (This is the one `bundle new --template` already
    needs.) Optionally a scope-filtered variant `"bundle-template-names"`/`"project-template-names"`.
  - `"target-names"` (`src/completion/agent-names.ts`) — the `ALIAS_PATHS` keys (well-known, for `add`); a
    sibling `"installed-target-names"` reads `manifest.targets` (for `remove`). Provide at least the well-known
    one; note the `remove` variant for tasks 34–84.
- **Built-in fixed-enum sources (AC#2; `src/completion/enums.ts`):** register each finite set from doc 10 as a
  named source returning its constant values, prefix-filtered:
  `"bump-levels"` → `["major","minor","patch"]`; `"build-formats"` → `["zip","tarball","git"]`;
  `"confirmation-levels"` → `["safe","dangerous"]`; `"task-kinds"` → `["kind:state","kind:migration"]`;
  `"template-scopes"` → `["project","bundle"]`. A fixed-enum source is just a `CompletionSource` over a constant
  array — so AC#2 ("options with a fixed set of valid values complete to those values") is the same mechanism as
  AC#3, specialized to a constant. (Keep a tiny `fixedEnum(values: string[]): CompletionSource` helper.)

### 2. Declaring a completion on a command/option — the convention for tasks 34–84
A command/option associates a value position with a SOURCE NAME. commander has no native "completion source"
field, so we keep a small side-table the dispatch consults, keyed by the command path + the option/arg. The
SIMPLEST shape that satisfies AC#3 without over-building: a per-command map declared at registration, e.g.
`completionFor("bundle new", { "--template": "template-names" })` stored in a module-level registry the dispatch
reads. (PICK the exact shape — a `WeakMap<Command, …>`, a `Map<string /*command path*/, Record<flag, source>>`,
or attaching via commander's `Option`/`Argument` — and DOCUMENT it so a 34–84 leaf follows the same one line.)
Wire `bundle new --template` to `"template-names"` now as the worked proof (it's the one existing option that
takes a project-state value). Wire `bundle new <id>` to NO source (a brand-new id → no suggestions, doc 10).

### 3. `src/completion/complete.ts` — the `completeArgv` dispatch (AC#2/AC#3, testable in-process)
The function the `__complete` subcommand calls. Input: the completed words (the partial line) + the completion
deps; output: `string[]`. It:
1. Walks the commander tree (from `buildProgram`) along the typed words to find the current command.
2. If completing a **value** for an option/arg that declares a source name → `registry.resolve(name, ctx)`.
3. Else (completing a command position) → the subcommand names + the flags of the current command (derived from
   the commander tree, so new leaves auto-appear), prefix-filtered by `partial`.
Pure over the ports (no `process.exit`, no direct `node:fs`). This is THE testable seam.

### 4. `src/cli.ts` — wire the `__complete` subcommand + the `completion` group
- A hidden top-level `__complete` command (commander `.command("__complete", { hidden: true })` or an
  `.argument("[words...]")` passthrough) whose action runs `completeArgv(words, deps)` and writes each
  suggestion on its own line to `io.out`. This is what omelette's generated script calls back into. Exits 0.
- A top-level `completion` group with an `install` leaf (AC#1) — `wpm completion install [--shell
  bash|zsh|fish]` — wired via the `CommandModule` pattern, with `--help` + `withExamples` (non-trivial effect),
  and `--shell` completing from the `"shells"` fixed-enum source (dogfood AC#2). Its action calls into
  `src/util/` to emit/install the script. (Keep the global `-C/--project` honoured for `__complete` so
  state-dependent sources resolve the right project.)

### 5. `src/util/completion-install.ts` — emission/install through the FileSystem port (AC#1, doc 12 line 248)
The infra-layer side-effect. Given the omelette instance's pure script text + the target shell + the FileSystem
port + the user's HOME, it:
- writes the completion script to a stable path (e.g. `~/.wpm/completion.sh` for bash, or emits the fish/zsh
  variants), and
- ensures the shell init file sources it (read-modify-write a clearly-delimited `# begin wpm completion … #
  end wpm completion` block, idempotently — re-install does not duplicate the block).
- Supports bash, zsh, fish; an unsupported shell is a clean `UsageError` (task-23), not a throw-with-stack.
- Returns a structured result (which files it wrote / would write) so the command formats output and tests
  assert without `process.exit`. INJECT `fs` (the port) + HOME (via the Environment port or a param) so it's
  testable with a `MemoryFileSystem` or a tmpdir. Use omelette's `generateCompletionCode()` /
  `generateCompletionCodeFish()` for the script bytes (so the actual shell wiring is omelette's, per doc 12).

### Layering & boundary (doc 13 §1; doc 12 line 248)
- `src/completion/**` + `src/util/completion-install.ts` + the `src/cli.ts` wiring = the **impure shell** (may
  import `omelette`/`commander`). The completion SOURCES read project state ONLY through the ports + the pure
  core services (`resolveContext`/`parseManifest`/`listTemplates`) — they do NOT import `node:fs`/`commander`/
  `omelette`. `src/core/**` is UNTOUCHED (the boundary lint rule — no `commander`/`omelette`/`node:fs` under
  `src/core/**` — stays green; the named sources live in `src/completion/`, not `src/core/`).

## Files to add / change
- **ADD** `package.json` dep: `omelette` (exact-pinned, already installed in investigation) + lockfile; `npm ci`.
- **ADD** `src/completion/omelette.d.ts` — minimal ambient types for omelette (the factory + the two script
  generators + the methods we touch).
- **ADD** `src/completion/sources.ts` (registry + `CompletionContext`/`CompletionSource` + `defaultRegistry`),
  `src/completion/enums.ts` (the fixed-enum sources + `fixedEnum` helper), `src/completion/bundle-ids.ts`,
  `src/completion/template-names.ts`, `src/completion/agent-names.ts`, `src/completion/complete.ts`
  (`completeArgv`). (Combine small files if cleaner — but keep the doc-12 names where reasonable.)
- **ADD** `src/util/completion-install.ts` — the emission/install through the FileSystem port.
- **CHANGE** `src/cli.ts` — register the `completion` group (`install` leaf, with `withExamples`) + the hidden
  `__complete` command; wire `bundle new --template` → `"template-names"` as the worked proof. No change to any
  operation/the exit table/`configureOutput`/the existing `bundle new` action.
- **ADD** tests (below).
- (No `docs/`/`templates/` change.)

## Tests (AC-driven; unit in-memory + an integration tmpdir for the real install) — deterministic, isolated
- **AC#1 — `completion install` emits/installs a non-trivial script for the common shells:**
  - Unit: call the `src/util/completion-install.ts` emitter with a `MemoryFileSystem` for shell ∈
    {bash, zsh, fish}; assert it wrote a completion script that is non-trivial AND shell-correct (bash/zsh
    script contains `complete -F`/`compdef`; fish contains `complete -f -c wpm`), and that the init-file loader
    block is present + idempotent (running install twice does not duplicate the block). An unsupported shell →
    a clean `UsageError`.
  - End-to-end via `run`: `run(["completion","install","--shell","bash"], deps, io)` → exit 0 and `io.out`
    reports what was installed (assert no `process.exit` escaped — the test process survives).
  - (Optional integration in a tmpdir with a fake HOME, isolated, to prove the real-fs path writes files.)
- **AC#2 — a fixed-value source completes to exactly its enum values:**
  - `completeArgv` (or the registry directly) for a fixed-enum source (e.g. `"bump-levels"`) returns exactly
    `["major","minor","patch"]`; with a partial `"m"` returns `["major","minor"]` (prefix filter). Do the same
    for `"template-scopes"` → `["project","bundle"]`. AND prove the wiring end-to-end: `completion install
    --shell <tab>` (i.e. `completeArgv(["wpm","completion","install","--shell",""], deps)`) returns the shell
    enum — showing a real option completing to its fixed values (AC#2 on a live option).
- **AC#3 — a named state-dependent source resolves from project state, and a NEW source slots in without
  rewiring:**
  - Seed a `MemoryFileSystem` with a `manifest.yml` listing bundles (`core`, `web-handoff`) + a `templates/
    bundle/<name>/template.yml` (and a built-in templates root); assert `completeArgv` for `bundle new
    --template <tab>` returns the template names, and `"bundle-ids"` resolves `["core","web-handoff"]`
    (prefix-filtered). No project (`{found:false}`) → `[]` (and flags still complete — `bundle new <tab>` after
    the positional yields the flags, not a crash).
  - **Extensibility proof:** `register("fixture-source", () => ["alpha","beta"])` on a registry, then resolve
    `"fixture-source"` through the SAME `completeArgv`/dispatch (wire a throwaway option or call the registry via
    the dispatch path) and get `["alpha","beta"]` — WITHOUT modifying `complete.ts`/the dispatch. This is the
    AC#3 "without restructuring the completion wiring" assertion, made executable.
  - `bundle new <id>` (a brand-new id, no source) → `[]` suggestions, but the command's flags still complete
    after (doc 10's "unknown-value positionals get no suggestions but still complete flags").
- **(boundary) the core stays pure:** rely on the existing import-boundary fixture test (task-22) to ensure no
  `omelette`/`commander`/`node:fs` import landed under `src/core/**`; the new sources live in `src/completion/`.

> Drive `completeArgv`/the registry IN-PROCESS (no `process.exit`, no subprocess). Use a tmpdir ONLY for an
> optional real-fs install test. Keep assertions content-based + robust. Mirror `cli.acceptance.test.ts`'s
> `collector()`/`io()`/`seedDeps()` harness for the `run`-driven cases.

## DoD (the backlog DoD for task-29)
- `tsc --noEmit` clean (incl. the local `omelette.d.ts`); `biome check src test` clean with **0 errors / 0
  warnings** (run `biome check --write src test` FIRST). `vitest run` green (SINGLE process). `npm ci` clean
  with omelette in the lockfile (lockfile regenerated). **Core import-boundary intact** — completion plumbing
  is the impure shell; `src/core/**` untouched (the boundary test stays green). No dead code; all public
  functions (`completeArgv`, the registry API, the sources, the installer) documented.

## Previous-story intelligence (carried forward — task-24, task-27, task-28, task-31)
- **task-24** built `resolveContext` (pure over fs+env) — the entry point a state-dependent source uses to find
  the project; **task-17** `listTemplates`/`TemplateSummary`; the schema `parseManifest`. Reuse them; don't
  re-derive project loading.
- **task-27** the composition root + `CommandModule`/`buildProgram`/`groupOnly`; `run`/`runWithExit` map
  `commander.help`/`helpDisplayed` → 0 and route output through `io` sinks; `exitOverride()`. Register the new
  commands the SAME way.
- **task-28** `withExamples` + `EXAMPLE_HEADING` + the completeness guard: the `completion install` leaf has a
  non-trivial flag set, so it MUST carry a worked example (the task-28 guard will fail it otherwise). Give it
  one. The hidden `__complete` command: if it declares options/args it also needs an example OR mark it
  `hidden` — DECIDE so the task-28 guard stays green (a `{ hidden: true }` command is excluded from help; verify
  the task-28 guard's command walk excludes hidden/`help` — it excludes `help`; CONFIRM hidden too, else give
  `__complete` an example or no own options).
- **task-31 finding pattern:** when a mandated tool's runtime model conflicts with the architecture, keep the
  tool for what it's for, adapt around the conflict, and RECORD it. That is exactly the omelette `process.exit`
  resolution above.
- **gate hygiene:** `biome check --write src test` before the gate; single-process vitest (task-18);
  `MemoryFileSystem` is POSIX-normalized; the real-fs/real-shell tests (if any) must be isolated (per-tmpdir
  HOME) — but PREFER in-process for completion (omelette's exit-y paths are avoided by construction).

## Boundaries (do NOT do here)
- Do NOT add new leaf COMMANDS beyond `completion install` + the hidden `__complete` (the groups' leaves are
  tasks 34–84). Do NOT change any operation, the exit table, or `configureOutput`. Do NOT call omelette's
  `init()`/`setupShellInitFile()`/`reply()` on any path `run()` reaches (they `process.exit`) — use only the
  pure script-text generators + the FileSystem port. Do NOT import `omelette`/`commander`/`node:fs` under
  `src/core/**` (boundary). Do NOT edit `docs/`, `templates/`, the repo-root `AGENTS.md`/`CLAUDE.md`, `.bmad/`
  (incl. sprint-status), or the dev `backlog/`. If doc 10/12 specify something this sketch omits, the DOC wins
  — add it + note the divergence. If omelette genuinely cannot do something doc 12 assumes, SURFACE it (like the
  task-31 Backlog.md finding) rather than faking it.

## Dev Agent Record
### Agent Model Used
(filled by dev-story)
### Completion Notes List
### File List
