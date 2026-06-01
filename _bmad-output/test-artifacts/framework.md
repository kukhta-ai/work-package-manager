# Test Framework — decision & plan (`testarch-framework`, adapted to a CLI)

> **Status:** design-only. This is the framework **decision and plan**; it creates **no**
> `vitest.config.*` and installs nothing. The runnable harness is **FOUNDATION.md task-6**, which
> implements the decisions below. The standard `testarch-framework` workflow scaffolds **Playwright or
> Cypress**; that assumption is browser-E2E and **does not apply** to this project — adapted here to a
> Node + TS CLI with **vitest** (`docs/12` "Testing: vitest").
> Sources: `docs/12-builder-architecture.md`, `docs/13-core-architecture.md`, `FOUNDATION.md`.

## 1 · Verdict

**Framework: `vitest`.** Decided in `docs/12` ("Testing: vitest") and adopted without change.

**Playwright / Cypress: Not Applicable.** They are browser end-to-end runners. The `wpm` builder has
**no UI, no server, no browser, no network** — it is a CLI that "produces or transforms artifacts on
disk" (`docs/13` §0) and whose end-to-end thread is *argv → command → operation → ports → filesystem*
in a tmpdir (`docs/13` §5, §8). There is nothing for a browser driver to drive. The
`testarch-framework` step is therefore satisfied by **vitest as the single runner for all three test
flavours** (unit, integration, snapshot), not by a browser harness.

## 2 · Rationale (why vitest, from `docs/12`)

`docs/12` "Testing: vitest" gives the reasoning; restated as the framework decision:

- **TS-native, ESM-friendly.** The project is **ESM-only, TypeScript** (`docs/12` "Engineering
  decisions": "ESM-only (no CommonJS dual-build)"). vitest runs TS + ESM with no separate
  transpile/build step, matching the package's module system directly.
- **Fast.** The pure core is unit-tested **entirely in-memory** (`docs/12` "Layered architecture";
  `docs/13` §1); a fast runner keeps that wide base cheap to run on every change and in the
  pre-commit/CI gate.
- **Snapshot support, built in.** One of the three required flavours is **rendered-output stability**
  for `AGENTS.md`/`SKILL.md` (`docs/12` "Testing: vitest"). vitest's snapshot support covers this
  without an extra library.
- **Covers all three flavours without ceremony** (`docs/12`): unit, integration (real tmpdir), and
  snapshot all run under one runner, one config, one command (`vitest`) — which is also leg 3 of the
  three-command gate (see `test-design.md` §5).

No alternative runner is under consideration: the stack decision is fixed in `docs/12`, and the test
strategy (`test-design.md`) is built on the hexagon's injected-ports posture that vitest serves well.

## 3 · Config decisions — the plan **task-6 implements**

The following are **decisions to be realized by FOUNDATION.md task-6** (and the `tsc --noEmit` leg by
task-6/task-7). Listed as a plan, **not** as a config file — `tea` does not write `vitest.config.*`
(that would pre-empt and conflict with task-6).

### 3.1 ESM-native configuration
- Configure vitest for **ESM + TypeScript** with **no emit / no separate build** for tests, matching
  `docs/12`'s ESM-only stance. Type-checking is a **separate** gate leg (`tsc --noEmit`), not folded
  into the test run — keeping responsibilities clean (`test-design.md` §5).

### 3.2 Unit vs integration separation
- Implement the **unit (pure, no fs/subprocess) vs integration (real tmpdir, touches ports)** split
  that task-6 requires and `docs/12` scaffolds (`test/unit`, `test/integration`, `test/snapshot`).
  **Recommended mechanism:** vitest **test projects** (a unit project and an integration project)
  **or** a directory/name-glob split — task-6 chooses; either satisfies the AC.
- Wire the **`test:unit`** and **`test:integration`** scripts named in `docs/12` "Development
  workflow" so the bands can run independently (unit fast and pure; integration slower, real tmpdirs).
  The default `vitest` (no filter) runs **all three flavours** — the single command CI invokes.

### 3.3 tmpdir lifecycle helpers (integration band)
- Provide a small **tmpdir lifecycle helper** (create a unique tmpdir per test, recursive cleanup on
  teardown) so integration tests get an **isolated real filesystem** and can run in parallel without
  sharing state (`docs/12` `test/integration`; determinism in `test-design.md` §3). This is the
  natural home for spinning up a `backlog` root inside the tmpdir for the **real `BacklogMd`** adapter.

### 3.4 Injected-ports test fixtures (the determinism contract)
- Ship the **fakes** the unit/snapshot bands depend on as test fixtures — **in-memory `FileSystem`**,
  **`fake-backlog`**, **`fixed-clock`**, **`fake-env`** (`docs/13` §1, §3). These are the same fakes
  named in the `docs/13` hexagon and are **owned by the port tasks** (FOUNDATION.md task-12 fs port +
  in-memory adapter; task-14 BacklogMd port + fake; task-15 Clock + Environment); task-6 wires them
  into the harness as reusable fixtures rather than re-implementing them.

### 3.5 No global state / determinism by construction
- **No shared mutable global state** across tests: each test constructs its own ports; integration
  tests own their tmpdir; `Project` is a per-operation projection, never a cached singleton
  (`docs/13` §2). Tests assert on the **returned `OperationResult`**, not captured stdout (output is
  not a port — `docs/13` §3). The **`Clock`/`Environment`** ports are injected so **no test reads the
  wall clock or the host platform** (`test-design.md` §3).

### 3.6 Green on current code
- The harness must be **runnable and green on the code present when task-6 lands** (task-6 AC) — i.e.
  the initial suite is small but real and passes, establishing the band structure the later tasks
  fill in (model/services/operations → unit; representative operation + walking skeleton →
  integration; render/derived-artefacts → snapshot).

## 4 · Reconciliation with task-6 (no conflict)

- This plan **defines no config file** and **installs nothing** — task-6 implements every item in §3.
- Every decision is sourced from `docs/12`/`docs/13`: vitest itself, the ESM stance, the three
  flavours, the `test/` scaffold, the fakes, and the `test:unit`/`test:integration` scripts.
- The choice between vitest **projects** vs **glob-based** unit/integration separation is left to
  task-6; both satisfy the "unit vs integration split" acceptance criterion, so there is no
  pre-emption.
- Nothing here contradicts task-5 (Biome) or task-8 (CI): the framework produces the **`vitest`** leg
  of the shared three-command gate and nothing more.
