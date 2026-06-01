# Test Automation Summary — task-29 (Wire tab-completion plumbing)

> POST-REVIEW FIX (bmad-dev-story): an orchestrator integration check found a MUST-FIX defect — the
> omelette-generated completion scripts invoke the CLI with omelette's OWN protocol (`wpm --comp<shell>
> --compgen <cword> <prev> <line>`), NOT `__complete`, so real-shell completion produced ZERO suggestions
> (`run()` only intercepted `__complete`, and commander rejected `--compbash` as an unknown option → exit 2).
> The in-process tests passed only because they called `run(["__complete", …])` directly, never the real
> protocol. FIXED: `run()` now intercepts the real `--compgen`/`--comp<shell>` callback (reconstructing the line
> exactly as omelette does, `argv.slice(compgenIndex + 3).join(' ')`) and routes it to the SAME `completeArgv`
> dispatch; the `__complete` alias is kept. Added 7 protocol tests that drive the EXACT omelette invocation
> through `run()` for bash/zsh/fish (incl. the generated-script↔dispatch loop-closure assertion + a `-C`
> override through the real protocol). The named-source registry, enum sources, and install path are unchanged.
>
> bmad-qa-generate-e2e-tests output (original). Feature under test: "tab-completion plumbing — `completion install`
> (bash/zsh/fish), fixed-enum value completion, and a named-source registry for state-dependent completions."
> The observable behavior is (a) script emission/install through the FileSystem port
> (`src/util/completion-install.ts`), and (b) `completeArgv` (the `__complete` dispatch) over the commander
> tree + the named-source registry. All driven IN-PROCESS — no `process.exit`, no subprocess (omelette's exit-y
> paths are avoided by construction). Framework: vitest (`unit` + `integration` projects). No UI/runtime API
> → Steps 2–3 (API/browser E2E) do not apply.

## Tests — `test/unit/completion/completion.test.ts` (20 cases, in-memory)
Drives the testable seams over in-memory ports: `generateScript`/`installCompletion`, `completeArgv`, and the
registry. One `describe` per AC.

- AC#1: `generateScript` for bash/zsh/fish is non-trivial + shell-correct (`complete -F`/`compdef`; fish
  `complete -f -c wpm`); `installCompletion` writes the script + an idempotent loader block through a
  `MemoryFileSystem` (re-install doesn't duplicate); install via `run()` end-to-end exits 0 (no `process.exit`
  escaped); an unsupported/undetected shell → exit 2 (clean `UsageError`).
- AC#2: each fixed-enum source returns exactly its values + prefix-filters (`bump-levels`, `build-formats`,
  `confirmation-levels`, `task-kinds`, `template-scopes`); a live option completes end-to-end
  (`completion install --shell <tab>` → `bash`/`zsh`/`fish`).
- AC#3: `bundle new --template <tab>` resolves bundle-scoped template names from built-in + project-local
  `templates/`; `bundle-ids`/`target-names`/`installed-target-names` resolve from project state; no project →
  `[]` (never throws); `bundle new <id>` (new id) → `[]` but flags still complete; **EXTENSIBILITY** — a NEW
  named source slots in by name through the SAME dispatch with no rewiring; **(ADDED)** a `-C/--project`
  override on the line is respected (completion targets THAT project).
- tree-derivation: top-level groups + a group's subcommands + flags complete from the commander tree (new
  leaves auto-appear); the `__complete` callback runs end-to-end via `run()` and prints suggestions.

## Tests — `test/integration/completion/completion-install.test.ts` (4 cases, real fs, tmpdir) — ADDED
Proves `installCompletion`'s bytes land on REAL disk via `NodeFileSystem` (doc 12 "real command sequences in a
tmpdir"), each in its own tmpdir-scoped HOME (isolated; the `integration` project runs serially):
- for bash/zsh/fish: the completion script file really exists, is non-trivial + shell-correct, the init file
  gains the delimited loader block, and re-install is idempotent on the real fs;
- the bash script lands at `~/.wpm/completion.sh` and the loader goes into `~/.bashrc` within the tmpdir HOME.

## AC → coverage map
| AC | Covered by |
|----|------------|
| #1 install for the common shells | generateScript (3 shells); installCompletion + idempotency (3 shells, memory); run()-end-to-end exit 0; unsupported→exit 2; the 4 real-fs tmpdir cases |
| #2 fixed-value options complete to those values | the fixed-enum-source case (5 enums, exact + prefix); the live `--shell` completion case |
| #3 state-dependent completions via named sources, extensible without rewiring | `--template`/`bundle-ids`/`target-names`/`installed-target-names`; no-project→[]; new-id→[]+flags; the extensibility case; the `-C` override case |

## Gaps found & closed
1. (AC#3) No test proved the `-C/--project` override flows into a state-dependent completion. Added a case: the
   project at `/proj` is invisible from the cwd, but `-C /proj` on the completion line makes `bundle new
   --template` resolve the project's bundle template — proving `completeArgv` threads the override into sources.
2. (AC#1) The unit install test used `MemoryFileSystem`; doc 12 wants integration-in-tmpdir. Added a real
   `NodeFileSystem` tmpdir integration test proving the script + loader block land on disk (isolated per
   tmpdir HOME).
3. (regression guard) Confirmed the task-28 help completeness guard still passes over the enlarged command tree
   — the new `completion install` leaf carries its `withExamples` worked example, and the hidden `__complete`
   (a PRE-commander branch in `run()`, not a commander command) is correctly absent from the tree. No new test
   needed; verified `test/unit/cli/help-contract.test.ts` green.

## Coverage
- ACs: 3/3, each by multiple cases. 20 unit + 4 integration = 24 new cases, all green; no regressions to the
  existing CLI tests (the `bundle new --template` option add + the `__complete` intercept keep `-C`-anywhere
  intact).
- No UI → no browser E2E; no runtime API → no status-code tests.

## The omelette wiring + the named-source API (so leaves 34–84 follow it)
- A command/option declares its completion BY SOURCE NAME in `COMPLETION_SPECS` (a `Map<command-path,
  {options, args}>` the dispatch reads). A later leaf adds a completion by adding an entry that references a
  source name — no change to `completeArgv`. State-dependent sources read project state only through the ports +
  the pure core services (`resolveContext`/`parseManifest`/`listTemplates`/`ALIAS_PATHS`).
- Script emission uses omelette's PURE `generateCompletionCode()`/`generateCompletionCodeFish()`; the install
  side-effect goes through the FileSystem port in `src/util/completion-install.ts` (NOT omelette's
  `setupShellInitFile`, which `process.exit`s). The `__complete` callback is a pre-commander branch in `run()`
  so the raw completion line reaches the dispatch verbatim.

## Next steps
- Run in CI via the three-command gate (tsc + biome + vitest), which already includes the new files.
- As tasks 34–84 add leaves, each declares its value completions by source name in `COMPLETION_SPECS`; new
  state-dependent sources register into `defaultRegistry()`.
