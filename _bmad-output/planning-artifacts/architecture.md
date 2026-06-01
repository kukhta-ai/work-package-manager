# Architecture — work-package-manager (`wpm`) — BMAD projection shim

> **Authoritative source**: `docs/12-builder-architecture.md` (stack, scaffold, distribution) and
> `docs/13-core-architecture.md` (the core application's internal hexagon — the design tasks 6–19 of
> the foundational backlog implement). This file is a BMAD-required projection of those two documents;
> it is **NOT** a second source of truth, and it adds **no** new architectural decisions. Every claim
> below cites its doc/section; where this file and the docs disagree, the docs win. Where the docs
> deliberately leave a detail open (exact module APIs, internal data-structure shapes), this shim says
> "refined per-task" rather than deciding it here — those are sharpened at implementation time by the
> per-task build loop, inside doc `13`'s fixed principles.

---

## 0 · The two framing principles (doc `13` §0)

Everything below rests on two stances that decide what belongs in the core and what does not. They are
**fixed** (part of the project's style), not refinable:

- **Thin builder, fat agent** (doc `13` §0). The product distributes *instructions for AI agents*; the
  core's job is **delivery**, and execution is the agent's, at runtime, in the user's environment. The
  builder authors and packages artifacts on disk; it never executes an install, embeds a runtime, or
  reaches onto the target machine. Architectural consequence: the core needs only a filesystem port and
  a Backlog.md port — **no** process-executor or network-installer port — because there is no install
  engine here to give one to.
- **SDLC-agnostic pure core** (doc `13` §0). The execution discipline an install runs under (Ralph-style
  loop, a review gate, spec-driven phases, or none) is **vendored content**, never core. The core has no
  `Workflow` type, no `Methodology` enum, no branch that behaves differently per methodology; it would
  not change if a new SDLC framework appeared tomorrow. Hard rule: **nothing under `core/` models, names,
  or depends on any particular workflow.** A workflow concept leaking into the model or operations is the
  same class of violation as a `commander` import in the core. (This is *our* development method, the
  BMAD loop in `AGENTS.md`; it must never leak into `src/core/`.)

---

## 1 · Stack (doc `12` §"Engineering decisions, with rationale")

The chosen, committed stack — each with the doc's rationale, none re-opened here:

- **Node.js + TypeScript, ESM-only** (no CommonJS dual-build). Backlog.md (the hard runtime peer
  dependency the CLI shells out to) is itself Node; sharing the ecosystem keeps install to one
  `npm i -g`. TS because the manifest / bundle.yml / template schemas are structural enough that a type
  system pays for itself within the first refactor. (doc `12` §"Engineering decisions" — Language.)
- **CLI framework: commander** — declarative, mature; its `.command()` chain maps cleanly onto doc `10`'s
  command tree, and its `.helpInformation()` / `.helpOption()` hooks meet the `--help` content contract
  without a custom help renderer. (doc `12` — CLI framework.)
- **Tab completion: omelette** — generates bash/zsh/fish completion scripts and dispatches dynamic
  completions back via a `__complete` hook (e.g. bundle ids completed from `manifest.yml`). (doc `12` —
  Tab completion.)
- **YAML: `yaml` (eemeli/yaml)** — preserves comments and key order through round-trips, because manifest
  and bundle.yml are author-edited and must never be silently re-formatted on a programmatic touch.
  (doc `12` — YAML.)
- **Subprocess: execa** (the Backlog.md adapter shells out, not a library — Backlog.md exposes a CLI, not
  a stable JS API; reads parse `--plain` output, writes pass arguments). This insulates the builder from
  Backlog.md version churn. (doc `12` — Backlog.md adapter.)
- **Testing: vitest** — TS-native, ESM-friendly, snapshot support; covers the three test surfaces (pure
  unit, integration in a tmpdir, snapshot of rendered output). (doc `12` — Testing.)
- **Lint + format: Biome** (pinned exact), one tool for both; it is also the home of the import-boundary
  rule (§"the invariant" below). (doc `12` §"biome.json"; FOUNDATION.md Phase A / task-5.)
- **Distribution: a single global npm install** (`npm i -g`), Backlog.md as a `peerDependency` (pinged,
  not bundled); **CI** is GitHub Actions, matrix on Node LTS × {Linux, macOS, Windows}. (doc `12` —
  Distribution; CI. Realized by FOUNDATION.md task-7/task-8.)

Exact dependency versions, `package.json`/`tsconfig.json` field-level shapes, and script names are
**refined per-task** (FOUNDATION.md task-1, task-5–task-8); the doc fixes the *choices*, not the pins.

---

## 2 · The hexagon: layering (doc `13` §1, §2, §4, §5)

The architecture is **ports and adapters (hexagonal)**. The **core is pure** — it computes over an
injected filesystem and an injected Backlog.md adapter and has no idea whether a CLI, a test, or anything
else is driving it; effects live at the edges behind **ports** (interfaces the core declares) implemented
by **adapters** (doc `13` §1). One refinement of doc `12` that doc `13` makes explicit and that this shim
records: doc `12`'s single `core/` (the pure services list) is split into a **services** tier and an
**operations** (use-case) tier above it, with ports made explicit as injected interfaces (doc `13` §0
intro, §9 "Against `12`").

Four tiers, dependencies pointing **inward only**:

- **`model/`** (doc `13` §2) — pure data plus smart constructors that make illegal states
  unrepresentable. Branded primitives (`BundleId`, `AgentName`, `SemVer`, `VersionRange`) obtainable only
  through a validating parser; `Manifest`, `BundleManifest`, `Template`, the loaded `Project` aggregate
  (a fresh per-operation *projection*, never a long-lived mutable singleton), and value objects
  (authoring-task spec, validation report, operation result). Built by FOUNDATION.md task-10/task-11.
- **`services/`** (doc `13` §4) — the pure logic tier: `schema`, `version-constraint`, `render`,
  `derived-artefacts`, `scope-plan`, `materialisation`, `validate`, `integrity`. Each focused and
  mostly-pure; the ones that read content take it **as data** (the operation does the I/O) so they stay
  testable in memory. Built by FOUNDATION.md task-16–task-22.
- **`operations/`** (doc `13` §5) — the use-case tier, **one operation per command intent**; each composes
  services + ports and returns a structured result. This is the orchestration doc `12` left unplaced
  (e.g. `createBundle` runs ~eight steps). Built by FOUNDATION.md task-25 (the shared harness) + task-26
  (one representative operation).
- **adapters / driving edge** — `src/commands/` + `cli.ts` are the **driving adapter** (parse argv → typed
  Input → call **one** operation → format result; doc `13` §6); `src/util/` and the port adapters are the
  **driven** infrastructure. `cli.ts` is the composition root that constructs the **real** ports once and
  registers every command; a test constructs **fake** ports and calls the operation directly, skipping
  commander (doc `13` §6). Built by FOUNDATION.md task-27–task-29.

The dependency rule (doc `13` §1): `commands/ → operations/ → services/ → model/`; `operations/` and
`services/ → ports/` (interfaces, **never** an adapter); `adapters/ → ports/` + the real library; `util/`
is a pure leaf. Concrete module/internal-API shapes within each tier are **refined per-task**; the
*tiers and the arrow direction* are fixed.

---

## 3 · The hard import-boundary invariant (doc `13` §1; enforced by task-5)

**Nothing under `core/` imports `commander`, `execa`, `omelette`, or `node:fs` (nor any OS/filesystem or
subprocess module) directly** (doc `13` §1). A core module reaching for one of those is a layering
violation. This is what makes doc `12`'s promise real — "unit tests work entirely in-memory with the
adapter mocked" — and it is enforced **mechanically**, by a Biome `noRestrictedImports` rule, not by
code-review vigilance (FOUNDATION.md Phase A, task-5; the project DoD in `config.yml` includes
"no core-boundary violation", gating every task). A violating import is a defect the linter catches and is
**never** to be worked around (it is a fixed principle even as module shapes are refined).

---

## 4 · The four ports (doc `13` §3) — each with a real adapter and a fake

The core is written against the interface and never learns which implementation it got. There are exactly
four (the small set the thin-builder stance permits — no executor/network port):

| Port | What it abstracts (doc `13` §3) | Real adapter | Fake (tests) |
|---|---|---|---|
| **FileSystem** | read · write (atomic: temp-write then rename) · exists · make-dirs · list · copy-tree · remove · **ensure-alias** | `node-fs` (FOUNDATION.md task-12) | `memory-fs` (in-memory; task-12) |
| **BacklogMd** | init a backlog root w/ config · create · list (filterable) · edit · archive a task; reads return **parsed summaries**, not raw text | `backlog-cli` via execa (task-14) | `fake-backlog` (task-14) |
| **Clock** | the current time (task dates, changelog, receipts) — injected for determinism | `system-clock` (task-15) | `fixed-clock` (task-15) |
| **Environment** | cwd, platform, env-var access — *where* it's running (project resolution, the Windows alias decision in the adapter) | `process-env` (task-15) | `fake-env` (task-15) |

Two boundaries the doc states because they prevent whole categories of mistake (doc `13` §3), preserved
verbatim in intent:

- **`ensureAlias` hides the Windows fallback.** The symlink-vs-copy decision is an *adapter* concern: the
  real adapter symlinks on POSIX and copies-with-warning on Windows, reporting which it did; the core
  never branches on platform (it has no access to `os`). (doc `13` §3; doc `12` — Symlinks on Windows.)
- **`BacklogMd` scope = authoring-backlog + initial scaffolding only — never install-backlog content.**
  This is doc `10`'s "no-mirror" principle made structural: the port offers no operation that targets an
  install-backlog's *content*, so the principle cannot be violated by accident. (Setting a bundle's
  `install-backlog/config.yml` task-prefix is a YAML write through **FileSystem**, not a backlog op.)
  (doc `13` §3.)

**Output is not a port** (doc `13` §3): the core does not print — operations **return** a structured
result and the command layer formats and writes it; this keeps the core free of stdout/stderr and makes
results assertable without capturing streams. (A silent, injected debug logger is the one optional
exception.)

---

## 5 · The six-beat mutation lifecycle (doc `13` §5)

Every **mutating** operation walks the same six beats; the uniformity is the point — a new command leaf
becomes "fill in one operation", and doc `10`'s automatic-currency guarantee (derived artefacts never
drift) holds everywhere for free (doc `13` §5). Realized as the shared harness in FOUNDATION.md task-25.

1. **LOAD** — `ctx + fs` → the `Project` projection (manifest + every `bundle.yml`).
2. **CHECK** — pure services validate the change vs current state → on failure **throw a typed
   DomainError** (no mutation).
3. **APPLY** — `fs` / `backlog`: the structural effects (YAML writes, dirs, task-prefix, backlog init).
4. **RERENDER** — `derived-artefacts` → `AGENTS.md` + the orchestrator skill + scope aliases
   (**idempotent**: writes only what differs; re-running an unchanged op is a no-op).
5. **MATERIALISE** — `materialisation → backlog` → authoring tasks, **title-idempotent** (skip any title
   that already exists).
6. **RESULT** — return an `OperationResult` (summary + changed paths + materialised task titles); the
   command formats + prints, exit 0.

Read-only operations (`show`, `list`, `validateProject`) run **① → pure projection → ⑥** with no ③④⑤
(doc `13` §5). Steps ④ and ⑤ are **automatic**, not per-command: an operation declares its structural
effect in ③ and the harness handles currency (④) and materialisation (⑤) around it. Idempotency is
structural at ④ and ⑤ (doc `13` §5). The harness's exact signature/interfaces are **refined per-task**
(task-25); the *six beats and their ordering* are fixed.

---

## 6 · Error model + exit codes (doc `13` §7)

The core raises a **small set of typed domain errors** and never terminates the process or writes to
stderr itself (doc `13` §7). Each category carries a fixed meaning and exit code:

| Error category (doc `13` §7) | Raised when | Exit |
|---|---|---|
| Usage | bad invocation or bad input value | **2** |
| Not-found | project, bundle, or template missing | **1** |
| Conflict | id already exists, bundle already enabled, … | **1** |
| Constraint | unsatisfiable `requires`, or a dependency cycle | **1** |
| Validation | schema / kebab / reserved-word failure | **1** (or **2** when it's a bad argument) |

A **single top-level handler** at the CLI boundary maps each error to its exit code and prints a clean
message; an unexpected (non-domain) error exits **1** and prints a stack only under `--debug`. Commander
handles pure-syntax usage errors (unknown flag, missing argument) as exit **2** before the core is
reached. Net, decided in one place: **0** success / **2** usage / **1** everything else (doc `13` §7).
Realized as the typed error model + exit-code mapping in FOUNDATION.md task-23, wired at the boundary in
task-27.

---

## 7 · Cross-cutting: context resolution (doc `13` §7)

**Context resolution** (FOUNDATION.md task-24) is a service used before any project-bound operation: walk
the working directory upward (via the Environment + FileSystem ports) until a `manifest.yml` is found
(git-style), honour a `-C/--project` override, and yield either a located project context or an explicit
*no-project* result (which `template list`/`show` tolerate by falling back to built-ins). (doc `13` §7.)

---

## 8 · Traceability to the foundational backlog (doc `13` §9; FOUNDATION.md)

Doc `13` §9 maps the architecture onto the backlog and the build is **bottom-up**: model+schema
(task-10/11) → FileSystem port + adapters (task-12) → comment-preserving YAML inside the fs adapter
(task-13) → BacklogMd port + adapters (task-14) → Clock/Environment (task-15) → the `render`,
template-resolver, `version-constraint`, `derived-artefacts`/`scope-plan` services (task-16–task-20),
`materialisation` (task-21), `integrity` (task-22) → the typed error model (task-23), context resolution
(task-24), the shared mutation lifecycle harness (task-25), one representative operation end-to-end
(task-26) → the commander composition root + registration + DI + error handler (task-27), `--help`
(task-28), completion (task-29) → minimal/default templates + builder skill (task-30–task-32). The
**walking skeleton (task-33)** is the first end-to-end thread — `commands → operation → services → ports →
fs` against a real tmpdir — proving the hexagon composes before the per-command leaves are filled in
(doc `13` §9; FOUNDATION.md Phase G).

---

## Read-with / cross-refs

Read doc `12` for *what ships and why this stack*; doc `13` for *how the core is shaped internally*; doc
`10` for the command surface each operation backs; doc `11` for the authoring-task materialisation each
mutating operation drives; FOUNDATION.md for the dependency-ordered tasks that turn this into code
(epics.md projects that mapping). No decision in this shim originates here — all are citations.
