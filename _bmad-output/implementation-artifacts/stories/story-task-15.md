# Story task-15 — Implement the Clock and Environment ports

> BMAD create-story output (skill-driven; the skill's sprint-status/epics auto-discovery is suppressed —
> sprint-status is orchestrator-owned — and the spec is steered from `docs/13 §3` + the task ACs). doc 13 §3:
> the last two of the four ports. Ports under `src/core/ports/` (pure, boundary rule applies); adapters under
> `src/adapters/` (real use `process`/`Date`, fakes pure+settable). **Synchronous core** — `now()`/`cwd()`/
> `platform()`/`getEnv()` are all sync.

## Story
As the builder's pure core, I need replaceable abstractions for the clock and the environment so that every
time-dependent and environment-dependent behavior is injected — making the core deterministic and fully
testable (pin time, cwd, platform, env), exactly as the FileSystem and BacklogMd ports already are.

## Acceptance criteria (the contract)
1. Everything time-dependent and environment-dependent the builder does is reached through replaceable
   abstractions for the clock and the environment (doc 13).
2. Tests can pin the current time, the working directory, the platform, and environment variables to fixed
   values.

## Developer context (doc 13 §3)
- **Clock** — "the current time, for dates in task creation, the changelog, and receipts. Injected so tests
  are deterministic." (doc 13 §3.)
- **Environment** — "the current working directory, the platform, and environment-variable access —
  everything the core needs about *where* it's running, for project resolution and (in the adapter) the
  Windows alias decision." (doc 13 §3.)
- These two join FileSystem (task-12) and BacklogMd (task-14) as the four ports; the same pattern applies:
  pure interface in `core/ports/`, a real adapter and a fake in `src/adapters/`.

## Technical requirements / architecture compliance (guardrails)
- **SYNC**: all methods synchronous (the cross-cutting decision; matches task-12/14). No Promises.
- **Import boundary**: `src/core/ports/clock.ts` and `environment.ts` import nothing effectful (no `process`,
  no `Date` construction) — they are interfaces; the boundary rule on `src/core/**` must stay clean. The
  REAL adapters (`system-clock.ts`, `process-env.ts`) use `new Date()` / `process.*` and live OUTSIDE the
  core. The FAKES (`fixed-clock.ts`, `fake-env.ts`) are pure + settable.
- **Platform**: `platform()` returns raw `NodeJS.Platform` (`"win32"`/`"linux"`/`"darwin"`/…) — supports the
  Windows-vs-POSIX distinction directly, and matches `process.platform`'s type so the real adapter is a
  straight pass-through.
- **DO NOT refactor task-12.** `src/util/symlink.ts` keeps its own injected `platform` for `ensureAlias`;
  this Environment port is the core's *general* environment window. Unifying them is a later task (note it).

## File structure (files to add)
- `src/core/ports/clock.ts` — `interface Clock { now(): Date }`.
- `src/core/ports/environment.ts` — `interface Environment { cwd(): string; platform(): NodeJS.Platform;
  getEnv(name: string): string | undefined }`.
- `src/adapters/system-clock.ts` — `class SystemClock implements Clock { now() { return new Date(); } }`.
- `src/adapters/fixed-clock.ts` — `class FixedClock implements Clock`: constructed with a `Date` (or ISO
  string / epoch ms); `now()` returns a COPY of the pinned instant (so callers can't mutate it); plus
  `set(date)` and `advance(ms)` so a test can move time deterministically (AC#2).
- `src/adapters/process-env.ts` — `class ProcessEnvironment implements Environment` over `process.cwd()` /
  `process.platform` / `process.env`.
- `src/adapters/fake-env.ts` — `class FakeEnvironment implements Environment`: constructed with optional
  `{ cwd, platform, env }`; settable `setCwd`/`setPlatform`/`setEnv`/`deleteEnv`; `getEnv` returns
  `undefined` for unset keys (AC#2).
- Update `src/core/ports/index.ts` and `src/adapters/index.ts` barrels.

## Tests (AC#2; pure where possible)
- `test/unit/adapters/fixed-clock.test.ts`: `now()` returns the pinned instant; returns a fresh Date each
  call (mutating the returned Date doesn't move the clock); `set` re-pins; `advance(ms)` moves forward;
  accepts Date/ISO/epoch construction.
- `test/unit/adapters/fake-env.test.ts`: returns the constructed cwd/platform/env; `getEnv` undefined for
  unset; `setCwd`/`setPlatform`/`setEnv`/`deleteEnv` mutate; pinning all three (AC#2).
- `test/integration/adapters/system-env.test.ts` (real adapters reflect reality, light): `SystemClock.now()`
  within a tolerance of real `Date.now()`; `ProcessEnvironment.cwd() === process.cwd()`,
  `.platform() === process.platform`, and an env var set on `process.env` reads back through `getEnv`
  (restore it after).
- Also (AC#1, structural): the fakes are `Clock`/`Environment` (type-level), confirming the core can be
  driven by either real or fake — a small compile-and-run assertion.

## DoD
- Ports pure (boundary clean — verify biome on `src/core/ports/`). `tsc --noEmit` clean, `biome check .`
  clean, `vitest run` green, `npm ci` clean (no new deps — `Date`/`process` are built-ins). JSDoc every
  public type/method; no dead code.

## Previous-story intelligence (carried forward)
- Pattern established (task-12/14): pure port interface (zero effectful imports — proven by the boundary
  rule), real adapter class + fake class, both added to the adapters barrel; fakes must be FAITHFUL +
  settable. Tests split unit (fakes, pure) / integration (real, reflects reality).
- task-14 lesson: integration tests that touch real external state must be robust under concurrency — the
  integration project already runs `fileParallelism: false`, and the `system-env` integration test restores
  any `process.env` it mutates so it can't leak across tests.
- Formatting: run `biome check --write` before the gate (the pre-commit hook enforces it).

## Boundaries (do NOT do here)
- No use of these ports in operations yet (later). No refactor of `src/util/symlink.ts` (task-12). No new
  deps. Don't edit docs/, AGENTS.md, backlog/, .bmad/ (incl. sprint-status), task-5's biome.json, task-10–14.
