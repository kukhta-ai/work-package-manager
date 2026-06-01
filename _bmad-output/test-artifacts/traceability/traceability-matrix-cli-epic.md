---
stepsCompleted:
  ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-06-01'
coverageBasis: 'acceptance_criteria'
oracleConfidence: 'high'
oracleResolutionMode: 'formal_requirements'
oracleSources:
  ['backlog tasks TASK-34..TASK-84 (acceptance criteria, via `backlog task <id> --plain`)', 'docs/10-authoring-cli.md', 'docs/13-core-architecture.md']
externalPointerStatus: 'not_used'
tempCoverageMatrixPath: '_bmad-output/test-artifacts/traceability/coverage-matrix-cli-epic.json'
gate_type: 'epic'
trace_target: { type: 'epic', id: 'cli', label: 'epic-2 — wpm authoring command surface (51 leaves, TASK-34..84)' }
collection_mode: 'collected'
allow_gate: true
---

# Traceability Report — CLI epic-2 (`wpm` authoring command surface)

**Test Architect (TEA / Murat) · Phase 6 epic gate · interim coverage trace**
Generated 2026-06-01 · Branch `feature/cli` · Evaluator Root

> This is the **interim gate** of the Phase 6 epic gate for the CLI epic: the acceptance-criteria →
> tests coverage matrix over the 51 command-leaf tasks (TASK-34..84) that implement `wpm`'s authoring
> surface per `docs/10`. The **final** epic-gate verdict is produced after `testarch-nfr` + the
> cold-start full-suite re-run; this trace + the NFR report feed it.

---

## Gate Decision (interim): **PASS**

**Rationale:** P0 coverage 100%, P1 coverage 100% (target 90%), overall fully-covered **100% (250/250
acceptance criteria, min 80%)**. **Zero uncovered ACs** — exhaustively verified: all 250 ACs across the
51 tasks are ticked in the backlog, and every AC maps to at least one covering test, the great majority
**doubly covered** (in-process `run()` unit + real-`dist`-binary E2E). Deterministic gate algorithm
(steps-c/step-05): P0=100% ∧ overall≥80% ∧ P1≥90% ⇒ **PASS**.

---

## 1 · Oracle resolution (Step 1)

| Field | Value |
|---|---|
| `coverageBasis` | **acceptance_criteria** |
| `oracleResolutionMode` | **formal_requirements** (top priority; no synthetic inference) |
| `oracleConfidence` | **high** — formal, versioned, per-task ACs; the suite ran green cold |
| `oracleSources` | the 51 backlog tasks' AC + DoD + implementation notes (via `backlog task <id> --plain`); `docs/10` (the command surface), `docs/13` (the hexagon) |
| `externalPointerStatus` | not_used |

The oracle is the **250 acceptance criteria** across TASK-34..84 (avg ≈ 4.9 ACs/task). **All 250 are
ticked; zero unchecked ACs and zero unchecked DoD items** across the entire epic (verified by an
exhaustive scan). The cold CI-sequence E2E ran green: `npm ci` 0 → `tsc` 0 → `biome ci` **0 over 189
files** (incl. the `src/core/**` import-boundary rule) → `npm run build` 0 → `vitest` **1174 passed /
93 files** with a fresh `dist/` (so the built-binary + real-`backlog` E2E **ran cold**).

Architecture under trace: the **doc-13 ports/adapters hexagon**, now extended to the full command
tree. Each leaf is a thin commander adapter in `src/cli.ts` → one `src/core/operations/*` use-case →
`src/core/services/*` → injected ports; effects only in `src/adapters/*`. Pure core unit-tested over
**in-memory fakes**; the driven edges (`node-fs`, `backlog-cli`, the built `dist/cli.js`) covered by
**integration/E2E** in real tmpdirs.

---

## 2 · Test inventory (Step 2)

| Level | Files | Notes |
|---|---|---|
| **Unit** | 72 | `test/unit/**` incl. **20 `*-commands.test.ts`** families (one per command family) driving operations/leaves in-process via `run()` + OutputSink; plus operation/service/model/util unit tests |
| **Integration / E2E** | 21 | `test/integration/**` incl. **7 `*.e2e.test.ts`** driving the **built `dist/cli.js`** via `execFileSync(process.execPath, [builtCli, …])` against a real project on real disk, several against the **real `backlog`** CLI |
| **TOTAL** | **93** | **1174 test cases pass** (993 static `it/test`; remainder are `it.each`/`test.each` table-row expansions) |

**The real-binary E2E harness is genuine** (not in-process): each `*.e2e.test.ts` resolves
`../../dist/cli.js` and runs it as a child process; `describeIfBuilt = existsSync(builtCli) ? describe
: describe.skip` gates on a built `dist/` — the cold sequence builds before test, so these **ran, did
not self-skip** (the 1174-pass cold run confirms). E2E case density tracks surface complexity:
`cli.bundle-id.e2e.test.ts` carries **78 cases** (the per-bundle subcontext + dynamic-id routing — the
richest surface), `cli.build.e2e.test.ts` 13 (dry-run/package/publish, tasks 82-84),
`cli.project-installer-skills.e2e.test.ts` 10, `cli.project-meta.e2e.test.ts` 7, the bundle
lifecycle/remove-list/template files 5-6 each.

**Double coverage is the established, verified pattern.** A command's ACs are exercised **both**
in-process (the `*-commands.test.ts` unit family, fast, fakes) **and** through the real binary (the
`*.e2e.test.ts`, slow, real disk/`backlog`). E2E `it` titles show deep real assertions — dynamic-id
routing, `-C` placed *after* the subcommand, exit-2 on bad input via the real binary, completion
through the real binary, eemeli/yaml key-order preservation across a round-trip, read-sees-mutation.

**Test-level classification (TEA framework):** CLI/library — **unit** = pure hexagon + command-leaf
logic via `run()` (72 files); **integration/E2E** = real-adapter + **real-built-binary** tests (21
files), this project's end-to-end equivalent (a real `wpm <cmd>` driving real disk + real `backlog`).
**No** browser/UI, **no** HTTP endpoints, **no** authn/authz surface → the endpoint / auth-negative /
UI-state heuristics are **N/A** (recorded below).

---

## 3 · Traceability matrix (Step 3) — AC → tests, by command family

The 51 leaves share a **uniform AC shape** (this is doc-10's discoverability + structure-not-content
contract applied per command), so the matrix is grouped by command family; **every AC of every listed
task is FULL** (covering test exists and ran green). The recurring AC archetypes, and how each is
covered, are:

| AC archetype (recurs across the 51) | How covered (every family) |
|---|---|
| **Behavior** (mutate/read produces the specified manifest/bundle.yml/disk effect) | `*-commands.test.ts` unit (in-process `run()` asserts the OperationResult + fs effect via memory-fs) **+** `*.e2e.test.ts` real-binary asserts the on-disk effect |
| **Structure-not-Content** ("mechanical substitution only, no invented prose") | render-service unit tests (substitution-only, task-16) + the leaf's scaffold test asserts no `{{}}` markers and no authored prose; the CLI never writes prose |
| **Typed-error + non-zero exit** (bad id / not-found / unsupported value / reserved verb) | unit asserts the typed `DomainError` + `exitCodeFor`; E2E asserts the **real exit code** (e.g. bad `--confirmation-level` → 2, non-enabled id → 1, real binary) |
| **"Outside any project" guard** (names missing manifest.yml, suggests init / -C) | every family's unit test runs the leaf with no project → NotFoundError naming `manifest.yml`; `-C` override honored (asserted incl. `-C` *after* the dynamic subcommand in the E2E) |
| **Idempotency / re-render** (materialise by title; derived AGENTS.md + skill re-rendered) | the lifecycle harness (task-25) guarantees RERENDER+MATERIALISE; family tests assert re-invocation de-dupes by title and derived artefacts update |
| **Discoverability** (substantive help: desc/synopsis/flags/example; completion of finite + state-dependent values) | the task-28 `--help` completeness GUARD bites any empty help across ALL registered leaves; family tests assert the specific flags/example; completion tests assert enum + state sources (E2E exercises completion through the real binary) |

### Family-level matrix (all ACs FULL)

| Command family | Tasks | ACs | Priority band | Primary unit evidence | Real-binary E2E evidence | Status |
|---|---|---|---|---|---|---|
| **`init`** | 34 | 8 | **P0** | `cli/*` init coverage; the foundation `cli.init.test.ts` walking-skeleton | `cli.init` (foundation) + init used as fixture-setup in every E2E (`init demo --at …`) | **FULL** |
| **`template list` / `show`** | 35, 36 | 10 | P1 | `template-commands.test.ts` (19) | resolution + not-found exercised via fixtures | FULL |
| **`project show` / reads** | 37 | 5 | P1 | `project-reads-commands.test.ts` (17) | read paths via `cli.project-*` E2E | FULL |
| **`project meta`** | 38 | 5 | P1 | `project-meta-commands.test.ts` (11) | **`cli.project-meta.e2e.test.ts` (7)** — real edit + comment/key-order preserved | FULL |
| **`project version` / `bump` / `set`** | 39, 40, 41 | 14 | **P0** (bump/set mutate + re-render) | `version-commands.test.ts` (15) | version round-trips via E2E; exit-2 on bad level/semver | FULL |
| **`project targets add` / `list` / `remove`** | 42, 43, 44 | 16 | P1 (alias side-effects) | `targets-commands.test.ts` (19) | alias create/remove + unknown-agent warn | FULL |
| **`project installer-skills add` / `list` / `remove`** | 45, 46, 47 | 15 | P1 (scaffold + reserved-name) | `project-installer-skills-commands.test.ts` (24) | **`cli.project-installer-skills.e2e.test.ts` (10)** — scaffold vs attach, deregister-not-delete | FULL |
| **`project validate`** | 48 | 6 | **P0** (the coherence gate) | `validate.*` (foundation) + `project-reads`/validate family | aggregated-findings + exit code via real binary | FULL |
| **`project root`** | 49 | 4 | P1 | `project-reads-commands.test.ts` | single-line path, shell-composable | FULL |
| **`bundle new`** | 50 | 6 | **P0** (the core authoring mutation) | `bundle-lifecycle-commands.test.ts` (27) + `create-bundle.*` (foundation) | **`cli.bundle-lifecycle.e2e.test.ts` (6)** — reserved-verb exit 2, `--version` shadow fix, advisor scaffold | FULL |
| **`bundle enable` / `disable`** | 51, 52 | 11 | P1 (idempotent enable; disable re-render) | `bundle-lifecycle-commands.test.ts` | `cli.bundle-lifecycle.e2e` | FULL |
| **`bundle remove`** | 53 | 6 | **P0** (DESTRUCTIVE) | `bundle-remove-commands.test.ts` (11) | **`cli.bundle-remove-list.e2e.test.ts` (6)** — confirm-required, decline-no-op, prefix-safe archive | FULL |
| **`bundle list`** | 54 | 4 | P2 | `bundle-list-commands.test.ts` (7) | `cli.bundle-remove-list.e2e` | FULL |
| **`bundle template show` / `set`** | 55, 56 | 8 | P1 | `bundle-template-commands.test.ts` (13) | **`cli.bundle-template.e2e.test.ts` (5)** — replace bundle-template, wrong-scope rejected | FULL |
| **`bundle <id> show` / `meta`** | 57, 58 | 10 | **P0** (dynamic-id ROUTING + confirmation-level enum) | `bundle-id-commands.test.ts` (22) | **`cli.bundle-id.e2e.test.ts` (78)** — routing, `-C`-after-subcommand, bad enum exit 2, key-order | FULL |
| **`bundle <id> version` / `bump` / `set`** | 59, 60, 61 | 13 | P1 (bump materialises cross-bundle review tasks) | `bundle-version-commands.test.ts` (22) | version round-trips + cross-bundle task fan-out | FULL |
| **`bundle <id> requires add` / `list` / `remove`** | 62, 63, 64 | 15 | P1 (cycle-warn + dependency edges) | `bundle-requires-commands.test.ts` (26) | requires edge add/remove, cycle warn, caret default | FULL |
| **`bundle <id> files add` / `list` / `remove`** | 65, 66, 67 | 13 | P1 (register-not-write; deregister-not-delete) | `bundle-files-commands.test.ts` (21) | payload ref register/deregister, content untouched | FULL |
| **`bundle <id> templates add` / `list` / `remove`** | 68, 69, 70 | 13 | P1 | `bundle-templates-commands.test.ts` (22) | payload-template ref register/deregister | FULL |
| **`bundle <id> scripts add` / `list` / `remove`** | 71, 72, 73 | 13 | P1 | `bundle-scripts-commands.test.ts` (23) | installer-scripts ref register/deregister | FULL |
| **`bundle <id> skills add` / `list` / `remove`** | 74, 75, 76 | 15 | P1 (payload-skill scaffold + ref) | `bundle-skills-commands.test.ts` (23) | scaffold vs attach, deregister-not-delete | FULL |
| **`bundle <id> installer-skills add` / `list` / `remove`** | 77, 78, 79 | 15 | P1 (scaffold + bundle alias ensure) | `bundle-installer-skills-commands.test.ts` (25) | scaffold + per-bundle alias, deregister-not-delete | FULL |
| **`bundle <id> advisor add` / `remove`** | 80, 81 | 10 | P1 (stub render; remove closes task) | `bundle-advisor-commands.test.ts` (18) | advisor scaffold no-op-if-present; remove deletes stub | FULL |
| **`build dry-run`** | 82 | 6 | **P0** (validate + lock-verify gate) | `build-commands.test.ts` (15) | **`cli.build.e2e.test.ts` (13)** — validate fail-fast, frozen-lock drift, ship-tree printed, no artefact | FULL |
| **`build package`** | 83 | 5 | **P0** (produces the distributable; missing-tool error) | `build-commands.test.ts` | **`cli.build.e2e.test.ts`** — real tarball produced + `tar -tzf` listed; unsupported `--format` exit 2; **missing-tool → ValidationError exit 1 (runSync spawn-failure fix)** | FULL |
| **`build publish`** | 84 | 4 | **P0** (build-then-push; build-fail-no-push) | `build-commands.test.ts` | **`cli.build.e2e.test.ts`** — local-dir + git-remote push; **build-fail-no-push proven** (real binary) | FULL |

**Totals:** 51 tasks · **250 ACs · 250 FULL · 0 PARTIAL · 0 NONE.**

---

## 4 · Gap analysis & coverage statistics (Step 4)

### Coverage statistics

| Metric | Value |
|---|---|
| Total acceptance criteria (oracle items) | **250** |
| Fully covered (FULL) | **250** |
| Partially covered (PARTIAL) | 0 |
| Uncovered (NONE) | **0** |
| **Overall coverage %** | **100%** (250/250) |

### Priority breakdown

Priority assigned by risk-to-the-author and blast radius (the matrix bands above):

| Priority | Total ACs | Covered (FULL) | % | What's here |
|---|---|---|---|---|
| **P0** | ~70 | ~70 | **100%** | `init`, version bump/set (project+bundle), `project validate`, `bundle new`, **`bundle remove` (destructive)**, dynamic-id **routing** (57/58), the **`build` trio** (82/83/84 — validate+lock gate, produce, publish) |
| **P1** | ~165 | ~165 | **100%** | every other mutating + reading leaf (targets, installer-skills, requires, files/templates/scripts/skills refs, advisor, template list/show, project meta/show) |
| **P2** | ~15 | ~15 | **100%** | pure read-only listings with the lightest blast radius (`bundle list`, some `*-list` leaves) |
| **P3** | 0 | 0 | 100% | none material |

> Band sizes are approximate (the P0/P1 split is a risk judgement over 250 criteria); the **gate-relevant
> facts are exact**: P0 = 100%, P1 = 100%, overall = 100% (250/250).

### Gaps by risk

- **Critical (P0) gaps: 0.**
- **High (P1) gaps: 0.**
- **Medium (P2) gaps: 0.**
- **Uncovered ACs (the gaps that matter): NONE.** Every one of the 250 ACs is ticked **and** test-covered.

### Coverage heuristics — applicability recorded

| Heuristic | Status | Why |
|---|---|---|
| Endpoints without tests | **not_applicable** | no HTTP/API surface (CLI; "thin builder", `docs/13` §0) |
| Auth negative-path gaps | **not_applicable** | no authn/authz/session surface |
| Error-path / happy-path-only | **present (covered)** | error paths are first-class and pervasive: every leaf has a typed-error AC + a "no project" guard AC, each with a test; exit-2 (usage) and exit-1 (not-found/conflict/constraint) asserted **through the real binary**; destructive `bundle remove` decline-paths exhaustively tested; `build` validate/lock/missing-tool failure paths tested |
| UI journey / UI state | **not_applicable** | no UI |

The negative-path posture is exceptionally strong: across 51 leaves, ~100 ACs are error/guard
behaviors, all tested — many doubly (unit + real-binary exit code).

### Scope notes recorded (not gaps)

Two **documented, AC-consistent scope decisions** (each ticked, each with a test for what *is* in
scope — not coverage gaps):
- **`build publish` (task-84):** npm/registry HTTP push is a **documented v1 deferral** (`docs/10`:183
  leaves the destination open); local-dir and git-remote destinations **are** implemented and E2E-tested.
  AC#1/#2 ("push to the given destination", "build-fail-no-push") are satisfied for the in-scope
  destinations.
- **Template set:** only `minimal`/`default` templates exist; `single-bundle`/`multi-bundle` are
  follow-on content (FOUNDATION.md), not invented here — `template list`/`show`/`bundle template set`
  are tested against the templates that exist.

---

## 5 · Gate decision (Step 5) — deterministic algorithm applied

Inputs (`steps-c/step-05`): `collection_status = COLLECTED`, `allow_gate = true` ⇒ **gate-eligible**.

| Rule | Threshold | Actual | Result |
|---|---|---|---|
| 1 · P0 coverage | = 100% | **100%** | MET |
| 2 · Overall coverage | ≥ 80% | **100%** (250/250) | MET |
| 3 · P1 coverage floor | ≥ 80% | **100%** | MET |
| 4 · P1 target → PASS | ≥ 90% | **100%** | **PASS** |

Oracle confidence **high**, **not** synthetic ⇒ no CONCERNS overlay. **0 P0/P1/P2 gaps.**

### → Interim gate verdict: **PASS**

**Rationale:** P0 100%, P1 100%, overall 100% (250/250). Zero uncovered acceptance criteria; the
established double-coverage pattern (in-process `run()` unit + real-`dist`-binary E2E) holds across the
command tree, and the cold full-suite (1174 tests, incl. real-binary + real-`backlog`) ran green.

### Next actions / recommendations

| Priority | Action |
|---|---|
| INFO | This interim PASS feeds the **final** Phase-6 epic-gate verdict together with `testarch-nfr` and the cold-start full-suite re-run (already green). |
| LOW | (Scope, not coverage) When the npm/registry publish destination is added post-v1, extend `cli.build.e2e` with a registry-push case; the local-dir + git paths are already E2E-covered. |
| LOW | (Placement, carried from epic-1) rendered-content stability still lives inside unit family/scaffold tests rather than a dedicated `test/snapshot/`; optional consolidation when convenient. |

---

*Companion machine-readable outputs: `coverage-matrix-cli-epic.json` (full Phase-1 matrix) and
`e2e-trace-summary-cli-epic.json` (portable gate summary) in this directory.*
