---
baseline_commit: 9da1240f2b6412c1b6eed653c12e03ae74f78ce2
---

# Story 2.11: Complete the Cold Packed-Install-to-Handoff Journey

Status: done

<!-- Created by literal bmad-create-story in YOLO mode for Backlog TASK-124. -->

## Story

As a package author or bootstrap agent,
I want the exact local WPM package to support onboarding from a cold environment,
so that the consumer journey is proven without source-checkout state or a prior authoring conversation.

## Acceptance Criteria

1. Given the exact verified local package and a fresh supported environment without its source checkout or WPM skills; when the package is installed but setup has not been invoked; then its CLI and every resource in the final revision's declared ship set resolve successfully without repository-relative state.
2. Given the exact verified local package is installed but setup has not been invoked; when Codex and Claude Code personal and workspace configurations are inspected; then every configuration remains unchanged.
3. Given Codex-only, Claude-Code-only, both-client, or explicit headless selection; when the installed package's single setup action completes; then only the selected personal scopes receive `wpm-create-package`.
4. Given installed-package setup succeeds; when its result is inspected; then it requires no repository-relative resource.
5. Given installed-package setup succeeds; when its user-facing result is inspected; then it provides one package-creation next action.
6. Given the installed bootstrap skill receives package intent and an explicit or retained authoring-client selection; when it creates or adopts the workspace; then every selected project scope contains the five workspace skills.
7. Given the installed bootstrap skill creates or adopts the workspace; when each selected project scope is inspected; then its native front door is present and routes first to `wpm-author`.
8. Given the installed bootstrap skill creates or adopts the workspace; when workspace-wide authoring state is inspected; then the workspace contains one shared core authoring backlog.
9. Given the installed bootstrap skill creates or adopts the workspace; when handoff and unselected integration surfaces are inspected; then one prepared handoff is present and unselected integrations are absent.
10. Given the revision under complete-family verification contains all six WPM-owned skill artifacts; when the installed package is inspected and exercised through selected personal and workspace fixtures; then `wpm-create-package`, `wpm-author`, `wpm-author-bundle`, `wpm-author-recipe`, `wpm-author-skill`, and `wpm-review-package` are each independently packaged, discoverable, and invocable.
11. Given an independently launched fresh agent starts at the recorded workspace root; when handoff verification runs with the expected handoff surfaces intact; then its actual working directory, configured clients, native front doors, five workspace skills, prepared receipt, and core authoring backlog are reported as agreeing.
12. Given fresh-agent handoff verification succeeds; when core authoring work is requested; then the agent can claim or resume that work.
13. Given fresh-agent handoff verification and authoring continuation succeed; when WPM's handoff claims are inspected; then WPM claims no process, authentication, session, or acceptance ownership.
14. Given that authoring workspace produces a work-package deliverable; when the deliverable boundary is inspected; then it contains no personal or workspace WPM skills, authoring backlog, managed onboarding state, handoff receipt, or workspace authoring front door.

## Tasks / Subtasks

- [x] Establish one accepted cold-package observation shared by the full journey (AC: 1-5, 10)
  - [x] Build and inspect one clean synthetic revision, freeze the exact accepted archive, install it into a disposable consumer, delete the synthetic source checkout, and keep every later assertion bound to that archive, revision, package root, and digest inventory.
  - [x] Snapshot the complete disposable HOME and workspace roots before and after inert package installation, not only named fixture files, and prove the install resolves the CLI plus the declared ship set without creating or changing any Codex/Claude personal or workspace surface.
  - [x] Exercise explicit headless setup in independent fresh HOME fixtures for Codex only, Claude Code only, and both; prove selected-only exact personal bytes, no unselected scope, no repository-relative resource, and exactly one client-native package-creation next action per selected result.
- [x] Exercise create and strict adoption from the installed package (AC: 6-9, 13)
  - [x] Create workspaces using both retained and explicit authoring-client selection while planting empty and deliberately opposite/nonempty `manifest.yml.targets`; prove authoring selection is authoritative and target bytes remain unchanged by personal/workspace onboarding.
  - [x] Exercise an exact controlled legacy workspace adoption through the installed CLI, then prepare handoff; prove create and adopt each converge to the selected five-skill family, selected native front door, one shared core backlog, one prepared receipt, and no unselected integration.
  - [x] Assert the returned bootstrap/handoff language stops at prepared next actions and never claims process spawn, authentication, session ownership, acceptance, fresh-agent execution, or authoring-task progress.
- [x] Prove all six skills and a fresh receiving-agent continuation independently (AC: 10-13)
  - [x] From the installed package after source deletion, construct six isolated client-native cells and prove each skill's exact packaged identity, directory/frontmatter discovery identity, explicit invocation, intended trigger, and adjacent non-trigger independently; add the missing dual-native parity for `wpm-author-bundle` without weakening the personal-versus-workspace scope boundary.
  - [x] Launch handoff verification from a fresh process at the recorded workspace root and prove root, configured clients, front doors, five skill digests, prepared receipt, and shared Backlog root agree.
  - [x] Use only the workspace's Backlog CLI contract to surface all active work, preflight eligibility, claim exactly one eligible core task when none is active, and rerun verification to prove resumable work without hand-editing Backlog or attributing the action to WPM bootstrap.
  - [x] Attempt one isolated fresh Codex continuation against the exact accepted archive only if host access reaches inference; record the truthful installed version, launcher/config isolation, prompt/outcome, and any single deterministic blocker. Do not retry quota/auth failures, mutate host auth, or invoke live Claude.
- [x] Compose complete deliverable non-leak and final evidence (AC: 1-14)
  - [x] Extend the existing TASK-95/TASK-118 tar, Git, and conditional-zip sentinels so all six skill identities, personal setup/quarantine state, workspace managed state, receipt, shared authoring backlog, and both native front doors are absent while original symlink, byte, manifest-target, and build behavior remains preserved.
  - [x] Run the focused cold-package/journey, six-skill, handoff/claim-resume, package-boundary, non-leak, lint, typecheck, boundary, supply-chain, and build gates; invoke literal QA in YOLO and leave the exact stable full `npm test` to the independent reviewer.

## Dev Notes

### Goal and Scope Boundary

Story 2.11 is the complete-family integration proof for the already approved Stories 2.3 through 2.10. It
must exercise their public installed-package contracts together from one exact accepted archive after the
synthetic source checkout is inaccessible. It supplements rather than replaces the focused artifact,
ownership, retry, handoff, and non-leak evidence owned by the earlier stories.

Default to journey/test/evidence changes. Do not add a new CLI command, state field, port, setup phase,
workspace subsystem, process launcher, auth/session manager, or agent-acceptance protocol unless an executable
RED proves a real product gap. Live Claude remains deferred until the post-TASK-127 exact-final-revision gate;
deterministic Claude Code compatibility is required now.

### One Cold Archive and Inert Installation

Reuse the installed-package harness's clean synthetic source and accepted inspection report. Record the exact
source revision, archive path/digest/size, installed package root, executable shims, and declared resources.
Delete the synthetic source before setup, workspace, skill-family, handoff, continuation, and build assertions.
All paths and commands after deletion must resolve from the installed package or the disposable workspace—no
`REPO_ROOT`, repository-relative resource fallback, or manual source copy may serve as journey evidence.

Installation is acquisition only. Snapshot the complete disposable HOME and workspace trees before and after
`npm install`/verification so an unexpected new personal/workspace file fails the test even if named sentinels
remain unchanged. The accepted archive may install package files inside the consumer package root; it must not
install a personal skill, workspace skill, front door, setup state, managed authoring state, receipt, or
Backlog wrapper until the corresponding explicit action runs.

### Selection Matrix and Target Independence

Use distinct HOME/workspace roots for Codex-only, Claude-Code-only, and both-client cases. Every setup call is
explicit and headless (`--client ... --json`), so stdin, ambient detection, the real HOME, and retained state
from another cell cannot authorize behavior. Assert exact package bytes at only the selected personal native
scope and the absence of the unselected scope. Success reports one next action for each selected client's
native invocation and no repository-relative prerequisite.

For workspace creation, exercise retained defaults and an explicit selection that differs from the retained
set. Plant both `targets: []` and a deliberately opposite/nonempty target selection; compare the manifest bytes
before/after any adoption or integration operation. Authoring-client selection decides personal/workspace
native surfaces and never reads, merges, or rewrites deliverable targets.

### Create, Adopt, Handoff, and Continuation

The created path should use installed `wpm init`; the adoption path should use an exact controlled legacy WPM
wrapper/backlog signature and the installed `authoring integrate` plus `authoring handoff prepare` surfaces.
Do not weaken strict legacy recognition to construct the test. For every selected client compare all five
workspace `SKILL.md` files to exact installed-package bytes and verify its managed front-door block routes
first to `wpm-author`. There is one workspace integration state, one handoff receipt, and one
`.authoring-backlog`; unselected native skills/front door are absent.

Fresh-agent verification is an independent process invocation whose actual cwd is the receipt's workspace
root. It must inspect both shared and per-client evidence, not reuse an earlier in-memory result. After a clean
verification, follow the narrow `wpm-author` contract through Backlog CLI reads: list every In Progress task;
if none is active, read sequence/task records, preflight all dependencies, and mutate exactly one eligible
task to In Progress. A second verification should report resumable work. This is receiving-agent evidence, not
a bootstrap or WPM claim, and Backlog files must never be hand-edited.

### Six Independent Skill Cells

The six artifacts are one personal bootstrap plus five workspace authoring skills. Once source is deleted,
exercise each from its exact installed-package bytes in an isolated native fixture. Each cell must bind:

- directory name and strict `name:` frontmatter identity;
- exact package digest and absence of repo-relative resources;
- client-native explicit invocation (`$name` for Codex, `/name` for Claude Code);
- one positive intent the description is expected to trigger; and
- one adjacent intent that must not trigger it or route to another family member.

Do not infer live-agent support from prose alone. Deterministic dual-native placement/identity evidence is the
portable contract; one bounded live Codex probe may add current discovery/outcome evidence. The current Claude
Code contract is deterministic only in this story. Preserve the scope split: only `wpm-create-package` is
personal, while the five focused skills are workspace-scoped.

### Non-Leak Composition

Extend the existing TASK-95/TASK-118 build harness rather than creating a weaker parallel check. Plant unique
path and byte sentinels for the personal bootstrap, every workspace skill, personal setup state and quarantine,
workspace integration state, handoff receipt, authoring backlog, and both native front doors. Check tar, Git,
and conditional zip inventories and extracted bytes while retaining all existing preservation checks for
original files, symlinks, targets, and build semantics.

### Client Contract and Live Boundary

Current supported native surfaces remain Codex personal `~/.agents/skills` and project `.agents/skills`, plus
Claude Code personal `~/.claude/skills` and project `.claude/skills`. Exact directory/frontmatter identity and
native invocation are part of the deterministic contract. A new top-level skill may require a fresh client
session; WPM may recommend reload but may not claim one occurred.

Attempt at most one fresh isolated Codex continuation using the accepted installed package and workspace. Keep
the real HOME and auth metadata unchanged, use an isolated `CODEX_HOME`/config, and report the installed Codex
version and exact launcher shape. If the known account quota or another deterministic host boundary blocks
inference, record it once as a deviation rather than retrying or treating it as acceptance evidence. Never run
live Claude in this story.

### Previous Story and Git Intelligence

- Story 2.10 is independently approved with 18/18 criteria and zero open findings. Its exact stable full gate
  passed 134 files and 1,823 tests; its final path-ordered product/test aggregate is
  `f55d6dd373a67aab8edd226eeac52759e365be85b9ff5573b93a0d18f75f0c62`.
- Preserve Story 2.10's strict selected-only setup, request-bound no-clobber quarantine, retained defaults,
  exact legacy migration, and real-HOME isolation. This journey consumes those public contracts; it does not
  relax their ownership or retry proof.
- Baseline `9da1240f2b6412c1b6eed653c12e03ae74f78ce2` is the state-integrated HEAD after the approved TASK-123 merge.

### Expected Project Structure

- Primary journey work belongs in `test/integration/distribution-preparation/packed-install.test.ts` and
  focused helpers beside it so one installed accepted archive can serve every cold cell without repeated pack.
- Exact six-skill package/identity coverage may extend
  `test/integration/distribution-preparation/package-preparation.test.ts` and the six existing skill unit tests;
  add the missing `wpm-author-bundle` dual-native parity without changing skill bytes unless a real defect is
  proven.
- Complete build exclusion belongs in the existing TASK-95/TASK-118 section of
  `test/integration/cli.build.e2e.test.ts`.
- A QA summary belongs at `_bmad-output/implementation-artifacts/tests/test-summary-task-124.md`.
- No production file or package manifest change is expected.

### References

- [Source: Backlog TASK-124]
- [Source: _bmad-output/planning-artifacts/prd.md]
- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#story-211-complete-the-cold-packed-install-to-handoff-journey]
- [Source: _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/review-first-run.md]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/review-friction.md]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/review-trust-recovery.md]
- [Source: _bmad-output/implementation-artifacts/2-10-configure-personal-authoring-clients-in-one-setup-action.md]
- [Source: _bmad-output/implementation-artifacts/tests/test-summary-task-123.md]
- [Source: test/integration/distribution-preparation/packed-install.test.ts]
- [Source: test/integration/distribution-preparation/package-preparation.test.ts]
- [Source: test/integration/cli.build.e2e.test.ts]
- [Source: agent-skills/wpm-create-package/SKILL.md]
- [Source: agent-skills/wpm-author/SKILL.md]

## Dev Agent Record

### Agent Model Used

GPT-5.6 Codex

### Implementation Plan

- Extend one exact accepted source-deleted archive journey with complete inert-root snapshots and isolated
  Codex-only, Claude-only, both-client, create, and strict-adopt fixtures.
- Add exact six-skill native identity/invocation/trigger cells and an independent installed-CLI verification
  plus Backlog claim/resume continuation, keeping current host probes supplementary.
- Compose all onboarding sentinels into the established tar/Git/conditional-zip non-leak proof and run focused
  package/static/build/QA gates before independent review.

### Debug Log References

- Literal `bmad-create-story` invoked in YOLO mode. Customization resolution found no workflow override,
  activation prepend/append step, completion hook, or matching `project-context.md` persistent fact.
- Literal `bmad-dev-story` invoked in YOLO mode. Customization resolution likewise found no workflow override,
  activation prepend/append step, completion hook, or matching `project-context.md` persistent fact.
- Literal `bmad-qa-generate-e2e-tests` invoked in YOLO mode. Its resolver found no workflow override,
  activation prepend/append step, completion hook, or matching `project-context.md` persistent fact.

### Completion Notes List

- Extended the installed-package verifier to compare complete disposable personal/workspace-root snapshots, so
  acquisition remains inert even for unexpected paths outside the named client fixtures.
- Proved one source-deleted accepted archive through isolated Codex-only, Claude-Code-only, and both-client
  personal setup, retained and explicit workspace creation, strict legacy adoption, prepared handoff,
  independent verification, Backlog-only claim/resume, and tar/Git/conditional-zip deliverable inspection.
- Bound all six skill cells to exact installed-package bytes and native Codex/Claude discovery and invocation;
  added the previously missing dual-native `wpm-author-bundle` parity without changing any skill or production
  behavior.
- The final focused gates passed: six skill unit files 76/76, package preparation 6/6, packed-install unit and
  journey 15/15, TASK-95/TASK-118 non-leak 2/2 (24 filtered), lint, typecheck, production build, and
  `git diff --check`.
  The repository has no standalone `check:boundaries` or `check:supply-chain` scripts; Biome enforces the core
  boundary and the accepted archive/package-preparation band supplies the package/supply-chain evidence.
- Supplementary live evidence used exact archive SHA-256
  `e17183b05c4c446748c9c3bd2d6c9c513dedd89507faf813f01cf3f543022795` and `codex-cli 0.148.0` in one
  disposable ephemeral session (`01a03487-b231-7721-91bf-2c96e88c6ecc`). Codex discovered and invoked
  `wpm-author`, then its host sandbox blocked workspace shell execution with
  `bwrap: execvp .../codex: Permission denied`; it truthfully returned blocked with no task mutation. No retry,
  live Claude invocation, real-HOME write, or auth mutation occurred; an independent Backlog postread showed
  all eight authoring tasks still To Do. The deterministic accepted-archive journey remains the acceptance
  evidence.
- The disposable live init initially exposed a missing `EDITOR` environment prerequisite at Backlog init. The
  generated Backlog was repaired only through `backlog config set defaultEditor vim`, then the identical WPM
  init request converged; no Backlog file was hand-edited.
- Literal `bmad-create-story`, `bmad-dev-story`, and `bmad-qa-generate-e2e-tests` ran in YOLO mode. All three
  customization resolvers found no override or hook; the dev and QA completion-hook resolvers were empty.
- No production/domain subsystem or package manifest changed. The exact stable full `npm test` is intentionally
  reserved for the independent reviewer.

### File List

- `_bmad-output/implementation-artifacts/2-11-complete-the-cold-packed-install-to-handoff-journey.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-124.md`
- `distribution-preparation/verify-packed-install.js`
- `test/integration/cli.build.e2e.test.ts`
- `test/integration/distribution-preparation/packed-install.test.ts`
- `test/unit/agent-skills/wpm-author-bundle-skill.test.ts`
- `test/unit/distribution-preparation/packed-install.test.ts`

## Change Log

- 2026-08-24: Created the implementation-ready Story 2.11 contract from Backlog TASK-124 and the final
  reviewed TASK-123 evidence via literal `bmad-create-story` in YOLO mode.
- 2026-08-24: Completed the cold source-deleted accepted-archive journey, six-skill/native identity matrix,
  create/adopt handoff and Backlog continuation, complete non-leak composition, focused QA, and one bounded
  truthful Codex probe; moved Story 2.11 to review.
- 2026-08-24: Literal `bmad-story-automator-review` auto-fixed cold-environment isolation, exact matrix/
  continuation/non-leak evidence, and the full-gate timeout seam; 14/14 ACs pass with zero open findings,
  stable full `npm test` green, and Story 2.11 approved/done.

## Senior Developer Review (AI)

### Reviewer and Verdict

- Reviewer: independent persistent reviewer, literal `bmad-story-automator-review` in auto-fix mode.
- Date: 2026-08-24.
- Verdict: **APPROVE — 14/14 acceptance criteria pass; 0 open findings.**
- Stable product/test aggregate (path-sorted five-file SHA-256):
  `742d7ac8237647f099850755c0fe2b2c9a5f2455160b778e8804b7a5b5b907fd`.

### Findings Resolved

1. Fresh child commands inherited ambient coding-client context. The verifier now removes `CODEX_*`,
   `CLAUDE_*`, and Claude Code's underscore-free `CLAUDECODE` session sentinel, with a focused unit contract.
2. Selected-only setup and workspace evidence was incomplete. The final matrix proves exact personal skill
   inventories, unchanged selected/unselected client configuration, an unchanged workspace for every fresh
   setup cell, exact receipt clients, exactly five selected workspace skills, no unselected native root, and
   one shared Backlog root independent of empty/opposite manifest targets.
3. Six-skill and continuation checks contained causal gaps. The final fixture scanner binds directory,
   frontmatter, native invocation, trigger/non-trigger contract, and exact package bytes; the Backlog band
   reads every task, checks dependencies and route classification, repeats a byte-identical freshness barrier,
   claims exactly one eligible task, proves every peer unchanged, and reverifies resumable work.
4. Source-free/non-leak preservation was too narrow. The final evidence excludes actual source/checkout paths,
   setup/quarantine/managed/front-door/backlog surfaces across tar/Git/conditional zip, and proves complete
   workspace/deliverable preservation outside expected build outputs.
5. The first full gate exposed a real reliability seam: the outer verifier was killed at the same 300-second
   boundary as a cold npm dependency install. Ordered bounded budgets now use 600 seconds for the install,
   660 seconds for the outer npm process, and 720 seconds for the complete journey so failures remain truthful.

### Acceptance and Gate Evidence

- AC1-10 and AC13-14: causally covered by the final source-deleted accepted archive, isolated setup/create/
  adopt fixtures, exact native skill/front-door/state/receipt assertions, Backlog continuation, and composed
  multi-format non-leak/preservation checks.
- AC11-12: accepted under the approved compositional readiness policy, not as a successful current live run.
  Current exact installed-package handoff/claim-resume evidence composes with unchanged `wpm-author` bytes
  (`272d37019235bec9ea657e49e1401f452a3b5f732ae47c887fa93b9e0984a8c8`) and prior byte-bound live Codex
  discovery/claim evidence. The single current Codex probe remains explicitly **BLOCKED** by host `bwrap`,
  made no task mutation, and is supplementary only. Live Claude remains deferred until post-TASK-127.
- Final accepted source-deleted package: synthetic revision
  `d2375eec330c5d3973166b93d2010e483788aa70`; `wpm-0.1.0.tgz` SHA-256
  `2efd78fb057b442e0f06b30757983995ea08f4fcb31cc3b4e94ab82a39f365d1`; 625,313 bytes; zero boundary
  violations; installed CLI/resources accepted; full HOME/workspace configuration roots unchanged; all six
  skill bytes exact; no packaged `src/` or `test/`.
- Focused/static gates: packed-install unit/journey 15/15; six skill units plus package preparation 82/82;
  TASK-95/TASK-118 non-leak 2/2; typecheck, Biome lint, build, and `git diff --check` pass.
- First full attempt: 133/134 files and 1,823/1,824 tests, with the sole failure the diagnosed 300-second outer
  timeout. After the executable/test timeout fix and new stable hash, the required replacement full
  `npm test` passed **134/134 files and 1,824/1,824 tests** in 467.64 seconds.
