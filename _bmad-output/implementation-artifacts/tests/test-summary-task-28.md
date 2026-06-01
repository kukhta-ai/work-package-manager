# Test Automation Summary — task-28 (Wire the --help content contract)

> bmad-qa-generate-e2e-tests output. Feature under test: "every command's `--help` meets doc 10's
> discoverability contract, guarded for all registered commands." The observable behavior is the CLI's `--help`
> output, driven IN-PROCESS via `run([..., "--help"], deps, io)` and `buildProgram`'s command tree. There is no
> UI and no runtime API — the deliverable is the `--help` content plus a completeness guard. Framework: vitest
> (`unit` project). Steps 2–3 (API / browser E2E) do not apply.

## Generated / confirmed tests — `test/unit/cli/help-contract.test.ts`
In-process via `run` / `buildProgram` with in-memory ports + string-collector sinks (mirrors
`cli.acceptance.test.ts`). A `fullHelp(cmd)` helper captures the COMPLETE rendered help (commander emits the
`.addHelpText` example via the `afterHelp` event during `outputHelp`, not in `helpInformation()`).

- [x] AC#1 — `bundle new --help` is self-sufficient: the description; a `Usage:` line naming `bundle new` with
  `<id>`; each flag with its effect + the `--version` default (`0.1.0`); the `<id>` positional's meaning (the
  `.argument` description); and a worked `Example:` block (`$ wpm bundle new …`).
- [x] AC#2 — completeness guard: every registered command (walked recursively) has a non-empty `description`
  and a `Usage:` line; the walk covers the expected set (`init`/`template`/`project`/`build`/`bundle`/`new`,
  ≥ 6 commands) so it can't pass vacuously.
- [x] AC#2 — the stated RULE: a command with its OWN options OR a positional argument MUST carry a worked
  example (checked via `fullHelp`).
- [x] AC#2 — the rule BITES and is SCOPED: `bundle new` (options + `<id>`) has an example; a bare group (`init`,
  no own options/args) does NOT (proving the rule is scoped to non-trivial flag sets, per doc 10's wording).
- [x] (representative) `bundle --help` names the group description and its `new` subcommand.
- [x] (ADDED, end-to-end) the `-h` short alias is byte-identical to `--help` on the leaf (doc 10: "`--help`/`-h`
  is supported") — both exit 0 and render the description + the worked example.
- [x] (ADDED, end-to-end) a group renders substantive help and exits 0 via `run` (`project --help`).
- [x] (ADDED, end-to-end) the root `wpm -h` lists every top-level group and exits 0.

## AC → coverage map
| AC | Covered by |
|----|------------|
| #1 every command's help shows invocation + options/effects + ≥1 worked example | `bundle new --help` full-content case; the guard's "example for non-trivial flag set" rule; the `-h`/group/root end-to-end cases |
| #2 no registered command has empty or missing help | the recursive completeness guard (description + Usage for ALL; example for non-trivial; walk covers the expected set; rule bites + scoped) |

## The placeholder-group RULE the guard enforces (stated)
doc 10 scopes the worked-example requirement to "a worked usage example **where the flag set is non-trivial**".
So: (1) EVERY command must have a non-empty description; (2) EVERY command's help must contain a `Usage:` line;
(3) a command that declares its OWN options (excluding the auto `-h/--help`) OR a positional argument must ALSO
carry a worked example. The 5 group placeholders (`init`/`template`/`project`/`build`/`bundle`) need only (1)+(2)
today; `bundle new` triggers (3). When the leaves in tasks 34–84 declare options/args, the guard forces each to
ship an example — making the contract durable.

## Gap found & closed
The pre-existing guard inspects `helpInformation()`/`fullHelp(cmd)` directly but never drives a GROUP or the
short `-h` alias through the real `run()` display path. Added three end-to-end cases: `-h` ≡ `--help` (the
short alias is part of doc 10's "`--help`/`-h` is supported"); a group (`project`) rendering help + exit 0 via
`run`; and the root `wpm -h` listing the groups. No existing coverage duplicated.

## Coverage
- ACs: 2/2 covered, each by multiple cases. 8 cases total, all green.
- Happy path: an author reading any command's `--help` finds it self-sufficient. Critical robustness: the guard
  fails any future leaf that ships empty/boilerplate-only help; `-h` parity; group + root help through `run`.
- No UI → no browser E2E; no runtime API → no status-code tests.

## The help mechanism (so leaves 34–84 follow it)
`src/help/examples.ts` exports `withExamples(command, [{ command, note? }])` which attaches a worked example via
commander's `.addHelpText('after', …)`, plus `EXAMPLE_HEADING` (the marker the guard recognises). A future leaf
with a non-trivial flag set declares its `.description()`, `.option()`s (with effect + default), `.argument()`s
(with meaning), and calls `withExamples(…)` — and it complies with both doc 10 and the completeness guard
automatically. commander natively renders the rest (description, Usage synopsis, option effects + defaults,
argument descriptions).

## Next steps
- Run in CI via the three-command gate (tsc + biome + vitest), which already includes the new file.
- As tasks 34–84 add leaves, each declares description/flags/args + `withExamples`; the guard enforces it.
