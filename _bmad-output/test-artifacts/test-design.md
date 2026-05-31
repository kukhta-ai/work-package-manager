# Test Design — `wpm` installer-builder (system-level strategy)

> **Status:** design-only. This document is the test **strategy** the foundational tooling tasks
> conform to. It creates **no** config or CI files — Biome lives in **task-5**, the vitest harness in
> **task-6**, and CI in **task-8** (FOUNDATION.md Phase A). Authored by `tea` (Murat) in Phase 3
> (solutioning); resumed in Phase 4 (epic test-design) and Phase 6 (trace + NFR + final gate).
> Sources: `docs/12-builder-architecture.md`, `docs/13-core-architecture.md`, `FOUNDATION.md`.

## 0 · What we are testing and why this shape

The product is a **Node + TypeScript ESM CLI** (`wpm`) that authors and packages instructions for AI
agents — "thin builder, fat agent" (`docs/13` §0). It never executes an install, never embeds a
runtime, never reaches onto a target machine; **everything the core does is produce or transform
artifacts on disk** (`docs/13` §0). That single fact decides the whole test strategy:

- There is **no install engine, network, or browser** to drive. Browser-E2E tooling
  (Playwright/Cypress) is **N/A** here (see `framework.md`). The "end to end" we care about is
  *argv → command → operation → services → ports → filesystem* against a real tmpdir.
- The architecture is **hexagonal** (`docs/13` §1): a **pure core** computing over injected ports
  (`FileSystem`, `BacklogMd`, `Clock`, `Environment`), with effects pushed to adapters at the edges.
  This is what makes the bulk of the system unit-testable **in-memory with the adapter mocked**
  (`docs/12` "Layered architecture"; `docs/13` §1).

So the test pyramid is wide at the pure base (fast, in-memory, deterministic), narrower at the
integration band (real tmpdir, real command sequences), with a thin, sharp snapshot band guarding
the one thing a CLI like this ships that humans read: **rendered instructional content**
(`AGENTS.md`, `SKILL.md`).

## 1 · The three test flavours (`docs/12` "Testing: vitest")

`docs/12` names exactly three test surfaces; this strategy adopts them verbatim as the three flavours,
and maps each to the hexagon so it is unambiguous what code each layer owns.

| Flavour | What it exercises | Ports | Speed / determinism | Placement |
|---|---|---|---|---|
| **unit** | pure logic: version constraints, kebab validation, schema parse, render, scope-plan, materialisation *decisions*, validate, integrity hashing | **fakes only** (in-memory `FileSystem`, `fake-backlog`, `fixed-clock`, `fake-env`) — or none, for purely functional services | sub-ms, fully deterministic, no fs / no subprocess | `test/unit/` |
| **integration** | real command sequences run in a **real tmpdir**: `init` → `bundle new`, version-bump cascades, targets add/remove, context walk-up, backlog materialisation through the **real** `BacklogMd` adapter | **real adapters** (`node-fs`, `backlog-cli` via execa, `system-clock`/injected `fixed-clock`, `process-env`) | slower; deterministic via fixed clock + isolated tmpdir per test | `test/integration/` |
| **snapshot** | **rendered output stability**: the `AGENTS.md`, the orchestrator/installer `SKILL.md`, and other derived artefacts rendered for a known fixture project, compared against committed expected output | fakes (render is pure; `derived-artefacts` is a pure projection — `docs/13` §4) | fast, deterministic by construction (same `Project` ⇒ same output) | `test/snapshot/` |

These map one-to-one onto `docs/12`'s `test/` scaffold (`test/unit`, `test/integration`, `test/snapshot`,
`test/fixtures`) and onto the worked-example fixtures it names (`hermes-handoff`, `single-bundle-project`).

## 2 · What each layer owns — mapped to the hexagon

The dependency rule (`docs/13` §1, §2–§6) gives a clean ownership split; the test flavour for a module
is decided by **where in the hexagon it sits**, not by taste.

```
        commands/        (driving adapter, src/commands + cli.ts)
            │                 → exercised by INTEGRATION (real argv path) + a thin
            │                   layer of UNIT checks on parse/format helpers
        operations/      (use-case tier, core/operations)
            │                 → UNIT with fake ports (lifecycle logic, the six beats);
            │                   INTEGRATION for the real-adapter end-to-end thread
        services/        (pure logic tier, core/services)
            │                 → UNIT (render, version-constraint, validate, scope-plan,
            │                   materialisation decisions, integrity, schema)
        model/           (branded primitives + aggregates, core/model)
            │                 → UNIT (smart constructors: illegal states unrepresentable)
        ports/           (interfaces, core/ports)
            │                 → contract is exercised through BOTH a real adapter and a
            │                   fake; the fake is a unit-test fixture, the real adapter
            v                   is covered by INTEGRATION
        adapters/        (node-fs, backlog-cli, system-clock, process-env)
                              → INTEGRATION (touch the real OS / real `backlog` CLI)
        rendered content (derived-artefacts output: AGENTS.md, SKILL.md)
                              → SNAPSHOT vs test/fixtures
```

Concretely, by `docs/13` module:

- **`model/` + `schema` service** → **unit**. Branded `BundleId` / `AgentName` / `SemVer` /
  `VersionRange` constructors and manifest/bundle/template parse+validate+serialize are pure; tested
  against in-memory data and fixture YAML strings (`docs/13` §2, §4).
- **`version-constraint`** → **unit**: `satisfies(version, range)` and `resolve(graph)` →
  satisfied / unsatisfied / **cycle**, against semver fixtures (`docs/13` §4).
- **`render`** → **unit** + **snapshot**: substitution-only (no conditionals/loops) is unit-checked;
  the *rendered file map* for a fixture template feeds the snapshot band (`docs/13` §4; `docs/12`
  "Templates as data").
- **`derived-artefacts`** → **unit** (idempotent projection: same `Project` ⇒ same output) **+
  snapshot** (the actual `AGENTS.md`/`SKILL.md` text) (`docs/13` §4, §5 step ④).
- **`scope-plan`** → **unit**: `(targets)` → alias paths via the built-in agent→alias map (`docs/13` §4).
- **`materialisation`** → **unit** for the *decision* (`(intent, Project)` → `AuthoringTaskSpec[]`);
  **integration** for the *creation* (title-idempotent tasks through the real `BacklogMd` adapter)
  (`docs/13` §4, §5 step ⑤).
- **`validate`** → **unit**: constraints resolve, no cycles, targets non-empty, no orphan bundle
  dirs (`docs/13` §4; the `project validate` read-only trace, `docs/13` §8).
- **`integrity`** → **unit**: content hashing + lockfile emit/verify over file content the operation
  supplies (`docs/13` §4).
- **`operations/`** (the six-beat mutation lifecycle, `docs/13` §5) → **unit** with fake ports for the
  orchestration logic; the **representative operation (FOUNDATION.md task-26)** and the **walking
  skeleton (task-33)** prove it through **integration** against a real tmpdir.
- **`commands/` + `cli.ts`** (driving adapter, `docs/13` §6) → **integration** for the real argv
  path (incl. the discoverability contracts below); thin **unit** coverage on parse/format helpers.
- **adapters** (`node-fs`, `backlog-cli`, `system-clock`, `process-env`) → **integration** (they are
  the only code allowed to touch the OS / the real `backlog` CLI; the **Windows symlink→copy
  fallback** in `ensureAlias` is an adapter concern and is tested at this band, `docs/12`/`docs/13` §3).

## 3 · Determinism — the non-negotiable

Every test must be deterministic; flakiness is treated as a defect, not a retry. The hexagon makes
this structural rather than aspirational (`docs/12` "Layered architecture"; `docs/13` §3):

- **Time** is injected via the **`Clock`** port. Unit and snapshot tests use a **fixed clock**;
  integration tests that assert on dates (task dates, changelog, receipts) inject a fixed clock too,
  so no test ever reads the wall clock (`docs/13` §3).
- **`Environment`** is injected (cwd, platform, env vars). Tests that depend on platform or project
  location set them explicitly rather than inheriting the host (`docs/13` §3, §7).
- **Filesystem** is the **in-memory `memory-fs`** for unit/snapshot; integration uses a **fresh,
  uniquely-named tmpdir per test**, created and torn down by a harness helper, so tests never share
  on-disk state and can run in parallel (`docs/12` `test/integration`; `docs/13` §1).
- **`BacklogMd`** is the **`fake-backlog`** for unit (in-memory task store, parsed summaries back);
  integration uses the **real** adapter against a backlog root inside the per-test tmpdir (`docs/13` §3).
- **Idempotency is asserted, not assumed**: re-running an unchanged operation is a no-op (step ④
  writes only diffs) and re-materialising skips existing-title tasks (step ⑤) — both are directly
  testable and **must** have explicit "run twice ⇒ second run changes nothing" tests (`docs/13` §5).
- **Output is not a port** (`docs/13` §3): operations **return** a structured `OperationResult`; tests
  assert on the returned value (summary, changed paths, materialised task titles), not on captured
  stdout/stderr. Stream formatting is the command layer's concern and is checked at the integration band.

## 4 · The core import-boundary as a first-class quality gate

`docs/13` §1/§2 mandate: **nothing under `core/` may import `commander`, `execa`, `omelette`, or
`node:fs` directly.** This is *the* invariant that makes "unit tests run entirely in-memory with the
adapter mocked" true (`docs/12` "Layered architecture"). The strategy treats the boundary as a gate
with **two independent enforcers**:

1. **Static (the real gate):** the Biome `noRestrictedImports` rule encoding the boundary —
   **owned by FOUNDATION.md task-5**, run as `biome ci` locally and in CI. A violating import is a
   reported lint **violation**, not a warning (task-5 AC). This catches the boundary mechanically on
   every change, exactly as `docs/13` §1 requires ("a lint rule … rather than code-review vigilance").
2. **Behavioural (the safety net):** the in-memory test posture itself. Because unit suites construct
   **only fake ports** and never import an adapter, a stray `node:fs`/`execa`/`commander` import in a
   core module tends to surface as an unexpected real effect or an import error in the unit run. This
   is a backstop, not a replacement — the Biome rule is the authority. (No new test invariant is
   introduced here that task-5 doesn't already enforce.)

The boundary is also a **trace target** in Phase 6: the final gate (`testarch-trace`) records that the
boundary rule is present, enabled, and green, alongside the coverage matrix.

## 5 · The three-command gate (the single quality gate, local == CI)

There is exactly **one** gate, run identically in three places (a developer's machine, the pre-commit
hook on touched files, and CI on every push/PR). It is three commands (`docs/12` "CI"; `docs/12`
"Development workflow"; FOUNDATION.md task-8 — "the SAME lint/type/test gates as local"):

```
1. biome ci          # lint + format-check, incl. the core import-boundary rule   ← task-5 owns
2. tsc --noEmit      # full TypeScript type-check (ESM, no emit)                   ← task-6/-7 wire
3. vitest            # the whole suite: unit + integration + snapshot             ← task-6 owns
```

- **Local:** `npm run lint` / `npm test` (and `test:unit` / `test:integration` splits) per `docs/12`
  "Development workflow" run these. The pre-commit hook (**husky + lint-staged**, task-5) runs the
  same lint+format on **staged/touched files** for speed, and a fresh clone gets the hook with **no
  manual setup** (task-5 AC).
- **CI:** the matrix (see `ci.md`) runs the **identical three commands**; any failure **blocks merge**
  (task-8 AC). CI does not run a *different* or *stronger* gate than local — parity is the whole point
  (`docs/12` "CI"; task-8 AC).

This document does not implement the gate; it states the contract the three tasks implement so they
stay mutually consistent.

## 6 · Test placement and fixtures (`docs/12` `test/` scaffold)

Adopt `docs/12`'s scaffold exactly — this is what **task-6** stands up:

```
test/
├── unit/          pure-logic tests, no fs / no subprocess         (fakes or no ports)
├── integration/   real command sequences in a tmpdir             (real adapters)
├── snapshot/      rendered-output stability vs fixtures           (render/derived-artefacts)
└── fixtures/      worked-example projects + expected outputs
    ├── hermes-handoff/          the primary worked-example project
    ├── single-bundle-project/
    └── …
```

- **Fixtures are inputs and oracles.** A fixture project (e.g. `hermes-handoff`) is the loaded
  `Project` a snapshot test renders from; the committed `AGENTS.md`/`SKILL.md` next to it is the
  expected output. Snapshot updates are a **deliberate, reviewed** act — a diff in rendered
  instructional content is a real change to what ships, never a rubber-stamp `-u`.
- **Naming convention** carries the flavour (`*.test.ts` under the flavour directory); task-6 decides
  whether unit/integration separation is by directory + vitest **projects** or by name glob (see
  `framework.md`). Either satisfies "unit (pure) and integration (real tmpdir) split" (task-6 AC).
- **No global state**: each integration test owns its tmpdir and its ports; no shared singletons
  (`Project` is a per-operation projection, never a long-lived mutable cache — `docs/13` §2).

## 7 · The walking skeleton is the first true end-to-end thread

Per `docs/13` §5/§9 and FOUNDATION.md Phase G, the **walking skeleton (task-33)** is the first
integration test that runs **one vertical slice through every layer** — *commands → operation →
services → ports → fs* — against a real tmpdir, proving the hexagon composes **before** the
per-command leaves exist. Until task-33, integration coverage is necessarily partial (the
representative operation, task-26, is the first operation-level thread). The strategy therefore
expects: rich unit coverage from Phase B onward, the first real integration thread at task-26, and the
**foundation-complete E2E checkpoint** at task-33 — which is also the entry condition for the Phase 6
epic gate (`testarch-trace` + `testarch-nfr` + the cold-start full-suite run).

## 8 · Reconciliation with tasks 5 / 6 / 8 (no conflicts)

This strategy is written to **conform to**, never pre-empt, the implementing tasks:

- It defines **no** `biome.json`, `vitest.config.*`, or `.github/workflows/*` — those are task-5,
  task-6, and task-8 respectively.
- The **single gate** it names (`biome ci` + `tsc --noEmit` + `vitest`) is exactly task-8's
  "same lint/type/test gates as local," sourced from `docs/12` "CI."
- The **import-boundary** it elevates to a gate is exactly task-5's `noRestrictedImports` rule.
- The **unit/integration split + determinism + green-on-current-code** it requires are exactly
  task-6's acceptance criteria.
- The **matrix** (`ci.md`) is exactly task-8's "supported Node range across Linux/macOS/Windows"
  (`docs/12` "CI").

If any implementing task were to diverge from this (e.g. a CI gate that differs from local, or a
boundary rule that warns instead of fails), that is a **conflict to surface**, not to absorb. As of
this design, none exists.
