---
baseline_commit: f963e332ea99d00ffb5ac737a8f9bd5c3fee529e
---

# Story 3.2: Initialize Complete Project Authoring Work

Status: done

<!-- Created by literal bmad-create-story in YOLO mode for Backlog TASK-126. -->

## Story

As a bootstrap agent creating a workspace,
I want ordinary initialization to include all mandatory and selected template-defined authoring work,
so that the fresh workspace agent receives one complete backlog without another setup step.

## Acceptance Criteria

1. Given a valid selected project template and a new workspace request; when ordinary initialization succeeds; then one shared authoring backlog contains every mandatory project task and every project-template task exactly once with resolved Backlog.md dependencies.
2. Given a valid selected project template includes one or more bundles; when ordinary initialization succeeds; then every pre-included bundle receives its applicable mandatory and template-defined tasks exactly once.
3. Given initialization materialises the complete applicable task plan; when initialization succeeds; then that complete plan is already present in the authoring backlog and no separate task-generation action is required.
4. Given distinct selected template producers use the same local stable key in one initialization plan; when ordinary initialization succeeds; then both tasks coexist under distinct producer-scoped identities with their dependencies resolved independently.
5. Given project-template tasks have been materialised; when their Backlog.md records are inspected; then each task exposes its stable key, template origin, and defining revision independently of its displayed title.
6. Given a project template contributed authoring tasks to an initialized workspace; when that workspace produces a work-package deliverable in any supported format; then the deliverable contains neither the template task definitions nor their materialisation provenance.
7. Given the project template contributes no authoring tasks; when initialization succeeds; then existing mandatory-task behavior remains unchanged and no additional or duplicate task appears.
8. Given a workspace was initialized from a project template; when the source template later changes or is removed; then the existing workspace and its authoring tasks remain unchanged.
9. Given the complete project task contribution has a predictable definition, context, identity, dependency, cycle, rendered-title, or ownership conflict; when initialization is evaluated; then every blocker and affected contribution is reported before any workspace or authoring-backlog change.
10. Given an unforeseen I/O failure after initialization writes begin; when initialization ends; then a typed, non-zero mutation non-success identifies completed, failed, and unattempted project, derived-artifact, and authoring-backlog boundaries in plan order, retains completed-boundary evidence, and supplies actionable forward-recovery guidance.
11. Given initialization reports a partial write; when its recovery guidance is inspected; then it promises no generic rollback, resume, reconciliation, or successful initialized workspace.

## Tasks / Subtasks

- [x] Compile one deterministic complete initialization task plan in the pure core (AC: 1-5, 7, 9)
  - [x] Add an init-specific planned-task model/service that composes mandatory project tasks, the concrete selected project-template inspection, and one concrete default-bundle-template inspection for each pre-included bundle.
  - [x] Preserve manifest order and the current mandatory catalog order; topologically order additional tasks so every dependency identity precedes the task that consumes its returned Backlog ID.
  - [x] Scope mandatory and template task identities by semantic producer and, for bundle contributions, the concrete bundle ID. Keep equal local keys from distinct producers/instances independent.
  - [x] Produce deterministic Backlog-visible template provenance for stable key, resolver origin, defining revision, and concrete bundle scope where applicable, while leaving no-pack mandatory task bytes unchanged.
  - [x] Aggregate concrete-context inspection findings plus full-plan identity, rendered-title, dependency, cycle, and ownership conflicts into deterministic contribution-aware problems before exposing a valid plan.
- [x] Integrate the complete plan into fresh `initProject` preflight without a second task engine (AC: 1-4, 7, 9)
  - [x] Reuse final Story 3.1 `resolveTemplate` provenance and `inspectTemplateAuthoringTasks` with `wpm.project.name`; for each pre-included bundle use the already-resolved default bundle template plus project name, bundle ID, and bundle version.
  - [x] Translate every invalid project/bundle contribution and cross-plan conflict to the existing aggregate `authoring-task-plan` preflight surface while continuing to discover independent target, package, client, destination, and Backlog blockers.
  - [x] Bind the exact identities, task text, provenance, and dependency identities into the existing immutable whole-init request key before the applying-state write. Do not add a command, a post-init generator, a parallel state store, or a generic reconciliation path.
- [x] Materialise dependency-aware Backlog records inside the existing ordered init plan (AC: 1-5, 10-11)
  - [x] Create tasks in deterministic topological plan order, map each successfully returned Backlog ID to its stable planned identity, and pass only already-resolved concrete IDs to dependent `createTask` calls.
  - [x] Keep each task creation as a named `MATERIALISE` boundary and preserve the existing applying → outputs/backlog/tasks → preparing receipt → complete state → prepared receipt order.
  - [x] Extend exact partial-retry verification to compare title, unchecked criteria, provenance fields, dependency IDs, ordinal, status, and the otherwise-pristine task record; authorize only an exact prefix of the same immutable plan before the preparing receipt and require the full exact plan afterward.
  - [x] Preserve typed completed/failed/unattempted evidence and forward-only identical-request guidance; never claim rollback, generic resume/reconciliation, handoff preparation, or successful initialization after a partial write.
- [x] Prove source independence and authoring-only non-leakage (AC: 6, 8)
  - [x] Show that changing or removing template source bytes after a successful init neither mutates nor reconstructs the existing workspace/task records.
  - [x] Extend the existing tar, Git, and conditional ZIP build assertions so neither declaration bytes nor the reserved materialised provenance vocabulary can enter a deliverable; keep definitions in package/template sources and provenance only in the gitignored authoring backlog.
- [x] Prove compatibility, real Backlog dependency wiring, and failure recovery (AC: 1-11)
  - [x] Add focused pure tables for project-only, multiple pre-included bundles, same local key across producers, forward references, concrete-context collisions, aggregate invalid contributions, no-pack exact compatibility, and stable order.
  - [x] Extend init operation tests for all new task boundaries, dependency IDs, exact provenance, partial-prefix retry, tampered metadata/dependencies, and finalization-stage full-plan enforcement.
  - [x] Add real-filesystem/Backlog CLI acceptance for a custom packed project template plus pre-included bundles, proving exact task records and no separate generation action.
  - [x] Run the focused Story 3.1 contract band, init unit/integration band, build/package/non-leak band, lint, typecheck, boundary and production-build gates; leave the exact stable full `npm test` to the independent reviewer.

## Dev Notes

### Goal and Scope Boundary

Story 3.2 changes only ordinary creation of a fresh authoring workspace. `wpm init` must publish one complete
authoring backlog before the prepared handoff is reported. It must not add a public command, generate tasks
after init, mutate an existing completed workspace, infer work for an old project, reconcile changed template
definitions, retire tasks, reconstruct a missing gitignored backlog, or alter bundle create/enable behavior;
Story 3.3 owns the latter bundle-operation paths.

The operation already has a whole-request immutable plan and typed partial-write sequence. Extend that plan;
do not route this story through the title-only generic `materialiseAuthoringTasks()` service and do not create a
generic transaction/rollback/resume/reconciliation subsystem. Backlog.md remains the only task store, the
existing workspace integration state and handoff receipt retain their current roles, and no template task
definition or provenance is a deliverable/runtime artifact.

### Final Story 3.1 Contract to Consume

- `resolveTemplate()` returns `{template, source}` on a hit, rejects non-portable registry names, and proves
  the descriptor scope/name agrees with the requested semantic key. Producer identity is semantic
  `{source, scope, name}`, never an absolute path or descriptor-controlled alias.
- `inspectTemplateAuthoringTasks()` is pure and total over a loaded template. Its discriminated result is
  `none | valid | invalid`; invalid results expose all deterministic problems and no compiled tasks.
- Concrete operation context is strict. Project inspection supplies only `wpm.project.name`; bundle
  inspection supplies `wpm.project.name`, `wpm.bundle.id`, and `wpm.bundle.version`. Missing, empty, unsafe,
  or unavailable values invalidate the contribution.
- A valid task exposes producer-scoped `identity`, local `key`, rendered title/acceptance criteria, resolved
  same-pack or mandatory-reference dependencies, and context keys. The Story 3.1 identity deliberately has
  no concrete bundle instance; Story 3.2 must add that scope at the operation-plan boundary.
- `projectWideAuthoringTaskCatalog()` and `perBundleAuthoringTaskCatalog()` publish stable mandatory
  references while `projectWideAuthoringTasks()` / `perBundleAuthoringTasks()` preserve the existing title
  and criteria bytes. The advisor bundle task remains request-applicable and must stay present for init's
  existing `advisor: true` pre-included-bundle behavior.

### Applicable Producers and Concrete Plan

The selected project template contributes its project-scoped pack once. The already-resolved default bundle
template (the same semantic producer whose file tree is captured under `wip/bundles/bundle-template/`)
contributes its bundle-scoped pack once per bundle named by the rendered project manifest. Inspect that pack
separately for every bundle because concrete ID/version context and title collisions can differ. Iterate
pre-included bundles in manifest order and use their rendered `bundle.yml` versions; do not guess another
template or scan source directories after planning.

A minimal deterministic order that preserves compatibility is: mandatory project catalog; valid project
pack in stable topological order; then, for each pre-included bundle in manifest order, its mandatory catalog
followed by that concrete bundle pack in stable topological order. Independent pack tasks retain declaration
order where the graph allows it. No-pack templates must still create the exact historical sequence: eight
project tasks followed by the unchanged 12-task advisor-inclusive catalog for each pre-included bundle.

Mandatory references repeat for each bundle, so the operation plan must scope `wpm:bundle:*` identities by
concrete bundle ID before dependency resolution. Likewise, a bundle template task identity must include its
concrete bundle ID in addition to Story 3.1 producer/revision/key evidence. Project mandatory references and
project-template identities need no bundle suffix. Resolve dependencies by identity in the complete plan,
not by title and not by predicted/recycled Backlog IDs.

### Provenance and Backlog Record Contract

Template-created records need a deterministic reserved WPM metadata representation visible through
`BacklogMd.readTask`: local key, resolver origin (`built-in` or `project-local` plus scope/name), defining
revision, and concrete bundle ID when applicable. Reserved labels are the narrowest existing Backlog-visible
field and may be used if their grammar is exact, collision-safe, and tested through both fake and real
adapters. Do not put provenance on mandatory records in the no-pack path, duplicate the declaration in
managed workspace state, or store source/native paths. Keep template task descriptions/DoD/extra sections
empty unless the chosen exact representation requires a description; preserve unrelated fields as pristine.

Every planned task carries dependency *identities*. During APPLY/MATERIALISE, capture the actual ID returned
from each successful `createTask` boundary and resolve the next task's dependency IDs from that map. Do not
predict IDs to perform creation and do not add a Backlog edit-after-create seam. On retry, exact existing
prefix records repopulate the same identity-to-actual-ID map after strict verification; a missing dependency,
non-prefix record, changed provenance, changed criteria/dependency, duplicate title/identity, archived task,
extra metadata, or user modification is a prewrite ownership conflict.

### Aggregate Preflight and Partial Failure

Run the Story 3.1 inspector for every applicable concrete contribution even if another contribution is
invalid, then validate the combined plan. Each blocker must name its affected producer/bundle and stable
problem code on the existing `authoring-task-plan` surface. Continue gathering independent safe target,
Backlog, packaged-content, client, destination, and ownership blockers already owned by init. No structural,
Backlog, applying-state, or handoff write may precede completion of this inspection.

The current request fingerprint already binds files/directories/aliases/tasks. Replace the task portion with
the complete planned identities, exact rendered bytes, exact provenance, and dependency identities. The
existing effect order and `MutationFailure` contract are load-bearing: task boundaries remain in plan order,
the failed beat is `MATERIALISE`, completed evidence remains truthful, and later state/receipt boundaries are
unattempted. An exact applying retry may finish only the untouched immutable plan; once the preparing receipt
exists, every task must already be present and exact before final publication.

### Architecture and Reuse

- Keep pure compilation/validation under `src/core/services/`; keep effect sequencing in
  `src/core/operations/init-project.ts`. Core imports no adapter, CLI framework, subprocess, or direct
  filesystem module and uses only the established four ports.
- Reuse the final Story 3.1 inspector/catalogs and current init action engine. Do not broaden
  `AuthoringTaskSpec` or the generic title materialiser for unrelated operation catalogs unless a concrete
  test proves a minimal shared value type is necessary.
- No new Backlog port method is expected: `createTask()` already returns the assigned ID and accepts
  dependencies/labels/description; `listTasks()`, `readTask()`, and exact inventory already support strict
  partial verification. If a port refinement proves unavoidable, keep it concrete and parity-tested.
- Keep CLI behavior under the existing `wpm init` leaf. Existing aggregate failure formatting and typed exit
  mapping should work unchanged; extend only if executable evidence proves the new contribution identity is
  not visible or machine-distinguishable.
- No new dependency, package ship root, WPM-owned skill, host process, authentication, live Codex, or live
  Claude action belongs to this story.

### Testing Guidance

Prefer a focused new pure service suite plus extensions to `test/unit/operations/init-project.test.ts` and
`test/integration/cli.init.test.ts`. Use a project template fixture with a valid project pack and at least two
pre-included bundles plus a default bundle pack. Include forward same-pack references so creation order and
actual dependency IDs are observable; use the same local key in project and bundle producers; and assert
concrete bundle instances remain distinct.

Add one aggregate invalid fixture spanning malformed project contribution, bundle-context failure,
cross-contribution rendered-title collision, unresolved dependency/identity conflict, and an independent
target or packaged-content blocker; snapshot every effect-capable fake before/after. Extend the existing
every-boundary failure sweep rather than creating a second retry harness. Include adversarial retry edits to
labels, dependencies, AC text, task status, archive inventory, and exact source-plan bytes.

For non-leakage, compose with the existing TASK-95/TASK-118/TASK-124 tar/Git/conditional-ZIP harness. Plant
unique definition and provenance sentinels and assert both path and bytes are absent while original
deliverable symlink/content/build guarantees stay intact. The npm package may still ship built-in descriptor
definitions under its declared `templates/` root; that is a separate explicit package boundary, not a
generated deliverable leak.

### Previous Story and Git Intelligence

- Story 3.1 is independently approved at integrated baseline
  `f963e332ea99d00ffb5ac737a8f9bd5c3fee529e`. Review closed six trust/aggregation/graph compatibility
  findings and the stable replacement full gate passed 136 files / 1,866 tests.
- Preserve its unsupported-YAML retention, semantic producer identity, strict concrete-context safety,
  iterative deep-graph traversal, aggregate recoverable YAML findings, and base-resolver error
  classification. Do not weaken those boundaries when moving from symbolic inspection to concrete init.
- Recent commits establish the pattern: one focused pure core capability, operation-specific immutable plan,
  exhaustive MemoryFileSystem tables, real CLI/Backlog acceptance, then package/non-leak composition. TASK-126
  should be primarily a task-plan/init/test change; no personal/workspace skill or distribution identity is
  involved.

### Expected Project Structure

- `src/core/services/project-authoring-task-plan.ts` (name refinable) for pure complete-plan compilation
- `src/core/operations/init-project.ts` for concrete template resolution, aggregate preflight, immutable
  fingerprint, task execution, and retry verification
- service/model barrels only if the new public pure contract is intentionally exported
- `test/unit/services/project-authoring-task-plan.test.ts`
- `test/unit/operations/init-project.test.ts`
- `test/integration/cli.init.test.ts`
- focused real Backlog/build/package/non-leak integration tests where existing harnesses own those boundaries
- `_bmad-output/implementation-artifacts/tests/test-summary-task-126.md`

### References

- [Source: Backlog TASK-126]
- [Source: _bmad-output/planning-artifacts/prd.md#Template-defined-authoring-tasks]
- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#Story-32-Initialize-Complete-Project-Authoring-Work]
- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#Additional-Requirements]
- [Source: _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md#Decision-1-Operation-Specific-Snapshot-and-Complete-Plan-Preflight]
- [Source: _bmad-output/implementation-artifacts/investigations/authoring-agent-backlog-materialisation-investigation.md]
- [Source: _bmad-output/implementation-artifacts/3-1-declare-and-inspect-template-authoring-tasks.md]
- [Source: src/core/services/template-authoring-tasks.ts]
- [Source: src/core/services/template-resolver.ts]
- [Source: src/core/operations/init-project.ts]
- [Source: src/core/operations/create-bundle.ts]
- [Source: src/core/ports/backlog.ts]
- [Source: test/unit/operations/init-project.test.ts]
- [Source: test/integration/cli.init.test.ts]

## Dev Agent Record

### Agent Model Used

GPT-5.6 Codex

### Implementation Plan

- RED a pure `project-authoring-task-plan` service around the final Story 3.1 inspector, then implement
  deterministic mandatory/project-pack/per-bundle-pack composition, concrete bundle scoping, topological
  ordering, provenance labels, and aggregate plan findings.
- Replace init's title-only `AuthoringTaskSpec[]` with that immutable plan, bind it into the request key,
  resolve actual returned Backlog IDs at each named MATERIALISE boundary, and strictly verify exact prefixes
  on applying retries/full plans at handoff finalization.
- Extend real init and build/non-leak acceptance around valid/invalid packs, exact dependency/provenance
  records, source removal, no-pack compatibility, and every-boundary retry; then run only the focused/static/
  build/package bands reserved to the worker before literal QA.

### Debug Log References

- Literal `bmad-create-story` invoked in YOLO mode. Customization resolution found no workflow override,
  activation prepend/append step, completion hook, or matching `project-context.md` persistent fact.
- Input discovery loaded the full sprint tracker, the governed PRD/architecture/epic projections, the scoped
  onboarding architecture addendum, the backlog-materialisation investigation, final Story 3.1 story/QA/review
  evidence, and the final resolver/inspector/catalog/init seams. No current external library/API research was
  required because TASK-126 changes no dependency, protocol, or versioned external surface.
- Literal `bmad-dev-story` invoked in YOLO mode. Its customization resolver likewise found no override,
  activation prepend/append step, completion hook, or matching persistent fact.
- RED: the initial two-file band failed at the absent `project-authoring-task-plan` module; after compiler GREEN,
  the init suite failed its two new complete-plan/aggregate expectations against the legacy mandatory-only path.
- GREEN/refactor: the focused compiler/init band reached 59/59, including exact dependency/provenance retry,
  12,000-task iterative graph, bundle-identity, and one-template-snapshot regressions.
- Literal `bmad-qa-generate-e2e-tests` invoked in YOLO mode. Its resolver found no overrides/hooks. QA added the
  real-filesystem aggregate failure case and reconciled real Backlog, packed-source-deletion, and all-format
  nonleak evidence in `tests/test-summary-task-126.md`.
- A bounded read-only seam audit found four material joins during development: derived-plan blocker
  short-circuiting, quadratic deep-graph sorting, manifest/rendered bundle identity disagreement, and a second
  project-template resolver read. Each was fixed and regression-tested; final re-audit found no additional
  P0/P1 issue.
- Final worker-owned gates passed: lint, typecheck, production build; TASK-126 59/59; final Story 3.1 contract
  89/89; CLI init 17/17; build/packager/public surfaces 45/45; package preparation 6/6; TASK95 tar/Git/
  conditional-ZIP nonleak 1/1; exact packed archive/source-deletion 1/1.
- Workflow deviation: dev-story's generic full-regression instruction was not run because the user explicitly
  reserved the exact stable full `npm test` for the independent reviewer. Focused/static/build/package gates
  were used instead, as required by the story assignment.

### Completion Notes List

- Ultimate context engine analysis completed — comprehensive developer guide created.
- Added one pure complete-plan compiler that composes mandatory work with the selected project contribution and
  each concrete pre-included bundle contribution. It preserves no-pack bytes/order, scopes bundle identities,
  emits deterministic origin/revision/key labels, aggregates conflicts, and uses an iterative stable topological
  queue proven with 12,000 forward-linked tasks.
- Fresh init now consumes one resolver snapshot for rendered files, Story 3.1 inspection, semantic provenance,
  and derived artefacts. The default bundle producer is applied once per rendered manifest bundle with exact
  manifest/path/rendered-id agreement; no source scanning or inferred alternate producer was added.
- The existing immutable init request now binds full task identities/text/provenance/dependencies. Named
  MATERIALISE actions map returned Backlog IDs to planned identities; applying/finalizing retry verifies the
  exact pristine prefix/full plan and rejects changed source bytes, labels, dependencies, status, inventory, or
  completion evidence before another write.
- Real Backlog and exact installed-archive evidence prove 22-record project/bundle plans after source deletion.
  Tar, Git, and conditional ZIP tests prove declaration/provenance bytes remain authoring-only while established
  deliverable layout/symlink/byte guarantees remain unchanged.
- Documented fresh-init consumption and source-independence in README. No new command, port, adapter,
  dependency, state store, task reconciliation path, runtime target change, host process, or authentication
  behavior was introduced.
- Literal create-story, dev-story, and QA workflows ran in YOLO with no customization hooks. The reviewer owns
  the exact stable full `npm test`; no live Claude/host action was in scope.
- Stable path-ordered 9-file README/product/test aggregate (`sha256sum <paths> | sha256sum`):
  `dcd4a0bfcd317993c19a61a65e52dbd658b22fc679ead3f04cd59de939abe8ff`.

### File List

- `_bmad-output/implementation-artifacts/3-2-initialize-complete-project-authoring-work.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-126.md`
- `README.md`
- `src/adapters/backlog-cli.ts`
- `src/core/operations/derive-artefacts-capability.ts`
- `src/core/operations/init-project.ts`
- `src/core/services/project-authoring-task-plan.ts`
- `src/core/services/template-authoring-tasks.ts`
- `test/integration/adapters/backlog-cli.test.ts`
- `test/integration/cli.build.e2e.test.ts`
- `test/integration/cli.init.test.ts`
- `test/integration/distribution-preparation/packed-install.test.ts`
- `test/unit/operations/init-project.test.ts`
- `test/unit/services/project-authoring-task-plan.test.ts`
- `test/unit/services/template-authoring-tasks.test.ts`

## Change Log

- 2026-08-24: Created the implementation-ready Story 3.2 contract from Backlog TASK-126 and final integrated
  Story 3.1 evidence via literal `bmad-create-story` in YOLO mode.
- 2026-08-24: Completed the fresh-init complete task-plan compiler, dependency/provenance materialisation,
  immutable retry proof, real Backlog/packed-source acceptance, and all-format nonleak QA; moved Story 3.2 to
  review.
- 2026-08-24: Literal `bmad-story-automator-review` auto-fixed four aggregation/materialisation trust findings;
  all 11 ACs pass with zero open findings and the single stable full gate green; moved Story 3.2 to done.

## Senior Developer Review (AI)

### Reviewer and Verdict

- Reviewer: independent persistent reviewer, literal `bmad-story-automator-review` in auto-fix mode.
- Date: 2026-08-24.
- Verdict: **APPROVE — 11/11 acceptance criteria pass; 0 open findings.**
- Stable README/product/test aggregate (path-sorted 13-file SHA-256):
  `5a668c6dad1691f74c8cc4442c822a4291fd77b22188d965e16d12d3dcd62340`.

### Findings Resolved

1. A rendered manifest or bundle projection failure prevented inspection of the independently readable project
   task contribution and the other manifest-listed bundle contributions. The diagnostic-only fallback now
   aggregates every safely available concrete contribution/context finding without exposing a plan or write.
2. Backlog CLI interpreted a valid dash-prefixed task title such as `--help` as command authority. The adapter
   now places all options before an end-of-options marker and passes the title as inert literal text; real CLI
   coverage proves both an option-looking title and criterion remain exact.
3. Quoted leading/trailing whitespace was valid to the inspector but normalized by Backlog.md, allowing a
   successful record to differ from its immutable task definition. Such non-canonical literal text now fails
   aggregate preflight before any workspace or Backlog write.
4. Init trusted task-creation returns and could publish the preparing receipt without re-reading the complete
   store. A named read-only MATERIALISE boundary now verifies actual returned IDs, resolved dependencies,
   provenance labels, pristine records, ordering, and exact active inventory before handoff preparation.

### Acceptance and Gate Evidence

- AC1-11 pass through the pure complete-plan compiler, immutable init operation, fake and real Backlog
  adapters, real CLI, exact accepted archive after source deletion, and composed tar/Git/conditional-ZIP
  nonleak evidence. No separate generation, source reconstruction, generic rollback/resume, or deliverable
  provenance path exists.
- Focused evidence: core/Story 3.1/real Backlog and CLI **10 files / 188 tests**; package preparation **6/6**;
  composed nonleak **1/1**; exact packed-install/source-deletion **1/1**.
- Static/package evidence: Biome lint (**265 files**), typecheck, production build, and `git diff --check` pass.
- Exactly one full `npm test` on the stable hash above: **137/137 files and 1,892/1,892 tests** in 605.82s.
  No product/test byte changed afterward and no replacement full run was made.
