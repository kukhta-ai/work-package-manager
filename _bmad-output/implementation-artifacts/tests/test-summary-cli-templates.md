# Test Automation Summary — `template list` + `template show` (tasks 35 + 36)

> bmad-qa-generate-e2e-tests output. Feature under test: the `template` command family — two READ-only,
> project-aware CLI commands that reuse the existing `listTemplates`/`resolveTemplate` services. Driven
> IN-PROCESS via `run()` over `MemoryFileSystem` fixtures (the template roots are just dirs in memory).
> Framework: vitest (`unit`). No UI/runtime API → Steps 2–3 (API/browser E2E) do not apply.

## Tests — `test/unit/cli/template-commands.test.ts` (18 cases)
Seeds a built-in templates root (`/builtin`) + a project (`/proj`) with a `templates/` that shadows one
built-in (`project/single-bundle`), adds a bundle template (`bundle/adopts-tool`), and a name (`clash`) at both
project scopes. Drives via `run(["template", …, "-C", "/proj"], deps, io)`. A `snapshot()` of the fs proves
read-only.

### `template list` (task-35)
- AC#1 — inside a project lists BOTH project-local + built-ins; OUTSIDE any project lists built-ins only (the
  project-only template absent). Exit 0.
- AC#2 — a project-local sharing a name with a built-in is shown shadowing it (the `shadow` marker present).
- AC#3 — `--scope bundle` and `--scope project` each filter to that scope; a bad `--scope` value → exit 2.
- AC#4 — read-only: the fs file-set is byte-unchanged; exit 0.
- AC#5 — help: description + `Usage:` + `--scope` + `Example:`.

### `template show` (task-36)
- AC#1 — prints metadata (name, scope, source) + the parameter names + the `files/` tree; and resolves the
  PROJECT-local template over the same-named built-in (`source: project-local`, project files).
- AC#2 — `--scope` disambiguates a name at both scopes: no `--scope` → UsageError exit 2; `--scope project` /
  `--scope bundle` each resolve the right one (exit 0).
- AC#3 — a name matching nothing → NotFoundError, exit 1, clean stack-free message; PLUS (ADDED) an explicit
  `--scope` that doesn't match the name → NotFoundError exit 1.
- AC#4 — read-only: file-set unchanged; exit 0 on a hit.
- AC#5 — help: description + `Usage:` + `<name>` + `--scope` + `Example:`.

### Completion (the AC#5 completion half for BOTH tasks) — ADDED
Via `completeArgv` over the real program tree + the default registry + the template specs:
- `template list --scope <tab>` → `[project, bundle]`.
- `template show --scope <tab>` → `[project, bundle]`.
- `template show <tab>` (the positional) → the available template names (`minimal`/`default`/`adopts-tool`…)
  from the `template-names` source.

## AC → coverage map
| Task | AC | Covered by |
|------|----|------------|
| 35 | 1 | in-project + outside-project list cases |
| 35 | 2 | the shadowing-marker case |
| 35 | 3 | the `--scope bundle`/`--scope project` filter cases (+ bad-scope→exit 2) |
| 35 | 4 | the read-only (snapshot) case |
| 35 | 5 | the help case + the `template list --scope` completion case |
| 36 | 1 | the metadata+files-tree case + the project-over-builtin case |
| 36 | 2 | the `--scope` disambiguation case |
| 36 | 3 | the missing-name case + the explicit-non-matching-scope case |
| 36 | 4 | the read-only (snapshot) case |
| 36 | 5 | the help case + the `template show --scope`/`<name>` completion cases |

## Gaps found & closed
1. (AC#5 completion half, BOTH tasks) The help half was covered but the COMPLETION half (`--scope` →
   `[project, bundle]`; `show <name>` → template-names) had no permanent test. Added 3 completion cases via the
   dispatch.
2. (AC#3 task-36) Added the explicit-`--scope`-miss path (`show minimal --scope bundle` → NotFoundError exit 1),
   distinct from the both-scopes-tried miss already covered.

## Cross-cutting (verified, no new test needed)
- The task-28 help completeness guard (`help-contract.test.ts`) walks the new `template`/`list`/`show` commands
  and passes — both leaves carry `withExamples` examples (they have options/args).
- The task-29 completion tests pass — the tree gained the template leaves; the specs reference the existing
  `template-scopes`/`template-names` sources; the dispatch is unchanged.

## Coverage
- ACs: 10/10 (35: 5, 36: 5), each by ≥ 1 case (several by 2). 18 cases total, all green. No new core code (the
  read projections compose the existing pure services; the formatting is shell). No disk change (read-only,
  proven by fs snapshots).
- No UI → no browser E2E; no runtime API → no status-code tests.

## The pattern (for the family-grouped CLI builds)
A `CommandModule` per command family; READ leaves call the existing services + a CLI-layer `formatX` helper +
return 0 (no `runMutation`); context is resolved tolerantly (built-ins fallback); `--scope` via commander
`.choices()` (help + exit-2 validation for free); `withExamples` per leaf (the guard requires it); the
completion is one `COMPLETION_SPECS` entry referencing existing sources. Tests drive `run()` in-process over
`MemoryFileSystem` fixtures + a read-only snapshot assertion.

## Next steps
- Run in CI via the three-command gate (tsc + biome + vitest). The next families (the `project` and `build`
  groups, the `bundle <id>` subcontext) follow this same pattern.
