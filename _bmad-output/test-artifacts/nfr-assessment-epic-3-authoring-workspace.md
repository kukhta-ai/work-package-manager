---
stepsCompleted: ['step-01-load-context', 'step-02-define-thresholds', 'step-03-gather-evidence', 'step-04e-aggregate-nfr', 'step-05-generate-report']
lastStep: 'step-05-generate-report'
lastSaved: '2026-06-07'
executionMode: 'sequential (single tea specialist; subagent fan-out not used)'
inputDocuments:
  - 'backlog/tasks/task-85..94'
  - 'docs/01,04,05,06,07,09,10,11,12,13'
  - 'src/core/operations/{init-project,build,install-authoring-skill}.ts'
  - 'src/adapters/packager.ts'
  - 'test/integration/core-boundary.test.ts'
  - '_bmad-output/test-artifacts/traceability/trace-epic-3-authoring-workspace.md'
overallVerdict: 'PASS (with notes)'
---

# NFR Assessment — EPIC-3 "authoring-workspace"

- **Skill:** `bmad-testarch-nfr` (Murat / Master Test Architect), Create mode. The skill's Step-4 fan-out to 4 subagents (security/perf/reliability/scalability) was driven **sequentially** by the single tea specialist (no subagent launch in this gate run) — a stated fallback per Rule 3. Scalability is folded into Reliability/Performance for a CLI tool; the brief's project-specific dimensions (Maintainability, Reliability, Security, Fake-Real-Parity) are assessed in full.
- **Epic:** authoring-workspace (TASK-85..94, all Done; TASK-95 deferred).
- **Cold suite at assessment time:** tsc 0 / biome 0 (195 files) / build 0 / vitest 1217 passed (96 files).
- **Verdict scale:** PASS / CONCERNS / FAIL, evidence-based.

---

## Dimension 1 — Maintainability · **PASS**

**Thresholds:** core import-boundary holds (no `node:fs`/os/subprocess/CLI-framework import under `src/core/**`); pure-core vs adapter separation for the build transform; docs updated to match behavior.

**Evidence:**
- **Core boundary intact.** `grep` over `src/core/**` finds no forbidden imports — only allowlisted `node:path`/`node:url` and `node:crypto` (pre-existing, in `integrity.ts`; not fs/os/subprocess/CLI). The rule is itself test-guarded: `test/integration/core-boundary.test.ts` asserts a `node:fs` import in core is reported, `node:path` is allowed, and the rule does not apply outside `src/core`.
- **Build transform is pure / effects in the adapter.** `computeFrontDoorTransforms` (the `_AGENTS.md`→`AGENTS.md` strip + alias policy) lives in `src/core/operations/build.ts` as a pure function over the `BuildPlan` — unit-tested in isolation (`test/unit/operations/build.test.ts` "computeFrontDoorTransforms" block). All staging/copy/symlink/archive effects live in the adapter `src/adapters/packager.ts` (`test/unit/adapters/packager.test.ts`). The core/adapter split (55 core files / 10 adapter files) is preserved by this epic.
- **Resolution centralized.** `PROJECT_MARKER` fully removed; a single `WORKSPACE_MARKER = wip/manifest.yml` and one shared no-workspace message (`src/cli.ts`) back every project-bound command — one seam, not per-command drift.
- **Docs updated to match.** Authoring-side docs (01/04/06/11/12) and CLI/build docs (07/09/10), plus doc-13 §7 resolution + doc-06 reconciliation, were updated under tasks 85/86; README under task 94; the reserved-prefix convention is documented in `agent-skills/installer-builder/references/conventions.md`. Doc-13 *principles* (pure core / ports-and-adapters / SDLC-agnostic) were left untouched.

**Concerns:** none blocking. Minor: `installer-builder-skill.test.ts`'s `REFERENCES` array was not extended to the new `quality-protocol.md` (task-92), so that reference is outside the automated skill-consistency guard (recommend adding it).

---

## Dimension 2 — Reliability · **PASS**

**Thresholds:** idempotent skill install; deterministic build layout; no floating-promise masking after task-93.

**Evidence:**
- **Idempotent skill install.** Re-running `wpm skill install` reports "updated" (not a duplicate "installed") and stays exit 0: `test/unit/operations/install-authoring-skill.test.ts` "AC#2: re-running is idempotent and reports updated …"; `test/unit/cli/skill-commands.test.ts` "AC#2: re-running reports 'updated' …". No-scope path is a clean typed `UsageError` → exit 2 writing nothing.
- **Deterministic build layout.** `shippableFiles` returns a sorted, prune-aware set (`build.test.ts` "returns a SORTED list (deterministic)"); a two-build layout compare proves reproducibility: `test/integration/cli.build.e2e.test.ts` "AC89#7 — re-packaging unchanged project state reproduces an identical archive layout".
- **Floating-promise masking eradicated (task-93).** The genuine bug — un-awaited `withTempDir((dir)=>{…})` in e2e suites that let a failing assertion leak as an unhandled rejection — was fixed by converting to `async/await`. `cli.bundle-id.e2e` (78 awaited sites) and `cli.project-installer-skills.e2e` (10 awaited sites) now show zero non-awaited callback sites; the cold run reported **0 unhandled rejections**. The two remaining bare `withTempDir(` sites repo-wide are the helper's own self-test and a `return`-ed (awaited-by-caller) call — not masking.
- **Error outcomes are explicit, not crashes.** Outside-workspace runs exit non-zero naming the marker (`cli.build.e2e` AC82#5/AC89#6; `cli.project-meta.e2e` 38#4); empty shippable set / non-git project / missing zip tool are typed errors, not throws (`packager.test.ts`).

**Concerns:** none blocking. Note (failure-path only, non-blocking, recorded under task-90): if `stageWithTransforms` throws mid-stage the temp dir can leak (cleanup runs after `archiveSource` begins) — minor robustness follow-up, no correctness impact on the success path.

---

## Dimension 3 — Security · **PASS**

**Thresholds:** no secrets in source/skill content; user-scope skill install writes only under HOME; build excludes builder-time regions.

**Evidence:**
- **No secrets.** Pattern scan (`api_key|secret|password|token|PRIVATE KEY`) over `src/` and `agent-skills/` returns only false positives (`token` as a lexer/CLI-parse variable). No credentials, keys, or `.env` material introduced.
- **Skill install is HOME-confined.** `install-authoring-skill.ts` reads `HOME` only through the **Environment port** (never `process`), resolves targets exclusively from the `USER_SCOPE_PATHS` map (e.g. `<HOME>/.claude/skills`), and a missing/empty HOME is a `UsageError`. AC#6 is explicitly guarded: `install-authoring-skill.test.ts` "AC#6: writes ONLY under the HOME user scope — never a project/wip deliverable subdir". The op imports no `node:fs`/`node:os`/`child_process` — all writes go through injected ports.
- **Build excludes builder-time regions.** The archive never carries the authoring backlog, the authoring front door, or `builds/`: regression-guarded by path AND content with planted sentinels (`cli.build.e2e` "AC93#3"), and the un-nested root carries no authoring surface (`AC83/AC89` tarball-listing). Disabled bundles, `.git/`, `node_modules/`, `dist/` are excluded (`build.test.ts`). The reserved `_AGENTS.md` ships only as canonical `AGENTS.md`, never under both names.

**Concerns:** none blocking. Carry-forward note (pre-existing, recorded under task-90): scope-alias symlinks ship with **absolute** targets — an archive-portability concern (a recipient on a different machine sees dangling links), not a secret-leak. Track for a future portability fix; out of epic-3 AC scope.

---

## Dimension 4 — Fake-Real Parity · **PASS**

**Thresholds:** in-memory fakes (MemoryFileSystem, FakeBacklog) behave like the real adapters (NodeFileSystem, real `backlog` CLI) so unit-level coverage is trustworthy and e2e is not the only safety net.

**Evidence:**
- **Parity is explicitly tested.** `test/integration/adapters/backlog-parity.test.ts` exercises FakeBacklog vs the real backlog CLI; `node-fs.test.ts` / `memory-fs.test.ts` cover the two FileSystem implementations against the same port contract.
- **Both sides are exercised for epic-3 behavior.** Resolution, init, and skill-install have **unit** coverage over fakes (`context.test.ts`, `init-project.test.ts` over MemoryFileSystem mirroring the real `templates/` tree, `install-authoring-skill.test.ts`) **and** real-disk/real-binary **e2e** (`cli.init.test.ts`, `cli.build.e2e.test.ts` through `dist/cli.js`, `cli.skill-install.test.ts` over a real tmpdir HOME). The build packager is unit-tested over both the real fs and the in-memory port (`packager.test.ts` "a local directory destination via the in-memory fs port (no real disk needed)").
- **Fixtures unified on the real path.** task-93 funneled fixtures through `test/helpers/workspace.ts` `initWorkspace` (a real `wpm init`), eliminating the earlier hand-rolled flat-project helper — fakes and real fixtures now describe the same workspace shape.

**Concerns:** none.

---

## Dimension 5 (note) — Performance · **CONCERNS (pre-existing, not introduced by epic-3)**

**Observation:** the **cold** suite runs ~21-22 min, dominated by real-binary e2e that build `dist/` and spawn the `wpm` subprocess per scenario. This cost **predates epic-3** (recorded as far back as task-87's notes) and is a property of the real-binary e2e strategy, not a regression from the workspace work. A fast suite (no dist, ~50s) exists for routine per-task checks.

**Disposition:** flagged as a CONCERNS-level **note** for the epic gate / handoff, not attributable to this epic. Recommendation (non-blocking): consider sharding e2e in CI or sharing a single built `dist/` across e2e files to cut wall-clock. No correctness impact.

---

## Aggregate

| Dimension | Verdict | Basis |
|-----------|---------|-------|
| Maintainability | **PASS** | core boundary held (test-guarded); pure transform in core, effects in adapter; docs updated |
| Reliability | **PASS** | idempotent install; deterministic/reproducible layout; floating-promise masking eradicated (0 unhandled rejections cold) |
| Security | **PASS** | no secrets; HOME-only install via env port (AC#6 guarded); builder-time regions excluded from archive |
| Fake-Real Parity | **PASS** | parity tests + both fakes and real-binary e2e exercise epic-3 behavior; fixtures unified on real `wpm init` |
| Performance (note) | **CONCERNS** | cold e2e ~21-22 min — **pre-existing**, not introduced by epic-3 |

### Overall NFR verdict: **PASS (with notes)**

Four assessed quality dimensions PASS on concrete evidence. The only CONCERNS is the pre-existing cold-suite runtime, which this epic did not introduce and which carries no correctness risk.

### Non-blocking follow-ups (recommendations)
1. Extend `installer-builder-skill.test.ts` `REFERENCES` to include `quality-protocol.md` (task-92) so the new reference falls under the automated skill-consistency guard.
2. Robustness: clean the packager temp dir even when `stageWithTransforms` throws mid-stage (task-90 failure-path note).
3. Portability: emit **relative** scope-alias symlink targets so archived links resolve on a recipient machine (pre-existing).
4. `--format git` does not yet apply un-nesting/exclusions/strip (`git archive HEAD`) — tracked as **TASK-95**, outside epic-3 AC scope; ensure it lands before any release that advertises `--format git`.
5. Perf: shard e2e or share a single built `dist/` in CI to cut cold-suite wall-clock.

None of these block the epic gate.
