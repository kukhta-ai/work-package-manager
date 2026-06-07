# Retrospective — Epic-3 (Authoring Workspace) — work-package-manager (`wpm`) builder

> **BMAD provenance (Rule 3).** The `bmad-retrospective` skill was invoked via the Skill tool. Its
> workflow is an interactive party-mode session that requires a live human participant
> (`{user_name}`) answering at numerous WAIT points across Steps 1, 5–10. In this unattended Phase-6
> gate run there is no live participant, so the skill **fell back to a doc-driven execution**: its
> *method* (epic discovery → deep per-story analysis → previous-retro continuity → review of
> went-well / hard → action items & carry-forward → significant-change detection → readiness
> assessment → save artifact) was driven from the authoritative records — the Backlog.md task files
> for TASK-85…95 (especially their Implementation Notes), `git log feature/authoring-workspace`, and
> `.bmad/sdlc-state.yaml`. This fallback is **stated, not silent**, per Rule 3. The interactive
> facilitation dialogue is not reproduced; the analysis it would have produced is captured below.

- **Epic:** authoring-workspace (epic-3)
- **Branch:** `feature/authoring-workspace` (off `feature/cli`; epic-3 depends on CLI epic-2 init/build code not yet on `dev`)
- **Date:** 2026-06-07
- **Phase:** 6 (epic gate) → produces this retro before the final gate verdict and the Phase-7 handoff
- **Cold suite at retro time:** tsc 0 · biome 0 (195 files) · build 0 · **vitest 1217 passed (96 files)**

---

## 1 · Epic summary & metrics

| Metric | Value |
|---|---|
| Stories planned | 10 (TASK-85…94) |
| Stories Done | **10 / 10 (100%)** |
| Tracked follow-up | 1 (TASK-95, `To Do`, deferred — not in epic scope) |
| Docs-only stories | 4 (85, 86, 92, 94) |
| Code stories | 6 (87, 88, 89, 90, 91, 93) |
| Cold-suite tests at gate | 1217 vitest (96 files), up from 1174 at epic-2 close |
| Production incidents | 0 |
| Blockers (review-cycle) | 1 blocking review finding (task-86 doc-13 contradiction), resolved in cycle 2 |
| Genuine bugs found & fixed | 1 (task-93 floating-promise test-masking) |

**What shipped.** Epic-3 changed the shape of an authored bundle-project from *deliverable-at-project-root*
to an **authoring workspace that wraps the deliverable**:

- **Workspace root = authoring surface** — the authoring front door (`AGENTS.md` + `CLAUDE.md` alias,
  addressed to the *authoring* agent) and the gitignored `.authoring-backlog/`.
- **`wip/` = the deliverable under construction** — manifest, bundles tree, default bundle template,
  installer-skills, templates, the rendered per-project installer skill, and the executor front door
  authored under the reserved `_AGENTS.md` prefix.
- **`builds/` = build output** — archives named by release name + version + format.
- **The built archive = the `wip/` deliverable un-nested** to the archive root, with `_AGENTS.md`
  stripped to canonical `AGENTS.md` (+ per-target aliases), and the wrapper (authoring front door,
  authoring backlog, `builds/`) absent.

The epic also **closed the authoring-agent distribution gap** (`wpm skill install` copies the bundled
installer-builder skill into the user agent scope) and **embedded the doc-04 quality protocol** into the
installer-builder skill as a progressive-disclosure reference.

The 10 stories, in dependency order:

| # | Task | Outcome |
|---|---|---|
| 1 | **85** docs: workspace architecture (authoring side) | Vocabulary (workspace root / `wip/` / `builds/`) + nesting model into docs 01/04/06/11/12 |
| 2 | **92** embed doc-04 protocol in skill | `references/quality-protocol.md` (68 lines) linked from SKILL.md |
| 3 | **86** docs: workspace CLI + build behavior | docs 07/09/10/11/12 (+ reconciled 13/06); pinned `_AGENTS.md` reserved prefix + `wip/manifest.yml` marker |
| 4 | **87** scaffold workspace on `wpm init` | init builds root front door + `.authoring-backlog/` + `wip/` deliverable + empty `builds/` + gitignore |
| 5 | **91** deliver authoring skill to agent scope | new `wpm skill install`; user-scope detection per doc-05 |
| 6 | **88** resolve workspace + deliverable root | marker `wip/manifest.yml`; `ProjectContext{workspaceRoot, deliverableRoot}`; project-bound commands resolve from anywhere in workspace |
| 7 | **94** README + first-run UX | 5-step workspace walkthrough + layout + skill-is-the-instruction-surface |
| 8 | **89** package build as un-nested deliverable → `builds/` | archive root = `wip/` un-nested; wrapper absent; reproducible layout |
| 9 | **90** executor front door under build-stripped prefix | pure `computeFrontDoorTransforms`; `_AGENTS.md` → `AGENTS.md` + aliases at build, verbatim content |
| 10 | **93** migrate tests/fixtures to workspace layout | fixtures via `initWorkspace`; non-vacuous regression guards; floating-promise bug fixed |

---

## 2 · Team & participation (agent roster)

Per `.bmad/sdlc-state.yaml` and each task's Implementation Notes, every story ran the orchestrated
per-story loop with **a worker subagent and a SEPARATE reviewer subagent** (never self-review):

- **worker** (from `dev`): `bmad-create-story` → `bmad-dev-story` (+ `qa-generate-e2e-tests` where executable behavior existed)
- **reviewer** (separate subagent each story): `bmad-story-automator-review`
- **orchestrator**: independent cold-gate verification, nit-fixes, merge mechanics
- **tea / investigator / retro**: Phase-6 gate roles (this retro is the `retro` output)

---

## 3 · What went well

1. **The workspace model resolved the core design collision cleanly.** The pre-epic spec authored the
   deliverable in place at the project root, where the executor front door (docs 06/07, addressed to an
   *end-user* install agent) and the authoring-agent stance directly contradicted each other
   (closest-wins auto-discovery would load the wrong front door). Wrapping the deliverable in a workspace
   (root = authoring surface, `wip/` = deliverable) separated the two surfaces without touching the
   **shipped-artifact contract** — because the built archive is just `wip/` un-nested. The fixed core
   (docs 00/13 principles) stayed intact throughout.

2. **The pure-core / ports-and-adapters boundary held under real pressure.** The build's front-door
   transform was implemented as a **pure** `computeFrontDoorTransforms(shippable, targets)` on the
   BuildPlan (policy only), with all staging / copy / symlink / archive **effects in the `packager.ts`
   adapter**. `build.ts` stayed pure and byte-identical on the no-transform path. The core import-boundary
   lint rule was never violated across all six code stories (reviewers verified each).

3. **Regression guards are non-vacuous and the suite genuinely guards the new structure.** Task-93's
   build e2e plants a **unique sentinel in each builder-time region** (`.authoring-backlog/`, root
   `AGENTS.md`/`CLAUDE.md`, `builds/`) and asserts both path and content absence from the archive; AC#4
   walks all of `wip/` asserting no canonical front-door name exists (only `_AGENTS.md`). Reviewers
   independently confirmed the guards fail when they should. Coverage was repeatedly described as
   **strengthened, not eroded**. The suite grew 1174 → 1217.

4. **Strong review independence and cold-gate discipline.** Several workers ended before their final
   report (a cold run still in flight); in each case the orchestrator + a separate reviewer ran the
   **full cold suite independently** and verified the gate (task-88: 1203 passed, 0 unhandled rejections;
   task-93: 1217 passed). The separate-reviewer-per-story rule was honored every story.

---

## 4 · What was hard / notable decisions

1. **The `_AGENTS.md` reserved-prefix decision (task-86, implemented task-90).** The deliverable's
   executor front door is **author-owned** content the author may edit — but under its canonical name
   inside the workspace it would be auto-discovered by the authoring agent and contradict the authoring
   front door. The decision: author it under a reserved leading-underscore prefix (`_AGENTS.md`) that
   agent auto-discovery ignores, and have the **build strip the prefix** to canonical `AGENTS.md` (+
   per-target aliases `CLAUDE.md`/`GEMINI.md` per doc-05; codex/hermes/openclaw read `AGENTS.md`
   natively). The build never regenerates or overwrites the content — it ships the author's bytes
   verbatim. The bundle template's `AGENTS.md.tmpl` was renamed to `_AGENTS.md.tmpl` so `bundle new`
   and preincluded bundles never scaffold the canonical name.

2. **The doc-13 / doc-06 context-resolution reconciliation absorbed into task-86 (beyond its stated
   scope).** task-86's stated scope was docs 07/09/10/11/12, but the cycle-1 review found a **blocking
   contradiction**: doc-13's context resolution still said "walk up to `manifest.yml` = project root",
   which is impossible under the new model (from the workspace root, walking up never enters `wip/`).
   Cycle 2 reconciled doc-13's walk-up to the marker `wip/manifest.yml` (parent = workspace root,
   deliverable root = `<workspace>/wip`) — leaving doc-13's **principles** untouched. This is the
   contract the code tasks 87–90 implement against; it is a *realization* fix, not a fixed-core change,
   but it **edited docs (13, 06) beyond the task's stated scope** — flagged as a deviation (see §5).

3. **The staging + transform build design (tasks 89 + 90).** Two-step: task-89 made the archive root the
   **un-nested deliverable** (build operates on `deliverableRoot = wip/` since task-88, so the manifest
   lands at the archive root) and routed output to `<workspace>/builds/`. task-90 then layered the pure
   transform-spec + adapter staging (stage shippable set preserving symlinks → write `AGENTS.md` from
   `_AGENTS.md` bytes → create alias symlinks → drop `_AGENTS.md` → archive). AC#7's "reproducible
   layout" is a genuine two-build compare.

4. **The floating-promise test-masking bug found in task-93.** A subset of `cli.bundle-id.e2e` (files /
   installer-skills families) used floating, un-awaited `withTempDir((dir) => {...})` — a failing
   assertion would leak as an unhandled rejection rather than failing the test (latent test-masking).
   task-88 first flagged it as a carry-forward (cold run had 0 rejections, so nothing was masked *yet*);
   task-93 converted all sites to `async/await withTempDir` and grep-confirmed no floating sites remain
   suite-wide. Genuine bug, fully eradicated.

5. **Node-20 + rolldown-binding environment setup.** The repo requires Node ≥20 (system node is v18 and
   crashes vitest); Node 20 lives at `$HOME/.local/node20/bin` and must be re-established on every
   resume. rolldown needs `@rolldown/binding-linux-x64-gnu` (`npm install --no-save` it if missing after
   `npm ci`). This environment fragility is a standing operational cost, captured in the state file.

---

## 5 · Key decisions & divergences (with dispositions)

| # | Decision / divergence | Disposition |
|---|---|---|
| D1 | Workspace marker = `wip/manifest.yml` (not `.authoring-backlog/` [gitignored] nor bare `AGENTS.md` [too generic]) | **Accepted** — pinned in task-86; implemented task-88 (`PROJECT_MARKER` fully removed, only `WORKSPACE_MARKER`) |
| D2 | `_AGENTS.md` reserved leading-underscore prefix; build strips → `AGENTS.md` + per-target aliases; installer skill + advisors unprefixed | **Accepted** — task-86 / task-90; doc-05 alias map verified |
| D3 | Dir names `wip/` and `builds/` | **Accepted** — task-85 AC#1 |
| V1 | **task-86 edited docs 13 + 06 beyond its stated 07/09/10/11/12 scope** | **Recorded deviation** — necessary realization reconciliation (the contract 87–90 build against), not a fixed-core change; doc-13 principles untouched. Flag at gate. |
| V2 | **`bmad-story-automator-review` consistently fell back to manual** review every story | **Recorded deviation (Rule 3)** — the skill auto-fixes + mutates sprint-status and needs a live story-automator/tmux session, absent in standalone worktrees; reviewers ran manual adversarial review instead. Surfaced, not silent. |
| V3 | **task-88 worker wrote NO `story-task-88.md`** | **Recorded deviation** — worker judged a freehand story a Rule-3 defect and skipped it; a small evidence-trail divergence from sibling tasks. Non-blocking. |
| V4 | `bmad-dev-story` / `qa-generate-e2e-tests` fell back to doc-driven impl on the code tasks | **Recorded (Rule 3)** — those workflows gate on the epic-1 sprint mirror, which excludes tasks 85+; fallback recorded per task |

---

## 6 · Carry-forwards / tech-debt

| Item | Source | Severity | Notes |
|---|---|---|---|
| **TASK-95 — `--format git` reconciliation** | task-90 (created as follow-up) | Medium | `--format git` does `git archive HEAD` and does **not** apply un-nesting / exclusions / front-door strip (never did, since task-89). Tarball + zip are correct. Tracked as `To Do`; **outside epic-3 scope** (task-90 non-goal "packaging mechanics"). Must land before any release that supports git format. |
| **~21-min cold suite / real-binary e2e cost** | task-87, state file | Medium (operational) | The full cold suite is ~21 min, dominated by real-binary e2e subprocess cost (pre-existing, not an epic-3 regression). Routine per-task verify uses the fast suite (no dist, ~50s, e2e self-skip). A drag on the epic gate and CI. |
| **Scope-alias symlinks ship with ABSOLUTE targets** | task-90 | Low–Medium | Pre-existing init behavior; a latent **archive-portability** issue (absolute symlink targets won't resolve on the end user's machine). Not introduced by epic-3 but surfaced by it. |
| **Whether `bundles/bundle-template/_AGENTS.md.tmpl` should ship** | task-90 | Low | Open question — the bundle-template scaffold currently ships in the archive; unclear whether it should. |
| **task-90 failure-path temp-dir leak** | task-90 | Low | If `stageWithTransforms` throws mid-stage, the temp dir leaks (`archiveSource` runs before the try). Minor robustness follow-up. |
| **task-91 `bundledSkillsRoot` could be required for parity** | task-91 | Low (nit) | Typed optional to avoid churning ~29 test-dep literals; reviewer accepted. |
| **task-89 publish `builds/` write untested** | task-89 | Low (nit) | The publish path writes to `builds/` correctly but has no publish e2e (out of AC89 scope). |

No carry-forward is blocking for the Phase-7 handoff (the epic ends in a handoff, not a release).

---

## 7 · Continuity from epic-2 retro

Epic-2's retro carried forward several items; epic-3 either honored or did not regress them:

- **Separate-reviewer-per-story discipline** — fully maintained (every story).
- **Cold-gate-before-merge discipline** — maintained and strengthened (independent orchestrator + reviewer cold runs when workers ended early).
- **Cross-platform CI fragility** (epic-2's late Windows fixes) — not re-touched in epic-3 (no CI/platform changes); the epic-3 work is all logical-path / workspace-layout, which already uses POSIX logical paths.
- The **doc-07:67 docs reconciliation** noted human-owned at epic-2 handoff remains human-owned; unaffected.

---

## 8 · Significant-change detection

**No fixed-core / scope-level discoveries that invalidate downstream planning.** The one notable
mid-epic discovery — doc-13's context-resolution rule contradicting the new workspace model — was a
**realization reconciliation** caught and fixed *within* the epic (task-86 cycle 2), with doc-13's
principles left intact. It does not change goals, user problems, or the model/vocabulary (the fixed
core), so it is **not** a user gate. The only forward-looking scope note is the **deferred TASK-95**
(git format), which is explicitly tracked and out of epic-3 scope.

The two deviations worth a human's eye at the gate (not blockers): **V1** (task-86 doc-13/06 edits
beyond stated scope) and **V2** (story-automator-review manual fallback every story).

---

## 9 · Readiness assessment — Epic-3

| Dimension | Status |
|---|---|
| Stories complete | **GREEN** — 10/10 Done, all ACs + DoD ticked |
| Type / lint | **GREEN** — tsc 0, biome 0 (195 files) |
| Tests | **GREEN** — 1217 vitest passed (96 files), cold; regression guards non-vacuous; floating-promise masking eradicated |
| Architecture conformance | **GREEN** — core import-boundary intact; doc-13 principles untouched; pure-core / adapter split honored |
| Shipped-artifact contract | **GREEN** — archive = un-nested `wip/`, wrapper absent, front door stripped to canonical; reproducible |
| Build coverage | **AMBER** — tarball + zip correct; **`--format git` NOT reconciled (TASK-95)**; absolute-target alias symlinks latent portability issue |
| Process evidence (Rule 3) | **AMBER** — story-automator-review manual fallback every story (surfaced); one worker wrote no story file; task-86 edited beyond stated doc scope (recorded) |
| Operational cost | **AMBER** — ~21-min cold suite; Node-20 + rolldown-binding env must be re-established on resume |

### Overall verdict: **GREEN (with noted AMBER carry-forwards) — ready for the Phase-7 handoff.**

The epic's deliverable is complete, type/lint/test-clean cold, architecturally conformant, and the
shipped-artifact contract holds for the tarball and zip formats. The AMBER items (git-format
reconciliation TASK-95, absolute-symlink portability, the manual-review fallback, the slow cold suite)
are **tracked, non-blocking, and most are pre-existing or explicitly out of epic-3 scope**. The epic
ends in a **handoff, not a release**, so the deferred git-format work does not block the gate — but it,
and the absolute-symlink portability issue, **must be resolved before any release that ships those
paths**. Recommend the human disposing V1/V2 at the gate and confirming TASK-95 is scheduled before a
release.

---

## 10 · Top key takeaways

1. **A wrapper that separates surfaces beats authoring-in-place** — the workspace model dissolved the
   front-door collision while leaving the shipped contract identical (the archive is just `wip/`
   un-nested + prefix-stripped). Hold the fixed core; refine the realization.
2. **Reserved-prefix + build-strip is the right pattern for author-owned-but-not-auto-discovered
   content** (`_AGENTS.md` → `AGENTS.md`), and it keeps the build a pure transform over author bytes.
3. **Independent cold-gate verification by a separate reviewer is what caught the doc-13 contradiction
   and the floating-promise masking** — keep that discipline; it is the epic's quality backbone.

---

## 11 · Recommended action items (for the gate / Phase-7)

1. **Human disposes V1 + V2** at the epic gate (task-86 out-of-scope doc edits; story-automator-review manual fallback). — *owner: human gate*
2. **Schedule TASK-95** (`--format git` un-nest/strip/exclude reconciliation) before any release supporting git format. — *owner: next sprint / pre-release*
3. **Fix absolute-target alias symlinks** to relative targets before a release (archive portability). — *owner: pre-release follow-up*
4. **Decide whether `bundles/bundle-template/_AGENTS.md.tmpl` should ship** in the archive. — *owner: architect, low priority*
5. **Investigate cold-suite cost** (~21 min, real-binary e2e) if it becomes a CI bottleneck. — *owner: tea, opportunistic*
6. **Proceed to Phase-7 handoff** — push `feature/authoring-workspace`, open a PR to `dev`, green CI; **never self-merge** (human gate). — *owner: orchestrator → human*
