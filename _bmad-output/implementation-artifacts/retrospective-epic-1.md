# Retrospective — Epic-1 (Foundation) — work-package-manager (`wpm`) builder

> **Workflow:** `bmad-retrospective` (BMM v6.8.0), run by the **retro** persona at the Phase-6 epic gate.
> **Mode:** Autonomous. Party-mode dialogue is condensed to its substance; the team's reflections are
> sourced from the real epic history — `.bmad/sdlc-state.yaml` (the SDLC tracker) and the per-task
> Backlog.md `--notes` (the Rule-3 evidence trail), cross-checked against the source tree.
> **Date:** 2026-06-01 · **Facilitator:** Amelia (Developer) · **Project Lead:** Root
> **No time estimates** are given (per workflow rule): effort is expressed as criticality + sequence, not hours/days.

---

## 1 · Epic summary & metrics

**Epic-1 — the foundational backlog** (`FOUNDATION.md`): stand up the project that ships the `wpm` CLI,
building doc-13's hexagon **bottom-up** — toolchain → model + ports → services → operations/lifecycle →
CLI/driving adapter → built-in content → a walking skeleton that proves it composes. None of these tasks
is a command itself; together they are the **substrate every CLI-command leaf (epic-2, tasks 34-84) stands on**.

**Delivery**

| Metric | Value |
|---|---|
| Stories completed | **33 / 33 (100%)** — TASK-1…TASK-33, all merged `--no-ff` into `feature/foundation` |
| Phases | A toolchain/conventions (1-9) · B model + 4 ports (10-15) · C 8 services (16-22) · D errors/context/lifecycle/representative-op (23-26) · E commander root/help/completion (27-29) · F minimal+default templates, builder skill (30-32) · G walking skeleton (33) |
| Source / test files | 59 `src/*.ts` · 58 test files |
| Cold-E2E gate (CI sequence, fresh dist) | **GREEN** — `tsc --noEmit` 0 · `biome ci` 0 over 123 files · `vitest` **527/527** over 58 files · `npm ci` 0 |
| Production incidents | 0 (no runtime yet; this epic ships the substrate, not a release) |
| Walking-skeleton proof | `wpm init <name>` drives a real change on disk through **every** layer (commander → bootstrap operation → services → both real ports → real disk), verified 3 ways: `run()` over real `NodeFileSystem` in a tmpdir, the built `dist/cli.js` binary, and the real Backlog.md CLI |

**Architectural outcome:** the hexagon held. The core import-boundary invariant (doc-13 §0: nothing under
`src/core/` imports commander / execa / omelette / `node:fs` / `node:os` / `node:child_process`) is enforced
by a Biome `noRestrictedImports` override **and** an airtight 3-way fixture test (forbidden-in-core fires,
allowed `node:path` does not, forbidden-outside-core does not). The core is **synchronous** (a recorded
cross-cutting decision, TASK-12): sequential CLI, no concurrency benefit, avoids async coloring across
operations/lifecycle/tests.

---

## 2 · Team & participation (agent roster)

Resolved from `_bmad/config.toml`. Roles that actually participated in epic-1 execution:

- **Amelia (Developer)** — facilitator; the **worker** role (`create-story` → `dev-story` → `qa-generate-e2e-tests`).
- **Murat (Test Architect, tea)** — test-design / framework / CI in Phase 3; trace / NFR / final gate in Phase 6.
- **Winston (Architect)** — architecture conformance vs docs 12/13; `check-implementation-readiness`.
- **John (PM)** — PRD conformance vs docs 00-05.
- **Mary (Analyst)** — product-brief conformance vs docs 00-05.
- A **separate-lane reviewer** (distinct subagent, never the worker self-reviewing) — `story-automator-review`, adversarial, report-only.
- **Sally (UX)** — *not engaged* (no GUI per doc-12; correctly skipped).
- **Root (Project Lead)** — owns the design set (the human-owned spec) and the gates.

---

## 3 · What went well

1. **Pure-core / ports-and-adapters discipline held end-to-end.** The boundary is not aspirational — it is
   *mechanically enforced* (Biome rule + fixture test) and was respected by all 33 tasks. Effects live behind
   four injected ports (FileSystem, comment-preserving YAML, BacklogMd, Clock/Environment), each with a real
   adapter **and** a faithful fake. doc-13's thin-builder/fat-agent and SDLC-agnostic stances stayed out of the core.

2. **The adversarial separate-lane reviewer caught REAL defects an all-green gate hid.** This is the single
   highest-leverage process pattern of the epic. Concrete catches:
   - **TASK-29 (the "omelette" completion defect):** the generated shell script calls `wpm --comp<shell> --compgen`,
     but the CLI only intercepted `__complete` → **real-shell completion was dead** while every test was green.
     Fixed to intercept the real omelette 0.4.17 protocol byte-accurately, plus a loop-closure test (extract the
     callback from `generateScript(shell)`, run it through `run()`, assert) for bash/zsh/fish.
   - **TASK-1:** a false-clean `tsconfig` (tests were not being type-checked) → fixed with the two-config split.
   - **TASK-28:** a JSDoc landmine (`helpInformation` vs `outputHelp`) that would have made a future help-guard
     silently false — corrected before it could mislead the 51 downstream leaves.

3. **The skill-driven loop worked once Rule 3 was enforced.** From TASK-14 onward, every story ran the *actual*
   BMAD workflow skills — `create-story`, `dev-story`, `qa-generate-e2e-tests`, then `story-automator-review` —
   inside the specialist whose workflow it is, with the skills recorded per task. The loop converged (typically
   1-2 review cycles), and the recorded evidence trail makes a skipped workflow impossible to hide.

4. **Walking-skeleton-as-proof (TASK-33) did its job.** One thin vertical thread — `wpm init` — proved the
   layers compose end-to-end through the **built binary** and the **real** Backlog.md, not just in-process
   dispatch. It is the honest "foundation complete" checkpoint before per-command work.

5. **Fake↔real parity vigilance became a habit and paid off repeatedly.** Whenever a fake diverged from its
   real adapter, the divergence was caught at the real edges and fixed or documented (see §5). This is what kept
   the green suite *trustworthy*.

6. **Design refinements were recorded, not silently absorbed.** Forward-notes (bundle.yml single-write ownership,
   the front-door/orchestrator single-source collapse) were written down at the point of discovery and resolved
   at the right downstream task — exactly the "evolve the design, record the change" discipline AGENTS.md asks for.

7. **The exemplar patterns are reusable.** TASK-27 (registration + DI + single exit-code authority), TASK-28
   (the help-completeness guard that bites on empty help), and TASK-29 (named-source completion registry) leave
   behind patterns a command leaf just *fills in* — the 51 leaves of epic-2 don't re-derive the spine.

---

## 4 · What didn't go well / what to improve

1. **The Rule-3 lapse on tasks 1-13 (the central lesson).** The earliest tasks ran the SDLC *at the
   orchestration level only* — the worker/reviewer/personas followed hand-written briefs that *described* what a
   workflow would do, instead of **invoking the actual BMAD skill**. A freehand approximation of a workflow is
   the same class of defect as hand-editing a Backlog task file: it looks like the SDLC and isn't.
   - **Correction:** AGENTS.md "Rule 3" was added (run the skills; record which ran), feasibility was proven
     GREEN at TASK-14 (a subagent invoked `story-automator-review` end-to-end), and tasks 14-33 ran the real
     skills with per-task evidence. Per user decision, 1-13 stand as-is ("go forward only").
   - **Lesson:** confirm the skill-can-actually-run precondition **once, at Step 0**, before trusting the loop —
     don't discover it 13 stories in. Make each workflow invocation *visible* from the very first story.

2. **Worker-subagent resume fragility.** The original worker (`a67b0906…`) broke on continuations after TASK-30:
   its big authoring runs worked, but short follow-up turns returned **0 tool-uses** (emitted malformed/unexecuted
   tool calls) and it got confused on stale context. It was retired and replaced with a fresh worker
   (`a7f5ad60…`) that reliably ran the skill loop for tasks 31, 32, 28, 29, 33.
   - **Lesson:** treat a 0-tool-use continuation as a **spawn-fresh** signal, not a re-poke. Keep specialist
     sessions durable but be willing to cut a stuck one. Brief the replacement from the docs + the state file.

3. **All-green tests can hide integration / loop-closure gaps.** The omelette defect (§3.2) is the cautionary
   tale: 511 passing tests with **dead** real-shell completion. The in-process path was exercised; the path a
   real shell actually takes was not.
   - **Lesson:** for anything with a generated-script or built-binary boundary, **test the real artifact and
     close the loop** (generate → run the generated thing → assert), not just the in-process dispatch. The
     cold E2E **must build `dist/` before `npm test`**, or the binary-gated tests (`describeIfBuilt`) silently skip.

4. **Stale BMAD projection artifacts.** `_bmad-output/implementation-artifacts/sprint-status.yaml` still shows
   every story as `todo`; Backlog.md (the source of truth) shows 33/33 Done. The shim was never the authority,
   but a stale mirror is a future-reader trap.
   - **Lesson:** either keep the projection synced at merge time, or annotate it unmistakably as a non-authoritative
     snapshot pointing at Backlog.md. (Not corrected here by constraint — flagged as carry-forward.)

5. **Environment-permission friction on git-touching steps.** The worker could not create the executable
   `.husky/pre-commit` hook (TASK-5) or run git; the orchestrator (which owns git) completed those. Workable, but
   it split a few tasks across two actors.
   - **Lesson:** keep git/hook-arming mechanics explicitly in the orchestrator's lane so a story's gate doesn't stall.

---

## 5 · Key decisions & divergences (with dispositions)

| # | Decision / divergence | Disposition |
|---|---|---|
| D1 | **Core is synchronous** (sync ports/adapters/operations; `node:fs` sync + `execaSync`). Sequential CLI, no concurrency benefit, avoids async coloring. | **Adopted** (TASK-12, cross-cutting). |
| D2 | **Branch naming** `feature/foundation-task-N` (slash→hyphen): git cannot hold both a `feature/foundation` branch and `feature/foundation/task-N` (ref-file vs dir clash). Merge/push targets unchanged. | **Adapted & recorded.** |
| D3 | **Dual bin names** `{wpm, installer}` → `dist/cli.js`, reconciling doc prose (`wpm`) vs doc-10 tree / doc-12 bin example / TASK-1 AC (`installer`). | **Adopted.** |
| D4 | **Two-config TypeScript** (`tsconfig.json` noEmit base type-checks src+test; `tsconfig.build.json` emits src) so the typecheck gate covers tests too. | **Adopted** (fixed a false-clean caught in TASK-1 review). |
| D5 | **bundle.yml is operation-owned, not templated.** `createBundle` writes it canonically (id/version/requires/confirmation — doc-10 step 4); a templated `bundle.yml` would be render-then-clobbered (comments stripped). | **Resolved** (forward-note TASK-26 → honored in TASK-31: default template ships no `files/bundle.yml`). |
| D6 | **Front-door + orchestrator are snippets-only single source.** They briefly lived in both `templates/.../files/` and `snippets/` (drift hazard, pinned by a drift-guard test). | **Resolved** (forward-note TASK-30 → TASK-33: removed the `files/*.tmpl` copies; `init` renders from snippets via the same deriver every mutation uses). |
| D7 | **omelette is used for its pure script generators only.** Its runtime is `process.exit`-driven, not commander-aware, raw `node:fs` — incompatible with the testable-ports architecture. A custom ports-pure `completeArgv` dispatch replaces it. | **Adopted** (TASK-29); faithful to doc-12 (omelette generates scripts + dispatches via callback). |
| **D8** | **DOC-VS-TOOL DIVERGENCE — install-backlog discovery (surface to human).** doc-07 line 67 claims a Backlog.md root's "folder name is free (here `install-backlog/`)", but **Backlog.md 1.45.2 only auto-discovers `backlog/` / `.backlog/` or a root-level `backlog.config.yml`** — NOT a bare `install-backlog/`. TASK-31 correctly ships `install-backlog/` per the spec; the content is genuine, integration-proven Backlog.md. | **Surfaced to user** (a real inaccuracy in the human-owned design set). **Reconcile downstream, NOT a vocabulary change** (`install-backlog/` stays): (1) execution-time (doc 03/09) — the generated project must stage a `backlog.config.yml` pointing at `install-backlog/` (or a discoverable copy per doc-09's `$STATE` map); (2) authoring-time (doc 11) — the CLI leaves (34-84) that touch a bundle's `install-backlog` must `cd` into it or set up a `backlog.config.yml`; (3) **doc-07 line 67 should be corrected.** |
| D9 | **Fake↔real parity fixes** (recurring theme): TASK-25 `MemoryFileSystem.exists` masked broken-symlink semantics (now follows aliases; broken → false = `existsSync`); TASK-27/symlink parent-dir creation (real fs doesn't create the link's parent, the fake recorded it); TASK-33 `FakeBacklog.init` didn't require the cwd dir the real adapter shells out into. | **Each fixed or documented** at the real edges; parity trap noted in `FakeBacklog.init` JSDoc. |
| D10 | **Hookify guardrail over-match.** The Backlog.md-CLI-only rules over-matched `templates/.../install-backlog/` (template *content*, not a live backlog) and blocked authoring it. | **Resolved** — narrow `templates/` carve-out added; real `backlog/` + live install-backlogs stay blocked. |

---

## 6 · Next epic preparation — Epic-2 (the CLI epic, tasks 34-84)

**Status of the next epic:** **defined by intent, not yet a planning artifact in this tree.** Per the SDLC
goal and `.bmad/sdlc-state.yaml`, the CLI command-leaf tasks **34-84 live on the remote `dev` branch** and are
pulled in after `feature/foundation` merges to `dev`. `FOUNDATION.md` §"What is deliberately NOT here" already
scopes epic-2: one task per command in doc-10's tree (`init`, `project meta`, `bundle new`, `bundle <id> files
add`, `build`, …), the full template set beyond minimal+default, the per-command authoring-task catalogs, and
distribution/publish wiring.

**Dependencies on epic-1 (all complete & stable):** the six-beat mutation lifecycle harness (TASK-25), the
representative operation pattern (TASK-26), the commander composition root + registration + DI + error handler
(TASK-27), the `--help` content contract guard (TASK-28), the completion registry (TASK-29), the minimal +
default templates (TASK-30/31), and the builder's own skill (TASK-32). **A command leaf is now "fill in one
operation + register one command" — the spine is done.**

**Preparation — critical (resolve before/at epic-2 kickoff):**

- **C1 · Merge & promote.** Merge `feature/foundation` → `dev` (user-authorized), then `git pull origin` to bring
  in the 34-84 task definitions. *(Owner: orchestrator. Human gate: the merge.)*
- **C2 · Reconcile install-backlog discovery (D8).** Before the first CLI leaf that touches a bundle's
  `install-backlog`, decide the discovery mechanism (stage a `backlog.config.yml` at execution-time per doc 03/09;
  `cd` into `install-backlog/` or write a `backlog.config.yml` at authoring-time per doc 11). *(Owner: architect + worker.)*
- **C3 · Correct doc-07 line 67** to match Backlog.md 1.45.2 discovery reality. *(Owner: human — design set is human-owned.)*

**Preparation — parallel (can happen alongside early leaves):**

- **P1 · `tea` re-baseline.** Run `testarch-trace` (coverage matrix) and `testarch-nfr` for the epic-1 gate, and
  set the trace baseline epic-2 leaves extend. *(Owner: Murat.)*
- **P2 · Sync or annotate `sprint-status.yaml`** so epic-2 doesn't inherit a stale `todo` mirror (§4.4). *(Owner: sm.)*

**Preparation — nice-to-have:**

- **N1 · Promote the exemplars to a short "how to add a command leaf" note** (register + DI + exit-code + help
  guard + completion source), pointing at TASK-27/28/29 as the reference. *(Owner: tech-writer/Paige.)*

---

## 7 · Action items & carry-forward for the CLI epic (SMART)

**Process**

1. **Confirm skill-can-run at Step 0, every epic.** Run one persona's skill end-to-end inside its own subagent
   before the loop. *Owner:* orchestrator. *Done when:* an epic-2 dry-run shows a subagent invoking a `bmad-*`
   skill and the result is recorded. *(Carries the central Rule-3 lesson forward.)*
2. **0-tool-use ⇒ spawn fresh.** Codify: a worker returning 0 tool-uses on a continuation is retired and
   re-briefed, not re-poked. *Owner:* orchestrator. *Done when:* the rule is in the per-story loop checklist.
3. **Keep authoring and review in separate lanes** (reviewer never self-approves). *Owner:* orchestrator.
   *Done when:* every epic-2 story records both a `dev-story` and a separate `story-automator-review` run.

**Technical / testing**

4. **Test the real generated-script / binary path, not just in-process dispatch.** Every leaf with a
   script/binary boundary closes the loop (generate → run → assert). *Owner:* worker + Murat. *Done when:* such
   leaves include a loop-closure test (the TASK-29 pattern). *Priority: HIGH* (this hid a dead feature behind 511 green tests).
5. **Cold E2E must build `dist/` before `npm test`** so binary-gated tests (`describeIfBuilt`) run, not skip.
   *Owner:* CI / Murat. *Done when:* the epic-2 gate replicates `npm ci → typecheck → biome ci → build → test`.
6. **Maintain fake↔real parity as an explicit review check.** *Owner:* reviewer. *Done when:* each port-touching
   leaf's review asserts the fake matches the real adapter at the edges (existence/symlink/cwd semantics).
7. **Reuse the spine; do not re-derive it.** Follow TASK-27 registration/DI/exit-code, TASK-28 help contract,
   TASK-29 completion-source registration. *Owner:* worker. *Done when:* new leaves add a command + an operation
   only, with no change to `completeArgv` / the exit-code authority / the help guard.

**Documentation / design**

8. **Reconcile install-backlog discovery (D8/C2) + correct doc-07 line 67 (C3).** *Owner:* architect (downstream
   mechanism) + human (doc edit). *Done when:* a generated project's Backlog.md actually discovers its recipe folder,
   and doc-07 reflects 1.45.2 reality.
9. **Sync/annotate `sprint-status.yaml` (§4.4).** *Owner:* sm. *Done when:* it either tracks Backlog.md or is
   labeled non-authoritative.

**Team agreements**

- The BMAD workflows are **run, not paraphrased** — inside the specialist whose workflow it is, with the skill recorded.
- **Backlog.md is the source of truth** for story status; CLI-only edits; projections are shims.
- **Record the change** when the code teaches you something the docs didn't foresee; surface anything that touches a goal, a user problem, or the model/vocabulary as a human gate.

---

## 8 · Significant-change detection

**Epic update required before epic-2? — NO (with one human-owned doc correction queued).**

Nothing from epic-1 invalidates epic-2's plan. doc-13's hexagon principles held under real implementation; the
spine composes (walking skeleton proven through the binary + real Backlog.md). The **one** finding that touches
the human-owned design set is **D8 / install-backlog discovery** — a real inaccuracy in doc-07 line 67. It is a
**downstream reconciliation + a doc fix**, *not* a vocabulary or scope change (`install-backlog/` stays), so it
does **not** force an epic-2 replan — but doc-07 should be corrected and the discovery mechanism decided before
the first CLI leaf that drives Backlog.md inside a generated project. **Surfaced to the user.**

---

## 9 · Readiness assessment — Epic-1

| Dimension | Status |
|---|---|
| **Testing & quality** | **GREEN** — cold E2E (CI sequence, fresh `dist/`): `tsc` 0 · `biome ci` 0 (123 files) · `vitest` 527/527 (58 files) · `npm ci` 0. Binary + real-Backlog tests *ran* (not skipped). |
| **Deployment / release** | **N/A by design** — epic-1 ships the substrate, not a published release. Distribution/publish is explicitly epic-2+ scope. |
| **Stakeholder acceptance** | TASK-33 reviewer: APPROVE, readiness = YES. Human gates remain: the `feature/foundation` → `dev` merge and the eventual `dev` → `main` promotion (separate human decision). |
| **Technical health** | **STABLE** — core boundary enforced (rule + fixture); fakes faithful to real adapters at the edges; no known dead code; exemplar patterns in place for epic-2. |
| **Unresolved blockers** | **None blocking.** One human-owned doc correction queued (D8/doc-07 line 67) + its downstream discovery reconciliation; one housekeeping item (stale `sprint-status.yaml`). |

**Verdict:** Epic-1 is **complete from a story perspective and green at the cold gate**; the remaining items are
the human-owned merge gate, the doc-07 reconciliation (downstream, non-blocking for the merge), and one
housekeeping sync — all carried into epic-2 prep.

---

## 10 · Top key takeaways

1. **Run the skills, don't paraphrase them** — and prove a subagent *can* run them at Step 0, not 13 stories in.
   The Rule-3 correction is the defining lesson of this epic.
2. **A green suite is necessary, not sufficient.** An adversarial separate-lane reviewer + real-edges /
   loop-closure tests against the *actual* binary/script are what make "green" trustworthy (the omelette
   defect proves it).
3. **The hexagon paid for itself.** A mechanically-enforced pure-core boundary + real-and-fake ports gave a
   substrate the 51 epic-2 leaves can stand on by "fill in one operation + register one command."
4. **Evolve the design, and record it.** Forward-notes and recorded divergences (esp. the install-backlog /
   doc-07 inaccuracy) turned "the code teaches you something" into durable, surfaced knowledge rather than silent drift.

---

*Prepared by the `bmad-retrospective` workflow (retro persona). Sources: `.bmad/sdlc-state.yaml`; Backlog.md
task `--notes` (TASK-1…33); `FOUNDATION.md`; `_bmad-output/planning-artifacts/{epics,architecture,prd}.md`;
the `src/` tree. Sprint-status was intentionally **not** modified (scope constraint); Backlog.md remains the
authoritative per-story record.*
