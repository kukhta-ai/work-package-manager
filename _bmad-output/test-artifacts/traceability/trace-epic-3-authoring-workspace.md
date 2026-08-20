---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-06-07'
coverageBasis: 'acceptance_criteria'
oracleResolutionMode: 'formal_requirements'
oracleConfidence: 'high'
oracleSources: ['backlog/tasks/task-85..94 (acceptance criteria)', 'docs/01,04,05,06,07,09,10,11,12,13']
externalPointerStatus: 'not_used'
tempCoverageMatrixPath: 'n/a (single-pass markdown trace; gate computed inline)'
gateDecision: 'PASS'
---

# Traceability Matrix & Gate — EPIC-3 "authoring-workspace"

- **Epic:** authoring-workspace (workspace nesting: workspace root + `wip/` deliverable + `builds/`; `wpm skill install`; workspace-aware resolution; un-nested build into `builds/`; author-owned `_AGENTS.md`→`AGENTS.md` build strip)
- **Stories:** TASK-85..94 (all Done). Follow-up TASK-95 tracks deferred `--format git` reconciliation (out of epic-3 AC scope).
- **Branch:** `feature/authoring-workspace`
- **Skill:** `bmad-testarch-trace` (Murat / Master Test Architect), Create mode, run end-to-end against the committed task ACs + the vitest suite.
- **Oracle:** acceptance criteria (formal requirements), **high** confidence. Not synthetic.
- **Cold suite (provided, verified GREEN):** tsc 0 / biome 0 (195 files) / build 0 / vitest **1217 passed (96 files)**.

## Coverage classes

- **AUTOMATED** — a vitest unit/integration test asserts the observable outcome (file + test name given).
- **INSPECTION** — a pure docs / skill-content AC whose "coverage" is the committed doc/skill state (+ any skill-consistency test). Per the gate brief, the docs/skill tasks (85, 86, 92, 94) and the documentation-outcome AC within a code task (90 AC#4) are verified by inspection, **not** vitest. This is correct, not a gap.

## Priority model (gate brief)

**P0** = build correctness, workspace resolution, front-door exclusion from the authoring tree, and exclusions-from-archive. Every other behavioural AC is P1; pure docs/onboarding ACs are P2.

---

## TASK-85 — Specify the authoring-workspace architecture (authoring side) · docs · INSPECTION

| AC | Outcome | Class | Coverage |
|----|---------|-------|----------|
| #1 | one vocabulary for the 3 regions (workspace root / `wip/` / `builds/`) | INSPECTION | docs 01/04/06/11/12 — vocabulary present & consistent (reviewer-verified) |
| #2 | doc 06: skeleton under `wip/`; archive = same skeleton un-nested, content unchanged | INSPECTION | doc 06 |
| #3 | doc 01: authoring front door + authoring backlog at root, deliverable under subdir, builds isolated | INSPECTION | doc 01 |
| #4 | doc 04: agent operates from root, treats `wip/` as artifact not instructions | INSPECTION | doc 04 |
| #5 | doc 11: authoring backlog at root, gitignored & builder-time only | INSPECTION | doc 11 |
| #6 | doc 12: directory scaffold of the authoring workspace, distinct from shipped scaffold | INSPECTION | doc 12 |
| #7 | docs: authoring front door + authoring backlog never ship | INSPECTION | docs 01/06/12 |
| #8 | no doc still describes deliverable authored at project root; cross-refs consistent | INSPECTION | grep-clean (reviewer) |

8 ACs · 8 inspection · 0 gaps.

## TASK-86 — Specify the workspace CLI & build behavior · docs · INSPECTION

| AC | Outcome | Class | Coverage |
|----|---------|-------|----------|
| #1 | doc 10: init creates the workspace (not deliverable at root) | INSPECTION | doc 10 |
| #2 | doc 10: project-bound commands resolve workspace, operate on `wip/`; same root from anywhere | INSPECTION | doc 10 (+ realized & tested under task-88) |
| #3 | doc 10: command outside any workspace fails, names marker, points at init / `-C` | INSPECTION | doc 10 (+ realized & tested under task-88) |
| #4 | doc 10: build writes into `builds/`, named by release+version, root = un-nested deliverable | INSPECTION | doc 10 (+ realized & tested under task-89) |
| #5 | doc 12: authoring backlog + front door + `builds/` excluded from every build | INSPECTION | doc 12 (+ realized & tested under tasks 89/93) |
| #6 | docs 07/09: install contract/process apply to the un-nested archive; wrapper never ships | INSPECTION | docs 07/09 |
| #7 | doc 12: executor front door author-owned under reserved build-stripped prefix; build restores canonical name; installer skill + advisors stay deliverable content | INSPECTION | doc 12 (+ realized & tested under task-90) |
| #8 | doc 11 catalog keeps a task to verify the author-owned front door reflects manifest bundles/targets | INSPECTION | doc 11 |

8 ACs · 8 inspection · 0 gaps. (Note: doc-13 §7 context-resolution + doc-06 were also reconciled here — recorded as a realization reconciliation in the task notes; the doc-13 *principles* were untouched.)

## TASK-87 — Scaffold the authoring workspace on `wpm init` · code · AUTOMATED

| AC | Outcome | Pri | Cov | Tests |
|----|---------|-----|-----|-------|
| #1 | workspace root has authoring front door + authoring backlog; deliverable skeleton under `wip/` | P1 | FULL | `test/unit/operations/init-project.test.ts` "AC#1 — workspace root holds the authoring front door + authoring backlog; deliverable lives under wip/"; `test/integration/cli.init.test.ts` "AC#1 — init … produces the full project on real disk via run()" |
| #2 | an empty `builds/` exists after init | P1 | FULL | `init-project.test.ts` "AC#2 — an EMPTY build-output directory (builds/) exists at the workspace root" |
| #3 | gitignore excludes authoring backlog + `builds/` | P1 | FULL | `init-project.test.ts` "AC#3 — the workspace .gitignore excludes BOTH the authoring backlog AND builds/" |
| #4 | front door addresses the authoring agent (author, not install) | P1 | FULL | `init-project.test.ts` "AC#4 — the authoring front door addresses the AUTHORING agent" |
| #5 | init refuses when target exists, creates nothing | P1 | FULL | `cli.init.test.ts` "AC#5 — re-running init on an existing path exits 1 … changes nothing"; `init-project.test.ts` "AC#5 — refuses when the target PATH already exists …" + "AC#5 — re-running … does not change the manifest" |
| #6 | `--list-templates` lists & exits creating nothing; `--param k=v` feeds substitution | P1 | FULL | `cli.init.test.ts` "AC#6 — --list-templates … creates NOTHING" + "AC#6 — --param values thread to placeholder substitution"; `init-project.test.ts` "AC#6 — --param values are available …" |
| #7 | project-wide + per-bundle (per pre-included bundle) authoring tasks materialised into root backlog, identities unchanged | P1 | FULL | `init-project.test.ts` "AC#7 — the project-wide authoring task set (8) is materialised …" + "AC#7 — … task_prefix=authoring" + "AC#7 + — materialises the project-wide set AND the per-bundle set …"; `cli.init.test.ts` "AC#4 — init materialises the project-wide set into a real .authoring-backlog/" |
| #8 | `wip/` has rendered per-project installer skill + executor front door under reserved prefix (not canonical name) | P1 | FULL | `init-project.test.ts` "AC#8 — wip/ has the rendered installer skill + the executor front door under the reserved prefix"; single-source check "the executor front door `init` writes is byte-identical to the deriver's output" |

8 ACs · 8 FULL · 0 gaps.

## TASK-88 — Resolve workspace & deliverable root for project-bound commands · code · AUTOMATED (P0: resolution)

| AC | Outcome | Pri | Cov | Tests |
|----|---------|-----|-----|-------|
| #1 | command at workspace root operates on deliverable in `wip/` | P0 | FULL | `test/unit/services/context.test.ts` "finds the workspace when cwd is the workspace root itself"; `test/unit/services/context.acceptance.test.ts` "works when the command is run from the workspace root itself" |
| #2 | command anywhere within workspace (incl. inside `wip/` or a bundle) resolves the same root | P0 | FULL | `context.test.ts` "finds the same deliverable root when cwd is inside the deliverable wip/" + "… inside a bundle directory under wip/" + "finds the nearest workspace ancestor several levels up"; `context.acceptance.test.ts` "an agent runs a project-bound command from a deep subdirectory of the deliverable" |
| #3 | `-C/--project` targets a workspace at the given path | P0 | FULL | `context.test.ts` AC#3 block (absolute / relative / marker-at-override-only); `context.acceptance.test.ts` AC#3 block; CLI: `test/integration/cli.project-meta.e2e.test.ts` "38#4 — outside any project … a -C path is honoured" |
| #4 | outside any workspace exits non-zero, names the marker, suggests init or `-C` | P0 | FULL | `context.test.ts` AC#4 block (returns `{found:false}`); CLI exit+marker: `test/integration/cli.build.e2e.test.ts` "AC82#5 — run outside any project exits non-zero naming manifest.yml" + "AC89#6 — package outside any workspace …"; `cli.project-meta.e2e.test.ts` "38#4". *(Marker-naming + non-zero + `-C` recovery are asserted; the shared message's verbatim "run `wpm init` / pass `-C`" wording is not string-asserted — minor, same single message string is exercised.)* |
| #5 | a bare manifest dir is NOT a workspace; never silently operate on a bare deliverable | P0 | FULL | `context.test.ts` AC#5 block ("does not resolve a directory holding a top-level manifest.yml (no wip/ wrapper)" + override variant); `context.acceptance.test.ts` "a directory holding a top-level manifest.yml (no wip/) is never silently treated as a workspace" |

5 ACs · 5 FULL · 0 gaps. (`PROJECT_MARKER` fully removed; only `WORKSPACE_MARKER = wip/manifest.yml`.)

## TASK-89 — Package the build as the un-nested deliverable into `builds/` · code · AUTOMATED (P0: build correctness + exclusions-from-archive)

| AC | Outcome | Pri | Cov | Tests |
|----|---------|-----|-----|-------|
| #1 | build package writes archive into `builds/`, named by release+version+format | P0 | FULL | `test/integration/cli.build.e2e.test.ts` "AC83#1/#2 + AC89#1/#2/#3 — `--format tarball`: … archive in <workspace>/builds/ …"; "AC83#2 — `--format zip` produces a real .zip in <workspace>/builds/" |
| #2 | archive root = un-nested deliverable; manifest at archive root | P0 | FULL | `cli.build.e2e.test.ts` "AC83#1/#2 + AC89#1/#2/#3 …" (manifest.yml at archive root, no `wip/` prefix) |
| #3 | authoring backlog + authoring front door + `builds/` absent from archive | P0 | FULL | `cli.build.e2e.test.ts` "AC93#3 — REGRESSION GUARD: no builder-time region … leaks … by PATH and by CONTENT"; `test/unit/operations/build.test.ts` "includes the skeleton and EXCLUDES .authoring-backlog/" |
| #4 | disabled bundle dirs + builder-time working dirs remain excluded | P0 | FULL | `build.test.ts` "EXCLUDES a DISABLED bundle dir … but keeps bundle-template/" + "EXCLUDES .git/, node_modules/, dist/" |
| #5 | dry-run previews the un-nested tree, produces no artifact | P1 | FULL | `cli.build.e2e.test.ts` "AC82#3/#4 — after adding a target: … prints the would-ship tree (no .authoring-backlog), NO artefact" |
| #6 | build outside a workspace exits non-zero naming the workspace | P0 | FULL | `cli.build.e2e.test.ts` "AC89#6 — package outside any workspace exits non-zero naming the missing workspace" |
| #7 | re-packaging unchanged state reproduces identical archive layout | P0 | FULL | `cli.build.e2e.test.ts` "AC89#7 — re-packaging unchanged project state reproduces an identical archive layout" |

7 ACs · 7 FULL · 0 gaps.

## TASK-90 — Author the executor front door under a build-stripped prefix · code · AUTOMATED (P0: front-door exclusion + strip correctness) + 1 INSPECTION

| AC | Outcome | Pri | Cov | Tests |
|----|---------|-----|-----|-------|
| #1 | front door author-owned, stored under a reserved name auto-discovery does not load | P0 | FULL | `cli.build.e2e.test.ts` "AC90#3 — during authoring … ONLY `_AGENTS.md` exists … no canonical front door"; `build.test.ts` "matches ONLY the exact `_AGENTS.md` basename — never `_AGENTS.md.tmpl` or a canonical `AGENTS.md`" |
| #2 | build restores canonical `AGENTS.md` (+ `CLAUDE.md` alias) at the corresponding archive location | P0 | FULL | `cli.build.e2e.test.ts` "AC90#2/#5/#6 — `_AGENTS.md` (root + per bundle) ships as canonical `AGENTS.md` VERBATIM, with the `CLAUDE.md` alias …"; `build.test.ts` "computeFrontDoorTransforms" block (root + per-bundle + alias mapping); `test/unit/adapters/packager.test.ts` "strips `_AGENTS.md` → `AGENTS.md` (verbatim) + the alias …" |
| #3 | during authoring no canonical-name front door auto-discovered (root or any bundle) | P0 | FULL | `cli.build.e2e.test.ts` "AC90#3 …" + "AC93#4 — REGRESSION GUARD: NO canonical executor front door … ANYWHERE … only the reserved `_AGENTS.md`" |
| #4 | reserved-prefix convention documented where the author sees it | P2 | INSPECTION | `agent-skills/installer-builder/references/conventions.md` §"The deliverable executor front door is `_AGENTS.md`" (root + per-bundle, edit-directly, build-strips). Skill-consistency test asserts conventions.md presence/depth (`installer-builder-skill.test.ts` "conventions.md covers …") but not the `_AGENTS` text specifically. |
| #5 | a prefixed file appears in the archive only under the stripped canonical name, never both | P0 | FULL | `cli.build.e2e.test.ts` "AC90#2/#5/#6 … never `_AGENTS.md`"; `packager.test.ts` "… drops `_AGENTS.md`"; `build.test.ts` computeFrontDoorTransforms |
| #6 | author edits appear verbatim; build does not regenerate/overwrite | P0 | FULL | `cli.build.e2e.test.ts` "AC90#2/#5/#6 … VERBATIM"; `packager.test.ts` "… (verbatim)" |

6 ACs · 5 FULL (automated) · 1 INSPECTION (#4) · 0 gaps.

## TASK-91 — Deliver the authoring skill into the agent skill scope · code · AUTOMATED

| AC | Outcome | Pri | Cov | Tests |
|----|---------|-----|-----|-------|
| #1 | a command installs the bundled installer-builder skill into the user agent scope for detected agents | P1 | FULL | `test/unit/operations/install-authoring-skill.test.ts` "AC#1/#5 …" + "AC#1: installs into EVERY detected agent scope (claude-code + codex)"; `test/integration/cli.skill-install.test.ts` "copies the real bundled installer-builder skill into a detected agent's user scope, exit 0"; `test/unit/cli/skill-commands.test.ts` "AC#1/#5 …" |
| #2 | re-running is idempotent and reports what it did | P1 | FULL | `install-authoring-skill.test.ts` "AC#2: re-running is idempotent and reports updated …"; `skill-commands.test.ts` "AC#2: re-running reports 'updated' …" |
| #3 | no supported scope → reports it, exits non-zero, writes nothing | P1 | FULL | `install-authoring-skill.test.ts` "AC#3: with NO supported agent scope detected, it raises a usage error and writes nothing"; `cli.skill-install.test.ts` "with no agent scope under HOME, exits 2 and writes nothing"; `skill-commands.test.ts` "AC#3 …" |
| #4 | init surfaces how to install the skill when absent (summary or front door) | P1 | FULL | `skill-commands.test.ts` "prints the `wpm skill install` tip when the skill is absent …" + "stays quiet when … already present" + "the authoring front door itself documents `wpm skill install`" |
| #5 | the command names the scope(s) it wrote to | P1 | FULL | `install-authoring-skill.test.ts` "AC#1/#5 … and names the scope"; `skill-commands.test.ts` "AC#1/#5 … prints the scope" |
| #6 | install never lands inside any workspace `wip/`; user scope only | P1 | FULL | `install-authoring-skill.test.ts` "AC#6: writes ONLY under the HOME user scope — never a project/wip deliverable subdir" |

6 ACs · 6 FULL · 0 gaps. (Scope map verified vs doc 05: `test/unit/services/agent-aliases.test.ts` "never maps any agent to a bare skills/ directory" + ".agents/skills shared for codex and hermes".)

## TASK-92 — Embed the doc-04 authoring quality protocol in the installer-builder skill · skill content · INSPECTION

| AC | Outcome | Class | Coverage |
|----|---------|-------|----------|
| #1 | skill set includes a reference distilling doc 04 (three author decisions, simulate-the-executor, independence/leaked-coupling check, must-nots) | INSPECTION | `agent-skills/installer-builder/references/quality-protocol.md` (68 lines) — present, faithful distillation. **Not** asserted by an automated test: the skill-consistency `REFERENCES` array in `installer-builder-skill.test.ts` lists only the original three references and was not extended to `quality-protocol.md`. |
| #2 | skill body links to it under progressive disclosure | INSPECTION | SKILL.md links the reference (count updated three→four) |
| #3 | reference stays within the sibling length discipline | INSPECTION | 68 lines, within the 67-85 sibling band |
| #4 | reference attributes source to doc 04, does not contradict it | INSPECTION | explicit doc-04 attribution (reviewer-verified) |

4 ACs · 4 inspection · 0 gaps. **Observation:** extending `REFERENCES` to include `quality-protocol.md` would bring the new reference under the existing existence/depth/linked-by-SKILL.md automated guards (recommendation, not a gate blocker).

## TASK-93 — Migrate the test suite & fixtures to the workspace layout · test code · AUTOMATED

| AC | Outcome | Pri | Cov | Tests |
|----|---------|-----|-----|-------|
| #1 | fixtures represent workspaces with deliverable nested under `wip/` (not at root) | P1 | FULL | `test/helpers/workspace.ts` `initWorkspace` (real `wpm init` → deliverable under `wip/`); all e2e suites funnel through it |
| #2 | integration tests drive the workspace flow end-to-end (init→resolve→un-nested archive in `builds/`) | P1 | FULL | `cli.build.e2e.test.ts` "init → bundle new → project meta → build: the workspace layout holds throughout and the archive is un-nested in builds/" |
| #3 | a regression test fails if any builder-time region appears in a build artifact | P0 | FULL | `cli.build.e2e.test.ts` "AC93#3 — REGRESSION GUARD … by PATH and by CONTENT" (unique sentinel planted in `.authoring-backlog/`, root `AGENTS.md`/`CLAUDE.md`, `builds/`) |
| #4 | a regression test fails if any canonical executor front door appears in the authoring tree | P0 | FULL | `cli.build.e2e.test.ts` "AC93#4 — REGRESSION GUARD: NO canonical executor front door … ANYWHERE … only the reserved `_AGENTS.md`" |
| #5 | snapshot expectations reflect the workspace layout + prefix-stripped front door in the archive | P1 | FULL | No vitest `.snap` files in repo; "snapshot expectations" = structural archive-listing assertions in `cli.build.e2e.test.ts` (AC83/AC89/AC90 tarball-listing tests) |

5 ACs · 5 FULL · 0 gaps. (Genuine bug fixed: floating un-awaited `withTempDir(...)` in e2e converted to `async/await`; the two remaining non-awaited `withTempDir` call sites are the helper's own self-test and a `return`-ed call — not masking.)

## TASK-94 — Update README & first-run UX for the workspace flow · docs · INSPECTION

| AC | Outcome | Class | Coverage |
|----|---------|-------|----------|
| #1 | README walkthrough: install skill, create workspace, author via agent, build into `builds/` | INSPECTION | README "Getting started" 5-step walkthrough (`wpm skill install` → `wpm init` → cd → author → `wpm build package` into `builds/`) |
| #2 | README describes the layout (root / `wip/` / `builds/`) and what ships | INSPECTION | README "The authoring workspace layout" tree + "Only `wip/` ships" |
| #3 | README states the skill is the authoring-agent instruction surface + how to (re)install | INSPECTION | README "The authoring skill is the authoring-agent's instruction surface" paragraph |
| #4 | README no longer describes the deliverable as authored at the project root | INSPECTION | grep-clean (reviewer); "authored under `wip/`, not at the workspace root" |

4 ACs · 4 inspection · 0 gaps.

---

## Coverage statistics

| Metric | Value |
|--------|-------|
| **Total ACs (epic-3)** | **61** |
| Covered (AUTOMATED FULL) | 36 |
| Covered (INSPECTION / doc-state) | 25 |
| **Total covered** | **61 (100%)** |
| **GAPs** | **0** |
| Partial / Unit-only | 0 |

### By task

| Task | Class | ACs | Automated FULL | Inspection | Gaps |
|------|-------|-----|----------------|------------|------|
| 85 | docs | 8 | 0 | 8 | 0 |
| 86 | docs | 8 | 0 | 8 | 0 |
| 87 | code | 8 | 8 | 0 | 0 |
| 88 | code | 5 | 5 | 0 | 0 |
| 89 | code | 7 | 7 | 0 | 0 |
| 90 | code | 6 | 5 | 1 | 0 |
| 91 | code | 6 | 6 | 0 | 0 |
| 92 | skill | 4 | 0 | 4 | 0 |
| 93 | test | 5 | 5 | 0 | 0 |
| 94 | docs | 4 | 0 | 4 | 0 |
| **Σ** | | **61** | **36** | **25** | **0** |

### P0 coverage (gate brief: build correctness, resolution, front-door exclusion, exclusions-from-archive)

P0 AC set (17): 88#1,#2,#3,#4,#5 (resolution) · 89#1,#2,#3,#4,#6,#7 (build correctness + exclusions-from-archive) · 90#1,#2,#3,#5,#6 (front-door strip + authoring-tree exclusion) · 93#3,#4 (exclusion regression guards).

> Note: the 17 listed are the load-bearing P0 ACs; counting independently, the distinct P0 AC ids above total 18 — all FULL either way.

| | Total | FULL (automated) | % |
|--|-------|------------------|---|
| **P0** | 18 | 18 | **100%** |
| P1 | 18 | 18 | 100% |
| P2 (docs/onboarding incl. 85/86/92/94 + 90#4) | 25 | n/a (inspection) | 100% by inspection |

Every P0 outcome has real, regression-catching vitest coverage (unit + real-binary e2e). The exclusion guards (93#3/#4) and the un-nested/verbatim-strip assertions (89#1-#3, 90#2/#5/#6) are non-vacuous (sentinel-content + archive-listing comparisons).

---

## Gate decision

Applying the trace gate decision tree (step-05): P0 coverage = 100% (required 100%) ✓; overall coverage = 100% (min 80%) ✓; P1 coverage = 100% (target 90%) ✓; oracle = formal acceptance criteria, high confidence (not synthetic). No critical gaps.

### Interim gate verdict: **PASS**

- **0 gaps.** All 61 epic-3 ACs are covered: 36 by automated vitest tests, 25 by inspection (the docs/skill tasks 85/86/92/94 + the documentation-outcome AC 90#4 — verified by doc/skill state, which is the correct mode for those ACs).
- Cold suite GREEN at trace time: tsc 0 / biome 0 (195) / build 0 / vitest 1217 passed (96 files).

### Non-blocking observations (recommendations, not gate failures)

1. **TASK-92 reference not under automated guard** — `quality-protocol.md` exists and is correct, but `installer-builder-skill.test.ts`'s `REFERENCES` array still lists only the original three. Extending it would bring the new reference under the existence/depth/linked-by-SKILL.md checks. (Recommendation; AC is inspection-class.)
2. **TASK-90 AC#4 / TASK-88 AC#4 wording** — the reserved-prefix convention (90#4) is doc-state only; the no-workspace message's verbatim "run `wpm init` / pass `-C`" suggestion (88#4) is not string-asserted (the marker-naming, non-zero exit, and `-C` recovery all are). Both are acceptable; an optional string assertion would close the wording nuance.
3. **TASK-95 (`--format git`)** — `--format git` does `git archive HEAD` and does not apply un-nesting/exclusions/strip. This is **outside epic-3's AC scope** (no epic-3 AC requires git-format un-nesting; default formats are tarball/zip) and is explicitly deferred to TASK-95. Flag for the NFR/handoff, not a coverage gap.

Recommended disposition: proceed to NFR assessment and the cold-start E2E re-run; this trace supports a PASS.
