# Test Automation Summary — task-23 (typed error model + exit-code mapping)

> `bmad-qa-generate-e2e-tests` output. Framework: **vitest**. No HTTP API / UI (a CLI), so the API/E2E-UI
> bands are N/A. The error model is pure (types + a pure mapping; the core only raises), so it is fully
> unit-testable; the "acceptance" band is the raise -> catch -> exit-code flow the CLI top-level handler
> (task-27) will run.

## Generated / relevant tests

### Unit (the model + mapping — AC#1/#2/#3), `bmad-dev-story`
- [x] `test/unit/errors.test.ts` — each of the five subclasses (`UsageError`/`NotFoundError`/`ConflictError`/
  `ConstraintError`/`ValidationError`) is a distinct, throwable `instanceof DomainError` (+ `instanceof
  Error`) carrying its `category`, message, optional `detail.field`/`detail.id`, and `name`; the five
  categories are distinct; `isDomainError` true for each subclass / false for plain Error/TypeError/string/
  undefined/null/object; `exitCodeFor` maps usage->2, the other four->1, plain Error->1, non-Error value->1;
  and a **static no-I/O guard** asserting `src/core/errors.ts` contains no `process`/`console`/`node:fs`/
  `commander`/`execa` token (AC#2 — the core raises, never exits/prints).

### Acceptance (the raise -> catch -> exit-code boundary flow), this skill
- [x] `test/unit/errors.acceptance.test.ts` — a `runOperation` stand-in for the CLI boundary (try → success
  returns 0; catch → `exitCodeFor`):
  - simulated operations raise the typed error their domain failure would (duplicate id → ConflictError,
    missing template → NotFoundError, bad CLI arg → UsageError, unsatisfiable requires → ConstraintError,
    schema failure → ValidationError) → each maps to its documented code (usage->2, the four others->1).
  - the caught value is the right typed `DomainError` with `category` + `detail` intact.
  - an UNEXPECTED failure (a plain `Error`, e.g. a render unresolved-placeholder bug) → `isDomainError` false,
    `exitCodeFor` -> 1 (the everything-else bucket).
  - the success path is exit 0, decided by the caller (`exitCodeFor` only called on error).
  - the whole table holds via `exitCodeFor` as the single source of truth: 0 success / 2 usage / 1 everything
    else.

## Coverage
- AC#1 (distinct categories: usage / not-found / conflict / constraint / validation): covered.
- AC#2 (core raises, never exits/prints): covered (static no-I/O guard + the raise-only flow).
- AC#3 (one documented exit status per category, decided in one place): covered (`exitCodeFor`).

## Result
`npx vitest run` → 349 passed (37 files), run as a single process. `tsc --noEmit` clean, `biome check .`
clean.

## Next steps
- Run in CI (the matrix runs the three-command gate).
- The CLI top-level handler (task-27) + `src/util/exit.ts` will catch a thrown error, call `exitCodeFor`, print
  a clean message (a stack only under `--debug`), and `process.exit` with the code — the EFFECT this pure
  module deliberately omits. The operations (tasks 25/26+) raise the typed `DomainError`s (mapping a `validate`
  report → `ValidationError`/`ConstraintError`, a duplicate id → `ConflictError`, a missing project/template →
  `NotFoundError`, a bad argument → `UsageError`).
