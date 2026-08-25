---
baseline_commit: d920274da757b6f3e4ac7c7b454b7eea21fbe87c
---

# Story 3.3: Materialise Complete Bundle Authoring Work on Create and Enable

Status: done

<!-- Created by literal bmad-create-story in YOLO mode for Backlog TASK-127. -->

## Story

As an authoring agent creating or enabling a bundle,
I want that bundle's complete recorded authoring contribution materialised in the shared backlog,
so that its work is ready exactly once without a separate generation or reconciliation step.

## Acceptance Criteria

1. Given a valid explicit bundle template or recorded default contribution; when a bundle is created; then every applicable mandatory and template-defined task is present exactly once with resolved Backlog.md dependencies.
2. Given a valid bundle is created disabled; when creation succeeds; then its complete applicable authoring work is materialised even though the bundle is absent from the enabled manifest set.
3. Given bundle creation or enablement materialises the complete applicable plan; when the operation succeeds; then no separate task-generation action is required.
4. Given bundle-template tasks have been materialised; when their Backlog.md records are inspected; then each task exposes its concrete bundle scope, stable key, template origin, and defining revision independently of its displayed title.
5. Given a recorded bundle contribution is used for authoring work; when any supported work-package deliverable is produced; then neither the recorded task definitions nor their materialisation provenance appears in that deliverable.
6. Given a disabled bundle has a recorded contribution and some planned work is missing; when the bundle is enabled; then only the missing mandatory or template-defined work is created and every dependency resolves to the actual preserved or newly created Backlog ID.
7. Given enablement encounters already-materialised bundle work; when records match the recorded contribution; then their identities, status, checked criteria, notes, acceptance text, and unrelated user metadata remain unchanged.
8. Given the selected bundle template contributes no authoring tasks; when create or enable succeeds; then mandatory-only behavior remains unchanged and no duplicate task appears.
9. Given a legacy disabled bundle has no recorded contribution; when it is enabled; then only its mandatory work is considered and no current default or registry contribution is inferred.
10. Given the same recorded bundle contribution is applied repeatedly; when create or enable is evaluated; then no duplicate task is created.
11. Given an existing matching task has human progress or notes; when a repeat operation succeeds; then that human state remains byte-for-byte unchanged.
12. Given a bundle's contribution was recorded; when the source template or current default later changes or is removed; then create/enable uses the recorded contribution and does not alter existing materialised work.
13. Given a predictable contribution definition, context, identity, dependency, cycle, rendered-title, ownership, destination, manifest, or Backlog conflict; when create or enable is evaluated; then every safely discoverable blocker is reported before any bundle, manifest, derived-artifact, contribution-record, or Backlog mutation.
14. Given an unforeseen I/O failure after writes begin; when create or enable ends; then a typed non-zero mutation non-success identifies completed, failed, and unattempted bundle, manifest, derived-artifact, contribution-record, and authoring-backlog boundaries in plan order, retains completed-boundary evidence, and supplies actionable forward-recovery guidance.
15. Given create or enable reports a partial write; when its recovery guidance is inspected; then it promises no rollback, generic resume, reconciliation, or successful bundle operation.

## Tasks / Subtasks

- [x] Define the durable authoring-only bundle-contribution record (AC: 1-5, 8-12)
  - [x] Add a strict, canonical, versioned root-level record outside `wip/` and `.authoring-backlog/`; distinguish an explicit recorded `none` contribution from an absent legacy record.
  - [x] Record the selected default bundle producer during fresh init and successful `bundle template set`, and record one concrete contribution for every created/preincluded bundle without storing native paths or user task state.
  - [x] Preserve recorded contribution bytes across workspace-authoring reapply and handoff verification, reserve the record path in whole-init collision/retry planning, and keep it excluded from every deliverable format.
- [x] Compile and reconcile one deterministic complete bundle task plan in the pure core (AC: 1-4, 6-13)
  - [x] Generalise the final Story 3.2 task-plan/provenance vocabulary only as needed for a single concrete bundle; preserve mandatory catalog bytes and Story 3.1 context/dependency restrictions.
  - [x] Resolve a recorded inert default with the concrete project/bundle context at create time, or consume a concrete per-bundle record at enable time, without rereading registry/source/default state.
  - [x] Inspect all relevant active Backlog records before mutation, match template tasks by reserved producer/revision/key/bundle identity rather than title, and compare exact machine-owned definition/dependencies while ignoring status, checked criteria, notes, extra sections, and unrelated labels.
  - [x] Preserve exact matching tasks, create only missing tasks in stable topological order using actual returned Backlog IDs, and aggregate malformed ownership, foreign-title, definition/dependency, context, identity, and cycle conflicts.
- [x] Replace post-write create/enable discovery with operation-specific immutable plans (AC: 1-3, 6-15)
  - [x] Load one explicit/default/recorded template snapshot and every bundle/manifest/advisor/derived/backlog/contribution preimage before CHECK; freeze all bytes and actions before the first effect.
  - [x] For explicit create, select and record exactly the requested registry producer; for implicit create, use the project scaffold plus its separately recorded default contribution, falling back to a new registry-default selection only when no project scaffold exists.
  - [x] Materialise the complete plan for both enabled and `--disabled` creation. On enable, parse the disabled bundle descriptor directly, require path/ID agreement, and use only its concrete recorded contribution or legacy mandatory-only behavior.
  - [x] Reject occupied/orphan bundle destinations and ambiguous contribution/manifest/advisor/derived paths before mutation; immediately recheck each planned preimage before its effect.
  - [x] Execute named bundle-file, alias, descriptor, contribution-record, manifest, advisor, derived-artifact, and task boundaries in deterministic order with typed partial progress and forward-only recovery.
- [x] Bind the project bundle-template producer surfaces (AC: 1, 5, 9, 12-15)
  - [x] Extend fresh init to persist the exact default bundle contribution (including explicit `none`) as part of its applying/finalizing plan and strict retry evidence.
  - [x] Make `bundle template set` publish scaffold bytes and the matching inert contribution under one complete preflight/typed ordered operation so a partial cannot silently pair a scaffold with a stale record.
  - [x] Ensure existing legacy projects without a record remain supported as mandatory-only and never infer the current packaged default on enable.
- [x] Prove real Backlog preservation, source independence, package portability, and non-leakage (AC: 1-15)
  - [x] Add focused pure/service tables for explicit/default/none/legacy contributions, disabled create, forward dependencies, repeated application, partial missing work, same key across bundles, human-state preservation, and aggregate conflicts with zero effects.
  - [x] Add create/enable operation and CLI tests for complete preflight, exact current/default-source removal behavior, destination/path races, every named partial boundary, and non-overclaiming recovery.
  - [x] Add real Backlog coverage for preserved IDs/status/checks/notes/user metadata and actual returned-ID dependencies; add installed packed-archive create-disabled/change-source/enable coverage.
  - [x] Extend tar, Git, and conditional ZIP assertions with unique contribution-record, definition, and provenance sentinels while preserving existing original-byte, symlink, layout, and build guarantees.
  - [x] Run the focused Story 3.1/3.2 contract, bundle create/enable/template-set, real Backlog, build/package/nonleak, lint, typecheck, boundary, and production-build gates; leave the exact stable full `npm test` to the independent reviewer.

## Dev Notes

### Goal and Scope Boundary

Story 3.3 completes bundle authoring work at the two existing operation boundaries where a bundle enters an
author's workflow: `wpm bundle new` and `wpm bundle enable`. It does not add a generator command, reconcile a
changed contribution into existing work, recreate a missing authoring backlog, edit human-owned task state,
or introduce a generic transaction/rollback/resume framework. `bundle disable` keeps its current semantics.

The complete contribution must be selected and frozen before the first operation write. The current generic
`OperationSpec` lifecycle resolves bundle templates, derives files, and title-materialises tasks after earlier
effects, so simply adding Story 3.1 inspection to `materialiseAuthoringTasks()` cannot meet the acceptance
boundary. Use a bounded operation-specific observation/action plan for create and enable, still inside the
pure-core/ports-and-adapters architecture and existing four ports.

### Final Stories 3.1 and 3.2 Contracts to Reuse

- `resolveTemplate()` supplies semantic producer provenance and an immutable loaded template snapshot.
- `inspectTemplateAuthoringTasks()` is the only declaration compiler. It returns `none | valid | invalid`,
  requires strict concrete context, aggregates definition/context/dependency/cycle findings, and forbids a
  bundle pack from depending on the conditional advisor task.
- Story 3.2's `ProjectAuthoringTaskProvenance`, reserved provenance-label grammar, planned task identity and
  actual-returned-ID dependency wiring are the compatibility vocabulary. Extract a narrow reusable single-
  bundle seam rather than fabricating a project initialization or duplicating a second grammar.
- `perBundleAuthoringTaskCatalog(id, {advisor})` defines the mandatory work actually applicable to the
  operation. The template dependency allowlist remains the unconditional `{advisor:false}` catalog; the full
  actual catalog still participates in rendered-title/ownership collision checks.
- Backlog-created template provenance stays authoring-only. No declaration, record, provenance label, or
  task sentinel belongs under `wip/`, a bundle directory, manifest, deliverable, generated native skill, or
  handoff receipt.

### Durable Recorded Contribution

Create a dedicated strict/canonical root-level authoring record with a narrow schema and deterministic order.
It is separate from the exact `.wpm-authoring.json` client-integration handshake and from the authoring
backlog. The record must support:

- one current default bundle-template selection, stored as an inert/symbolic contribution sufficient to
  render a later concrete bundle after the registry source has changed or disappeared;
- a concrete per-bundle contribution containing only deterministic WPM-owned task definition/provenance data;
- an explicit `none` variant proving that a selected producer contributed no template work; and
- absence of a per-bundle record as the legacy compatibility signal, never as permission to consult the
  current registry/default.

Use semantic producer `{source, scope, name}`, revision, stable key, dependency identities, and canonical
definition bytes. Never store absolute/native template paths, Backlog IDs, task status/checks/notes, ambient
HOME, timestamps, source checkout paths, or executable/process state. Preserve unrelated existing record
entries on a new bundle write. Unknown fields, noncanonical bytes/order, duplicate bundle IDs/keys, incoherent
producer/scope/revision, or a record that does not describe its paired scaffold/bundle must fail closed.

Fresh initialization owns the first default record and any concrete preincluded-bundle records. Add the new
path to init's unified kind/collision index, request fingerprint, applying plan, retry-tree allowlist, and
final full-plan verification. An init finalization retry must never reconstruct changed contribution data.
`bundle template set` must update the scaffold and its inert record from one loaded template snapshot and
must report a typed partial if one write succeeds and the other fails; a later implicit create must reject a
stale/unbound pairing rather than guess.

### Explicit, Implicit, Disabled, and Legacy Semantics

- **Explicit create:** resolve the requested bundle template exactly once, render its scaffold and inspect its
  contribution with the requested ID/version/project context, then persist the concrete contribution.
- **Implicit create with project scaffold:** use the live author-edited `wip/bundles/bundle-template` tree for
  scaffold bytes, but use only the separately recorded inert default contribution for tasks. Do not reread
  the packaged/default registry. If this is a legacy scaffold with no default record, record `none` for the
  new bundle and keep mandatory-only behavior.
- **Implicit create without project scaffold:** resolving the packaged registry `default` is a new explicit
  selection; freeze, render, and record it exactly once.
- **Disabled create:** write the same bundle files, concrete contribution record, advisor/derived work where
  applicable, and complete task plan, but do not add the bundle to the enabled manifest set.
- **Enable:** load the disabled bundle's own `bundle.yml` directly (it is absent from `loadProject()`), require
  path/ID agreement, and use the concrete per-bundle record only. No record means legacy mandatory-only. Never
  use a changed project default, packaged source, or registry search to fill the gap.

Source/template/default changes after a contribution is recorded affect only a later explicit new selection;
they do not mutate an existing contribution, task, or bundle. Repeating an identical create against an
occupied destination remains a conflict rather than a reconciliation action. Repeating enable is idempotent
only by preserving exact matching work and creating genuinely missing planned records.

### Exact Backlog Reconciliation

The operation may read the active Backlog task summaries and full records through the existing port. Match a
template task by its exact reserved WPM provenance label set: concrete bundle scope, semantic producer,
revision, and key. Validate its WPM-owned definition (title, acceptance text, dependencies, and reserved
labels) while ignoring human state (status, checked flags, notes/extra sections/metadata, and unrelated
labels). Never adopt a record by title/frontmatter alone.

Mandatory historical tasks retain their existing title/criteria contract and are matched conservatively.
For a missing task, create it only after all dependency identities resolve to the actual IDs of exact existing
or newly created records. If an existing dependent is missing a required dependency, has a changed WPM-owned
definition, has malformed/ambiguous reserved labels, or a foreign record owns a planned title, report a
prewrite ownership conflict; no dependency-edit seam exists and human records must not be rewritten.

Inspect every safely readable active record and aggregate independent blockers. Inactive/archive inventory
that could hide a planned identity/title must be treated as ambiguity rather than recreated. Creation order is
stable topological order with declaration order as the tie-break. Existing records need not form a prefix and
are never recreated simply because another task is missing.

### Immutable Preflight and Partial Failure

The LOAD snapshot must cover registry/default/record contribution bytes; bundle/manifest/scaffold/advisor and
derived-artifact preimages; destination kinds and canonical containment; Backlog availability/root/task
records; and every output byte. CHECK produces the complete deterministic action list without port reads.
Before every effect, verify its planned preimage has not changed. A race or predictable I/O/capability error
must not silently change the confirmed plan or overwrite user/unowned content.

Execute only after every predictable blocker is known. Boundaries should identify the concrete bundle and
destination/outcome and retain the existing lifecycle beat vocabulary. On a failure, `MutationFailure` must
truthfully report completed, failed, and unattempted bundle files/aliases/descriptor, contribution record,
manifest, advisor, derived outputs, and each Backlog task. Recovery may direct the caller to inspect those
named effects and retry an operation after resolving the cause, but it must not promise atomic rollback,
generic resume/reconciliation, or a successful create/enable result.

### Architecture and Compatibility

- Keep declaration/record parsing and plan/reconciliation decisions in `src/core/services/`; keep port reads,
  immutable observation assembly, preimage rechecks, and ordered effects in `src/core/operations/`.
- Do not import adapters, CLI framework, subprocess, or OS/filesystem modules into core. Prefer current port
  reads; add a port method only for a concrete no-follow/read capability proven unavoidable by tests.
- Leave title-only `materialiseAuthoringTasks()` for unrelated legacy operation paths; create/enable should use
  the exact identity-aware plan. Do not globally rewrite `runMutation` merely to force this operation into a
  generic lifecycle shape.
- Keep existing CLI command names/options and human/JSON non-success formatting. Extend typed aggregate error
  rendering only where the new bundle/contribution surface would otherwise be lost.
- No new package dependency, ship root, workspace/personal skill, authoring client, manifest target, agent
  process/auth/session action, or live host belongs to this story.

### Testing Guidance

Start with a pure contribution-record/parser suite and a single-bundle plan/reconciliation suite. Include
explicit, recorded default, explicit none, absent legacy, forward dependency, same key across different
bundles, malformed reserved labels, foreign title, definition/dependency drift, inactive ambiguity, and a
12,000-task forward chain to retain the iterative graph guarantee.

Exercise create and enable with effect-counting fakes: valid enabled/disabled create, missing-only enable,
source/default deletion, human status/check/note/unrelated-label preservation, destination/descriptor ID
conflicts, aggregate multiple contributions/paths/tasks, preimage races, and failure at every named boundary.
Snapshot files, manifest, record, Backlog records, derived artifacts, and action calls before/after every
prewrite failure. Assert generic resume/rollback/reconciliation/success language is absent from partials.

Use real Backlog CLI to prove actual returned dependency IDs and full-record preservation. Extend the installed
archive journey so a source-free consumer creates a disabled bundle from a recorded default, makes the
original source inaccessible, then enables it without duplicates or task drift. Extend the existing all-
format nonleak harness with unique record/definition/provenance sentinels; retain every established symlink,
byte, original build, git-history, and conditional-ZIP assertion.

### Previous Story and Git Intelligence

- Story 3.2 is independently approved and integrated at baseline
  `d920274da757b6f3e4ac7c7b454b7eea21fbe87c`. Its stable full gate passed 137 files / 1,892 tests.
- Preserve its single loaded template snapshot, complete aggregate preflight, iterative graph traversal,
  manifest/bundle descriptor ID agreement, actual-returned-ID dependency wiring, Backlog option-safe title
  creation, exact text-whitespace contract, strict applying/finalizing task verification, and final full
  Backlog postcondition before handoff publication.
- Story 3.3 should be a bounded bundle contribution record + single-bundle plan + create/enable/template-set/
  init integration. A broad lifecycle/materialisation rewrite is evidence of scope drift.

### Expected Project Structure

- `src/core/services/bundle-authoring-contributions.ts` (name refinable) for strict record parsing/rendering
- a focused reusable single-bundle task-plan/reconciliation service, possibly extracted from
  `src/core/services/project-authoring-task-plan.ts`
- `src/core/operations/create-bundle.ts` and `src/core/operations/bundle-lifecycle.ts` for operation-specific
  create/enable plans; disable remains on the current lifecycle
- `src/core/operations/init-project.ts` and the existing bundle-template-set CLI/operation seam to publish the
  recorded default under the same complete preflight and typed progress contract
- `src/core/errors.ts` / CLI formatting only if aggregate contribution failures need a typed public boundary
- focused service/operation/CLI/real-Backlog/packed-install/build-nonleak tests
- `_bmad-output/implementation-artifacts/tests/test-summary-task-127.md`

### References

- [Source: Backlog TASK-127]
- [Source: _bmad-output/planning-artifacts/prd.md#Template-defined-authoring-tasks]
- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#Story-33-Materialise-Complete-Bundle-Authoring-Work-on-Create-and-Enable]
- [Source: _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md#Decision-1-Operation-Specific-Snapshot-and-Complete-Plan-Preflight]
- [Source: _bmad-output/implementation-artifacts/investigations/authoring-agent-backlog-materialisation-investigation.md]
- [Source: _bmad-output/implementation-artifacts/3-1-declare-and-inspect-template-authoring-tasks.md]
- [Source: _bmad-output/implementation-artifacts/3-2-initialize-complete-project-authoring-work.md]
- [Source: src/core/services/template-authoring-tasks.ts]
- [Source: src/core/services/project-authoring-task-plan.ts]
- [Source: src/core/operations/init-project.ts]
- [Source: src/core/operations/create-bundle.ts]
- [Source: src/core/operations/bundle-lifecycle.ts]
- [Source: src/core/operations/lifecycle.ts]
- [Source: src/core/services/materialisation.ts]
- [Source: src/core/ports/backlog.ts]
- [Source: test/unit/operations/create-bundle.test.ts]
- [Source: test/unit/cli/bundle-lifecycle-commands.test.ts]
- [Source: test/integration/cli.bundle-lifecycle.e2e.test.ts]

## Dev Agent Record

### Agent Model Used

GPT-5.6 Codex

### Implementation Plan

- RED a strict canonical authoring-only contribution record and pure single-bundle reconciliation plan against
  the final Story 3.1/3.2 provenance and dependency contracts.
- Replace create/enable post-write discovery with bounded operation-specific immutable plans; persist default
  and per-bundle contributions through init/template-set/create, and preserve exact matching human task state.
- Extend real Backlog, packed source-free, and all-format nonleak acceptance, then run only focused/static/build/
  package gates before literal QA and independent review.

### Debug Log References

- Literal `bmad-create-story` invoked in YOLO mode. Customization resolution found no workflow override,
  activation prepend/append step, completion hook, or matching `project-context.md` persistent fact.
- Input discovery loaded the complete governed PRD, architecture, authoring addendum, epic projection, sprint
  tracker, backlog-materialisation investigation, and final integrated Story 3.2 story/QA/review/product-test
  contract at `d920274da757b6f3e4ac7c7b454b7eea21fbe87c`. No external dependency/API research was required.
- Literal `bmad-dev-story` then `bmad-qa-generate-e2e-tests` ran in YOLO mode. QA customization resolution again
  found no activation or completion hook; the generated evidence is recorded in
  `tests/test-summary-task-127.md`.
- The first focused packed-archive run reached the final manifest assertion and exposed only an overly narrow
  block-list YAML oracle. The corrected flow-style assertion passed on the one required replacement run.

### Completion Notes List

- Added strict canonical `.wpm-bundle-authoring.json` producer/default/concrete records and exact init,
  template-set, create, and enable ownership joins without placing definitions under `wip/`.
- Added pure dependency-first single-bundle compilation/reconciliation with concrete provenance, actual Backlog
  IDs, exact matching/preservation, iterative deep-graph behavior, and aggregate conflict reporting.
- Replaced create/enable post-write discovery with bounded immutable observation/action plans, confined writes
  and retirements, every-effect preimage checks, exact final postconditions, and typed forward-only failures.
- Preserved explicit-none and absent-legacy mandatory-only behavior; recorded source/default changes no longer
  affect enable, and exact existing human task state is never rewritten.
- Proved real Backlog create-disabled/source-removal/enable, source-deleted installed-package behavior, and
  tar/Git/conditional-ZIP record/definition/provenance exclusion. Final focused product band is 278/278;
  lifecycle, nonleak, packed, package/core-boundary, lint, typecheck, build, and diff-check are green.
- Architectural refinement: kept the realization operation-specific rather than broadening the legacy generic
  lifecycle/materialiser. Added only the concrete confined-file retirement port needed to remove an exact
  pending marker without clobbering raced user bytes. No generic rollback/resume/reconciliation subsystem was
  introduced.
- Independent review fixed the remaining producer/title/namespace, Backlog identity, inactive-inventory,
  scaffold-binding, retry/precondition, real-CLI performance, fixture, and legacy message-compatibility gaps.
- The final 27-file product/test aggregate is
  `a8e31acf068376d6250ad0fc35f139f61cfb76b7a68875ab33911512e066ef22`; the independent reviewer-owned
  full gate passed 140/140 files and 1,944/1,944 tests.

### File List

- `_bmad-output/implementation-artifacts/3-3-materialise-complete-bundle-authoring-work-on-create-and-enable.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-127.md`
- `src/adapters/memory-fs.ts`
- `src/adapters/node-fs.ts`
- `src/cli.ts`
- `src/core/errors.ts`
- `src/core/operations/bundle-authoring.ts`
- `src/core/operations/init-project.ts`
- `src/core/ports/filesystem.ts`
- `src/core/ports/index.ts`
- `src/core/services/bundle-authoring-contributions.ts`
- `src/core/services/bundle-authoring-task-plan.ts`
- `src/core/services/project-authoring-task-plan.ts`
- `src/core/services/template-authoring-tasks.ts`
- `src/util/exit.ts`
- `test/integration/adapters/node-fs.test.ts`
- `test/integration/cli.build.e2e.test.ts`
- `test/integration/cli.bundle-lifecycle.e2e.test.ts`
- `test/integration/cli.bundle-new.test.ts`
- `test/integration/distribution-preparation/packed-install.test.ts`
- `test/unit/adapters/memory-fs.test.ts`
- `test/unit/cli/bundle-lifecycle-commands.test.ts`
- `test/unit/cli/bundle-template-commands.test.ts`
- `test/unit/cli/cli.acceptance.test.ts`
- `test/unit/cli/dispatch-di.test.ts`
- `test/unit/operations/bundle-authoring.test.ts`
- `test/unit/operations/init-project.test.ts`
- `test/unit/services/bundle-authoring-contributions.test.ts`
- `test/unit/services/bundle-authoring-task-plan.test.ts`

## Senior Developer Review (AI)

### Review Workflow and Scope

- Literal workflow: `bmad-story-automator-review`, run in auto-fix mode by the persistent independent reviewer.
- Baseline: `d920274da757b6f3e4ac7c7b454b7eea21fbe87c`.
- Scope: all 15 acceptance criteria, the complete Story 3.3 product/test diff, durable contribution schema,
  create/enable/init/template-set producers, immutable Backlog planning and partials, package/source-free
  behavior, and composed tar/Git/conditional-ZIP nonleakage.

### Findings Resolved

- Closed cross-bundle durable-title reservation and inactive/archive ambiguity gaps for both create and enable.
- Reserved `bundle-template` as the default-scaffold namespace across create, enable, init preincluded bundles,
  and the strict concrete-contribution parser while retaining legitimate default-producer semantics.
- Made active Backlog inspection one-to-one across inventory, unique summaries, and full read records; rejected
  duplicate/collapsed IDs before effects and rejected a created result that reused a frozen existing ID as a
  typed partial after the effect.
- Preserved complete aggregate preflight when another reconciliation finding exists, including managed Backlog
  configuration drift and missing-plan inactive/capability evidence.
- Bound live author-edited scaffold bytes to the separately recorded inert contribution, rechecked the scaffold
  at publication/final boundaries, and proved distinctive recorded task bytes—not changed registry bytes—drive
  materialisation.
- Replaced quadratic between-task full-record rereads with exact linear summary/inventory guards while retaining
  full-record truth at preflight, the first effect, each created-task readback, and the absolute final
  postcondition. Real CLI timeout clusters were removed without weakening ownership checks.
- Corrected the real-FS fake Backlog root and bundle-template fixtures, strengthened hidden-metadata and
  created-ID race regressions, and restored the established `bundle template "…" not found` CLI wording.

### Gate Evidence

- Final-byte focused regression: exact formerly failing documentation E2E 1/1; causal operation/dispatch band
  39/39; broader Story band 279/279; representative real built-CLI create/enable paths 3/3.
- Static: Biome checked 271 files; typecheck, production build, and `git diff --check` passed.
- Package/public/core: 20/20. Composed tar/Git/conditional-ZIP nonleak: 1/1 with 25 unrelated tests skipped.
- Exact accepted packed archive with the source checkout unavailable: 1/1 with one unrelated test skipped
  (64.08s on final bytes).
- Full-gate history is recorded truthfully: the first reviewer run exposed 29 failures before its terminal
  summary was lost; the replacement completed 139/140 files and 1,943/1,944 tests with only the wording
  regression; after that executable-byte fix, the policy-authorized new full gate passed 140/140 files and
  1,944/1,944 tests in 1,852.12s.
- Stable final product/test inventory: 27 paths, aggregate
  `a8e31acf068376d6250ad0fc35f139f61cfb76b7a68875ab33911512e066ef22`; unchanged after the full gate.

### Acceptance and Verdict

All 15 acceptance criteria are observably satisfied. No open HIGH, MEDIUM, or LOW review finding remains.

**Verdict: APPROVE.**
