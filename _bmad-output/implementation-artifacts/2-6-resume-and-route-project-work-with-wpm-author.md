---
baseline_commit: ae244ff20939812455503913e7bf151d6a93ac54
---

# Story 2.6: Resume and Route Project Work with `wpm-author`

Status: done

<!-- Created by literal bmad-create-story in YOLO mode for Backlog TASK-119. -->

## Story

As a fresh workspace authoring agent,
I want `wpm-author` to orient me and select the right work,
so that I can continue authoring without the bootstrap conversation.

## Acceptance Criteria

1. Given a fresh session at the workspace root; when `wpm-author` begins; then it identifies the authoring workspace, deliverable, build output, and authoring backlog from durable state, and it does not interpret executor-facing deliverable instructions as authoring instructions.
2. Given the authoring backlog contains in-progress work; when the agent asks to continue authoring; then all resumable work is surfaced before any new task is claimed, and continuing it creates no duplicate task.
3. Given no task is in progress and dependency-eligible authoring work exists; when the agent asks to continue; then exactly one eligible task can be claimed and is observable as the current work.
4. Given no task is in progress and no authoring work is dependency-eligible; when the agent asks to continue; then the backlog remains unchanged and the absence of eligible work is reported.
5. Given the current task concerns project-level authoring; when `wpm-author` handles it; then the task can reach its observable outcome without requiring a specialist skill, and its durable artifacts and authoring-backlog state remain coherent.
6. Given the current task concerns a bundle, recipe, agent skill or front door, or package review; when `wpm-author` routes it; then only the matching workspace specialist receives the focused work, and a missing or incompatible specialist produces integration-recovery guidance rather than an unrelated substitution.
7. Given the current directory is not a valid authoring workspace root, managed authoring state is missing or corrupt, or the authoring backlog is unavailable or malformed; when `wpm-author` begins or attempts to continue work; then every affected prerequisite is identified with one applicable recovery action.
8. Given `wpm-author` detects an invalid workspace, managed-state, or backlog context; when the authoring backlog and workspace artifacts are inspected afterward; then no task is claimed, resumed, or changed and no workspace artifact is mutated.
9. The exact packed WPM package exposes `wpm-author` independently without repository-relative resources.
10. Generated work-package deliverables contain no copy of the `wpm-author` workspace-authoring skill.

## Tasks / Subtasks

- [x] Author one portable, self-contained workspace router with the current official helper (AC: 1-8)
  - [x] Invoke the installed official Codex `skill-creator` and retain only the portable `SKILL.md` required by both supported clients.
  - [x] Orient only from the candidate workspace root, its canonical wrapper layout, and the exact managed-state pointer supplied by the native authoring front door; define only the smallest read contract required by this skill and leave integration/state creation and reconciliation to Story 2.7 / TASK-120.
  - [x] Preflight workspace, managed state, complete backlog observations, selected task classification, and any required specialist before the first task-status mutation; aggregate every affected prerequisite and preserve all workspace/backlog state on predictable failure.
  - [x] Surface every In Progress task before selection; when none exist, combine the plain task list, dependency sequence, and candidate task records to claim at most one eligible task through Backlog.md's CLI.
  - [x] Handle project-level work directly and route bundle, recipe, skill/front-door, or package-review work to exactly one matching installed specialist, with integration recovery and no substitution when compatibility cannot be proven.
- [x] Add focused deterministic orientation, selection, and routing evidence (AC: 1-8)
  - [x] Prove wrapper/deliverable/build/backlog separation, authoring-versus-executor front-door separation, exact managed-state consumption, aggregate invalid-context reporting, and zero mutation on preflight failure.
  - [x] Prove all-active-first behavior, no duplicate task, complete dependency preflight, exactly one status mutation on claim, no-eligible/no-write behavior, direct project work, unique specialist routing, and missing/incompatible-specialist recovery.
  - [x] Prove identical Codex and Claude Code native path/frontmatter/discovery and explicit identity plus focused trigger and unrelated non-trigger behavior.
- [x] Prove exact package and generated-deliverable boundaries (AC: 9-10)
  - [x] Extend the clean exact-package harness, extract the accepted archive, delete its source checkout, and re-read identical `wpm-author` bytes from both native workspace placements.
  - [x] Plant unique copies in both authoring-client skill paths and reject their paths and marker bytes from representative tar, Git, and conditional zip deliverables.
  - [x] Record fresh live Codex discovery, explicit invocation, unnamed natural activation, unrelated non-trigger, and a representative observable orientation/routing outcome from the accepted installed tarball; do not invoke or claim live Claude behavior.
- [x] Run proportional quality gates (AC: 1-10)
  - [x] Run the official validator, focused unit/package/non-leakage bands, typecheck, Biome, build, and diff checks; reserve the exact full `npm test` for independent review.

## Dev Notes

### Goal and Boundary

This story adds one packaged instruction surface. It does not add a router engine, task model, managed-state
subsystem, CLI command, core operation, adapter, schema, or workspace installer. `wpm-author` guides a fresh
agent through existing durable workspace surfaces and Backlog.md's own CLI. TASK-120 owns creating, writing,
versioning, reconciling, and migrating workspace integration and managed authoring state.

The skill may read only the narrow integration handshake required to prove that the current directory and
installed specialist family belong together. The native root authoring front door must supply one exact
root-relative managed-state path. From that record the skill consumes only the declared workspace-root
identity, coherent WPM integration version, and the owned relative path plus version for `wpm-author` and any
specialist selected for the current task. Do not scan for alternative state files, infer a filename, repair or
write the record, or turn this read contract into a general state API. If the pointer or required fields are
absent, corrupt, outside the root, or incompatible, report managed integration as affected and direct the user
to reapply/verify workspace integration; do not claim or resume work.

### Workspace Orientation and Front-Door Boundary

- Begin at the current directory and require it to be the candidate workspace root. Do not walk upward, run
  initialization, adopt another directory, or search for a plausible workspace.
- Resolve and report the canonical authoring wrapper surfaces: the workspace root itself, `wip/` as the
  deliverable, `builds/` as isolated build output, and `.authoring-backlog/` as the Backlog.md root. Require
  `wip/manifest.yml` and the managed-state handshake above; prove all resolved paths stay within the declared
  root and represent their expected kinds.
- The root `AGENTS.md` or `CLAUDE.md` selected by workspace integration is the authoring front door. The
  deliverable's editable `wip/_AGENTS.md`, per-bundle `_AGENTS.md`, any generated deliverable `AGENTS.md`, and
  content under `builds/` are executor-facing artifacts or output. Inspect them only when the current task
  requires it; never treat them as instructions for this authoring session.
- Never use `.authoring-backlog/` alone as the workspace marker: it is gitignored working state. Validate all
  three prerequisite groups independently—workspace layout, managed integration, and Backlog.md—and return
  every affected group in stable order with exactly one applicable recovery per group before any mutation.

### Backlog Observation, Resume, and Claim

Backlog.md remains the sole task store and is operated only through its CLI from `.authoring-backlog/`. The
skill never reads or edits task Markdown, indexes, or configuration directly.

1. Run `backlog task list --plain` and retain the complete snapshot. Surface every task whose status is
   `In Progress` before choosing or claiming anything.
2. Run `backlog sequence list --plain`. Read each In Progress record and every potentially selectable task
   with `backlog task <id> --plain`; do not infer eligibility, dependencies, acceptance criteria, task scope,
   or specialist ownership from title or sequence position alone.
3. If one or more tasks are In Progress, claim nothing. Report all of them. Continue the sole active task only
   after naming it; if several are active, require the author to select one. Resuming preserves the existing
   identity/status and creates no task.
4. If none is active, evaluate the complete plain-list/sequence/record snapshot. Dependency eligibility means
   a readable, consistent `To Do` task whose listed dependencies are all `Done`. Use dependency-sequence order
   and then the records' existing order/identity as the deterministic tie-break; do not invent or reorder work.
   Preflight the first eligible task's classification and any uniquely required compatible specialist next.
   A classification or specialist defect blocks that task; it does not redefine eligibility or permit
   skipping to unrelated work.
5. Preflight every observation and the selected route first. Immediately before selection, repeat the plain
   list, dependency sequence, selected-task record, and every dependency record; drift restarts orientation
   without mutation. Only inside a serialized selection boundary may the skill claim the task with exactly
   one status mutation: `backlog task edit <id> -s "In Progress"`. Repeat those CLI reads after the edit and
   report it as current only when they agree. Do not retry, roll back, or mutate a second task on uncertainty.
6. If no readable `To Do` task has all dependencies `Done`, report that no dependency-eligible work exists and
   make no Backlog or workspace mutation. A malformed or contradictory snapshot is a blocked backlog
   prerequisite, not an empty backlog.

The three commands above form one fresh logical snapshot; if their identities, statuses, or dependencies do
not agree, stop without mutation and rerun orientation after the backlog is repaired through its normal CLI.
The Backlog CLI exposes no conditional status edit, so this instruction surface neither invents one nor claims
cross-session atomic ownership: selection must be serialized, or the skill stops without mutation and asks
the author/coordinator to serialize it.

### Direct Work and Unique Specialist Routing

- A clearly project-level task remains in this `wpm-author` session. Execute its observable acceptance
  outcomes using the workspace's authoring rules and normal tools, preserve durable artifacts, verify before
  changing task state, and use only Backlog.md's CLI for task updates. Do not require a specialist merely to
  edit project-level metadata, targets, package-wide authoring content, or other unambiguously project work.
- Route one bundle's capability boundary, metadata, dependencies, payload registration, or lifecycle to
  `wpm-author-bundle`.
- Route install-backlog recipe detect/setup/verify/state/migration work to `wpm-author-recipe`.
- Route an advisor, installer helper, payload skill, or native front door to `wpm-author-skill`.
- Route whole-package structure/reference/registration/version/executor/non-leakage/release-readiness review
  to `wpm-review-package`.
- Choose from the task record's requested outcome and acceptance criteria, not a keyword-only title match. A
  task that spans or ambiguously matches several specialist domains is not silently split or guessed: report
  the classification boundary and ask for the task to be clarified through Backlog.md.
- Before claim or routing, prove the one matching specialist is recorded as WPM-owned at the exact relative
  path and coherent version in managed state and that its `SKILL.md` identity matches. Invoke only that skill.
  Never substitute another WPM skill, a personal/global copy, the legacy `installer-builder`, or a
  repository-relative source copy. Missing, stale, mismatched, or multiply-owned evidence receives one
  recovery: reapply and verify workspace integration.

Routing transfers only the focused current task, its acceptance criteria, and the already validated workspace
root. It does not load all specialists or let a specialist select/claim a different backlog task.

### Result Contract and Failure Atomicity

Return one stable result containing the declared workspace root; the `wip/`, `builds/`, and
`.authoring-backlog/` identities; managed integration/version evidence; every In Progress task; the current or
selected task and dependency evidence; classification (`project` or one exact specialist); selection action
(`resumed`, `claimed`, `none`, or `blocked`); dispatch action (`handled-directly`, `routed`, `none`, or
`blocked`); and any affected prerequisite with one recovery.

Complete all predictable reads and compatibility checks before the first status mutation. On any invalid
workspace, managed-state, Backlog.md, task-classification, or specialist prerequisite, do not invoke a
specialist, do not change task status/notes/criteria, and do not write workspace artifacts. Reporting a task
as resumable is a read result, not a status mutation; do not claim it was resumed when its prerequisites were
invalid.

### Skill Shape and Official Sources

- Create only `agent-skills/wpm-author/SKILL.md`. The bounded workflow needs no script, reference, asset,
  host-specific metadata, or product implementation change.
- Stable identity is `wpm-author`. Its description should front-load continuing work in a prepared WPM
  authoring workspace, mention resume/claim and focused specialist routing, and exclude work-package
  execution, direct specialist work already in scope, and unprepared/non-WPM directories.
- Codex native workspace placement is `.agents/skills/wpm-author/SKILL.md`, explicitly invoked as
  `$wpm-author`. Claude Code native project placement is `.claude/skills/wpm-author/SKILL.md`, explicitly
  invoked as `/wpm-author`. TASK-120 owns installation; this story proves identical portable bytes without
  touching real user scopes.
- Recheck during implementation the current official Codex Build skills guide
  (<https://learn.chatgpt.com/docs/build-skills>) and Claude Code skills guide
  (<https://code.claude.com/docs/en/skills>), and record access date plus installed helper/host versions.

Invoke the helper during implementation and record how its focused what/when description, smallest useful
instruction-only shape, explicit trigger/non-trigger tests, and forward-verifiable workflow influence the
asset. Deterministically prove both supported clients; run fresh live Codex only. Authenticated live Claude
parity remains the approved post-TASK-127 exact-revision gate and is neither invoked nor claimed here.

### Packaging and Testing

- Reuse the reviewed Story 2.2-2.5 skill-test patterns and clean-package harness. Add the asset to the generic
  declared expected ship set; do not add an artifact-specific package inspector.
- RED first while the asset is absent. Tests should verify state/order/mutation and routing relationships,
  not freeze incidental prose.
- Extend the clean synthetic-revision test to bind archive bytes to source, extract it, delete the source, and
  prove identical skill bytes at both native placements. Do not claim package-root discovery.
- Extend the real build band with planted copies in both native authoring paths and reject exact skill paths
  and marker bytes from tar, Git, and zip when available. Do not touch the source workspace.
- Live Codex must resolve `wpm` only from the accepted installed tarball, never repository `dist`; its
  representative session uses a disposable workspace/root/backlog/specialist fixture and reports an
  observable result without mutating unrelated or invalid state.
- Run `quick_validate.py`, focused Vitest bands, typecheck, Biome, build, and `git diff --check`. The
  independent reviewer owns the one exact full `npm test` after stable product/test bytes.

### Previous Story and Git Intelligence

- Stories 2.2-2.5 established the four mutually exclusive specialist boundaries, one-file portable shape,
  official-helper evidence, source-free dual-native extraction, accepted-installed-runtime Codex sessions,
  and planted multi-format non-leakage. Reuse their reviewed patterns.
- Baseline is `ae244ff20939812455503913e7bf151d6a93ac54`; it contains the independently approved TASK-118
  integration record after the four specialist skills. The canonical `docs/00`-`docs/14` remain the fixed
  product/model/style authority.

### Expected File Boundaries

- New: `agent-skills/wpm-author/SKILL.md`, one focused unit test, this story, and TASK-119 QA summary.
- Modified only as needed: the existing clean-package and real-build non-leakage tests plus live sprint
  tracker.
- Do not change `src/`, CLI/domain/schema/template/dependency files, other skills, Backlog,
  `.bmad/sdlc-state.yaml`, planning artifacts, `AGENTS.md`, `docs/SDLC.md`, `.serena`, branch, commits, or merges.

### References

- [Source: backlog task TASK-119 --plain]
- [Source: backlog task TASK-120 --plain; managed integration ownership only]
- [Source: docs/10-authoring-cli.md#Project-resolution]
- [Source: docs/11-authoring-process.md#Workspace-layout]
- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#Story-26-Resume-and-Route-Project-Work-with-wpm-author]
- [Source: _bmad-output/planning-artifacts/prd.md#Workspace-authoring-skills-integration-and-handoff]
- [Source: _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-21-final.md]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-08-22.md]
- [Source: _bmad-output/implementation-artifacts/2-2-plan-and-change-bundles-with-wpm-author-bundle.md]
- [Source: _bmad-output/implementation-artifacts/2-3-author-install-recipes-with-wpm-author-recipe.md]
- [Source: _bmad-output/implementation-artifacts/2-4-author-agent-skills-and-front-doors-with-wpm-author-skill.md]
- [Source: _bmad-output/implementation-artifacts/2-5-review-work-packages-with-wpm-review-package.md]
- [Source: test/integration/distribution-preparation/package-preparation.test.ts]
- [Source: test/integration/cli.build.e2e.test.ts]
- [Source: https://learn.chatgpt.com/docs/build-skills]
- [Source: https://code.claude.com/docs/en/skills]

## Dev Agent Record

### Agent Model Used

GPT-5.6 Codex

### Implementation Plan

- Keep the product change to one portable instruction-only skill with a deliberately narrow, read-only
  managed-integration handshake.
- Specify and test complete root/backlog/specialist preflight, all-active-first behavior, one-mutation claim,
  direct project handling, and exactly-one specialist routing with fail-closed recovery.
- Extend the existing exact clean-package and multi-format generated-deliverable non-leakage harnesses for
  source-free dual-native availability.
- Validate both native contracts deterministically and run fresh accepted-tarball Codex discovery, trigger,
  non-trigger, and observable outcome sessions; retain live Claude parity for the approved final gate.

### Debug Log References

- Literal `bmad-create-story` invoked in YOLO mode. Customization resolver found no workflow override,
  activation prepend/append step, completion hook, or matching project-context fact.
- Literal `bmad-dev-story` invoked in YOLO mode with the same empty customization/hook result. The focused
  router contract first failed 13/13 cases because the asset was absent, then passed 13/13 after the official
  helper scaffold was reduced to one portable instruction file.
- Official `skill-creator` `init_skill.py` and `quick_validate.py` were freshly invoked; current official Codex,
  Claude Code, and Anthropic skill-authoring sources were accessed on 2026-08-23.
- Literal `bmad-qa-generate-e2e-tests` invoked in YOLO mode. Its resolver found no override, activation step,
  completion hook, or matching project-context fact; the applicable four-file QA band passed 16/16 selected
  tests with 40 unrelated cases skipped.

### Completion Notes List

- Added only `agent-skills/wpm-author/SKILL.md`: a one-file, instruction-only router that orients from the exact
  candidate root/front-door pointer, reads only the narrow TASK-119 managed-integration handshake, aggregates
  root/state/backlog blockers without mutation, and leaves all state writes/reconciliation to TASK-120.
- The router takes one complete Backlog CLI list/sequence/record snapshot, surfaces every active task first,
  claims at most one fully preflighted eligible task through one status edit, handles project work directly,
  and routes exactly one compatible bundle/recipe/skill/review specialist without substitution.
- Added 13 focused unit cases and extended the generic exact-package/source-free/dual-native and real
  tar/Git/conditional-zip non-leak harnesses. Stable dev evidence: 77/77 selected tests plus a focused
  generated-deliverable test, official validator, typecheck, Biome over 245 files, build, and diff check PASS.
- Worker pre-review accepted-package evidence: synthetic revision `8bc3be105e6e4209c2142863ad1a307d28cde6c5`,
  434-entry 485,658-byte
  archive SHA-256 `f176a94c1cc42b24c7bbfc7ba9a4c02d227112bdb7ae8f6be01653aab5298cb3`, and identical
  source/extracted/installed/native skill SHA-256
  `2442bc340515453000878fac915b45be9d131a100368761bce0acef0a36d6a78` after source deletion.
- Fresh Codex `0.148.0` proved discovery, explicit use, unnamed natural activation, unrelated non-trigger,
  no-write active-task orientation, and exactly-one-claim outcome against that installed archive. Installed
  Claude Code `2.1.158` is recorded only for the deterministic native-byte contract; no live Claude/auth/host
  upgrade was invoked. At worker handoff, the full `npm test` remained reserved for independent review.

## File List

- `_bmad-output/implementation-artifacts/2-6-resume-and-route-project-work-with-wpm-author.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-119.md`
- `agent-skills/wpm-author/SKILL.md`
- `test/unit/agent-skills/wpm-author-router-skill.test.ts`
- `test/integration/distribution-preparation/package-preparation.test.ts`
- `test/integration/cli.build.e2e.test.ts`

## Senior Developer Review (AI)

### Review Outcome

**APPROVE — 0 open findings.** The independent reviewer literally invoked
`bmad-story-automator-review` in auto-fix mode, audited all ten acceptance criteria, resolved five HIGH and
three MEDIUM findings, and obtained a zero-open follow-up audit before the stable full gate.

### Findings Resolved

- **HIGH — stale selection and incomplete claim verification:** the router now applies a CLI-only freshness
  barrier immediately before selection and repeats list, sequence, selected-task, and dependency reads after
  the single status edit. Drift or uncertain post-edit evidence blocks dispatch without a retry, rollback, or
  second mutation.
- **HIGH — project work incorrectly depended on specialist compatibility:** compatibility is now conditional
  on a specialist classification, so unambiguous project-level work remains directly selectable and
  executable by `wpm-author`.
- **HIGH — TASK-120 ownership overlap:** deliverable executor-front-door content remains a
  `wpm-author-skill` concern, while workspace-root authoring-front-door installation, managed state, schema,
  reconciliation, and repair remain exclusively owned by TASK-120.
- **HIGH — dependency eligibility was conflated with route readiness:** eligibility now means only a readable
  `To Do` record whose dependencies are `Done`; classification or specialist failure blocks that first
  eligible task and cannot hide it as `none` or skip to unrelated work.
- **HIGH — cross-session atomicity was overstated:** Backlog.md exposes no conditional status edit. The router
  now names serialized selection as its supported boundary, refuses a claim when concurrent selection cannot
  be excluded, and does not misrepresent freshness reads as multi-agent claim ownership.
- **MEDIUM — selection and dispatch were conflated:** the result contract now reports selection
  (`resumed`, `claimed`, `none`, or `blocked`) independently from dispatch (`handled-directly`, `routed`,
  `none`, or `blocked`).
- **MEDIUM — Git-format evidence could reuse a stale tarball:** the test deletes and proves absence of the
  tarball before the Git build, then requires a newly produced archive before inspecting its layout and bytes.
- **MEDIUM — canonical deliverable non-leak evidence was incomplete:** the real-build harness now snapshots
  `wip/`, proves the exact router path and marker are absent, and rechecks identical sentinel-free bytes after
  tar, Git, and conditional-zip builds.

### Acceptance and Gate Evidence

- Acceptance audit: **10/10 PASS**. Durable root/`wip`/`builds`/Backlog orientation and executor-front-door
  separation are explicit; all active work is surfaced first; serialized selection performs at most one
  dependency-eligible claim with freshness and post-edit reads; no-eligible and invalid contexts are no-write;
  project work stays direct; specialist routing is exact and fail-closed; invalid prerequisites aggregate;
  the exact packed skill is source-free and dual-native; and planted native copies cannot leak into `wip/` or
  tar/Git/conditional-zip deliverables.
- Focused/static gates: official `quick_validate.py`, router unit **13/13**, authoring-skill/package band
  **7/7 files and 77/77 tests**, fresh Git/non-leak target **1 passed with 25 unrelated cases skipped**,
  typecheck, Biome over 245 files, build, and diff check all passed. The pre-review literal QA result remains
  **4/4 files and 16/16 selected tests**.
- Stable full gate: exactly one `npm test` passed **125/125 files and 1568/1568 tests** in 441.61s. No product
  or test byte changed afterward.
- Exact source-free package: clean synthetic revision
  `f36b0049d9396d3d5f8369dfceaad648fa758e30`; accepted 434-entry, 486,720-byte archive SHA-256
  `ea6bd67fc468c077c4a782ad40fb136a5f4ea5567bb939f81f8c128575309f11`; source, extracted, installed, and
  both native router copies SHA-256 `272d37019235bec9ea657e49e1401f452a3b5f732ae47c887fa93b9e0984a8c8`.
  The validated synthetic source was deleted while archive, extracted, and installed evidence stayed readable.
- Fresh Codex `0.148.0` sessions passed exact five-skill discovery, explicit invocation, unnamed natural
  activation, unrelated `42` non-trigger, two no-write active-task orientations, and a serialized isolated
  claim that performed exactly one Backlog status edit, verified `AUTHORING-2` as the sole active task, and
  stopped with dispatch `none`. The active fixture retained aggregate SHA-256
  `b71a37641004ac6366d53943064238fd3679388303249e7b386eec9bac868932`. No live Claude or host/auth upgrade
  was invoked; Claude parity remains deferred until after TASK-127.
- Stable product/test aggregate SHA-256:
  `a56f019c24c4cb3f05a4f945d264e2158f53a9d411193611bf33f739c5ea2653`.

## Change Log

- 2026-08-23: Created Story 2.6 from Backlog TASK-119 via literal `bmad-create-story` in YOLO mode.
- 2026-08-23: Implemented the one-file router via literal `bmad-dev-story`; added focused package/non-leak
  automation and accepted-package Codex evidence.
- 2026-08-23: Literal `bmad-qa-generate-e2e-tests` completed 10/10 AC trace and moved the story to review.
- 2026-08-23: Literal independent auto-fix review resolved five HIGH and three MEDIUM findings, reached 0
  open findings, passed focused/static/package/live-Codex evidence plus the one stable full gate, and marked
  the story done.
