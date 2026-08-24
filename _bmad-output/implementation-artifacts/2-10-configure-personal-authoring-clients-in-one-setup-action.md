---
baseline_commit: bbe80f5a1f72dfc0798368218f11c8ed51a3c5b7
---

# Story 2.10: Configure Personal Authoring Clients in One Setup Action

Status: done

<!-- Created by literal bmad-create-story in YOLO mode for Backlog TASK-123. -->

## Story

As a WPM user or bootstrap agent,
I want one setup action to configure my selected authoring clients safely,
so that `wpm-create-package` becomes available only where I authorized it and can seed later workspace creation.

## Acceptance Criteria

1. Given one or more explicit supported authoring-client IDs; when personal setup runs; then exactly those IDs authorize prompt-free setup.
2. Given an explicit supported selection; when detection is absent for a selected client or present for another client; then the explicit selection remains authoritative and detection adds no client.
3. Given a direct human invocation without IDs; when setup asks for authorization; then one chooser shows Codex and Claude Code together and presents detection only as context.
4. Given an interactive selection of one or both clients; when setup presents the resolved personal destinations; then exactly one confirmation authorizes the complete selected set before any write.
5. Given the human declines, cancels, or supplies no confirmation; when setup concludes; then cancellation is reported.
6. Given setup is cancelled; when personal, workspace, and deliverable surfaces are inspected; then every surface remains unchanged.
7. Given an empty or unsupported selection, unavailable packaged source or HOME, structurally unusable selected destination, or ambiguous/user-modified owned path; when the complete selected set is inspected; then every safely discoverable blocker and one applicable recovery are reported before the first write.
8. Given setup preflight rejects the request; when its CLI result is inspected; then the failure is machine-distinguishable and non-zero.
9. Given setup has any predictable blocker; when selected, unselected, workspace, and deliverable surfaces are inspected; then all remain unchanged.
10. Given a selected destination is absent, current WPM-owned, older WPM-owned, or an exactly recognized WPM legacy `installer-builder`; when setup runs or repeats; then only `wpm-create-package` is installed, left unchanged, updated, or migrated in that selected scope and the per-client outcome is reported.
11. Given a selected scope is reconciled; when it is inspected; then it contains exactly one managed `wpm-create-package` copy.
12. Given unrelated content exists in a selected personal scope; when setup succeeds; then that unrelated content remains byte-identical.
13. Given an unowned or user-modified sibling `installer-builder` does not occupy the current `wpm-create-package` destination; when setup reconciles that client; then the sibling is preserved, identified as not migrated, and does not block the current bootstrap install.
14. Given setup succeeds; when retained setup state and later workspace creation are inspected; then the selected client IDs are the proposed workspace-authoring defaults, while an explicit workspace selection remains authoritative.
15. Given setup succeeds; when deliverable targets and unselected personal scopes are inspected; then `manifest.yml.targets` and every unselected personal scope remain unchanged.
16. Given setup succeeds; when human or structured output is inspected; then it reports each selected outcome, reload guidance only for clients whose skill bytes changed, and the exact client-native `wpm-create-package` next action without any workspace or handoff claim.
17. Given an unforeseen effect failure after selected writes begin; when setup ends; then a typed non-success reports ordered completed, failed, and unattempted clients and destinations, one identical-request recovery, and a non-zero result.
18. Given a reported partial and the same authorized setup request; when the failed boundary becomes recoverable and setup repeats; then managed personal content and retained defaults converge without duplicates or corruption and without generic rollback or resume language.

## Tasks / Subtasks

- [x] Establish RED-first personal setup state and ownership contracts (AC: 7-15, 17-18)
  - [x] Add a strict, canonical, minimal personal setup record under the injected absolute HOME; keep the latest default selection separate from cumulative per-client managed ownership.
  - [x] Bind complete and applying records to schema/version, canonical HOME, exact package version/source digest, requested client set, native destinations, prior owned digests, and exact legacy observations; reject unknown fields, noncanonical bytes, foreign roots, duplicate/noncanonical IDs, and incoherent relationships.
  - [x] Recognize current content only by exact packaged bytes or a matching managed digest, older content only when actual bytes match its recorded prior digest, and legacy content only by an exact known packaged tree signature. Never use name/frontmatter alone as ownership proof.
  - [x] Preserve an unowned/modified sibling `installer-builder` as nonblocking evidence, but make an occupied/ambiguous current destination or modified recorded-owned path an aggregate no-write conflict.
- [x] Implement one projectless immutable setup plan over the existing ports (AC: 1-2, 7-15, 17-18)
  - [x] Normalize explicit selection through the closed `authoring-clients` catalog without consulting detection, project context, or deliverable targets.
  - [x] Resolve and confine HOME, shared state, selected scopes, current destinations, and legacy siblings using platform-aware absolute paths, no-follow inspection, canonical existing ancestors, exact directory inventories, and all predictable read/capability checks before the first write.
  - [x] Capture the packaged `wpm-create-package/SKILL.md` and legacy `installer-builder` tree as immutable digest-bound source evidence, then compute all selected-client outcomes and ordered effects before mutation.
  - [x] Reconcile only selected clients; install or update one `SKILL.md` through no-clobber request-bound publication, remove only an exactly recognized owned legacy tree, preserve all unrelated/unselected content, and publish complete defaults/ownership state only after selected effects succeed.
  - [x] Treat an applying retry as the exact same immutable plan: accept only its recorded pre-state, exact desired post-state, and operation-specific safe absence/partial-removal states; never silently recreate a missing path owned by a prior complete record or replan against changed source/user bytes.
  - [x] Raise typed ordered progress with client, destination, intended outcome, failed lifecycle beat, unattempted clients, and identical-request recovery; do not promise rollback or a generic resume subsystem.
- [x] Expose one consent-safe CLI experience and retain workspace defaults (AC: 1-8, 14, 16-18)
  - [x] Add canonical `wpm authoring setup` help/completion with repeatable `--client codex|claude-code` and structured output; explicit IDs authorize without any prompt.
  - [x] Without IDs in human mode, render both clients once with detection hints, read one multi-select chooser, show one combined destination summary, and read exactly one confirmation. EOF, cancel, or decline returns an explicit no-write cancellation.
  - [x] Retire or route legacy `wpm skill install` through the same selection, confirmation, preflight, ownership, and result operation so ambient detection can no longer authorize writes.
  - [x] Render aggregate preflight and typed partial failures in stable human and JSON forms with non-zero exit codes; success names only selected outcomes, changed-client reload advice, and `$wpm-create-package` or `/wpm-create-package` as applicable.
  - [x] Let `wpm init` consume canonical retained defaults only when no explicit `--authoring-client` flags are supplied; explicit workspace selection wins, absent defaults retain the current empty-selection usage result, and setup/init never reads or writes `manifest.yml.targets` for this decision.
- [x] Prove real-filesystem, exact-package, and non-leak boundaries (AC: 1-18)
  - [x] Add focused service/operation tests for strict state, supported/unsupported selection, absent/current/older/modified destinations, exact and modified legacy trees, combined blocker aggregation, canonical/no-follow HOME confinement, unselected preservation, defaults, and every effect/retry boundary.
  - [x] Add CLI tests for explicit Codex-only/Claude-only/both, advisory detection mismatch, chooser+single confirmation, decline/cancel/EOF, compatibility entry point, concise success, JSON failure/progress, completion, and init default/explicit precedence.
  - [x] Extend the installed-package source-deletion harness so the installed CLI itself configures isolated Codex and Claude personal scopes from the exact archive, repeats unchanged, updates recorded older bytes, and never reads repository sources or the real HOME.
  - [x] Extend real-FS and build/non-leak evidence with planted personal state/skill/legacy sentinels, proving selected-only personal changes and absence from `wip/`, tar, Git, and conditional zip deliverables.
  - [x] Run focused unit/integration/package/non-leak, lint, typecheck, boundary, supply-chain, and build gates; invoke literal QA in YOLO and leave the exact stable full `npm test` to the independent reviewer.

## Dev Notes

### Goal and Scope Boundary

Story 2.10 replaces ambient personal installation with one consent-bearing setup experience. It owns normal
installation, exact-byte adoption/update, strict legacy migration, retained workspace-authoring defaults, and
truthful partial retry for the already packaged `wpm-create-package` artifact. The same semantic action covers
Codex, Claude Code, or both; interactive/headless, repeat, update, and migration are states, not separate user
journeys.

This story does not install or launch a coding agent, inspect credentials/authentication, mutate the real test
host HOME, install the five workspace skills personally, create/adopt a workspace, prepare/verify handoff,
invoke the bootstrap skill, select/claim authoring work, or change deliverable `manifest.yml.targets`. Live
Claude remains deferred through TASK-127. Story 2.11 owns the complete cold installed-package-to-handoff
journey.

### Public Command and Consent Contract

Use `wpm authoring setup` as the canonical surface. Repeat `--client` for the complete explicit personal
selection. Explicit supported IDs are the caller's authorization and must not prompt; no detection fact may add
another client. Human mode without IDs has exactly two decision moments: one Codex/Claude multi-select chooser
and one yes/no confirmation after the selected native destinations are summarized. Detection can annotate the
chooser but must not be retained or treated as consent. Cancellation/EOF/decline is a normal, explicit no-write
result.

The existing `wpm skill install` currently detects four legacy config roots and immediately overwrites
`installer-builder` in all of them. It cannot remain an ambient side door. Either make it a compatibility alias
of the exact same new action or retire it with an actionable usage result; it may not preserve detected-all
write behavior. Normal setup presents only the closed P0 IDs `codex` and `claude-code`.

### Personal State, Defaults, and Ownership

Keep one minimal WPM-owned state file under the injected HOME (recommended concrete path:
`.wpm/authoring-setup.json`). It is machine-local setup evidence, never workspace or deliverable state. Its
complete form must retain:

- canonical schema/status and the exact HOME identity;
- the latest explicitly authorized selection as workspace-creation defaults;
- cumulative per-client ownership records so later selecting only Codex does not discard evidence for an
  untouched prior Claude installation;
- each managed `wpm-create-package` destination, WPM/package version, and exact `SKILL.md` digest; and
- only reconciliation facts required to distinguish current, update, and legacy outcomes.

Do not retain detection, client executable paths, credentials, sessions, workspace roots, handoff facts, or
deliverable targets. Require canonical serialized bytes and reject unknown/incoherent state rather than silently
rewriting a user-modified state path.

An absent current directory is installable. An exact source-equal directory with only regular `SKILL.md` is a
safe stateless current adoption reported as `unchanged`. A complete state record authorizes update only when the actual regular file
still equals its recorded prior digest; missing or different prior-owned bytes conflict even if they happen to
equal a future source in an ordinary non-retry update. Extra entries, aliases, special files, unreadability, or
kind collisions at the current destination are ambiguous ownership and block the entire selected request.

The sibling `installer-builder` is different: compare its complete no-follow tree and file digests to the exact
known packaged legacy tree. Exact equality authorizes migration/removal. Anything else is preserved and
reported as unowned/modified, but is nonblocking when it does not occupy `wpm-create-package`. Frontmatter,
directory name, or prose resemblance alone is never ownership evidence.

### Immutable Preflight and Retry

Build the whole projectless observation and action plan before any mutation. Validate HOME as a platform-correct
absolute existing directory and prevent every selected/state path from escaping through a symlink, special
entry, non-directory ancestor, or noncanonical identity. Capture source bytes and their digest in one read;
recursively inventory legacy source/destination without following leaf links. Aggregate selection, HOME,
packaged content, state, selected destination, ancestor/capability, and ownership findings across all safely
discoverable selected clients.

The operation remains pure core over injected FileSystem and Environment (with Clock/Backlog unused), and the
interactive shell stays in CLI utilities. Extend the FileSystem port only with the smallest concrete read
primitive a focused real-FS RED proves necessary; do not add a process, agent, auth, setup, or transaction port.
Do not force project context or the project-only lifecycle harness onto this projectless operation.

Before selected mutations, publish an exact applying record that binds the complete request/source/destination/
legacy plan and its deterministic private quarantine identity. Execute selected clients in canonical catalog
order. For an existing public entry, retain the exact observed bytes under that request before no-clobber
publication; a temporary public absence is an applying/typed-partial state, never success. A public-path race
must preserve both the raced entry and retained prior bytes. Remove only a proven exact legacy tree, and publish
complete state only after desired public bytes exist and every request-bound private slot is clean. A retry may
finish only the same plan and must compare every observed public/private path to the recorded pre/post evidence.
Unexpected private content fails closed and is preserved. The supported concurrency boundary excludes a hostile
same-user writer racing inside WPM's freshly created, unpredictable private quarantine between its final exact
guard and cleanup; it does not weaken the no-clobber guarantee for public paths. A prior complete-owned path that
goes missing without matching applying evidence is user/state drift, not an install opportunity.

Typed partial output must distinguish state boundaries from client boundaries and carry canonical client ID,
destination, intended outcome, completed/failed/unattempted order, failed beat, and one recovery telling the
caller to repeat the identical explicit selection after the named failure is fixed. Do not introduce generic
rollback/resume/transaction language or silently recompute a different plan.

### Retained Defaults and Workspace Independence

Setup defaults answer only which authoring clients to propose for later workspaces. `wpm init` should use them
when no `--authoring-client` flag is supplied. One or more explicit init flags are the complete authoritative
workspace set and replace, rather than merge with, personal defaults for that invocation. Missing defaults keep
the existing empty-selection failure; malformed/foreign personal state fails safely instead of guessing.

Setup must not resolve a workspace, walk upward for `wip/manifest.yml`, inspect or edit targets, or touch any
unselected personal scope. Tests should plant a workspace/deliverable below or beside the isolated HOME and
prove its bytes remain unchanged across success, conflict, cancellation, and partial retry.

### Result and Package Boundary

Per selected client report `installed`, `unchanged`, `updated`, or `migrated` as applicable, plus a
separate preserved/not-migrated legacy observation when present. Reload guidance is applicable only when
current bootstrap bytes changed; an unchanged exact current copy needs no restart ceremony. The only
next action is the native `wpm-create-package` invocation (`$wpm-create-package` for Codex,
`/wpm-create-package` for Claude Code). Never claim workspace creation, handoff preparation, process spawn,
authentication, discovery by the current live session, or task progress.

The exact installed-package harness must stop manually planting the personal skill as its setup proof. From an
extracted accepted archive with source deleted, invoke the installed CLI against a disposable injected HOME and
prove both native copies equal the package's exact `agent-skills/wpm-create-package/SKILL.md`. Keep the legacy
artifact packaged only as migration evidence; setup must not install it. Personal state, skill paths, legacy
sentinels, and instruction bytes must remain absent from all generated deliverables and build formats.

### Previous Story and Git Intelligence

- Story 2.9 is independently approved with 7/7 criteria, 0 open findings, and 1,660/1,660 reviewer full-suite
  tests. Its final six-file product/test aggregate is
  `53b917fb85ff9bf64111784904fb0ffec12f9dda5e5088638288274fd662bcee` and the exact personal skill digest is
  `a01a56f71428d82d9ca50cf8e3eb7abd1324f4fa0f36efc886c8ae8a18a4d5f7`.
- Preserve its one-file instruction-only artifact, exact dual-native/source-free bytes, five-skill workspace
  exclusion, strict adoption/handoff boundary, and tar/Git/zip non-leak sentinels.
- Baseline `bbe80f5a1f72dfc0798368218f11c8ed51a3c5b7` is the state-integrated HEAD after approved TASK-122 merge.

### Expected Project Structure

- New setup state/service and projectless operation under `src/core/services/` and `src/core/operations/`.
- Typed aggregate/partial errors in `src/core/errors.ts`, with human/JSON rendering at the CLI boundary.
- Canonical setup plus compatibility routing, completion, interactive utility, and init-default consumption in
  `src/cli.ts` and focused `src/util/`/completion files.
- New service/operation/CLI unit tests; real-FS CLI integration; installed-package setup/source-deletion proof;
  and extensions to existing build/non-leak harnesses.
- No new port family, dependency, package ship-set entry, workspace managed-state/receipt field, skill content,
  Backlog behavior, or deliverable model change is expected.

### References

- [Source: Backlog TASK-123]
- [Source: _bmad-output/planning-artifacts/prd.md]
- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#story-210-configure-personal-authoring-clients-in-one-setup-action]
- [Source: _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/review-first-run.md]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/review-friction.md]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/review-trust-recovery.md]
- [Source: _bmad-output/implementation-artifacts/2-9-guide-package-creation-with-wpm-create-package.md]
- [Source: _bmad-output/implementation-artifacts/tests/test-summary-task-122.md]
- [Source: src/core/services/authoring-clients.ts]
- [Source: src/core/operations/authoring-clients.ts]
- [Source: src/core/operations/install-authoring-skill.ts]
- [Source: src/core/operations/init-project.ts]
- [Source: src/core/ports/filesystem.ts]
- [Source: src/cli.ts]

## Dev Agent Record

### Agent Model Used

GPT-5.6 Codex

### Implementation Plan

- Drive strict personal state/ownership and complete selected-set preflight RED-first, then implement one
  immutable projectless plan with typed client/destination progress and identical-request convergence.
- Put chooser/confirmation and formatting at the CLI edge, route the legacy detected-all command through the
  same consent action, and consume retained defaults from init without touching target-agent state.
- Extend the exact installed-package and non-leak harnesses under disposable injected HOME roots, then run
  focused/static/build/QA gates while leaving the exact stable full suite to the independent reviewer.

### Debug Log References

- Literal `bmad-create-story` invoked in YOLO mode. Customization resolution found no workflow override,
  activation prepend/append step, completion hook, or matching `project-context.md` persistent fact.
- Literal `bmad-dev-story` invoked in YOLO mode. Customization resolution likewise found no workflow override,
  activation prepend/append step, completion hook, or matching `project-context.md` persistent fact.
- Literal `bmad-qa-generate-e2e-tests` invoked in YOLO mode. Its activation and completion resolvers found no
  workflow override, prepend/append step, completion hook, or matching persistent project-context fact.
- Literal `bmad-story-automator-review` invoked in auto-fix mode. The independent review completed the
  adversarial 18-criterion audit, fixed every reproducible finding, and reached zero open findings on the
  stable product/test bytes.
- Independent seam audit findings were fixed and focused-tested: normal writable HOME ancestry, confirmation
  bound to the immutable preview plan, reload advice only for changed skill bytes, canonical setup versions,
  latest-default/version coherence, exact mutation-file capability checks, and Windows real-FS platform wiring.

### Completion Notes List

- Added strict cumulative personal ownership/default state and a projectless, operation-specific immutable
  LOAD/CHECK/APPLY plan over injected FileSystem and Environment ports. This deliberately avoids broadening the
  project lifecycle into a generic transaction subsystem while preserving full preflight and typed progress.
- Added consent-safe explicit/headless and single-session interactive setup, retired the ambient detected-all
  installer side door, and retained defaults for later `wpm init` without touching deliverable targets.
- Proved exact selected-only reconciliation, legacy migration, partial retry, source-free installed-package
  behavior, and personal-state/skill non-leak. All 18 acceptance criteria have focused deterministic evidence.
- Stable worker gates: 197/197 focused unit, 31/31 real-FS/CLI, 6/6 package preparation, 2/2 packed install,
  TASK-95 non-leak 1 passed/25 skipped, lint (258 files), typecheck, build, and diff check. Full `npm test` is
  intentionally reserved for independent review.
- Final path-ordered product/test aggregate (including explicit deleted-path records):
  `80ec163783bcfeee0723f4071f06c6918cbbac3dbd9b4ed5a242077160cb2475`.

### Independent Review Result

- **APPROVE — 18/18 acceptance criteria pass; zero findings remain open.** The auto-fix review closed the
  high-risk immutable-plan, applying-state, exact ownership, no-follow confinement, no-clobber publication,
  deterministic quarantine/retry, complete blocker aggregation, UTF-8 byte identity, output inertness, and
  adapter-parity seams with focused RED/GREEN regressions.
- The approved operation-specific refinement retains exact observed bytes in an applying-request-bound private
  quarantine, publishes desired public bytes without clobbering a raced entry, reports temporary absence or
  any interrupted effect as a typed partial, and returns success only after canonical state, selected skills,
  legacy outcomes, and private-evidence cleanup all revalidate. It does not introduce a generic transaction or
  per-OS native backend.
- Final focused review band: **13 files, 323/323 tests passed**. Typecheck passed; Biome passed over **260
  files**; build and `git diff --check` passed. Package/source-free/non-leak band: **3 files, 34/34 tests
  passed**.
- Fresh accepted synthetic revision: `1d0ae39ad52877339325f9ce286ab6b8254b23c3`; archive SHA-256
  `d29c3c21ae0a952c2e334f66a3789538cfd25e3a4f107e66de71a1690c1b876e` (**625,269 bytes / 459
  entries**). Archive, installed package, and disposable Codex setup copies of `wpm-create-package/SKILL.md`
  all hash to `a01a56f71428d82d9ca50cf8e3eb7abd1324f4fa0f36efc886c8ae8a18a4d5f7`; the synthetic source copy was
  removed before the installed-package evidence was finalized.
- Exact isolated installed-CLI setup configured only Codex, preserved an unrelated sentinel and the unselected
  Claude scope, and an identical repeat reported `unchanged`. A fresh live Codex discovery attempt was blocked
  before model execution by the authenticated account usage limit; it is recorded as a one-diagnosis evidence
  deviation, not acceptance evidence. The disposable auth copy was removed, source auth metadata was unchanged,
  no process remained, and live Claude was not invoked.
- The exact stable full gate passed once: **134/134 files, 1,823/1,823 tests passed** in **461.52s**. The final
  path-ordered 30-record README/source/test aggregate, including two explicit deletion records, is
  `f55d6dd373a67aab8edd226eeac52759e365be85b9ff5573b93a0d18f75f0c62` before and after the gate.

### File List

- `README.md`
- `src/adapters/memory-fs.ts`
- `src/adapters/node-fs.ts`
- `src/cli.ts`
- `src/core/errors.ts`
- `src/core/operations/init-project.ts`
- `src/core/operations/install-authoring-skill.ts` (deleted)
- `src/core/operations/personal-authoring-setup.ts` (new)
- `src/core/ports/filesystem.ts`
- `src/core/services/personal-authoring-setup.ts` (new)
- `src/util/code-unit-order.ts` (new)
- `src/util/confirm.ts`
- `src/util/exit.ts`
- `test/integration/adapters/node-fs.test.ts`
- `test/integration/cli.build.e2e.test.ts`
- `test/integration/cli.init.test.ts`
- `test/integration/cli.skill-install.test.ts`
- `test/integration/distribution-preparation/package-preparation.test.ts`
- `test/integration/distribution-preparation/packed-install.test.ts`
- `test/unit/adapters/memory-fs.test.ts`
- `test/unit/cli/personal-authoring-setup-commands.test.ts` (new)
- `test/unit/cli/skill-commands.test.ts`
- `test/unit/completion/completion.test.ts`
- `test/unit/operations/init-project.test.ts`
- `test/unit/operations/install-authoring-skill.test.ts` (deleted)
- `test/unit/operations/personal-authoring-setup.test.ts` (new)
- `test/unit/operations/workspace-handoff.test.ts`
- `test/unit/services/personal-authoring-setup.test.ts` (new)
- `test/unit/util/code-unit-order.test.ts` (new)
- `test/unit/util/exit.test.ts`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-123.md` (new)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-08-23: Created the implementation-ready Story 2.10 contract from Backlog TASK-123 and final reviewed
  TASK-122 evidence via literal `bmad-create-story` in YOLO mode.
- 2026-08-23: Implemented and QA-tested the personal authoring setup action; marked Story 2.10 ready for
  independent review.
- 2026-08-23: Independent auto-fix review reached zero open findings, passed the stable focused/static/build,
  exact-package/source-free/non-leak, and one full-suite gate, and approved Story 2.10.
