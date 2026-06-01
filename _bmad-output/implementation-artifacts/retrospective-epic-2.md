# Retrospective — Epic-2 (CLI command surface) — work-package-manager (`wpm`) builder

> **Workflow:** `bmad-retrospective` (BMM v6.8.0), run by the **retro** persona at the Phase-6 epic gate.
> **Mode:** Autonomous. Party-mode dialogue is condensed to its substance; the team's reflections are
> sourced from the real epic history — `.bmad/sdlc-state.yaml` (the SDLC tracker) and the per-task
> Backlog.md `--notes` (the Rule-3 evidence trail), cross-checked against the source tree (`src/`),
> the per-family story files (`_bmad-output/implementation-artifacts/stories/`), and the family-merge
> first-parent history on `feature/cli`.
> **Date:** 2026-06-01 · **Facilitator:** Amelia (Developer) · **Project Lead:** Root
> **No time estimates** are given (per workflow rule): effort is expressed as criticality + sequence, not hours/days.
> **Scope note:** `.bmad/sprint-status.yaml` and `.bmad/sdlc-state.yaml` were intentionally **not** modified
> (orchestrator constraint); Backlog.md remains the authoritative per-story record. The full vitest suite was
> **not** re-run here — the Phase-6 epic gate already confirmed it cold (see §1, §9).

---

## 1 · Epic summary & metrics

**Epic-2 — the CLI command surface** (doc-10's command tree): turn the foundation's hexagon into `wpm`'s
**authoring command leaves** — `init`; `template list/show`; `project show/meta/version{,bump,set}/targets
{add,list,remove}/installer-skills{add,list,remove}/validate/root`; `bundle new/enable/disable/remove/list`;
`bundle template show/set`; `bundle <id> show/meta/version{,bump,set}/requires/files/templates/scripts/skills/
installer-skills{add,list,remove}/advisor{add,remove}`; and `build dry-run/package/publish`. Each leaf is "fill
in one operation + register one command" on the foundation **spine**: TASK-27 registration/DI/single-exit-code
authority, TASK-28 the help-completeness guard, TASK-29 the completion-source registry, TASK-25/26 the six-beat
mutation lifecycle, and **doc-10's rows as the contract**. With epic-2 complete, **all 84 backlog tasks are done**
(the 33-task foundation **epic-1** + this 51-task CLI **epic-2**).

**Delivery**

| Metric | Value |
|---|---|
| Stories completed | **51 / 51 (100%)** — TASK-34 … TASK-84, all merged `--no-ff` into `feature/cli` |
| Build unit | **~18 command families** (e.g. `project targets` add/list/remove; the `bundle <id>` payload-ref families; the skill scaffold-or-attach families), each one skill-driven build + one focused review |
| Family merges | **15 `--no-ff` merge commits** into `feature/cli` (some carry two families, e.g. P+F, G2+H, Q+C — first-parent history) |
| Workers used | **13** (rotated ~every 5-8 tasks; see §4.2) |
| Source / test files | **90** `src/*.ts` · **93** test files |
| Cold-E2E gate (CI sequence, fresh `dist/`) | **GREEN** — `npm ci` 0 · `tsc --noEmit` 0 · `biome ci` 0 · `npm run build` 0 · `vitest` **1174/1174** all 0 |
| Production incidents | 0 (pre-release; this epic ships the authoring tool, not a published distribution) |
| Binary-verification catches | **4** real defects, each hidden behind all-green unit tests and caught by an orchestrator `dist/cli.js` spot-check (see §3.2 / §5) |

**Architectural outcome:** the hexagon held under 51 leaves. Every command leaf reduced to (a) a pure operation
under `src/core/operations/` driven through the six-beat lifecycle (TASK-25), and (b) a thin commander registration
that reuses the TASK-27 composition root, the TASK-28 help guard, and the TASK-29 completion registry. The core
import-boundary invariant (doc-13 §0) stayed enforced by the Biome `noRestrictedImports` rule **and** the fixture
test from epic-1 — no leaf needed to reach for `node:fs`/commander/execa inside the core. The bundle-`<id>` space
was added **once** (run()-level pre-routing `isPerBundleInvocation`/`dispatchPerBundle`, ahead of commander, in
`src/cli.ts`) plus a reusable `PerBundleCommandModule`/`PER_BUNDLE_MODULES` registry — after which **21** bundle-`<id>`
families each added exactly **one module, with no routing change**.

> **Epic-discovery note (workflow Step 1):** the BMAD projection `sprint-status.yaml` and `epics.md`
> describe **epic-1 (the foundation)** only — they were never re-projected for the CLI epic (a known shim-staleness
> item carried from epic-1 §4.4, recurring here as §4.4). The **authoritative** epic-2 state is Backlog.md:
> TASK-34…84 all `Done`, confirmed via `backlog task list -s Done --plain` (51 in range) and the `feature/cli`
> merge trail. This retro therefore sources epic-2 from Backlog.md + the SDLC tracker, not from the stale shim.

---

## 2 · Team & participation (agent roster)

Resolved from `_bmad/config.toml` (via `resolve_config.py --key agents`). Roles that actually participated in
epic-2 execution:

- **Amelia (Developer)** — facilitator; the **worker** role (`bmad-create-story` → `bmad-dev-story` →
  `bmad-qa-generate-e2e-tests`), run **per family**. Rotated across **13 worker sessions** (§4.2).
- A **separate-lane reviewer** (a distinct subagent, never the worker self-reviewing) — `bmad-story-automator-review`,
  adversarial, **report-only** (its terminal story-status / sprint-sync / auto-fix writes suppressed to keep review
  in its own lane). One reviewer session (`a7f5a303…`) carried ~24 reviews reliably through TASK-34.
- **Murat (Test Architect, tea)** — resumed at the Phase-6 epic gate for `testarch-trace` / `testarch-nfr`
  (the CLI AC coverage matrix + NFR report).
- **The Orchestrator (Root's automation)** — owned the **binary verification** (the load-bearing check of this epic,
  §3.2), git/branch mechanics, the family-batching decision, and the per-family `--no-ff` merges.
- **Winston (Architect) / John (PM) / Mary (Analyst)** — *not re-engaged* for epic-2; the architecture and
  requirements were settled in epic-1's Phase 1-3 against docs 00-13, and epic-2 introduced no new scope.
- **Sally (UX)** — *not engaged* (no GUI per doc-12; correctly skipped, as in epic-1).
- **Root (Project Lead)** — owns the design set (the human-owned spec) and the gates (notably the Phase-7
  `feature/cli` → `dev` merge, §6).

---

## 3 · What went well

1. **Family-batching cut per-leaf overhead without losing the SDLC's essence — and it was the right call.**
   The headline process choice of this epic: rather than 51 one-task-per-story loops, the orchestrator grouped
   tightly-coupled command families that **share an operation** into one skill-driven build + one focused review
   per family (~18 families). The bet paid off because the leaves are genuinely **uniform, independent, and ride
   a mechanically-guarded spine** (TASK-27/28/29 + the TASK-25/26 lifecycle), so per-leaf risk is **low and uniform**.
   Evidence it held: 51/51 Done, the cold gate green at **vitest 1174**, and the four real defects that *did* slip
   were **not** caused by batching — they were spine/operation-level issues a per-leaf loop would have hit identically
   (§3.2). The full limit analysis (where batching would be wrong) is §4.1.

2. **Binary verification was the load-bearing quality gate — it caught four real defects every green suite hid.**
   This is the single highest-leverage pattern of the epic. Each was a **binary spot-check on the real `dist/cli.js`
   against a real Backlog.md / real shell**, not anything the unit suite surfaced:
   - **The materialise-root bug** — lifecycle beat ⑤ materialised authoring tasks into the **project root**, not
     `<project>/.authoring-backlog`. Since `BacklogCli` shells out with `cwd=root` and the project root is **not**
     a Backlog.md root, **every materialising command failed on a real project**. Hidden by FakeBacklog-at-project-root
     tests. Fixed to `join(root, AUTHORING_BACKLOG_DIR)` (a shared model constant; grounded in
     `src/core/operations/init-project.ts`, `bundle-remove.ts`).
   - **The `--version` shadow** — the program's `.version()` flag swallowed `bundle new --version <v>` (it printed
     the *program* version and created nothing). Fixed: program `--version` is now `-V`-only **plus** a run()-level
     interception, mirroring the bundle-`<id>` pre-routing (grounded in `src/cli.ts`).
   - **The omelette completion-protocol defect** — the **generated** completion script called `--compbash`/`--compgen`,
     but the CLI only answered `__complete`, so **real-shell completion was dead** while **511 tests passed**. Fixed to
     the real `__complete` dispatch seam (grounded in `src/completion/complete.ts`, `sources.ts`).
   - **The `runSync` spawn-failure latent bug** — a **missing executable** reported as **exit-0 success** (false
     success). Fixed by distinguishing "Command failed (exit N)" = the tool *ran* nonzero (so it EXISTS) from
     "Command could not be run" = a spawn failure (the tool is ABSENT) — grounded in `src/adapters/packager.ts:76-87`.

3. **Reuse-once-then-apply turned 51 leaves into a handful of patterns.** Each pattern was set up once and then
   filled in: the **READ** projection; **LIST-MGMT** add/list/remove (with a warnings channel + the alias asymmetry:
   `add`'s scope-alias falls out of the deriver re-render, but `remove` must **explicitly** delete the orphaned
   alias because the deriver only *adds*); **VERSION** show/bump/set; the bundle-`<id>` **routing + `PerBundleCommandModule`
   registry** (21 families ⇒ +1 module each, no routing change); the generic **`PayloadRefDescriptor`** op
   (files/templates/scripts share one descriptor — `src/core/operations/payload-refs.ts`); the **`SkillRefDescriptor`
   scaffold-or-attach** core + a **pure frontmatter validator**, reused by payload-skills, bundle+project
   installer-skills, and advisor (`src/core/operations/skill-refs.ts`); the **manifest-edit/meta-set**; the
   **destructive-confirmation** mechanism; and the **build pipeline** (validate + frozen-lockfile in the core, the
   archiving/publish effect in an adapter). This is exactly the "spine pays for itself" outcome epic-1 §3.7 predicted.

4. **The skill-driven loop ran clean under Rule 3.** Every family ran the *actual* BMAD workflow skills inside the
   specialist whose workflow it is — `bmad-create-story` → `bmad-dev-story` → `bmad-qa-generate-e2e-tests` (worker),
   then `bmad-story-automator-review` (separate-lane reviewer, report-only) — with the skills recorded per task in
   `--notes` (sampled e.g. TASK-42: "Skill-driven; reviewer APPROVE zero findings. Gate: tsc 0, biome 0, vitest 568").
   The epic-1 Rule-3 lesson (prove the skill-can-run precondition, make each invocation visible) **carried forward
   from story one** here — no repeat of epic-1's tasks-1-13 lapse.

5. **Divergences were surfaced and recorded, not silently absorbed — and one was actively closed.** The
   **bundle-template divergence** (`bundle new` read the registry, not the project's `bundles/bundle-template/`,
   making `bundle template set` **inert** for `bundle new`) was caught, recorded, and **closed in TASK-34**:
   `createBundle` now **prefers** the project scaffold `bundles/bundle-template/` when present (falling back to the
   registry default), **binary-proven on both paths**. The `doc-07:67` discovery inaccuracy and the `--format git`
   v1 limitation were both recorded and surfaced (§5).

6. **Worker-rotation was operationalised, not rediscovered.** Epic-1 learned that worker subagents accumulate
   transcript and eventually parse-error / return 0-tool on resume; epic-2 **codified** it — rotate to a fresh worker
   every ~5-8 tasks. 13 workers were used deliberately across the 51 tasks, with retirements recorded in the tracker.
   The 0-tool-use-⇒-spawn-fresh rule became standing practice rather than a per-incident reaction.

7. **The bundle-`<id>` routing seam is a clean extension point.** Adding a whole new subcommand space (a fresh
   commander program scoped to one resolved+enabled bundle) was done **once** at run() level — like the `--version`
   interception — behind a `requireEnabledBundle` guard, then the 21 families plugged into `PER_BUNDLE_MODULES`
   with zero further routing work. This is the architecture absorbing breadth without the spine churning.

---

## 4 · What didn't go well / what to improve

1. **Family-batching has real limits — name them so it isn't over-applied.** Batching was right *here* because the
   leaves are uniform, independent, low-risk, and ride a mechanically-guarded spine. It would be **wrong** when any
   of those conditions fail, and a future epic must re-check them before reusing the tactic:
   - **Novel or load-bearing work** — the `build` family (TASK-82-84) was *new* (archiving + publish + frozen-lockfile),
     not a uniform leaf; it correctly got its own batch and its own focused review, and it surfaced the `runSync`
     false-success bug. **Lesson:** batch *uniform* leaves; isolate *novel* ones.
   - **Cross-cutting changes** — the materialise-root fix and the `--version` shadow were **spine-level**, not leaf-level;
     they rode in on a family branch but affected *every* materialising / version command. Batching can **mask** that a
     "small" change is actually cross-cutting. **Lesson:** when a family touches the lifecycle, the composition root,
     or a shared op, treat the change as spine work (broader review + a real-binary regression check), not a leaf.
   - **Lighter-per-leaf review trades depth for throughput** — calibrated correctly to low uniform risk *this* epic,
     but it is exactly why **binary verification had to be the backstop** (§3.2). Without the orchestrator's real-binary
     spot-check, the four defects would have shipped behind green tests. **Generalisation verdict in §7.**

2. **Worker-subagent resume fragility persisted — now a tax, not a surprise.** Workers reliably degrade after ~5-9
   tasks (parse-errors / 0-tool returns on resume once the transcript is large). Epic-2 needed **13 workers** for 51
   tasks. It's managed (rotate early), but it is real overhead and a continuity risk on long families.
   - **Lesson (carried + reaffirmed):** treat a 0-tool-use continuation as a **spawn-fresh** signal; rotate
     **proactively** at ~5-8 tasks rather than waiting for the failure; re-brief the replacement from the docs + the
     state file. (Same lesson as epic-1 §4.2 — it did not regress, but it did not get cheaper either.)

3. **All-green tests hid four integration / loop-closure / real-environment gaps.** The recurring epic-1 lesson
   recurred with a vengeance: 511 passing tests with **dead** real-shell completion (omelette); a green suite while
   **every materialising command failed** on a real project (materialise-root); a green suite while a **missing
   executable read as success** (runSync). Each was an in-process path that passed while the **real** path (real shell /
   real Backlog.md root / real spawn) was broken.
   - **Lesson:** for anything with a generated-script, real-subprocess, or real-Backlog-root boundary, **test the real
     artifact and close the loop** (generate → run the generated thing → assert; or drive the real binary against a real
     root). Where that's impractical in unit scope, the **orchestrator binary spot-check is mandatory, not optional** —
     this epic proves it is the difference between green-and-correct and green-and-broken.

4. **The BMAD projection shims are stale (carried from epic-1, now worse).** `_bmad-output/.../sprint-status.yaml`
   and `planning-artifacts/epics.md` still describe **only epic-1 (the foundation)** — they were never projected for
   the CLI epic. Backlog.md (the source of truth) shows TASK-34…84 all `Done`. The shim was never the authority, but a
   stale mirror that omits an entire completed epic is a sharper future-reader trap than epic-1 flagged.
   - **Lesson:** either project epic-2 into the shims (or a `sprint-status` refresh) at handoff, **or** annotate them
     unmistakably as epic-1-only, non-authoritative snapshots pointing at Backlog.md. *(Not corrected here — explicit
     scope constraint forbids touching `sprint-status.yaml`/`sdlc-state.yaml`; flagged as carry-forward §7.)*

5. **`--format git` ships the committed `HEAD`, not the computed shippable set (a v1 gap).** `build package --format git`
   uses `git archive` over the committed tree, which can diverge from the operation's computed shippable set (it requires
   a git repo with ≥1 commit, and won't reflect uncommitted-but-shippable or committed-but-excluded content). Recorded as
   a **v1 limitation**, not a defect (grounded in `src/adapters/packager.ts:155`, `src/core/operations/build.ts`).
   - **Lesson:** document the `--format git` semantics for the end user (it archives HEAD); revisit reconciling it with
     the computed set in a later iteration.

---

## 5 · Key decisions & divergences (with dispositions)

| # | Decision / divergence | Disposition |
|---|---|---|
| D1 | **Family-batching** — group tightly-coupled command families (shared operation) into one skill-driven build + one focused review per family (~18), instead of 51 one-task loops. Calibrated to low, uniform per-leaf risk on a mechanically-guarded spine. | **Adopted & justified** (recorded in the tracker). **Right call here**; limits in §4.1; generalisation verdict §7. |
| D2 | **Bundle-`<id>` routing established once** — run()-level pre-routing (`isPerBundleInvocation`/`dispatchPerBundle`) ahead of commander, plus a reusable `PerBundleCommandModule`/`PER_BUNDLE_MODULES` registry behind a `requireEnabledBundle` guard. **21** families each add **one** module, no routing change. | **Adopted** (TASK-57/58 established it; J-Q reused it). `src/cli.ts`. |
| D3 | **Generic payload-ref + skill-ref descriptors** — one `PayloadRefDescriptor` op serves files/templates/scripts; one `SkillRefDescriptor` scaffold-or-attach core + a **pure frontmatter validator** serves payload-skills / bundle+project installer-skills / advisor. | **Adopted** (set up once, applied across K-Q + F/P). `src/core/operations/{payload-refs,skill-refs}.ts`. |
| D4 | **LIST-MGMT alias asymmetry** — `add`'s scope-alias falls out of the deriver re-render (beat ④); `remove` must **explicitly** delete the orphaned alias (the deriver only *adds*). A warnings channel (`ApplyOutcome.warnings` → `OperationResult.warnings` → stderr, exit 0) carries unknown-target / missing-alias / last-target warnings. | **Adopted** (TASK-42 exemplar; reused by every list-mgmt family). |
| **D5** | **`materialise-root` bug (cross-cutting fix).** Lifecycle beat ⑤ materialised into the **project root**, not `<project>/.authoring-backlog` — so **every materialising command failed on a real project** (`BacklogCli` shells out `cwd=root`; the root isn't a Backlog.md root). Hidden by FakeBacklog-at-project-root tests; **caught by the orchestrator's real-binary spot-check**. | **Fixed** — materialise into `join(root, AUTHORING_BACKLOG_DIR)` (shared constant); FakeBacklog tests re-pointed to `.authoring-backlog` for parity + a real-backlog regression test. Rode the `cli/targets` family branch (merge `1062f7d`). |
| **D6** | **`--version` shadow (cross-cutting fix).** The program's `.version()` swallowed `bundle new --version <v>` (printed program version, created nothing) — an in-process-vs-binary gap (run() tests passed). | **Fixed** — program `--version` is now `-V`-only **plus** a run()-level interception (mirrors the bundle-`<id>` pre-routing). Merge `d032ec3`. |
| **D7** | **omelette completion-protocol defect.** The **generated** script called `--compbash`/`--compgen`; the CLI only answered `__complete` ⇒ **real-shell completion was dead** while 511 tests passed. | **Fixed** — answer the real `__complete` dispatch seam (`src/completion/complete.ts`); omelette is used for its **pure script generators only** (continuing epic-1 D7). Loop-closure tested. |
| **D8** | **`runSync` spawn-failure latent bug.** A **missing executable** reported as **exit-0 success** (false success in the build/publish adapter path). | **Fixed** — distinguish "Command failed (exit N)" (tool RAN nonzero ⇒ exists) from "Command could not be run" (spawn failure ⇒ absent). `src/adapters/packager.ts:76-87`. |
| **D9** | **bundle-template divergence (CLOSED).** `bundle new` resolved from the **registry** (`resolveTemplate(name,"bundle")`), not the project's `bundles/bundle-template/`, so `bundle template set` (TASK-56) was **inert** for `bundle new` — a code-vs-doc-10:150 realization gap (recorded as a forward-note in TASK-56's family). | **Resolved in TASK-34** — `createBundle` now **prefers** `bundles/bundle-template/` when present (falling back to the registry `DEFAULT_BUNDLE_TEMPLATE`); **binary-proven on both paths.** This also satisfies doc-10:137 step5 (`init` materialises the default bundle template there). |
| **D10** | **DOC-VS-TOOL DIVERGENCE — install-backlog discovery (OPEN, surface to human).** doc-07 line 67 claims a Backlog.md root's "folder name is free (here `install-backlog/`)", but **Backlog.md 1.45.2 only auto-discovers `backlog/` / `.backlog/` or a root-level `backlog.config.yml`** — NOT a bare `install-backlog/`. *Inherited from epic-1 (its D8); confirmed again in epic-2.* | **Surfaced to user** (a real inaccuracy in the human-owned design set). **`install-backlog/` stays as vocabulary; reconcile downstream.** Concrete epic-2 consequence: `bundle list`'s kind-counts **scan the install-backlog by file** rather than relying on Backlog.md discovery. Full reconciliation = §7 carry-forward. |
| D11 | **`--format git` ships committed `HEAD`, not the computed shippable set** (requires a git repo + ≥1 commit). | **Recorded as a v1 limitation** (not a defect). Document the HEAD-archive semantics; reconcile later. `src/adapters/packager.ts:155`. |
| D12 | **Hookify guardrail `templates/` carve-out** — the Backlog.md-CLI-only rules over-matched template *content* under `templates/` (vs the live `backlog/`). | **Resolved** (continues epic-1 D10) — a `templates/` negative-lookahead carve-out; real `backlog/` + live install-backlogs stay blocked. |

---

## 6 · Next phase preparation — Phase 7 (handoff) and beyond

**Where epic-2 sits:** all 84 backlog tasks are Done; `feature/cli` carries the complete CLI epic (merged `--no-ff`
per family). The Phase-6 epic gate is green at the cold CI sequence (§1). **There is no epic-3 defined** — epic-2 was
the end of the planned command-surface scope (FOUNDATION.md scoped the leaves as "out of scope for epic-1, added later
per user scenario"; that "later" was epic-2). So "next phase" is **Phase 7 handoff**, not a next epic.

**Phase 7 — handoff (the immediate next step):**

- **H1 · Open the `feature/cli` → `dev` PR (HUMAN GATE).** Per AGENTS.md and `.bmad/sdlc-state.yaml`, **never
  self-merge to `dev` or `main`** — push `feature/cli`, open a PR `--base dev` (`gh pr create`) showing green CI (the
  three-command gate from TASK-8, here the full cold sequence). **The merge is Root's decision.** *(Owner: orchestrator
  opens the PR; human merges.)* The tracker notes the earlier `feature/foundation` → `dev` merge was pre-authorized, but
  the **CLI → `dev`** merge should be **explicitly confirmed** with the user (the goal says "to task 84" but the merge
  remains a human gate).
- **H2 · Reconcile `feature/cli` with `origin/dev` before/within the PR.** `dev` already carries the foundation merge +
  the CLI **task definitions** (and doc-10/13 fixes + task-conventions). Expect conflicts on `AGENTS.md`/`CLAUDE.md` +
  the Backlog.md index; `dev` is checked out in a sibling worktree (`work-package-manager-dev`). *(Owner: orchestrator;
  the merge resolution is mechanical, surface any semantic conflict.)*
- **H3 · Promotion `dev` → `main` remains a separate human decision** (out of scope for this epic's goal).

**Pre-handoff items to fold into the PR (non-blocking for the gate, but should ride the handoff):**

- **P1 · Surface doc-07:67 (D10) to the user with the recommended fix** and decide the downstream discovery mechanism
  (see §7 carry-forward). It is a doc-set inaccuracy in Root's owned design set — **not** a vocabulary/scope change, so
  it does not block the merge, but it should be on the PR.
- **P2 · Resolve or annotate the stale BMAD shims (§4.4)** so a future reader doesn't trust an epic-1-only
  `sprint-status.yaml`/`epics.md` as the whole picture. *(Deferred here by scope constraint.)*

---

## 7 · Action items & carry-forward (SMART)

**Process**

1. **Codify when family-batching applies (and when it must not).** Promote D1's limit analysis (§4.1) into the per-epic
   kickoff checklist: batch only **uniform, independent, low-risk** leaves on a **mechanically-guarded** spine; isolate
   **novel** work (e.g. `build`) and treat **cross-cutting** changes (lifecycle / composition root / shared op) as spine
   work with broader review + a real-binary regression check. *Owner:* orchestrator. *Done when:* the next epic's plan
   states, per group, why batching is/ isn't appropriate. **(Generalisation verdict: YES, conditionally — it generalises
   to any epic of uniform leaves on a guarded spine; it does NOT generalise to novel or cross-cutting work.)**
2. **Binary verification is mandatory, not optional, under lighter-per-leaf review.** Every family closes with an
   orchestrator spot-check on the real `dist/cli.js` against a real Backlog.md / real shell **before** merge. *Owner:*
   orchestrator. *Done when:* each family's `--notes` records a real-binary verification (as epic-2 did). *Priority: HIGH*
   — this caught all four defects a green suite hid.
3. **Rotate workers proactively at ~5-8 tasks; 0-tool-use ⇒ spawn fresh.** *Owner:* orchestrator. *Done when:* it's in the
   per-story-loop checklist and no stuck session is re-poked. *(Reaffirmed from epic-1; held in epic-2 across 13 workers.)*
4. **Keep authoring and review in separate lanes** (reviewer never self-approves; report-only). *Owner:* orchestrator.
   *Done when:* every family records both a `bmad-dev-story` and a separate `bmad-story-automator-review` run.

**Technical / testing**

5. **Test the real generated-script / real-subprocess / real-Backlog-root path, not just in-process dispatch.** Every
   leaf with such a boundary closes the loop (generate → run → assert; or drive the real binary against a real root).
   *Owner:* worker + Murat. *Priority: HIGH* — three of the four catches (§3.2) were exactly this gap. *Done when:* such
   leaves carry a loop-closure / real-environment test (the omelette `__complete` pattern; a `.authoring-backlog`-rooted
   FakeBacklog + a real-backlog regression test).
6. **NEVER run overlapping vitest processes.** The integration project is `fileParallelism:false` over shared
   real-backlog/`dist` state; concurrent runs produce **false** failures (one full-suite run once falsely failed from
   self-inflicted contention). *Owner:* orchestrator / CI. *Done when:* the gate and any local runs are serialized
   (one vitest process at a time).
7. **Cold E2E must build `dist/` before `npm test`** so the binary-gated tests (`describeIfBuilt`) run, not skip
   (`npm ci → typecheck → biome ci → build → test`). *Owner:* CI / Murat. *(Held at the epic-2 gate — vitest 1174 cold.)*

**Documentation / design**

8. **Reconcile install-backlog discovery (D10) + correct doc-07 line 67.** Decide the mechanism before any flow that
   relies on Backlog.md discovering a generated project's recipe folder: at **execution-time** (doc 03/09) stage a
   `backlog.config.yml` pointing at the recipe folder (or copy under a discoverable name per doc-09's `$STATE` map);
   at **authoring-time** (doc 11) `cd` into the folder or write a `backlog.config.yml`. *Owner:* architect (mechanism)
   + human (the doc-07 edit, since the design set is human-owned). *Done when:* a generated project's Backlog.md
   actually discovers its recipe folder **and** doc-07 reflects 1.45.2 reality. *(epic-2 already works around it for
   `bundle list` by scanning the install-backlog by file — D10.)*
9. **Document `--format git` HEAD-archive semantics (D11)** for the end user; reconcile with the computed shippable set
   in a later iteration. *Owner:* tech-writer (Paige) + a follow-on build task. *Done when:* the `build package` help/docs
   state that `--format git` archives committed `HEAD`.
10. **Project epic-2 into the BMAD shims, or annotate them as epic-1-only (§4.4).** *Owner:* sm / orchestrator at handoff.
    *Done when:* `sprint-status.yaml` + `epics.md` either reflect epic-2 or are labeled non-authoritative, pointing at
    Backlog.md. *(Deferred here by scope constraint.)*

**Team agreements** (reaffirmed from epic-1, all held in epic-2)

- BMAD workflows are **run, not paraphrased** — inside the specialist whose workflow it is, with the skill recorded per task.
- **Backlog.md is the source of truth** for story status; CLI-only edits; the BMAD projections are shims.
- **A green suite is necessary, not sufficient** — binary verification + real-edge / loop-closure tests make "green" trustworthy.
- **Record the change** when the code teaches you something the docs didn't foresee; **surface** anything touching a goal,
  a user problem, or the model/vocabulary as a human gate.

---

## 8 · Significant-change detection

**Epic/plan update required before handoff? — NO (with the same one human-owned doc correction queued from epic-1).**

Nothing in epic-2 invalidates the design set or forces a plan change. doc-13's hexagon principles held under all 51
leaves; the bundle-`<id>` space and the payload-ref / skill-ref reuse families extended the spine without churning it;
the four defects were **caught and fixed** before close, not shipped. The bundle-template divergence (D9) was **closed**
in-epic. The **only** finding touching the human-owned design set is **D10 / install-backlog discovery** — the same
doc-07:67 inaccuracy epic-1 surfaced, **re-confirmed** here and **worked around** for `bundle list` (file scan). It is a
**downstream reconciliation + a doc fix**, **not** a vocabulary or scope change (`install-backlog/` stays) — so it does
**not** block the Phase-7 handoff, but it should ride the PR and be corrected. `--format git` (D11) is a recorded **v1
limitation**, not a change trigger. **Surfaced to the user.**

---

## 9 · Readiness assessment — Epic-2

| Dimension | Status |
|---|---|
| **Testing & quality** | **GREEN** — cold E2E (CI sequence, fresh `dist/`): `npm ci` 0 · `tsc --noEmit` 0 · `biome ci` 0 · `npm run build` 0 · `vitest` **1174/1174** all 0. Binary + real-Backlog tests *ran* (not skipped). tea `testarch-trace`/`testarch-nfr` resumed at the gate (CLI AC coverage + NFR). |
| **Functional completeness** | **GREEN** — 51/51 leaves (TASK-34…84) Done + merged; all of doc-10's command tree implemented; every leaf binary-verified on `dist/cli.js` against real Backlog.md before close. |
| **Deployment / release** | **N/A by design at this gate** — epic-2 ships the **authoring tool**; actual distribution is the `build package/publish` *commands* (now implemented), but no published release is part of this gate. Promotion `dev` → `main` is a separate human decision. |
| **Stakeholder acceptance** | Per-family reviewer verdicts: APPROVE (TASK-34 = APPROVE recorded). Human gate remains: the `feature/cli` → `dev` PR merge (§6, H1). |
| **Technical health** | **STABLE** — core boundary still enforced (rule + fixture); the four real defects found-and-fixed; fakes re-pointed for parity (`.authoring-backlog`); reuse patterns + the bundle-`<id>` registry leave a clean extension surface; no known dead code. |
| **Unresolved blockers** | **None blocking the handoff.** Queued (non-blocking): D10/doc-07:67 reconciliation + its downstream discovery mechanism (human-owned doc + architect); D11 `--format git` doc/iteration; the stale-shim housekeeping (§4.4). |

**Verdict: GREEN — with two human-owned, non-blocking carry-forward items.**

Rationale: epic-2 is **complete from a story perspective (51/51) and green at the cold gate (vitest 1174)**; the
central process deviation (family-batching) was the **right call** and is **bounded** by an explicit limit analysis;
binary verification **caught every defect** the green suite hid, and all four were **fixed in-epic**; the one
design-set finding (D10) is a **downstream reconciliation + doc fix**, not a scope/vocabulary change, and does **not**
block the Phase-7 handoff. The remaining items — the **`feature/cli` → `dev` merge (a human gate)**, the **doc-07:67**
reconciliation, the **`--format git`** doc, and the **stale-shim** housekeeping — are carried into handoff. *Not
"GREEN-with-concerns": there is no quality concern outstanding at the gate; the open items are a human merge decision,
a human-owned doc edit, and housekeeping, not a defect or risk in the delivered epic.*

---

## 10 · Top key takeaways

1. **Family-batching works — within bounds.** Grouping uniform, independent, low-risk leaves on a mechanically-guarded
   spine cut per-leaf overhead with no loss of quality (51/51, gate green). The discipline is **knowing the bounds**:
   isolate novel work, treat cross-cutting changes as spine work. It **generalises conditionally** — reuse it only when
   the same four conditions hold.
2. **Binary verification is the load-bearing gate, not the unit suite.** Four real defects — every materialising command
   broken, dead real-shell completion, a swallowed `--version`, a missing executable read as success — were **all hidden
   behind all-green tests** and **all caught by an orchestrator spot-check on the real binary**. Under lighter-per-leaf
   review, real-binary verification is **mandatory**.
3. **Reuse-once-then-apply scales breadth cleanly.** A handful of patterns (READ, LIST-MGMT, VERSION, the bundle-`<id>`
   routing + registry, the payload-ref/skill-ref descriptors, the build pipeline) absorbed 51 leaves; the bundle-`<id>`
   space was added **once** and 21 families plugged in with **no routing change**. The epic-1 spine paid for itself.
4. **Evolve the design, record it, surface what's human-owned.** The bundle-template divergence was **closed in-epic**
   (binary-proven both paths); doc-07:67 and `--format git` were **recorded and surfaced**. The discipline that turned
   "the code teaches you something" into durable, surfaced knowledge held across the whole epic.

---

*Prepared by the `bmad-retrospective` workflow (retro persona), run end-to-end in autonomous mode. Sources:
`.bmad/sdlc-state.yaml`; Backlog.md task `--notes` (TASK-34…84); `_bmad-output/planning-artifacts/{epics,architecture,prd}.md`;
`_bmad-output/implementation-artifacts/{stories/*, retrospective-epic-1.md}`; the `feature/cli` first-parent merge history;
and the `src/` tree (`cli.ts`, `core/operations/{payload-refs,skill-refs,init-project,build,bundle-remove}.ts`,
`completion/{complete,sources}.ts`, `adapters/packager.ts`). Per explicit scope constraint, `sprint-status.yaml` and
`sdlc-state.yaml` were **not** modified and the full vitest suite was **not** re-run (the Phase-6 epic gate already
confirmed it cold at vitest 1174); Backlog.md remains the authoritative per-story record.*
