---
baseline_commit: e1e6e9894d12977bd4b57999242bd212f10a880b
---

# Story 3.1: Declare and Inspect Template Authoring Tasks

Status: done

<!-- Created by literal bmad-create-story in YOLO mode for Backlog TASK-125. -->

## Story

As a template author,
I want to declare and preview the additional authoring work contributed by a project or bundle template,
so that package authors can understand it before using the template.

## Acceptance Criteria

1. Given a valid template declares additional authoring tasks; when it is inspected through the existing template-show experience; then the template identity and revision and each task's stable key, task text, observable acceptance outcomes, dependencies, and materialisation scope are shown.
2. Given a valid authoring-task contribution is inspected; when its relationship to mandatory WPM work is reported; then it is identified as additional work that cannot replace or disable the mandatory catalog.
3. Given a task uses contextual values in its text or acceptance outcomes; when the task contribution is inspected; then every value is resolved from literal text or documented WPM-provided context.
4. Given template tasks depend on one another or on mandatory WPM project or bundle tasks; when the contribution is inspected; then every dependency resolves through a documented stable reference.
5. Given distinct template producers declare the same local stable key; when their otherwise-valid contributions are inspected; then their producer-scoped identities remain distinct and neither declaration is rejected as a duplicate of the other.
6. Given one template producer and revision declares the same local stable key more than once; when its contribution is inspected; then the duplicate declaration is reported as invalid.
7. Given a template declares no additional authoring tasks; when it is inspected; then it reports no additional authoring-task contribution.
8. Given a contribution is malformed, has duplicate keys or rendered-title collisions, requires unavailable context, has unresolved or cyclic dependencies, or contains unsupported non-declarative content; when it is inspected; then every detected problem is reported together and the contribution is not presented as valid.
9. Given any template contribution is inspected; when inspection completes successfully or with validation findings; then inspection leaves the template unchanged and performs no project, bundle, or authoring-backlog mutation.

## Tasks / Subtasks

- [x] Extend templates as inert data without widening their effect boundary (AC: 1-8)
  - [x] Add an optional, revisioned authoring-task contribution to the template descriptor/model; retain exact producer identity, local stable key, task text, outcome-focused acceptance criteria, dependencies, and the scope derived from the project-or-bundle producer.
  - [x] Keep existing templates without a contribution valid and report an explicit no-contribution result; do not alter their files, snippets, parameters, or scaffold behavior.
  - [x] Define a closed declarative vocabulary for task text and WPM-provided context. Reject prompts, hooks, executable interpolation, arbitrary template parameters, unknown fields, and unsupported expression forms.
- [x] Compile and inspect one complete contribution in the pure core (AC: 2-8)
  - [x] Add a total inspection/validation service that renders all task text and acceptance outcomes from literal text plus only context documented for that template scope, derives producer-scoped identities, and returns one deterministic aggregate report.
  - [x] Publish stable mandatory project/bundle task references from the existing mandatory catalogs while preserving their titles, criteria, order, and cardinality; resolve dependencies only to same-pack keys or applicable documented mandatory references.
  - [x] Detect every safely discoverable malformed field, duplicate local key, rendered-title collision, unavailable/unresolved context reference, unresolved dependency, self-edge/cycle, and unsupported non-declarative value in one pass. A report with findings is invalid and must not expose the pack as a valid contribution.
- [x] Extend the existing read-only template-show experience (AC: 1-9)
  - [x] Reuse `resolveTemplate` and the current `template show` leaf; show template identity/revision, producer-scoped and local keys, rendered text/outcomes, resolved dependencies, derived materialisation scope, and the append-only relationship to mandatory work.
  - [x] Render no-contribution and invalid-contribution states explicitly. Validation findings remain inspectable and machine-distinguishable without introducing a mutating command or touching a project, bundle, Backlog root, template, or generated deliverable.
- [x] Prove schema, graph, provenance, CLI, and immutability boundaries (AC: 1-9)
  - [x] Add focused pure unit tables for project and bundle contributions, two producers sharing a local key, duplicate keys, title collisions, all context/dependency failures, multi-cycle graphs, unsupported content, stable ordering, and no-contribution compatibility.
  - [x] Add real-filesystem/CLI acceptance coverage for valid, absent, and multi-finding invalid project/bundle templates; snapshot every relevant root before/after successful and findings-bearing inspection.
  - [x] Run the focused template/model/schema/resolver/CLI bands plus lint, typecheck, boundary checks, production build, and literal QA in YOLO; leave the exact stable full `npm test` to the independent reviewer.

## Dev Notes

### Goal and Scope Boundary

Story 3.1 establishes an inspectable declaration contract only. Template-defined tasks remain inert data: this
story does not materialise a task, modify `.authoring-backlog`, change initialization or bundle operations,
adopt legacy tasks, reconcile drift, reconstruct missing task history, or create a parallel task engine. Stories
3.2 and 3.3 consume the validated declaration when they extend initialization and bundle create/enable.

Extend the existing `Template` / `template.yml` model and the existing project-aware `wpm template show`
experience. Do not add a top-level subsystem or new CLI leaf. Keep the core pure and total over data already
loaded through the injected FileSystem port; inspection performs no Backlog, Environment, Clock, process,
authentication, or client-host action.

### Declaration and Identity Contract

The contribution is optional and revisioned. Its producer identity is derived deterministically from the
selected template's stable scope/name identity rather than from a global local task key. A task's local key is
unique within one producer revision, while its externally inspectable identity includes the producer and
revision so two different producers may both declare (for example) `write-docs` without collision.

Keep the declaration grammar closed and declarative. Task titles and acceptance outcomes may contain literal
text and a documented WPM context reference only. Context availability is scope-specific and comes from WPM,
not from arbitrary template parameters, prompts, environment variables, files, command execution, helper
callbacks, or template-authored code. Reuse the established strict `{{kebab-name}}` substitution semantics
where practical, but give authoring-task context its own closed allowlist and aggregate unresolved/unsupported
forms instead of throwing at the first one.

Materialisation scope is a derived fact, not a template-controlled replacement mode: project-template work is
for project initialization; bundle-template work is for the applicable bundle create/enable path. Inspection
must say that the contribution is appended to WPM's mandatory catalog and cannot replace or disable it.

### Dependency and Mandatory-Catalog Contract

Expose documented stable references beside the current mandatory project and bundle task definitions. Preserve
the exact mandatory task titles, acceptance criteria, order, advisor conditional, and cardinalities; unrelated
command-triggered task catalogs remain unchanged. A template dependency may resolve only to a local key in the
same contribution or to an applicable mandatory reference. It may not name another template producer, a raw
Backlog ID/title, or a future workspace-global history record.

Build the full local-plus-mandatory dependency graph before declaring the contribution valid. Aggregate
unresolved references and every cycle (including self-cycles) deterministically. Title collision checks use
the fully rendered task title and include collisions between contribution tasks and applicable mandatory
titles; a collision is invalid rather than an implicit replacement.

### Inspection and Failure Semantics

Keep base template resolution behavior compatible, but retain enough descriptor evidence for the inspector to
report all independent authoring-task findings together. A malformed contribution must not be silently dropped
by the schema parser, thrown as a first-problem stack trace, or printed as valid. The structured inspection
report should distinguish `none`, `valid`, and `invalid`, carry deterministic findings with field/task
locations, and preserve unaffected metadata/file-tree output.

Both valid and findings-bearing `template show` paths are read-only. Tests must snapshot the built-in/project
template roots and any resolved project, bundle, deliverable, and authoring-backlog surfaces before and after.
No declaration or provenance metadata may be copied into the generated deliverable in this story.

### Architecture and Reuse

- Extend `src/core/model/template.ts` and `src/core/services/schema/template.ts`; do not introduce a second
  template descriptor parser.
- Add a focused pure service beside `template-resolver.ts` for compilation/inspection and export it through the
  existing service/model barrels. Keep CLI formatting in `src/cli.ts`.
- Reuse the template resolver's project-local-shadowing semantics and the established renderer's literal
  placeholder grammar where it fits; do not invoke filesystem reads from graph/context validation.
- Refactor `projectWideAuthoringTasks()` and `perBundleAuthoringTasks()` only enough to publish stable mandatory
  reference metadata while preserving every existing consumer and task byte.
- Do not change `materialiseAuthoringTasks()` in Story 3.1; its title-only behavior is deliberately replaced by
  operation-specific identity handling in Stories 3.2/3.3.

### Testing Guidance

Use MemoryFileSystem tests for exhaustive schema/context/graph aggregation and NodeFileSystem CLI tests for the
immutable inspection boundary. Cover forward references, duplicate edges, disconnected cycles, collisions
that appear only after rendering, same local key under project and bundle producers, context that is valid for
one scope but unavailable for the other, and multiple concurrent findings with stable ordering. Retain all
existing template-show output assertions and no-description/no-contribution compatibility.

No WPM-owned skill changes in this story, so no skill-creator or live Codex/Claude behavioral gate applies.
Live Claude remains deferred to the post-TASK-127 exact-final-revision gate.

### Previous Story and Git Intelligence

- Story 2.11 was independently approved at integrated baseline
  `e1e6e9894d12977bd4b57999242bd212f10a880b`; 14/14 criteria passed with zero open findings and stable full
  `npm test` evidence (134 files, 1,824 tests).
- Preserve its source-free package, six-skill, handoff, Backlog continuation, and complete tar/Git/zip non-leak
  contracts. TASK-125 should not change onboarding skills, personal/workspace state, package ship boundaries,
  host launching, or generated-deliverable content.
- The current resolver parses `template.yml` and populates `files`/`snippets`; the current `template show`
  formatter is a thin read-only shell over that resolver. The mandatory project/bundle catalogs are currently
  code-owned `AuthoringTaskSpec[]`, while the materialiser is title-idempotent and intentionally insufficient
  for the later exactly-once template-task stories.

### Expected Project Structure

- `src/core/model/template.ts`
- `src/core/services/schema/template.ts`
- `src/core/services/template-resolver.ts`
- a focused pure authoring-task inspection service under `src/core/services/`
- `src/core/operations/init-project.ts` and `src/core/operations/create-bundle.ts` only for stable mandatory
  reference catalogs with byte-compatible current task specs
- `src/cli.ts` for existing `template show` formatting/wiring
- focused schema/service/CLI unit tests and one real-filesystem inspection integration band
- `_bmad-output/implementation-artifacts/tests/test-summary-task-125.md`

### References

- [Source: Backlog TASK-125]
- [Source: _bmad-output/planning-artifacts/prd.md#template-defined-authoring-tasks]
- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#story-31-declare-and-inspect-template-authoring-tasks]
- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#additional-requirements]
- [Source: _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md]
- [Source: _bmad-output/implementation-artifacts/investigations/authoring-agent-backlog-materialisation-investigation.md]
- [Source: _bmad-output/implementation-artifacts/2-11-complete-the-cold-packed-install-to-handoff-journey.md]
- [Source: src/core/model/template.ts]
- [Source: src/core/services/schema/template.ts]
- [Source: src/core/services/template-resolver.ts]
- [Source: src/core/services/render.ts]
- [Source: src/core/services/materialisation.ts]
- [Source: src/core/operations/init-project.ts]
- [Source: src/core/operations/create-bundle.ts]
- [Source: src/cli.ts#templateModule]

## Dev Agent Record

### Agent Model Used

GPT-5.6 Codex

### Implementation Plan

- Extend the existing template descriptor/model with a closed optional task pack and retain malformed pack
  evidence for aggregate inspection rather than first-error mutation paths.
- Add a pure compiler/inspector for context rendering, producer-scoped identity, mandatory/local dependency
  resolution, collision/cycle detection, and deterministic `none | valid | invalid` results.
- Surface the report through existing `template show`, then prove compatibility, aggregate findings, and
  read-only real-filesystem behavior before literal QA.

### Debug Log References

- Literal `bmad-create-story` invoked in YOLO mode. Customization resolution found no workflow override,
  activation prepend/append step, completion hook, or matching `project-context.md` persistent fact.
- Literal `bmad-dev-story` invoked in YOLO mode. Customization resolution likewise found no workflow override,
  activation prepend/append step, completion hook, or matching `project-context.md` persistent fact.
- Literal `bmad-qa-generate-e2e-tests` invoked in YOLO mode. Customization resolution likewise found no
  workflow override, activation prepend/append step, completion hook, or matching `project-context.md`
  persistent fact.
- RED: the initial two-file band failed at the missing inspector module and absent raw-declaration retention;
  the first GREEN passed 4 files / 64 tests plus typecheck.
- Final focused QA passed 6 task-specific unit files / 93 tests, 7 mandatory/template compatibility files /
  90 tests, 4 real integration files / 10 tests, package preparation 6/6, lint, typecheck, build, and diff check.

### Completion Notes List

- Added a strict optional `revision` + `authoring-tasks` descriptor contract while retaining malformed task
  bytes only at the explicit untrusted boundary. The discriminated pure inspection result is `none`, `valid`,
  or `invalid`; invalid declarations expose all deterministic findings and no compiled tasks.
- Added resolver-derived built-in/project-local producer provenance, strict portable registry names,
  descriptor identity agreement, typed YAML/schema failures, closed WPM context rendering, stable local and
  mandatory references, title/dependency/cycle aggregation, and terminal-safe output through the existing
  `template show` command.
- Published unique stable references beside the unchanged mandatory project/bundle catalogs. Existing
  materialised task titles, criteria, order, advisor conditional, and cardinalities remain byte-compatible;
  the conditional advisor task is not advertised as an unconditional template dependency.
- Documented the shipped inert declaration/context/reference vocabulary in README and guarded it against
  catalog drift. No design-set document, materialiser, port, adapter, Backlog state, initialization/bundle
  mutation, WPM-owned skill, package manifest, or onboarding surface changed.
- Literal create-story, dev-story, and QA workflows ran in YOLO. Their resolvers found no overrides/hooks.
  The exact stable full `npm test` remains reserved for the independent reviewer; no live Claude/host action
  was in scope.
- Stable path-ordered 16-file product/test/docs aggregate:
  `5e6808bb287b3042edc84427dd7c69a3a5531a26402aa0cdf91f9184274c94b6`.

### File List

- `_bmad-output/implementation-artifacts/3-1-declare-and-inspect-template-authoring-tasks.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-125.md`
- `README.md`
- `src/cli.ts`
- `src/core/model/index.ts`
- `src/core/model/operation.ts`
- `src/core/model/template.ts`
- `src/core/operations/create-bundle.ts`
- `src/core/operations/init-project.ts`
- `src/core/services/schema/template.ts`
- `src/core/services/template-authoring-tasks.ts`
- `src/core/services/template-resolver.ts`
- `test/integration/cli.template-show.e2e.test.ts`
- `test/unit/cli/template-commands.test.ts`
- `test/unit/docs/template-documentation-drift.test.ts`
- `test/unit/schema/template.test.ts`
- `test/unit/services/template-authoring-tasks.test.ts`
- `test/unit/services/template-resolver.test.ts`

## Change Log

- 2026-08-24: Created the implementation-ready Story 3.1 contract from Backlog TASK-125 and the integrated
  Story 2.11 evidence via literal `bmad-create-story` in YOLO mode.
- 2026-08-24: Completed the inert declaration/schema, aggregate pure inspector, stable mandatory-reference
  catalogs, safe existing template-show output, author-facing contract, and real-binary read-only QA; moved
  Story 3.1 to review.
- 2026-08-24: Literal `bmad-story-automator-review` auto-fixed six trust, aggregation, graph-robustness, and
  compatibility findings; all 9 ACs pass with zero open findings and the stable replacement full gate green.

## Senior Developer Review (AI)

### Reviewer and Verdict

- Reviewer: independent persistent reviewer, literal `bmad-story-automator-review` in auto-fix mode.
- Date: 2026-08-24.
- Verdict: **APPROVE — 9/9 acceptance criteria pass; 0 open findings.**
- Stable README/product/test aggregate (path-sorted 16-file SHA-256):
  `413c4ca9c057479c0d3ce81ab4fffcb28b1efb5333196b3c7dd670ef9588644f`.

### Findings Resolved

1. Unsupported YAML tags were reduced to ordinary scalar text by the descriptor parser. Parser warnings are
   now retained as inert, located `unsupported-yaml-content` findings, so prompt/exec-looking tags can never
   be presented as a valid declarative contribution.
2. The pure inspector trusted a caller-supplied producer scope/name independently of the selected template.
   Producer/template identity disagreement now invalidates the contribution and exposes no compiled tasks.
3. Concrete WPM context was substituted after raw text safety checks. Empty, whitespace-only, C0/C1,
   Unicode format, line/paragraph separator, and surrogate-bearing values now fail before a task can be valid.
4. Recursive cycle detection exhausted the JavaScript stack on a large valid dependency chain. An iterative,
   deterministic graph traversal now handles the 12,000-task regression while retaining disconnected and
   self-cycle findings.
5. Recoverable YAML parse errors inside `authoring-tasks` bypassed the aggregate invalid report. Parser errors
   now join independently discoverable schema/context/dependency findings; unrecoverable base descriptors
   retain the established authoring-error boundary.
6. Base template YAML/schema/registry authoring defects had been reclassified as domain validation failures,
   changing existing debug diagnostics. The resolver again treats base defects as unexpected authoring errors
   while keeping contribution-level findings structured and inspectable.

### Acceptance and Gate Evidence

- AC1-9: valid project/bundle, absent, malformed, duplicate/collision, context, dependency/cycle, provenance,
  stable-catalog, terminal-safety, and complete read-only root evidence passes through the pure service,
  existing CLI surface, built CLI, and real filesystem.
- Focused evidence: task-specific plus generic CLI acceptance **7 files / 114 tests**; mandatory operation/
  template compatibility **7/90**; real built integration **4/10**; package preparation **1/6**.
- Static/package evidence: typecheck, Biome lint (**263 files**), production build, and `git diff --check` pass.
- First full `npm test`: **135/136 files and 1,865/1,866 tests** in 530.60s. Its sole failure was the existing
  no-stack assertion matching literal `at ` in a newly typed base-descriptor message. Focused reproduction
  then exposed the underlying compatibility classification, which was corrected before the hash was frozen.
- Required replacement full `npm test` on the stable hash above: **136/136 files and 1,866/1,866 tests** in
  545.93s. No further product/test byte change or full-suite rerun occurred.
