# Story task-28 — Wire the --help content contract

Status: ready-for-dev

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 10 §"Design principles" (the discoverability paragraph) + doc 12 §"CLI framework: commander"
> /§"How the CLI implements each load-bearing principle from 10" (the `src/help/` + `synopsis.ts` slot) +
> §"Layered architecture", against the task-27 composition root `src/cli.ts` (the `CommandModule.register`
> pattern, `buildProgram`, `TOP_LEVEL_MODULES`, `groupOnly`, the `bundle new` leaf) + the authoritative
> commander v15.0.0 typings/README I read). This builds the `--help` discoverability contract on the existing
> commander root and a COMPLETENESS GUARD test that keeps it durable for the 51 later leaves (tasks 34–84).

## Story
As an author at the terminal driving `wpm`, I want every command's `--help` to be self-sufficient — its
description, how to invoke it, every flag with its effect and default, every positional's meaning, and a worked
example where the flags are non-trivial — so that, having used a Unix-style CLI before, I never need to open the
design docs to learn how a command is invoked. And as the project, I want a guard test that fails if ANY
registered command (the 5 groups today; the 51 leaves tasks 34–84 add) ever ships empty or boilerplate-only
help — so the contract can't silently rot.

## Acceptance criteria (the contract — verbatim from the backlog)
1. Every command's help shows how to invoke it, its options with their effects, and at least one worked example
   (doc 10 discoverability).
2. No registered command has empty or missing help.

## doc 10's precise discoverability contract (the target)
> "**`--help` / `-h`** is supported and returns substantive content on every command, top-level group through
> leaf. The output includes: a one-line description, a synopsis line (`usage: wpm bundle new <id> [--template
> <name>] [--disabled] [--version <v>]`), every flag with its type and default, every positional argument with
> its meaning, and a worked usage example where the flag set is non-trivial. The help is self-sufficient for
> the common case — an author who's used a Unix-style CLI before should never need to consult this doc to learn
> how a command is invoked. A command that lacks either [help or completion] is a CLI bug, not a corner case."
> [Source: docs/10-authoring-cli.md §"Design principles" → "Every command is discoverable from the terminal"]

Doc 12 names where this lives: "commander's `.helpInformation()` / `.helpOption()` hooks let us meet the
`--help` content contract from `10`'s discoverability principle without a custom help renderer" and the
`src/help/` slot (`synopsis.ts` — "usage line from commander metadata", `flags.ts`, `examples.ts`).
[Source: docs/12 §"CLI framework: commander"; §directory scaffold `src/help/`]

## How each AC element is satisfied (read first — what commander gives us vs. what we add)
commander v15 already renders most of the contract; our job is to make every command *declare* the inputs so
the render is complete, and to add the one thing commander does not auto-produce (a worked example):

| Contract element | Who produces it | What we do |
|---|---|---|
| one-line **description** | `.description(text)` | every command already has one (task-27); the guard asserts non-empty |
| **synopsis / usage line** | commander auto-renders `Usage: wpm <path> [options] [command]`; `.usage(str)` overrides | rely on the auto line (it matches doc-10's shape); optionally set `.usage()` where a positional/arg shape reads better. The guard asserts a `Usage:` line is present |
| every **flag with type + default** | `.option(flags, effect, default)` — commander auto-appends `(default: "…")` | `bundle new`'s options already declare effects + the `--version` default; the guard/AC test asserts each flag line shows its effect (+ default where declared) |
| every **positional with its meaning** | `.argument('<id>', 'meaning')` OR `.command('new <id>', desc, …)` | **ADD** `.argument('<id>', '<meaning>')` to `bundle new` — today it uses `command("new <id>")` so `<id>` has NO description in help. This is the one concrete gap in the existing leaf |
| a **worked example** (non-trivial flag set) | NOT auto-produced | **ADD** via `.addHelpText('after', …)` through a reusable helper in `src/help/` |

## Confirmed mechanics (commander v15.0.0 — from the bundled typings + README, NOT guessed)
- `program.helpInformation(): string` — "get the built-in command help information as a string for processing
  or displaying yourself." Returns the FULL help text **including** any `.addHelpText()` sections. This is the
  guard's inspection primitive: walk `program.commands` recursively, call `cmd.helpInformation()` on each, and
  assert content — no printing, no subprocess.
- `cmd.addHelpText(position, text | (ctx) => text)` with `position` ∈ `beforeAll | before | after | afterAll`.
  `after` appends per-command text (the worked example) right after the built-in help; `beforeAll/afterAll`
  apply to a command AND all its subcommands. Use **`after`** per command for examples.
- `.option('-v, --version <version>', 'effect', '0.1.0')` — commander renders the option line WITH
  `(default: "0.1.0")` automatically (README "string-util" example). No manual default text needed.
- `.argument('<id>', 'description')` — declares a required positional with a help description (README
  "string-util" `.argument('<string>', 'string to split')`). `[opt]` is optional, `<req>` required, `x...`
  variadic. `cmd.registeredArguments` exposes them (readonly).
- The auto usage line is `Usage: <name path> [options] [command]` (and includes `<args>` when arguments are
  registered). `.usage(str)` overrides just the part after the command path. The `name` path for a subcommand
  includes its ancestors (e.g. `wpm bundle new`).
- Help is testable in-process: `run([... , "--help"], deps, io)` → commander throws a `CommanderError` with
  code `commander.helpDisplayed`, which `runWithExit` maps to **exit 0** after commander wrote the help text to
  the configured `io.out` sink (task-27 `configureOutput` → `writeOut: io.out.write`). So `io.out.text` holds
  the rendered help. (`--help` on a subcommand: `["bundle","new","--help"]`.)
- `program.exitOverride()` is already set (task-27), so help display throws rather than calling `process.exit`
  — that is why `run()` returns and the collector captures the text.

## The placeholder-group RULE the guard enforces (state it explicitly — doc 10's own wording)
doc 10 scopes the worked-example requirement to "a worked usage example **where the flag set is non-trivial**".
So the guard's rule, applied to every registered command (recursively):
1. **Every** command MUST have a non-empty `description`.
2. **Every** command's help MUST contain a usage/synopsis line (a `Usage:` line — commander always renders one).
3. A command that **declares its own options** OR a **non-trivial positional argument** (i.e. its flag set is
   non-trivial) MUST ALSO carry a worked example (an `.addHelpText('after', …)` block).
   - The 5 group placeholders (`init`, `template`, `project`, `build`, and `bundle`) declare no own options and
     no positional today → they need only description + usage (rule 1+2). Their leaves arrive in tasks 34–84.
   - The `bundle new <id>` leaf declares options (`--version`/`--disabled`/`--no-advisor`) AND a positional
     `<id>` → it needs the worked example (rule 3). This is the only command that triggers rule 3 today.

This rule is faithful to doc 10 (it does not demand an example on a bare group, which has no non-trivial flag
set) AND it makes the contract durable: the moment a leaf in tasks 34–84 declares options/args, the guard
forces it to ship an example too. Record this as the stated interpretation in the test + the final report.

> Detecting "declares its own options" robustly: commander's `cmd.options` includes inherited/global options in
> some configs — use the command's OWN declared options. The global `-C/--project`/`--debug` live on the root
> `program`, not on subcommands, so a subcommand's `cmd.options` are its own. The auto-added `-h/--help` is on
> every command and must be EXCLUDED from the "has its own options" test (filter it out). Detecting a worked
> example: assert the command's `helpInformation()` contains an "Example" / `$ wpm …` block (the helper emits a
> recognizable, asserted marker — e.g. a line starting with `Example` and a `$ wpm <path>` line).

## The help mechanism to build (`src/help/`, doc 12) — a reusable convention for tasks 34–84
Create `src/help/examples.ts` (doc 12 names `synopsis.ts`/`flags.ts`/`examples.ts`; we implement the example
attachment now — the synopsis/flags are commander-native, so a thin `synopsis.ts` is optional/deferred unless
the auto line needs reshaping). Keep it a SMALL, reusable helper the registration pattern uses, so a future
leaf complies by calling it:

```ts
// src/help/examples.ts  (impure shell — NOT src/core/; may import commander)
import type { Command } from "commander";

/** A worked invocation for a command's --help (doc 10 discoverability: "a worked usage example"). */
export interface HelpExample {
  /** The example command line, WITHOUT the leading `$ ` (e.g. `wpm bundle new web-handoff --version 0.2.0`). */
  readonly command: string;
  /** A one-line note on what the example does (optional). */
  readonly note?: string;
}

/** The header line the guard test recognizes as "this command carries a worked example". */
export const EXAMPLE_HEADING = "Example:"; // (or "Examples:")

/**
 * Attach one or more worked examples to a command's `--help`, rendered after the built-in help via commander's
 * `.addHelpText("after", …)` (doc 10 "a worked usage example where the flag set is non-trivial"; doc 12 the
 * `src/help/examples.ts` slot). Returns the command for chaining. The rendered block is stable + asserted by
 * the completeness guard, so any leaf (tasks 34–84) that declares options/args attaches an example the same way.
 */
export function withExamples(command: Command, examples: readonly HelpExample[]): Command {
  if (examples.length === 0) return command;
  const lines = [`\n${examples.length === 1 ? EXAMPLE_HEADING : "Examples:"}`];
  for (const ex of examples) {
    lines.push(`  $ ${ex.command}`);
    if (ex.note !== undefined) lines.push(`      ${ex.note}`);
  }
  command.addHelpText("after", lines.join("\n"));
  return command;
}
```
- Wire it in `src/cli.ts`: the `bundle new` leaf calls `withExamples(leaf, [{ command: "wpm bundle new
  web-handoff --version 0.2.0", note: "create the web-handoff bundle pinned to 0.2.0" }])` and adds
  `.argument("<id>", "the new bundle's id (kebab-case; not a reserved cross-bundle verb)")`. (`.argument` on a
  `.command("new <id>")` re-declares the same positional WITH a description — commander accepts the arg either
  in the command string or via `.argument`; keep `command("new <id>")` and add `.argument("<id>", …)` for the
  description, OR switch to `.command("new").argument("<id>", …)`. Pick whichever keeps the action signature
  `(id, opts)` intact — VERIFY both render `<id>` in usage + a description line.)
- Do NOT change any operation, the exit table, or `configureOutput` — this is purely declarative help wiring in
  the shell. `src/core/**` is untouched (boundary intact; the only files are `src/help/examples.ts` +
  `src/cli.ts` + the test).
- Keep the groups as-is (description present); the rule does not require them to carry an example. (Optionally,
  a representative `.usage()` or a one-line `addHelpText` pointer for a group is allowed but NOT required — keep
  scope tight; don't invent leaf commands the groups don't have yet.)

## Files to add / change
- **ADD** `src/help/examples.ts` — the `withExamples` helper + `HelpExample` + `EXAMPLE_HEADING` (documented;
  pure-ish shell helper over commander).
- **CHANGE** `src/cli.ts` — `bundle new`: add `.argument("<id>", <meaning>)` and call `withExamples(…)` with a
  worked `wpm bundle new …` example. No other behavioral change. (Import `withExamples` from `./help/examples.js`.)
- **ADD** `test/unit/cli/help-contract.test.ts` — AC#1 (full help on `bundle new`) + AC#2 (the recursive
  completeness guard). Mirror `cli.acceptance.test.ts`'s `collector()`/`io()`/`seedDeps()`/`run` harness.
- (No `package.json`/dep change. No `docs/`/template change.)

## Tests (`test/unit/cli/help-contract.test.ts`) — in-process, deterministic, mirror cli.acceptance
Reuse the `collector()` + `io()` + `seedDeps()` harness from `test/unit/cli/cli.acceptance.test.ts` (in-memory
ports + string-collecting sinks; `run([...], deps, io)` in-process — NO subprocess). One `describe` per AC.

- **AC#1 — `bundle new --help` is fully self-sufficient:**
  - `expect(await run(["bundle", "new", "--help"], deps, io)).toBe(0)` and capture `io.out.text` as `help`.
  - `help` contains the leaf description ("create a bundle directory and enable it in the manifest").
  - `help` contains a `Usage:` line that names `bundle new` and shows `<id>` (e.g. matches `/Usage:.*bundle new
    .*<id>/` — or assert `help` includes `Usage:` AND `bundle` AND `new` AND `<id>`).
  - `help` shows each option WITH its effect, and the `--version` default: contains `--version` + `0.1.0`,
    `--disabled`, `--no-advisor` (assert each flag's effect substring too, e.g. "initial version").
  - `help` shows the `<id>` positional's MEANING (the `.argument` description — e.g. contains "kebab-case" or
    "bundle's id"). Distinguishes the bug we're fixing (no `.argument` ⇒ no `<id>` description).
  - `help` contains a worked example: the `EXAMPLE_HEADING` marker + a `$ wpm bundle new web-handoff` line.
- **AC#2 — the completeness guard (the load-bearing deliverable):**
  - Build the program (`buildProgram(seedDeps(), io())`) and **walk every command recursively** (a helper
    `allCommands(program)` that flattens `program.commands` + their `.commands`, EXCLUDING commander's auto
    `help` subcommand if present).
  - For EACH command assert: (a) `cmd.description()` is a non-empty string; (b) `cmd.helpInformation()` contains
    a `Usage:` line; (c) per the STATED RULE — if the command has its own options (filter out the auto
    `-h,--help`) OR a registered positional argument (`cmd.registeredArguments.length > 0`), then
    `cmd.helpInformation()` MUST contain the `EXAMPLE_HEADING` marker (a worked example).
  - Assert the walk actually covered the expected set (the 5 groups + `bundle` + `bundle new`) so the guard
    can't vacuously pass on an empty list — e.g. `expect(names).toEqual(expect.arrayContaining(["init",
    "template","project","build","bundle","new"]))` and `names.length >= 6`.
  - Assert the rule BITES: `bundle new` (has options + `<id>`) MUST have an example; a bare group (e.g. `init`,
    no own options/args) is allowed to have NONE (assert `init`'s help has no `EXAMPLE_HEADING` to prove the
    rule is scoped, not blanket — optional but strengthens intent).
- **(robustness) a group's help is non-empty + dispatches:** `run(["bundle","--help"], …)` → 0 and the output
  names its `new` subcommand + the group description (a representative group through leaf, per the brief).

> Keep assertions CONTENT-based + robust (substring / lowercased / regex on `Usage:`/`Example`), not brittle
> exact-match — the help text is commander-rendered + our example block; test the load-bearing signals.

## DoD (the backlog DoD for task-28)
- `tsc --noEmit` clean; `biome check src test` clean with **0 errors / 0 warnings** (run `biome check --write
  src test` FIRST to clear import-organize/format nits). `vitest run` green (SINGLE process). `npm ci` clean
  (no dep change). **Core import-boundary intact** — `src/help/examples.ts` + `src/cli.ts` are the impure shell
  (they may import `commander`); `src/core/**` is untouched. No dead code; `withExamples`/`HelpExample`/the test
  helpers documented.

## Previous-story intelligence (carried forward — task-27, task-31/32)
- **task-27** built the composition root: `buildProgram` + the `CommandModule.register` pattern +
  `groupOnly` + the `bundle new` leaf; `run`/`runWithExit` map `commander.help`/`helpDisplayed` → exit 0;
  output flows through `io.out`/`io.err` sinks (`configureOutput`); `exitOverride()` makes help/usage throw so
  tests capture text. The acceptance test `test/unit/cli/cli.acceptance.test.ts` ALREADY exercises `--help` →
  0 and `io.out.text` containing the group names — mirror its `seedDeps()`/`collector()`/`io()` harness exactly.
- **boundary discipline (doc 13 §1/§6):** the CLI shell (`src/cli.ts`, `src/util/exit.ts`, and now
  `src/help/`) is the sanctioned home for `commander`; never let help wiring leak into `src/core/`.
- **gate hygiene (task-31/32):** run `biome check --write src test` before the gate to clear formatting; biome
  globs are `src/**`/`test/**`/`*.json`/`*.ts` (the new `.ts` files ARE linted); single-process vitest (task-18).

## Boundaries (do NOT do here)
- Do NOT add new leaf commands (the groups' leaves are tasks 34–84 — only `bundle new` exists). Do NOT change
  any operation, the exit-code table, or `configureOutput`. Do NOT write a custom help RENDERER (doc 12: use
  commander's hooks — `.addHelpText`/`.helpInformation`; the example helper is the only new rendering, and it's
  thin). Do NOT touch `src/core/**` (boundary). Do NOT edit `docs/`, `templates/`, the repo-root
  `AGENTS.md`/`CLAUDE.md`, `.bmad/` (incl. sprint-status), or the dev `backlog/`. Do NOT touch task-10–27/30–32
  source beyond the `bundle new` help wiring. If doc 10/12 specify something this sketch omits, the DOC wins —
  add it + note the divergence in the final report.

## Dev Agent Record
### Agent Model Used
(filled by dev-story)
### Completion Notes List
### File List
