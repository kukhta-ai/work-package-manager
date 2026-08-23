---
baseline_commit: d95d9032e5042c237e47e0fe0dd910385b191561
---

# Story 2.7: Deliver and Reconcile Workspace Authoring Integration

Status: done

<!-- Created by literal bmad-create-story in YOLO mode for Backlog TASK-120. -->

## Story

As a work-package author,
I want each explicitly selected authoring client to receive the workspace's WPM authoring integration,
so that supported agents can author safely without depending on personal authoring state.

## Acceptance Criteria

1. Given an explicit non-empty selection of supported workspace authoring clients; when workspace integration is applied; then only the selected clients receive their native workspace scopes and front doors.
2. Given an explicit workspace authoring-client selection; when workspace integration reads or records that selection; then the selection neither derives from nor changes the deliverable's target agents.
3. Given the workspace authoring-client selection is empty or contains an unsupported client; when integration is requested; then the selection is rejected with a machine-distinguishable result.
4. Given workspace integration rejects its authoring-client selection; when workspace and deliverable surfaces are inspected afterward; then every surface remains unchanged.
5. Given workspace creation or adoption has a predictable target, Backlog.md, authoring-task-plan, selected-client, destination, or ownership conflict; when the complete workspace request is evaluated; then every predictable blocker and its recovery are reported before the first write.
6. Given the complete workspace request has a predictable blocker; when workspace, integration, authoring-backlog, and handoff surfaces are inspected afterward; then every surface remains unchanged.
7. Given the complete workspace request has a predictable blocker; when its operation result is inspected; then no prepared handoff is claimed.
8. Given workspace integration succeeds; when a selected client inspects its native scope; then `wpm-author`, `wpm-author-bundle`, `wpm-author-recipe`, `wpm-author-skill`, and `wpm-review-package` are independently available at one coherent WPM version.
9. Given workspace integration succeeds; when a selected client's native front door is inspected; then it directs a fresh authoring session first to `wpm-author`.
10. Given workspace integration succeeds; when package-owned installers, advisors, and payload skills are inspected; then they retain their package-owned names rather than acquiring the reserved `wpm-` prefix.
11. Given workspace integration has been applied; when its managed authoring state is inspected; then it records the selected clients, installed skill versions, WPM-owned paths, integration origin, and reconciliation facts outside `wip/`.
12. Given WPM-owned integration already exists alongside user-authored content; when integration is reapplied; then matching WPM-owned content remains unchanged and stale WPM-owned content converges to the requested version.
13. Given WPM-owned integration already exists alongside user-authored content; when integration is reapplied; then surrounding user-authored content is preserved.
14. Given workspace integration is applied or reapplied; when managed client scopes and front doors are inspected; then no duplicate managed integration exists.
15. Given an unforeseen failure occurs after integration writes begin; when the operation ends; then the typed non-success identifies completed, failed, and unattempted boundaries with recovery guidance and a non-zero result.
16. Given a reported partial integration write and the same authorized request; when the request is repeated after the failed boundary is recoverable; then managed integration converges without duplicate or corrupted content and without claiming generic rollback or resume.
17. Given a recognized WPM-owned legacy `installer-builder` workspace; when adoption succeeds; then the new family is available.
18. Given a recognized WPM-owned legacy workspace is adopted; when its deliverable and authoring backlog are inspected; then the deliverable is unchanged and the authoring-backlog history is preserved.
19. Given an integration path is unowned, user-modified, or ambiguously owned; when adoption is evaluated; then the conflict is reported before integration mutation.
20. Given adoption has an ownership conflict; when the integration path is inspected afterward; then its existing content remains unchanged.

## Tasks / Subtasks

- [x] Establish the complete read snapshot, pure plan, and typed result contracts (AC: 1-7, 11, 15-16, 19-20)
  - [x] Extend only the existing FileSystem and BacklogMd ports with the concrete read probes required to distinguish path kind/alias, bind owned file bytes, and prove Backlog.md availability before mutation; keep real/fake parity.
  - [x] Validate and canonicalize an explicit repeatable `codex`/`claude-code` selection independently of `manifest.targets`, with stable machine-distinguishable blocker codes and no inferred default.
  - [x] Load all template, mandatory-task-plan, packaged five-skill, workspace, backlog, managed-state, destination, and ownership facts before producing one ordered operation-specific plan; aggregate all safely discoverable predictable blockers with one recovery each.
  - [x] Add the architecture addendum's typed post-write non-success at the core/CLI boundary, preserving completed, failed, and unattempted plan boundaries plus forward recovery and exit 1 without a generic transaction, rollback, or resume system.
- [x] Materialise and reconcile the exact selected-client integration (AC: 1-2, 8-14)
  - [x] Install the exact five packaged WPM workspace skills into each selected native workspace scope and no unselected scope, preserving their names and recording one coherent package version.
  - [x] Manage one client-specific block in each selected native root front door, with the exact managed-state pointer and native invocation of `wpm-author`; preserve surrounding user bytes and prevent duplicate/orphan markers.
  - [x] Persist one minimal strict managed-authoring record outside `wip/` that satisfies Story 2.6's exact read handshake and carries selected clients, per-skill path/version/content ownership, origin, complete/applying status, and reconciliation facts.
  - [x] Reapply unchanged bytes as a no-op, update only proven WPM-owned stale bytes, retire only proven WPM-owned deselected integration, and fail before writes for modified or ambiguous ownership.
- [x] Integrate fresh creation, reapplication, retry, and strict legacy adoption (AC: 5-7, 12-20)
  - [x] Extend `wpm init` with an explicit repeatable authoring-client selection and preflight the entire creation plus integration request before its first write; retain target rejection for unrelated existing paths.
  - [x] Add one project-bound authoring-integration command for existing managed workspaces and strict recognized legacy adoption; do not add a separate detection/update/migration workflow.
  - [x] Recognize only the exact WPM-generated legacy authoring front-door model, migrate its owned surfaces, and preserve `wip/` plus `.authoring-backlog/` byte/state history; reject altered, unowned, or ambiguous lookalikes.
  - [x] Inject failures at ordered integration boundaries, prove typed partial evidence and non-zero CLI behavior, then repeat the identical authorized request and prove deterministic convergence without duplicates or corruption.
- [x] Prove real filesystem, CLI, package, and non-leak boundaries (AC: 1-20)
  - [x] Add focused in-memory planner/operation tests for both clients, one client, invalid selections, aggregate blockers, ownership/state parsing, managed-block preservation, version update, deselection, partial failure, retry, and legacy conflicts.
  - [x] Add real-filesystem and built-CLI coverage for fresh init, existing reapplication, legacy adoption, unchanged deliverable/backlog, help/selection behavior, and structured failure output.
  - [x] Extend exact packed/source-free evidence so the installed CLI resolves all five packaged source skills during workspace integration, and extend tar/Git/conditional-zip non-leakage for managed state and native workspace front doors without touching the deliverable.
  - [x] Run focused Vitest bands, typecheck, Biome, build, and `git diff --check`; reserve the stable full `npm test` for independent review.

## Dev Notes

### Goal and Ownership Boundary

Story 2.7 is the first product implementation of workspace-local WPM authoring integration. It owns creation,
writing, versioning, reapplication, strict legacy adoption, and reconciliation of only these workspace-wrapper
surfaces:

- `.agents/skills/{wpm-author,wpm-author-bundle,wpm-author-recipe,wpm-author-skill,wpm-review-package}/SKILL.md`
  for selected Codex integration;
- `.claude/skills/{wpm-author,wpm-author-bundle,wpm-author-recipe,wpm-author-skill,wpm-review-package}/SKILL.md`
  for selected Claude Code integration;
- selected native root front doors (`AGENTS.md` and/or `CLAUDE.md`); and
- one exact managed authoring-state record at the workspace root, outside `wip/`.

It does not own personal setup (Story 2.10/TASK-123), handoff receipt/prepared verification (Story
2.8/TASK-121), `wpm-create-package` (Story 2.9/TASK-122), template-defined task identity/materialisation
(Epic 3/TASK-125+), delivered package targets/content, live agent processes, or authenticated Claude behavior.
Do not create a generic ownership database, transaction journal, rollback/resume engine, task-reconstruction
store, fifth port, or separate required detect/update/migrate command.

### Final Story 2.6 Handshake

The independently reviewed `wpm-author` router consumes only the path named by the selected native root front
door. That state must let it prove the current workspace-root identity, one coherent WPM integration version,
and the WPM-owned relative directory path plus version for `wpm-author` and one routed specialist. The router
does not search for the record, infer its name, repair it, accept incomplete reconciliation, or broaden the
schema. The front door therefore names one exact root-relative state path, and the record exposes those facts
directly and strictly. A state record in an applying/failed/incompatible shape must remain rejectable by the
router until identical reapplication completes it.

The reviewed router also fixes the responsibility split: Story 2.7 owns workspace-root authoring front doors;
`wpm-author-skill` continues to own capability content and deliverable executor front doors such as
`wip/_AGENTS.md`. Never route this integration mutation through a skill or inspect executor instructions as
authoring instructions.

### Operation and CLI Shape

Refine names in code where existing conventions demand it, but keep these observable intents:

- `wpm init <name> --authoring-client <codex|claude-code>` accepts the repeatable explicit non-empty selection
  as part of one complete creation request. Existing init callers/tests must become explicit; no default may be
  inferred from HOME detection or `manifest.targets`.
- `wpm authoring integrate --client <codex|claude-code>` is the one project-bound reapply/adopt intent for an
  existing workspace. It resolves the normal workspace marker and does not invent another maintenance journey.
- `wpm authoring clients` stays read-only and advisory. Detection never authorizes or adds a client.

The operation input receives the installed package version and bundled `agent-skills/` root from the
composition root. The pure core must not import package JSON, `node:fs`, `node:crypto`, Commander, or execa.
Keep `commands -> operations -> services -> model`, with effects only through the existing FileSystem,
BacklogMd, Clock, and Environment ports. Only concrete capability reads demonstrated by tests may extend the
FileSystem/BacklogMd interfaces; no new port family is justified.

### Complete Preflight and Ordered Effects

LOAD gathers an immutable operation-specific snapshot. For fresh init, resolve/render both project and default
bundle templates, parse the prospective manifest/bundles, derive the mandatory authoring-task plan, validate
Backlog.md availability, validate all five packaged skill sources and their frontmatter identities, validate
the explicit selection, and evaluate every destination before any target write. For existing integration,
also read the project/backlog, exact managed-state path, owned destination kinds/content, and any strict legacy
evidence. CHECK is pure and returns all safely discoverable blockers in deterministic order or one complete
ordered plan.

The plan, not fresh ad hoc discovery, drives writes. Name logical boundaries finely enough that an injected
failure can truthfully report what completed, what failed, and what was not attempted. An atomic file write is
one boundary; record it complete only after success. Preserve the original cause for debug diagnostics, but
render stable boundary evidence and one forward recovery without parsing exception text. A predictable
preflight failure writes nothing and never emits a handoff-prepared claim.

An operation-specific `applying` state may retain the exact authorized request, prior owned state, and planned
owned paths needed for the identical request to recognize its own completed bytes. This is permitted only to
make this integration converge after a reported partial write; it is not a general resume protocol. A retry
may accept only exact desired bytes, exact prior WPM-owned bytes, or absence at a planned path. Any other state
is a new predictable ownership conflict before further mutation.

### Managed State and Ownership

Choose one small, exact root-relative state path and pin it in implementation/tests/front-door bytes. Keep the
schema strict, deterministic, source-free, and minimal. Its complete form needs:

- schema/status, canonical workspace-root identity, coherent integration/package version, and explicit selected
  client IDs in catalog order;
- stable origin (`created` or recognized legacy adoption) and reconciliation facts;
- one owned record per selected skill directory with client, exact relative path, skill identity, version, and
  content fingerprint; and
- one owned front-door record per selected client describing the exact managed block/path.

State never lives under `wip/`, never records or changes `manifest.targets`, never becomes a task store, and
never contains a handoff receipt. On a complete-state reapply, compare actual owned bytes with the recorded
prior fingerprint before update. Missing or mismatched owned bytes are conflicts, not permission to overwrite.

Use stable begin/end markers for one WPM-owned block inside each selected native front door. Replace only an
owned block; preserve every byte before and after it. Append a new block to user content only when the request
and existing managed state authorize adding that client and no WPM marker is present. Duplicate, nested,
orphaned, state-less, or modified markers are ambiguous and block before writes. Deselecting a client removes
only its proven owned block/skill directories; retain unrelated files and remove a front-door file only when no
user content remains.

### Strict Legacy Adoption

The only state-less existing workspace accepted for adoption is the exact WPM-generated legacy
`installer-builder` authoring-front-door model already produced by the current init path: a valid wrapper and
Backlog.md root, the exact rendered legacy `AGENTS.md`, and its exact WPM-created `CLAUDE.md` alias relationship.
Validate the complete legacy signature before the first adoption write. Do not use a name mention, nearby skill,
partial marker, or similar prose as ownership evidence. A changed legacy front door, unexpected alias kind or
target, occupied new skill path, malformed backlog, or any other ambiguous/unowned integration path blocks the
whole adoption and preserves it byte-for-byte.

Adoption changes only wrapper integration. Snapshot and prove `wip/` unchanged and compare the Backlog.md task
history before/after. It does not materialise, reconstruct, reconcile, rename, edit, or archive authoring tasks.

### Current Code to Reuse and Preserve

- `src/core/services/authoring-clients.ts` already freezes the exact IDs and native workspace skill/front-door
  mappings. Reuse it; do not duplicate a client catalog.
- `src/core/operations/authoring-clients.ts` is advisory inspection only. Selection remains an explicit
  operation input.
- `src/core/operations/init-project.ts` already owns fresh wrapper/deliverable/backlog creation, but currently
  discovers the bundle template and Backlog failures after writes and unconditionally writes legacy
  `AGENTS.md` plus a `CLAUDE.md` alias. Refactor its predictable reads into the complete plan and integrate the
  selected-client result without changing `wip/` semantics or mandatory task content.
- `src/core/operations/lifecycle.ts`, `src/core/model/operation.ts`, `src/core/errors.ts`, and `src/util/exit.ts`
  contain the existing success/domain-error boundaries. Add only the architecture addendum's typed progress
  non-success; do not turn the six-beat harness into a generic transaction manager.
- `src/core/ports/filesystem.ts`, `src/adapters/node-fs.ts`, and `src/adapters/memory-fs.ts` need real/fake parity
  for any exact path-kind/alias or byte-fingerprint read. Existing `exists`/`list` alone cannot distinguish a
  state-less symlink from a regular file safely.
- `src/core/ports/backlog.ts`, `src/adapters/backlog-cli.ts`, and `src/adapters/fake-backlog.ts` may gain only the
  side-effect-free availability/read evidence needed by preflight. Backlog.md remains the sole task store.
- `validateSkillFrontmatter` already validates packaged skill identity. The five reviewed skill directories are
  each exactly one portable `SKILL.md`; copy those exact package bytes, not repository-relative substitutes.
- Keep the existing legacy `templates/project/minimal/snippets/authoring-front-door.md.tmpl` available as the
  strict legacy signature. Put new WPM-owned managed front-door content in a packaged deterministic asset or
  equally single-sourced renderer; do not silently redefine the legacy signature before adoption can recognize
  it.

### Testing and Non-Leakage

RED first. Principal focused evidence should include:

- selection normalization, exact selected-only destinations, and manifest-target independence;
- aggregate preflight blocker codes/order/recoveries and whole-tree no-write snapshots;
- exact five-skill bytes/version/state handshake for Codex only, Claude Code only, and both;
- managed-block insertion/update/removal with byte-exact surrounding user content and no duplicates;
- complete-state unchanged no-op, stale version convergence, modified owned bytes, occupied paths, malformed
  state, and ambiguous marker failures;
- strict exact legacy adoption plus altered-file/alias/path conflict cases, with unchanged `wip/` and backlog;
- injected failure after at least one integration boundary, structured CLI output/exit 1, applying-state truth,
  and identical-request convergence;
- real NodeFileSystem/BacklogCli creation and adoption, plus built CLI help and selected-client behavior; and
- accepted exact package/source deletion installation resolving the five skills, while native workspace skill
  paths, root front doors, the managed-state path/marker, `.authoring-backlog/`, and wrapper bytes remain absent
  from real tar/Git/conditional-zip deliverables and leave the canonical `wip/` tree unchanged.

Do not run live clients or change host authentication/configuration. Story 2.7 changes no skill content, so it
does not repeat Story 2.2-2.6's skill-creator authoring evidence. Independent review owns the acceptance verdict
and stable-diff/full gate; the live supported-client matrix belongs to the post-TASK127 Phase-6 cold gate.

### Previous Story and Git Intelligence

- Final Story 2.6 review resolved stale selection, direct-project gating, front-door ownership overlap,
  eligibility-versus-route readiness, non-atomic claim wording, selection/dispatch conflation, stale Git
  evidence, and incomplete `wip/` non-leak evidence. Preserve those boundaries; this story supplies only the
  exact managed state and root front-door writes the router deliberately refused to invent.
- Baseline `d95d9032e5042c237e47e0fe0dd910385b191561` is the coordinator record after merge commit `ea1dba9` and
  reviewed TASK-119 product/test aggregate
  `a56f019c24c4cb3f05a4f945d264e2158f53a9d411193611bf33f739c5ea2653`.
- Current stack remains Node >=20, TypeScript 6.0.3, Commander 14.0.3, Vitest 4.1.7, Biome 2.4.16,
  Backlog.md 1.45.2, and WPM package version 0.1.0. No dependency change is required.
- Current official native facts refreshed 2026-08-23: Codex scans `.agents/skills` from CWD toward the repo
  root and reads root `AGENTS.md` for a session; Claude Code uses project `.claude/skills`, reads `CLAUDE.md`,
  live-reloads skill edits, and may require restart when the top-level skills directory is newly created.
  WPM reports guidance but never owns either process.

### Expected File Boundaries

Expected new/modified implementation homes are the existing model/error, service, operation, four-port adapter,
CLI, packaged-template/resource, and focused test tiers named above. Update shared init helpers/callers to pass
an explicit supported client. Extend the existing exact-package/public-surface and real-build non-leak harnesses
rather than creating artifact-specific packaging machinery.

Do not modify Backlog files directly, `.bmad/sdlc-state.yaml`, `AGENTS.md`, `docs/SDLC.md`, `.serena`, canonical
design docs, unrelated skills, branch/commit/merge state, personal scopes, HOME, or host auth.

### References

- [Source: backlog task TASK-120 --plain]
- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#Story-27-Deliver-and-Reconcile-Workspace-Authoring-Integration]
- [Source: _bmad-output/planning-artifacts/prd.md#Workspace-authoring-skills-integration-and-handoff]
- [Source: _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md#Core-Architectural-Decisions]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-21-final.md]
- [Source: _bmad-output/implementation-artifacts/2-6-resume-and-route-project-work-with-wpm-author.md]
- [Source: agent-skills/wpm-author/SKILL.md]
- [Source: src/core/services/authoring-clients.ts]
- [Source: src/core/operations/init-project.ts]
- [Source: src/core/ports/filesystem.ts]
- [Source: src/core/ports/backlog.ts]
- [Source: https://learn.chatgpt.com/docs/build-skills]
- [Source: https://code.claude.com/docs/en/skills]

## Dev Agent Record

### Agent Model Used

GPT-5.6 Codex

### Implementation Plan

- Build one operation-specific immutable snapshot and deterministic plan for fresh creation or existing
  reapply/adoption, using only the current four ports and the frozen authoring-client catalog.
- Pin the smallest strict managed-state/front-door handshake consumed by `wpm-author`, with exact ownership
  evidence and selected-client-only five-skill materialisation.
- Carry unforeseen write progress through one typed non-success and prove identical-request convergence by
  exact operation-owned bytes, never by rollback or generic resume.
- Validate with focused fake/real/CLI/package/non-leak tests and static/build gates before literal QA.

### Debug Log References

- Literal `bmad-create-story` invoked in YOLO mode. Customization resolver found no workflow override,
  activation prepend/append step, completion hook, or matching `project-context.md` fact.
- Literal `bmad-dev-story` invoked in YOLO mode. Its resolver supplied no workflow override or lifecycle hook;
  implementation and focused verification followed the story's operation, ownership, package, and non-leak
  boundaries.
- Literal `bmad-qa-generate-e2e-tests` invoked in YOLO mode. Its resolver supplied no workflow override,
  activation hook, completion hook, or matching `project-context.md` fact; the generated task-specific QA
  summary traces all 20 acceptance criteria to focused automation.
- Development probe deviation: the first disposable Backlog.md format probe omitted its intended temporary
  `cwd`, so the CLI changed repository `backlog/config.yml` and created accidental `TASK-128`. Work stopped on
  discovery; no Backlog file was hand-edited. The root coordinator restored `backlog/config.yml` exactly to
  HEAD (reported SHA prefix `1b6c2f0c`), removed only the accidental task through the root-owned recovery path,
  and verified `backlog task task-128 --plain` reports not found. All later Backlog probes used explicit
  temporary working directories; the intended TASK-120 record/status was preserved.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Added explicit `codex`/`claude-code` workspace integration to fresh init and existing-workspace adoption,
  including completion metadata, exact five-skill native installation, managed front doors, and the strict
  Story 2.6 state handshake without deriving from deliverable targets.
- Added fail-closed ownership/reconciliation planning, aggregate preflight, typed partial progress, strict
  legacy recognition, deterministic identical-request recovery, real/fake port parity, and atomic adapter
  behavior at filesystem and Backlog.md partial-write boundaries.
- Focused QA is green: 88 unit tests, 15 source-CLI tests, 21 real-adapter tests, 26 built-CLI tests, 17
  preparation/public-boundary tests, and 2 accepted packed/source-free tests. Typecheck, Biome over 249 files,
  build, and `git diff --check` pass. Independent review subsequently passed the final full gate recorded below;
  only the live supported-client matrix remains deferred to the approved post-TASK127 Phase-6 cold gate.
- Architecture realization refinement: Story 2.7 keeps fresh init and existing integration as bounded,
  operation-specific immutable observation/action plans instead of generalizing `lifecycle.ts` into a
  cross-operation transaction framework. Each planner captures all port evidence before its first effect,
  deterministically decides blockers/actions from those captured values, labels the existing six lifecycle
  beats in typed progress, and never replans after mutation starts. This preserves the fixed pure-core,
  injected-port, complete-preflight, deterministic-plan, typed-progress, and no-generic-resume principles;
  the literal shared LOAD/pure-CHECK harness shape in the architecture addendum is treated as a refinable
  proposal and intentionally not expanded into TASK-120 scope. Independent review must still disposition
  purity, preflight completeness, and data-safety from the implementation evidence.

### File List

- `_bmad-output/implementation-artifacts/2-7-deliver-and-reconcile-workspace-authoring-integration.md`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-120.md`
- `src/adapters/backlog-cli.ts`
- `src/adapters/fake-backlog.ts`
- `src/adapters/memory-fs.ts`
- `src/adapters/node-fs.ts`
- `src/cli.ts`
- `src/completion/enums.ts`
- `src/core/errors.ts`
- `src/core/operations/init-project.ts`
- `src/core/operations/workspace-authoring-integration.ts`
- `src/core/ports/backlog.ts`
- `src/core/ports/filesystem.ts`
- `src/core/ports/index.ts`
- `src/core/services/integrity.ts`
- `src/core/services/workspace-authoring-integration.ts`
- `src/util/exit.ts`
- `src/util/symlink.ts`
- `test/helpers/workspace.ts`
- `test/integration/adapters/backlog-cli.test.ts`
- `test/integration/adapters/backlog-parity.test.ts`
- `test/integration/adapters/node-fs.test.ts`
- `test/integration/cli.build.e2e.test.ts`
- `test/integration/cli.init.test.ts`
- `test/integration/cli.workspace-authoring-integration.test.ts`
- `test/integration/distribution-preparation/package-preparation.test.ts`
- `test/integration/distribution-preparation/packed-install.test.ts`
- `test/integration/distribution-preparation/public-surfaces.test.ts`
- `test/integration/docs-template-examples.e2e.test.ts`
- `test/unit/cli/skill-commands.test.ts`
- `test/unit/completion/completion.test.ts`
- `test/unit/operations/init-project.test.ts`
- `test/unit/operations/lifecycle.acceptance.test.ts`
- `test/unit/operations/lifecycle.test.ts`
- `test/unit/operations/workspace-authoring-integration.test.ts`
- `test/unit/templates/default-bundle.test.ts`
- `test/unit/util/symlink.test.ts`

## Senior Developer Review (AI)

### Review Outcome

**APPROVE — 0 open findings; 20/20 acceptance criteria PASS.** The independent reviewer literally invoked
`bmad-story-automator-review` in auto-fix mode, completed a separate post-fix read-only audit, and dispositioned
the approved operation-specific immutable-plan refinement as conforming to the pure-core/injected-port,
complete-preflight, typed-progress, and no-generic-resume principles.

### Findings Resolved

- **HIGH — a fresh partial init could mix package revisions:** the applying request key previously covered only
  caller flags, so an unattempted template output could be taken from changed packaged bytes on retry. Fresh init
  now fingerprints the complete rendered file/directory/alias/task/state plan before writing its applying record;
  changed plan bytes fail closed, while restoring the original plan converges.
- **MEDIUM — non-canonical versions could corrupt front-door ownership markers:** trim-only checks admitted
  partial/prefixed versions and newline/end-marker injection. Inputs and durable state now require the exact
  normalized `parseSemVer` value before any write.
- **MEDIUM — source-free package evidence was not dual-native:** the accepted packed-install exercise selected
  only Codex. It now installs both explicit clients after source deletion and proves exact packaged bytes for all
  five skills under both `.agents/skills` and `.claude/skills`, plus native front-door invocations.
- **LOW — existing-workspace callers could override integration origin:** the unused public override was removed;
  legacy origin is derived by the operation, while fresh creation remains owned by its separate plan.
- Review-cycle regression guards preserve aggregate target reporting when another source/template blocker prevents
  plan completion, and make legacy lifecycle/template snapshots distinguish listed symlink leaves through the
  new no-follow inspection port.

### Acceptance and Gate Evidence

- The audit passed **20/20 ACs**: explicit selected-only clients independent of deliverable targets; aggregate
  no-write preflight/no-handoff results; exact coherent five-skill/native-front-door/state installation;
  idempotent user-preserving update/deselection; typed partial boundaries and identical-plan convergence; strict
  legacy adoption/history preservation; exact package/source-free dual-native bytes; and planted
  tar/Git/conditional-zip non-leakage with unchanged canonical `wip/`.
- No hidden post-write domain replan remains. Both operations finish deterministic observations before effects
  and execute captured closures only. Atomic file publication and exact applying-state/preimage/fingerprint
  checks support bounded forward retry. Cross-process mutation after preflight is residual external concurrency,
  not an invented lock/CAS or generic transaction contract.
- Final-current focused/static evidence: retry/version RED cases failed as intended then passed **58/58**;
  combined affected unit/source-CLI/adapter regression band passed **156/156**; typecheck, Biome over **249 files**,
  build, and `git diff --check` passed. Built CLI/non-leak passed **26/26**, package/public passed **17/17**, and
  accepted packed/source-free dual-native install passed **2/2**.
- The first full attempt exposed only three legacy test-walker failures caused by newly visible symlink leaves
  (**1611/1614**). After the test walkers adopted no-follow inspection—with no product-byte change—the required
  stable replacement `npm test` passed **127/127 files and 1614/1614 tests** in **447.42s**.
- Stable path-sorted aggregate SHA-256 over the **35** changed/untracked `src` + `test` files:
  `0dd4ad89ed91c2abcd19c894143dca74745d3b46bccc679a24e149547a73958d`. `package.json` and
  `package-lock.json` remained unchanged. No live client, personal configuration, authentication, or host upgrade
  was invoked.

## Change Log

- 2026-08-23: Created Story 2.7 from Backlog TASK-120 via literal `bmad-create-story` in YOLO mode.
- 2026-08-23: Implemented Story 2.7 via literal `bmad-dev-story`, completed literal
  `bmad-qa-generate-e2e-tests`, and moved the story to review with focused gates green.
- 2026-08-23: Literal independent auto-fix review resolved one HIGH, two MEDIUM, and one LOW finding, reached
  0 open findings, passed all focused/package gates and the stable replacement full gate, and marked the story
  done.
