---
stepsCompleted:
  ['step-01-load-context', 'step-02-define-thresholds', 'step-03-gather-evidence', 'step-04-evaluate-and-score', 'step-05-generate-report']
lastStep: 'step-05-generate-report'
lastSaved: '2026-06-01'
workflowType: 'testarch-nfr-assess'
inputDocuments:
  [
    'backlog tasks TASK-1..TASK-33 (AC + DoD + implementation notes, via `backlog task <id> --plain`)',
    'docs/12-builder-architecture.md',
    'docs/13-core-architecture.md',
    'FOUNDATION.md',
    '_bmad-output/test-artifacts/test-design.md',
    '_bmad-output/test-artifacts/traceability/traceability-matrix.md',
    '.claude/skills/bmad-testarch-nfr/resources/knowledge/nfr-criteria.md (adapted: web→CLI)',
  ]
---

# NFR Evidence Audit — Foundation epic-1 (installer-builder `wpm`)

**Date:** 2026-06-01
**Target:** epic-1 — installer-builder foundation (TASK-1..TASK-33), branch `feature/foundation`
**Assessor:** Root (TEA / Murat) · Phase 6 epic gate
**Overall Status:** **PASS** ✅

---

> **Adaptation note (required by the brief).** This is a **Node + TS ESM CLI** that authors and
> packages instructions for AI agents — "thin builder, fat agent" (`docs/13` §0): no server, no
> network, no UI, no auth surface, no runtime install engine. The `nfr-criteria.md` knowledge fragment
> frames Security/Performance/Reliability around a **web app** (auth/JWT/RBAC/OWASP, k6 SLO/SLA load,
> Playwright UI resilience). Those exact thresholds are **not applicable**; I assess the **ISO/IEC
> 25010 quality characteristics that *do* apply to this CLI** and mark the inapplicable ones N/A with
> rationale rather than inventing thresholds (the fragment's own rule: *undefined targets → CONCERNS*
> is avoided here because N/A is a *justified* determination, not an undefined one).
>
> This audit summarizes **existing implementation evidence** (the 33 tasks' acceptance criteria, DoD,
> and implementation notes; the green cold suite). It does **not** re-run tests or CI.

---

## Executive Summary

**Assessment:** **4 PASS, 1 CONCERNS (advisory, doc-only), 0 FAIL.**

The four applicable NFR domains for this CLI are all **PASS**:

| Domain (ISO/IEC 25010) | Status | One-line basis |
|---|---|---|
| **Maintainability** | **PASS** ✅ | the core import-boundary invariant is mechanically enforced (Biome rule + fixture test) and one registration/help/completion exemplar governs the 51 future leaves |
| **Reliability** | **PASS** ✅ | determinism by injected Clock/Environment + in-memory fakes; the one real-`backlog` flake source was root-caused and fixed without retry-masking; 527/527 green cold |
| **Security** | **PASS** ✅ | injective length-prefixed sha256 + `wpm.lock` tamper-evidence; argv-array (no-shell) subprocess; 0 npm vulns; no secrets/telemetry/network |
| **Fake↔Real Parity** (custom) | **PASS** ✅ | every parity gap (memory-fs alias-follow, symlink parent-dir, FakeBacklog.init) was surfaced by a real-edge test and recorded, not papered over |
| Performance | **N/A** | artifact-authoring CLI; no SLO/throughput surface; synchronous core over small file trees |
| Scalability | **N/A** | single-invocation, single-working-tree tool; no concurrency/load dimension |

**Blockers:** **0.**

**High-priority issues:** **0.** No P0/P1 NFR gap.

**The single CONCERNS** is **doc-only and advisory**: TASK-9 AC#3/#4 (agent-orientation front door /
README→docs link) are unchecked because `AGENTS.md`/`CLAUDE.md` were deliberately left **human-owned**.
This is the *same* item the trace flagged; it is a **Monitorability/onboarding documentation** concern,
not a code, security, or reliability risk, and it is a **user-gate** disposition — not a release
blocker for the foundation's technical readiness.

**Recommendation:** **PASS the NFR gate.** Surface the one doc-only CONCERNS to the human at the epic
gate for a trivial non-code disposition.

---

## Performance Assessment

**Status: N/A (justified) — not a release blocker.**

- **Response time (p95) / Throughput / CPU / Memory:** **N/A.** `wpm` is an artifact-authoring CLI
  invoked once per author action; it reads/writes a small project file tree and shells out to
  `backlog` for task ops. There is no request-serving surface, no SLO/SLA, and no load dimension —
  the `nfr-criteria.md` k6 thresholds (`p(95)<500ms`, `error rate <1%`) have nothing to measure
  against. `docs/13` §0 makes this structural: the builder "never embeds a runtime, never reaches
  onto the target machine."
- **Design facts that keep it cheap (recorded, not gated):** the core is **synchronous** (a
  cross-cutting decision in `docs/13`'s adapters, task-12) over in-memory/disk data; `Project` is a
  **per-operation projection, never a cached singleton** (`docs/13` §2) — so there is no cache-warming
  or memory-growth concern; rendering is pure substitution with no template-engine evaluation
  (task-16). The cold full suite (527 tests, incl. real-`backlog` subprocess + a built-binary spawn)
  completes within the normal CI step budget — evidence enough that nothing pathological exists.
- **Evidence:** `docs/13` §0/§2; task-12 (sync core) and task-16 notes; the green cold `npm test`.
- **Findings:** No performance NFR applies; no action.

### Scalability

- **Status: N/A (justified).** Single-invocation, single-working-tree tool (the dev process itself is
  "one story in flight, single working tree" — `CLAUDE.md` branch topology). No horizontal scaling,
  no multi-tenant, no concurrent-request model. The one place concurrency *appeared* — parallel vitest
  workers over shared external `backlog` state — was a **test-harness** isolation issue, handled under
  Reliability below, not a product scalability property.
- **Evidence:** `docs/12`/`docs/13` scope; FOUNDATION.md "What is deliberately NOT here."
- **Findings:** No scalability NFR applies; no action.

---

## Security Assessment

**Status: PASS ✅.** For a CLI that *distributes instructions an agent will execute*, the relevant
security properties are **supply-chain tamper-evidence**, **injection-safe subprocess execution**,
**dependency hygiene**, and **no secret/telemetry leakage** — not web auth/authz. All are satisfied.

### Authentication / Authorization

- **Status: N/A (justified).** No login, no sessions, no tokens, no RBAC, no protected routes — there
  is no authn/authz surface in an offline authoring CLI. (The `nfr-criteria.md` JWT/RBAC examples do
  not apply.) `docs/12`: "No telemetry. No login."
- **Findings:** Not applicable; no action.

### Data Protection — tamper-evidence on vendored content (the real security control here)

- **Status: PASS ✅.**
- **Threshold:** every vendored third-party artifact pinned to source + resolved version + a content
  fingerprint that **detects any drift**; a single-byte change must fail verification (`docs/08`/`13`).
- **Actual:** the **integrity service** (task-22) computes a **length-prefixed, order-independent,
  INJECTIVE sha256** over artifact files (`<bytes>:<path><bytes>:<content>` per file, path-sorted),
  emits/verifies `wpm.lock`. `verifyLockfile` passes on match and **fails naming the drifted artifact
  on a one-byte change** (the `--frozen-lockfile` catch). The injectivity was **adversarially
  attacked** by the reviewer — classic `{a|bc}` vs `{ab|c}`, colon-in-path/content, digit-boundary,
  content-mimicking-a-prefix, unicode byte-vs-char (`Buffer.byteLength`), deep stream-reparse — **all
  distinct**. A malformed/tampered `wpm.lock` throws descriptively (9 shapes tested).
- **Evidence:** task-22 AC#1/#2/#3 (all ticked); `test/unit/services/integrity.test.ts` (16) +
  `integrity.acceptance.test.ts` (4); `node:crypto` (pure hashing, allowed under the core boundary).
- **Findings:** This is the structural realization of `docs/13` §0's "the thing we distribute is
  instructions an agent will execute, so tamper-evidence on bundled-in third-party content is
  structural, not optional." Strong PASS.

### Injection / Command Execution

- **Status: PASS ✅.**
- **Threshold:** subprocess calls to the external `backlog` CLI must not be shell-injectable.
- **Actual:** the `backlog-cli` adapter (task-14) shells out via **`execaSync` with an argv array, no
  shell** (`src/util/shell.ts`), explicit `cwd` per call — arguments are passed positionally, never
  string-interpolated into a shell line, so a malicious bundle id / title cannot break out. The
  reviewer's Acceptance-Auditor confirmed the no-mirror boundary is *structural* (the port exposes no
  recipe-authoring verb), which also limits the blast radius of what the CLI can ever ask `backlog` to
  do.
- **Evidence:** task-14 notes (argv-array, injection-safe); `test/integration/adapters/backlog-cli.test.ts`;
  `backlog-parity.test.ts`.
- **Findings:** PASS. (One forward note, non-blocking: the same argv-array discipline must be retained
  when the file-touching command leaves land in tasks 34+; the exemplar is already correct.)

### Vulnerability Management

- **Status: PASS ✅.**
- **Threshold:** 0 critical / 0 high dependency vulnerabilities.
- **Actual:** the cold gate ran **`npm ci` with 0 vulnerabilities**. Dependency surface is small and
  every addition was pinned and lockfile-synced (semver 7.8.1, execa 9.6.1, commander 15.0.0,
  omelette 0.4.17, yaml 2.9.0, biome, vitest, husky 9.1.7, lint-staged 17.0.7); `backlog.md` is a
  **peerDependency** (not bundled).
- **Evidence:** the cold `npm ci` (0 vuln) reported by the orchestrator; task-1/7/8/10/14/27/29 notes
  (each "npm ci clean", pinned exact).
- **Findings:** PASS. (`npm audit` thresholds are honored by the clean `npm ci`; a dedicated `npm
  audit` CI job is a reasonable *future* hardening, not a foundation gap.)

### Secret Handling / Telemetry

- **Status: PASS ✅.** No secrets in the repo or the code path; **no telemetry, no analytics, no
  network calls** by design (`docs/12`: "No telemetry. No anonymous-usage pings... The CLI is silent
  by default."). Errors are typed DomainErrors that print clean messages; stacks appear **only** under
  `--debug`/`WPM_DEBUG` (task-27) — so no incidental stack/path leakage in normal output.
- **Evidence:** `docs/12` "What's deliberately not in the architecture"; task-27 exit/debug handling;
  `test/unit/util/exit.test.ts`.
- **Findings:** PASS.

---

## Reliability Assessment

**Status: PASS ✅.** For this CLI, reliability = **determinism, test isolation/stability, and typed
error recovery** — not uptime/MTTR/circuit-breakers (no running service exists).

### Availability / MTTR / Disaster Recovery

- **Status: N/A (justified).** No long-running service, no uptime, no incidents, no RTO/RPO — a CLI
  process runs and exits. The `nfr-criteria.md` health-check/circuit-breaker/offline examples target a
  web backend and do not apply.

### Determinism (the core reliability property here)

- **Status: PASS ✅.**
- **Threshold:** every test deterministic; no wall-clock, host-platform, or shared-state dependence
  (`test-design.md` §3).
- **Actual:** time is injected via the **Clock** port (FixedClock in tests); environment (cwd /
  platform / env) via the **Environment** port (FakeEnvironment); the filesystem is the **in-memory
  memory-fs** for unit/snapshot and a **fresh per-test tmpdir** for integration; `backlog` is the
  **fake-backlog** for unit. Operations **return** a structured `OperationResult` (output is not a
  port) so assertions never scrape stdout. Idempotency is **asserted** at three structural points
  (derive-twice = identical, re-materialise = no-op, re-run mutation = no change).
- **Evidence:** task-15 (the "pin all four at once" test), task-19/21/25 idempotency tests, task-23
  (core never prints/exits — static no-I/O guard); `docs/13` §3.
- **Findings:** PASS — determinism is *structural* (the hexagon), not a per-test convention.

### Error Handling & Fault Tolerance (typed error model)

- **Status: PASS ✅.**
- **Threshold:** every implied failure path is modeled and recoverable to a clean exit code, not a
  crash or a corrupt artifact.
- **Actual:** five typed `DomainError` categories → single-source `exitCodeFor` (0/2/1) at the CLI
  boundary (task-23/27). Negative paths are first-class and **tested**: re-`init` on an existing
  project → **ConflictError, changes nothing** (task-33); drift → **verify fails** (task-22); cycle →
  **detected, not looped** (task-18, brute-forced 20,000 digraphs); a **forced write failure** leaves
  the original file intact with zero `.tmp` residue (the atomic-write guarantee, task-12); malformed
  descriptor → field-precise message (task-11); bad completion shell → UsageError exit 2 (task-29).
- **Evidence:** the traceability matrix's "error-path coverage = present" heuristic (every broken
  branch has a negative-path test); `errors.acceptance.test.ts`, `cli.init.test.ts`, `integrity`,
  `version-constraint`, `node-fs` tests.
- **Findings:** PASS — notably strong negative-path posture for a foundation.

### CI Burn-In / Stability — the real-`backlog` flake (root-caused, fixed without masking)

- **Status: PASS ✅** (the one historical instability is closed).
- **Threshold:** the suite is stable under the way CI runs it (parallel workers, cold `dist/`), with
  **no retry-masking**.
- **Actual:** task-14 surfaced a genuine **~1-in-2 flake**: the real-`backlog` integration tests and
  the task-5 core-boundary fixture test failed under **concurrent vitest processes** on shared
  external state (`backlog`'s per-machine global config; fixed-name boundary fixtures in shared
  `src/core/`). The fix is the correct, **non-retry** one: **isolate `HOME`/`XDG_*` per-tmpdir** for
  backlog tests (env threaded through `runSync` — the port stays pure), **pid-suffix** the boundary
  fixtures, and set **`fileParallelism: false`** on the integration project. **Stress-verified:** the
  worker ran 18 sequential + 16 concurrent green; the orchestrator independently ran 6 concurrent
  green; the Phase-6 cold run is **527/527** with a fresh `dist/` (so the **built-binary** spawn tests
  and the **real-`backlog`** tests *ran*, did not self-skip).
- **Evidence:** task-14 notes (the flake + the precise fix + stress runs); task-21/33 reuse the same
  HOME/XDG isolation; task-29 S1 (binary test needs a built `dist/` — CI builds before test, and the
  cold sequence honored it).
- **Findings:** PASS. The flake was treated as a **defect to root-cause**, not a retry to add — exactly
  the `test-quality` discipline. One standing operational note (carried to the gate): the cold E2E
  **must** keep the order `npm ci → tsc → biome ci → build → test`, because the binary + real-backlog
  tests depend on a fresh `dist/`; this run did.

---

## Maintainability Assessment

**Status: PASS ✅.** This is the load-bearing NFR for a foundation whose entire purpose is to be the
substrate 51 future command leaves extend. Two properties dominate: the **architectural boundary is
mechanically enforced**, and the **extension patterns are proven and guarded**.

### Architecture conformance — the core import-boundary invariant

- **Status: PASS ✅** (this is the single most important maintainability control).
- **Threshold (`docs/13` §1):** nothing under `src/core/` may import `commander`, `execa`, `omelette`,
  or `node:fs` (and `node:os`/`node:child_process`/`node:fs/promises`) — enforced **mechanically**, not
  by review vigilance.
- **Actual:** a **Biome `noRestrictedImports`** rule scoped to `src/core/**` (task-5) forbids each
  module with a doc-13-citing message; `node:path`/`node:url`/`node:crypto` (pure) are allowed. It is
  proven by **`test/integration/core-boundary.test.ts`** — an airtight **3-way**: forbidden-in-core
  (`node:fs`) **FIRES**; allowed `node:path` does **NOT**; forbidden-**outside**-core does **NOT**
  (correct scoping). It runs as part of `biome ci` locally and in CI, and the cold `biome ci .` is
  **0 over 123 files**. The boundary went **live on real code at task-10** (first `src/core/` module)
  and every subsequent service/operation note records "boundary-clean."
- **Evidence:** task-5 AC#3 (ticked); task-22's `node:crypto`-allowed reasoning; the 30+ task notes
  asserting boundary-clean; the cold `biome ci` 0/123.
- **Findings:** **Strong PASS.** This is what makes `docs/12`'s promise real — "unit tests work
  entirely in-memory with the adapter mocked" — and it cannot silently regress as the 51 leaves land.

### Code Quality / Technical Debt

- **Status: PASS ✅.**
- **Threshold:** lint-clean and type-clean under one fixed standard; no dead code; documented public
  functions (the project DoD).
- **Actual:** cold **`tsc --noEmit` 0** and **`biome ci .` 0 (123 files)**; one **fixed** Biome
  formatting standard (space/2, lineWidth 100, lf, double-quotes, semicolons, trailing commas) so two
  contributors produce no format-only diffs; the project-level **DoD gates every task** ("typecheck +
  biome / tests / docs + no-dead-code + core-boundary") and all 33 ticked it. Every task note records
  a **dedicated reviewer** pass (separate lane from the worker) with APPROVE; deliberate non-blocking
  NITs are recorded with rationale rather than hidden. No SonarQube/jscpd score exists (not wired —
  the `nfr-criteria.md` tools are web-CI conventions), but the **Biome + tsc + DoD + independent
  review** stack is the equivalent objective gate for this project.
- **Evidence:** task-5 notes; the DoD in `config.yml`; the cold gate; the per-task reviewer APPROVEs.
- **Findings:** PASS. Technical debt is tracked openly as recorded NITs/forward-notes, not accrued
  silently.

### Maintainability of the extension surface — the patterns the 51 leaves follow

- **Status: PASS ✅.**
- **Threshold:** a new command leaf should be "fill in one operation + register one command," with the
  cross-cutting machinery (DI, errors, help, completion) shared and **guarded against regression**.
- **Actual:** the **six-beat mutation lifecycle** (task-25) makes a new command "declare check + apply
  + materialise-plan"; RERENDER and MATERIALISE are **automatic**. The **commander composition root**
  (task-27) gives one `CommandModule.register` pattern + `makeRealDeps` DI + the single `runWithExit`
  error authority — explicitly "the exemplar tasks 34-84 follow." The **`--help` completeness GUARD**
  (task-28) walks every registered command and **bites** empty-desc/no-usage/missing-example, so the
  51 leaves *cannot ship empty help*. The **completion registry** (task-29) lets a leaf add a
  state-dependent source with **no change to `completeArgv`** (proven by an extensibility test). The
  **representative operation** (task-26) + the **walking skeleton** (task-33) prove the hexagon
  composes end-to-end before any leaf is built.
- **Evidence:** task-25/26/27/28/29/33 ACs (all ticked) and their unit+integration tests; the trace
  matrix Phase D/E/G rows (all FULL).
- **Findings:** **Strong PASS.** The foundation doesn't just work — it makes the *next 51 tasks*
  cheap and regression-resistant, which is the whole point of building it first.

### Documentation Completeness

- **Status: PASS (with the one advisory CONCERNS noted below).**
- **Actual:** public functions are documented (DoD #3, enforced per task); `CONTRIBUTING.md` documents
  branching/PR/versioning/dogfooding; the design set `docs/00–14` is the spec; the builder ships its
  **own agent skill** (task-32) with progressive-disclosure references. **The one gap:** TASK-9 AC#3/#4
  (the repo's `AGENTS.md`/README orienting an agent to docs 00-14 + the boundary rule) were left to the
  **human-owned** front-door file — see CONCERNS.
- **Evidence:** task-9/32 notes; `CONTRIBUTING.md`; `agent-skills/installer-builder/`.

---

## Custom NFR — Fake↔Real Adapter Parity (the brief's 4th theme)

- **Status: PASS ✅.** This is the discipline that makes the in-memory test posture **trustworthy**:
  a fake port must behave like its real adapter, or unit tests pass while production breaks.
- **Threshold:** every divergence between a fake and its real adapter is **surfaced by a real-edge
  test and recorded**, then the fake is corrected — fakes are faithful, not convenient.
- **Actual — three parity gaps, each caught by the real edge and fixed (not hidden):**
  1. **memory-fs alias-follow (task-25):** `MemoryFileSystem.exists` masked broken-symlink semantics;
     fixed so exists **follows aliases to their target** (a broken link reads false, matching
     `existsSync`; chains transitively; cycles bounded) — and a parity test was added. (Not a
     production bug: `init` creates `installer-skills` before the alias, so real aliases are never
     broken — recorded honestly.)
  2. **symlink parent-dir (task-27, a task-12 carry-over):** real `fs` does not create the link's
     parent dir before symlink/copy but the memory fake recorded it; `src/util/symlink.ts` now creates
     the parent first — same parity class, fixed at the adapter.
  3. **FakeBacklog.init (task-33):** `initProject` must `makeDirectories(authoringRoot)` **before**
     `backlog.init` (the real adapter shells out with `cwd=root`); found **only via the real-`backlog`
     test**, fixed, and the parity trap documented in `FakeBacklog.init`'s JSDoc.
  - Additionally task-12's original fake-parity SHOULD (memory `list` of a file now throws `ENOTDIR`
    like node) was caught by a reviewer live-differential (9/10 → 10/10) with a parity test added.
- **Evidence:** task-12/25/27/33 notes (each names the gap, the real-edge test that caught it, and the
  fix); `memory-fs.test.ts`, `node-fs.test.ts` (+ parity), `backlog-parity.test.ts`, `cli.init.test.ts`.
- **Findings:** **Strong PASS.** Parity is enforced empirically (real-edge differential tests), and
  **every** gap is on the record with its provenance — the fakes can be trusted as stand-ins, which is
  the precondition for the wide in-memory unit base.

---

## Findings Summary — ADR Quality Readiness Checklist (adapted to a CLI)

Categories framed for web SaaS are scored against the CLI's reality; inapplicable criteria are marked
**N/A (justified)** and excluded from the denominator rather than failed.

| Category | Met | PASS | CONCERNS | FAIL | N/A | Status |
|---|---|---|---|---|---|---|
| 1. Testability & Automation | 4/4 | 4 | 0 | 0 | 0 | **PASS** ✅ |
| 2. Test Data Strategy | 3/3 | 3 | 0 | 0 | 0 | **PASS** ✅ (in-memory fakes + per-tmpdir fixtures + injected Clock/Env) |
| 3. Scalability & Availability | — | 0 | 0 | 0 | 4 | **N/A** (single-invocation offline CLI) |
| 4. Disaster Recovery | — | 0 | 0 | 0 | 3 | **N/A** (no service/state to recover) |
| 5. Security | 4/4 | 4 | 0 | 0 | 0 | **PASS** ✅ (tamper-evidence, no-shell exec, 0 vuln, no secrets/telemetry) |
| 6. Monitorability / Debuggability / Manageability | 3/4 | 3 | 1 | 0 | 0 | **PASS (minor)** — debuggability strong (typed errors, `--debug` stacks, source maps); onboarding doc CONCERNS = TASK-9 AC#3/#4 |
| 7. QoS / QoE | — | 0 | 0 | 0 | 4 | **N/A** (no quality-of-service/experience surface) |
| 8. Deployability | 3/3 | 3 | 0 | 0 | 0 | **PASS** ✅ (reproducible clean build, `npm i -g` model, CI matrix Node 20/22 × 3 OS) |
| **Total (applicable)** | **20/21** | **20** | **1** | **0** | **15** | **PASS** ✅ |

**Score (applicable criteria): 20/21 ≈ 95% → Strong foundation** (≥90% band). The 15 N/A criteria are
inapplicable-by-design for an offline authoring CLI, not gaps.

---

## Quick Wins

1. **Dispose TASK-9 AC#3/#4** (Maintainability/Monitorability) — LOW — minutes, no code.
   - Confirm the existing **human-owned** `AGENTS.md`/`CLAUDE.md` (which already orient an agent to
     docs 00-14 and the boundary rule) satisfy the intent and tick the two ACs; or add a short
     README→`docs/` link block. This closes the only CONCERNS.

---

## Recommended Actions

### Immediate (before merge to dev) — none required

- **No critical/high NFR action.** All applicable domains PASS. The foundation is NFR-ready to merge.

### Short-term (with the command leaves, tasks 34+) — MEDIUM/LOW

1. **Retain the argv-array no-shell discipline** in every file-touching command leaf — Security — the
   exemplar (task-14) is correct; keep it as the leaves shell out.
2. **(Optional) Add an `npm audit` CI job** — Security hardening — turns the current clean `npm ci`
   into a standing gate. Not a foundation gap.
3. **(Optional, placement) Promote rendered-content assertions** now in `unit/templates/**` +
   `derived-artefacts` into an explicit `test/snapshot/` flavour (`test-design.md` §1) when the broader
   template set lands — Maintainability — tracked, non-blocking.

### Long-term (backlog) — LOW

1. **Unify the `Environment.platform()` / `symlink` platform duplication** (recorded NIT in task-15) —
   Maintainability — a later refactor; documented and deferred by design.

---

## Evidence Gaps

**1 advisory gap (doc-only):**

- [ ] **Agent-orientation front door** (Monitorability / Documentation) — TASK-9 AC#3/#4
  - **Owner:** human (AGENTS.md/README are human-owned — a user-gate decision)
  - **Suggested evidence:** confirm the existing `AGENTS.md`/`CLAUDE.md` orientation, or add a
    README→`docs/` link block.
  - **Impact:** **LOW** — onboarding/discoverability only; no code, security, or reliability impact.

No other evidence gaps: every applicable NFR has concrete, cited implementation evidence.

---

## Gate YAML Snippet

```yaml
nfr_assessment:
  date: '2026-06-01'
  story_id: 'epic-1 / foundation (TASK-1..TASK-33)'
  feature_name: 'installer-builder wpm foundation'
  adr_checklist_score: '20/21 applicable (95%; 15 criteria N/A by design)'
  categories:
    testability_automation: 'PASS'
    test_data_strategy: 'PASS'
    scalability_availability: 'N/A'
    disaster_recovery: 'N/A'
    security: 'PASS'
    monitorability: 'PASS (1 doc-only CONCERNS)'
    qos_qoe: 'N/A'
    deployability: 'PASS'
  domain_status: # ISO/IEC 25010 (the brief's four)
    maintainability: 'PASS'
    reliability: 'PASS'
    security: 'PASS'
    fake_real_parity: 'PASS'
    performance: 'N/A'
    scalability: 'N/A'
  overall_status: 'PASS'
  critical_issues: 0
  high_priority_issues: 0
  medium_priority_issues: 0
  concerns: 1 # doc-only, advisory (TASK-9 AC#3/#4), user-gate disposition
  blockers: false
  quick_wins: 1
  evidence_gaps: 1 # doc-only
  recommendations:
    - 'PASS the NFR gate; foundation is NFR-ready to merge to dev.'
    - 'Surface TASK-9 AC#3/#4 (doc-only agent orientation) to the human for trivial disposition.'
    - 'Keep argv-array no-shell exec + the core import-boundary discipline as the 51 command leaves land.'
```

---

## Related Artifacts

- **Design of record:** `docs/12-builder-architecture.md`, `docs/13-core-architecture.md`, `FOUNDATION.md`
- **Test strategy:** `_bmad-output/test-artifacts/test-design.md`
- **Coverage trace (interim gate, PASS):** `_bmad-output/test-artifacts/traceability/traceability-matrix.md`
  (+ `coverage-matrix.json`, `e2e-trace-summary.json`)
- **Evidence sources:** the 33 task records (AC + DoD + notes) via the `backlog` CLI; the green cold
  suite (`npm ci` 0 vuln → `tsc --noEmit` 0 → `biome ci .` 0/123 → `npm run build` 0 → `npm test`
  527/58, fresh `dist/`).

---

## Recommendations Summary

**Release blocker:** **None.** All applicable NFR domains PASS.

**High priority:** None.

**Medium priority:** Retain no-shell exec + the boundary rule across the command leaves; optional
`npm audit` CI job and snapshot-flavour placement — all non-blocking.

**Next steps:** This NFR PASS + the trace PASS together feed the **final Phase-6 epic-gate verdict**.
Surface the single doc-only CONCERNS (TASK-9 AC#3/#4) to the human as a trivial disposition.

---

## Sign-Off

**NFR Evidence Audit:**

- Overall status: **PASS** ✅
- Critical issues: 0
- High-priority issues: 0
- Concerns: 1 (doc-only, advisory, user-gate)
- Evidence gaps: 1 (doc-only)

**Gate status:** **PASS** ✅ (NFR domain)

**Next actions:**

- PASS ✅: proceed to the final epic-gate verdict / release-gate disposition.
- The lone doc-only CONCERNS is a human disposition, not a blocker.

**Generated:** 2026-06-01 · **Workflow:** testarch-nfr (adapted: web→CLI)

<!-- Powered by BMAD-CORE™ -->
