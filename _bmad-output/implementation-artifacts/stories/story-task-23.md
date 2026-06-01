# Story task-23 — Define the typed error model and exit-code mapping

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned
> — steered from doc 13 §7). **Phase D begins.** doc 13 §7 the error model + exit codes. PURE — the error
> TYPES + the pure exit-code MAPPING; printing/`process.exit` is the CLI boundary (task-27), NOT here.

## Story
As the operations (tasks 25/26+) and the CLI top-level handler (task-27), I need a small set of typed domain
errors the core raises for domain failures — distinct categories the handler can map to documented exit
codes in one place — so the core never terminates the process or writes to stderr itself, and exit codes are
decided once (doc 13 §7).

## Acceptance criteria (the contract)
1. Failures are expressed as distinct categories — bad usage, not found, conflict, unsatisfiable constraint,
   and invalid input (doc 13).
2. The core signals failure by raising these; it never terminates the process or writes directly to the
   error stream.
3. Each failure category maps to one documented exit status (success, usage error, and everything-else),
   decided in a single place.

## Developer context (doc 13 §7 — the authoritative table)
| Error category | Raised when | Exit |
|---|---|---|
| Usage | bad invocation or bad input value | **2** |
| Not-found | project, bundle, or template missing | **1** |
| Conflict | id already exists, bundle already enabled, … | **1** |
| Constraint | unsatisfiable `requires`, or a dependency cycle | **1** |
| Validation | schema / kebab / reserved-word failure | **1** (or **2** when it's a bad argument) |

"A single top-level handler at the CLI boundary catches these, maps each to its exit code, and prints a clean
message; an unexpected (non-domain) error exits 1 … Commander handles pure-syntax usage errors … as exit 2
before the core is ever reached. So exit codes are **0** success, **2** usage, **1** everything else — decided
in one place." The core RAISES; never `process.exit`/stderr (doc 13 §7).

## Design — `src/core/errors.ts` (PURE; boundary rule applies)
- Lives under `src/core/` (a core-level module the operations + commands share), so the import-boundary rule
  applies — and it must hold trivially: it imports NOTHING (no `process`, no `node:fs`/`commander`/`execa`,
  no `console`). The core RAISES, never exits/prints.
- **`ErrorCategory`** = `"usage" | "not-found" | "conflict" | "constraint" | "validation"` (the five, AC#1).
- **`DomainError` base** `extends Error`: carries `readonly category: ErrorCategory` (the discriminator) +
  the human `message` + optional `readonly detail?: { field?: string; id?: string }` (structured extra). Set
  `this.name = <SubclassName>` and fix the prototype chain (`Object.setPrototypeOf` for ES2022-target class-
  extends-Error robustness) so `instanceof` works.
- **Five subclasses**, each fixing its `category`:
  - `UsageError` (`"usage"`) — bad invocation or bad input value (incl. a validation that is specifically a
    bad CLI argument → raise THIS so the mapping stays category-driven → exit 2).
  - `NotFoundError` (`"not-found"`) — project/bundle/template missing.
  - `ConflictError` (`"conflict"`) — id already exists, bundle already enabled, …
  - `ConstraintError` (`"constraint"`) — unsatisfiable `requires` / dependency cycle.
  - `ValidationError` (`"validation"`) — schema/kebab/reserved-word failure.
  - Constructor shape: `(message: string, detail?: { field?; id? })`.
- **`isDomainError(e: unknown): e is DomainError`** — type guard (`e instanceof DomainError`).
- **`ExitCode = 0 | 1 | 2`**.
- **`exitCodeFor(error: unknown): ExitCode`** — THE single source of truth (AC#3): if `isDomainError(error)`
  → `category === "usage"` ? `2` : `1` (not-found/conflict/constraint/validation all → 1); else (a plain
  `Error` or any non-`Error` value, the "everything-else" bucket) → `1`. (`0` is the success path — no error
  — handled by the caller; `exitCodeFor` is only invoked when an error occurred, so it never returns 0, but
  `ExitCode` includes 0 for the caller's success branch.) Document the table in the JSDoc.
- Export: `ErrorCategory`, `DomainError`, the five subclasses, `isDomainError`, `ExitCode`, `exitCodeFor`.

## Out of scope (do NOT retrofit)
The existing services' plain `throw new Error(...)` for authoring/tamper bugs (render unresolved placeholder,
malformed `template.yml`/`wpm.lock`) STAY as "unexpected → exit 1" via the default mapping; they are NOT
rewritten here. The OPERATIONS (tasks 25/26+) will raise the typed `DomainError`s for domain failures (map the
`validate` report → `ValidationError`/`ConstraintError`, a duplicate id → `ConflictError`, a missing
project/template → `NotFoundError`, a bad argument → `UsageError`). task-23 defines the model + the mapping
ONLY. No printing/`process.exit` (task-27 + `src/util/exit.ts`).

## Tests (`test/unit/errors.test.ts` — pure)
- Each of the five subclasses is a distinct, throwable value that is `instanceof DomainError` (and
  `instanceof Error`), carries the right `category`, the message, and (when given) `detail.field`/`detail.id`
  (AC#1). `name` is the subclass name.
- `isDomainError` returns `true` for each subclass, `false` for a plain `Error`, a string, `undefined`, `null`.
- `exitCodeFor`: `UsageError` → 2; `NotFoundError`/`ConflictError`/`ConstraintError`/`ValidationError` → 1; a
  plain `Error` → 1; a non-`Error` value (string/`undefined`/object) → 1 (AC#3, the single place).
- AC#2 (static): the module source contains no `process`/`console`/`node:fs`/`commander`/`execa` import or
  usage — assert by reading the file text and checking the forbidden tokens are absent (a pure-no-I/O guard).

## DoD
- Pure (boundary clean — no effectful imports; confirm biome on `src/core/`). `tsc --noEmit` clean,
  `biome check .` clean, `vitest run` green (SINGLE process), `npm ci` clean (no new deps). JSDoc every
  public type/fn; no dead code.

## Previous-story intelligence (carried forward)
- task-10–22 decision echo: services return DATA for normal "no" outcomes and throw plain `Error` for
  authoring/parse bugs; task-23 adds the TYPED domain errors the OPERATIONS raise for domain failures, and the
  ONE mapping. Class-extends-`Error` under `target: ES2022` needs `Object.setPrototypeOf(this, new.target?.
  prototype ?? <Class>.prototype)` (or per-class) so `instanceof` holds. Run `biome check --write` before the
  gate; vitest SINGLE process (task-18 caveat).

## Boundaries (do NOT do here)
- No printing / `process.exit` / stderr (task-27). No retrofitting existing services. No wiring into
  operations. No new deps. Don't edit docs/, AGENTS.md, backlog/, .bmad/ (incl. sprint-status), task-5's
  biome.json, task-10–22.
