---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/addendum.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-21.md
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-08-21'
project_name: 'work-package-manager'
user_name: 'Root'
date: '2026-08-21'
scope: 'authoring-agent-onboarding architecture addendum'
historicalProjection: '_bmad-output/planning-artifacts/architecture.md'
---

# Architecture Addendum — Authoring Agent Onboarding

_This is a scoped BMAD architecture-workflow artifact. The existing `architecture.md` is a historical projection without workflow state, so it cannot be safely resumed and is preserved unchanged. This addendum records only the implementation-significant decisions required by the approved authoring-agent-onboarding increment; `docs/00`–`14` and the fixed principles cited by the historical projection remain authoritative._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:** The approved increment contains 48 functional requirements across three epics and 21 stories. Distribution work prepares and assesses one inactive artifact without remote writes. Authoring onboarding configures Codex and Claude Code personal scopes explicitly, creates or adopts a workspace, installs workspace-local WPM skills, and prepares a fresh-agent handoff without owning an agent process. Template-defined authoring-task packs extend the mandatory Backlog.md work during existing initialization and bundle operations without becoming a second task engine.

**Non-Functional Requirements:** Eighteen cross-cutting constraints require deterministic planning, pure-core isolation, explicit ownership, complete predictable preflight before mutation, typed evidence when unforeseen writes fail partway, cold packed-install verification, stable no-write release assessment, and exclusion of authoring-only state from generated deliverables. The existing one-command-to-one-operation contract, SDLC-agnostic core, and four injected ports remain fixed.

**Scale & Complexity:** This is a medium-complexity brownfield CLI increment. Its complexity comes from coordinating several filesystem and Backlog.md boundaries safely, not from UI, real-time, multi-tenant, high-volume, or regulatory concerns.

- Primary domain: agent-mediated TypeScript CLI and filesystem artifact orchestration
- Complexity level: medium
- Architectural surface: existing model, services, operations, four ports, adapters, and CLI boundary; no new subsystem or port family

### Technical Constraints & Dependencies

- Preserve `commands -> operations -> services -> model`, with effects behind `FileSystem`, `BacklogMd`, `Clock`, and `Environment`.
- Preserve one command intent to one operation. Interactive prompting and output formatting stay at the driving edge.
- Personal setup must be valid when no project exists; project-oriented lifecycle beats may be inapplicable for that operation.
- All predictable facts for the selected operation must be read and checked before its first write.
- Backlog.md remains the task store. Stable identity reads and matching are refinements of its existing port, not authorization for reconciliation machinery.
- Publication, credentials, network mutation, and coding-agent process ownership remain outside this increment.

### Cross-Cutting Concerns Identified

- An operation needs a complete, operation-specific read snapshot and pure plan before APPLY, including projectless personal setup.
- An unforeseen failure after writes begin must remain a typed non-success through CLI handling and identify completed boundaries, the failed boundary, and recovery guidance.
- Filesystem capability inspection, ownership and receipt schemas, adapter-catalog types, Backlog identity reads, and stable-key matching are implementation-refinable data or API shapes inside existing boundaries.

## Starter Template Evaluation

### Primary Technology Domain

Existing brownfield Node.js and TypeScript CLI, driven by Commander and organized as a ports-and-adapters application.

### Starter Options Considered

No starter is appropriate for this scoped increment. The repository, toolchain, test infrastructure, module boundary, and composition root already exist, and the approved requirements explicitly preserve them. Introducing a generator would create an unrelated migration and could overwrite established architecture. A current-source check of Commander's official documentation on 2026-08-21 confirms that Commander continues to support TypeScript and locally constructed `Command` objects for larger, testable programs; it does not require adoption of a project generator for this extension.

### Selected Starter: Existing Repository

**Rationale for Selection:** Extend the current implementation in place. This addendum introduces no bootstrap command, framework migration, version decision, styling, database, deployment platform, or new first implementation story.

**Initialization Command:** Not applicable; the project is already initialized.

**Architectural Decisions Preserved:** ESM TypeScript, Commander at the driving edge, Vitest, Biome, the existing inward dependency rule, and the existing four ports remain as documented in the historical architecture projection.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical decisions:**

1. Generalize lifecycle LOAD and CHECK around an operation-specific read snapshot and complete pure plan, including operations that have no project.
2. Preserve unforeseen post-write failure as a typed non-success with boundary-level completion and recovery evidence through the CLI.

**Important decisions already fixed:** One command still invokes one operation; the six lifecycle beats retain their order; the core stays pure and SDLC-agnostic; effects still cross only `FileSystem`, `BacklogMd`, `Clock`, and `Environment`.

**Deferred or refinable shapes:** FileSystem capability inspection, ownership and receipt schemas, authoring-adapter catalog types, Backlog.md stable-identity reads, stable-key matching, and exact TypeScript interface names remain per-story refinements inside the existing boundaries.

### Decision 1: Operation-Specific Snapshot and Complete-Plan Preflight

The shared lifecycle admits an operation-specific read snapshot rather than requiring every mutation to load a `Project`. For a project-bound operation, that snapshot may contain the existing fresh `Project` projection. For personal setup it is explicitly projectless and contains the selected-client, destination, detection, ownership, packaged-content, environment, and filesystem facts needed by that request. Other operations load only the predictable facts needed by their intent.

LOAD obtains those facts through the existing four ports. CHECK remains pure: it consumes typed input plus the immutable snapshot and either rejects the request with all predictable blockers before mutation or produces the complete plan that the effectful beats will execute. APPLY, RERENDER, and MATERIALISE do not discover a predictable planning fact that should have been in the snapshot. This preserves the required no-write result for predictable failures across all selected destinations or applicable task contributions.

The lifecycle remains one command to one operation and keeps the ordered beats `LOAD -> CHECK -> APPLY -> RERENDER -> MATERIALISE -> RESULT`. An operation for which project-derived currency or authoring-task materialisation is irrelevant declares those RERENDER or MATERIALISE contributions empty; it does not fabricate a project and does not bypass the operation boundary. Interactive selection and confirmation remain CLI concerns completed before the typed operation input is invoked.

This is a generalization of the existing operation harness, not a new subsystem. It adds no network, executor, credential, or coding-agent-process port and does not authorize publication behavior.

### Decision 2: Typed Partial-Mutation Non-Success

A predictable CHECK failure remains a typed domain failure before mutation. Separately, if an unforeseen effect failure occurs after APPLY has begun, the core converts it into a typed mutation non-success rather than allowing it to collapse into the generic unexpected-error path or an `OperationResult` that implies success.

The non-success preserves, in deterministic operation-plan order, which named mutation boundaries completed, which boundary failed, and which later boundaries were not attempted. It carries the failed lifecycle beat, the observable evidence already produced at completed boundaries, and actionable forward-recovery guidance. The single CLI boundary recognizes this typed failure, renders the boundary evidence and recovery, and returns a non-zero result under the existing exit-code contract. Debug detail may supplement that result but cannot replace the structured evidence.

Completed effects are reported as completed. The outcome promises neither automatic rollback nor a generic resume or reconciliation engine, and it never recommends pretending that completed writes did not occur. An operation may make an identical retry converge when its own idempotency and ownership rules support that behavior; this does not change the failure contract into a global rollback or resume mechanism.

### Unaffected Architectural Categories

This addendum makes no data-store, authentication, API, frontend, infrastructure, deployment, dependency-version, or remote-distribution decision. Backlog.md remains the authoring-task persistence boundary, the filesystem remains the artifact boundary, and output remains a driving-adapter concern rather than a port.

### Decision Impact Analysis

**Implementation sequence:** First establish the lifecycle snapshot/plan seam and typed mutation-failure semantics at the model and operation boundary. Then carry the typed non-success through the existing CLI handler. Individual setup, workspace, handoff, and template-materialisation stories can subsequently supply their operation-specific snapshots, plans, named boundaries, and recovery text.

**Cross-component dependencies:** The pure CHECK plan defines the same ordered boundaries whose progress a post-write failure reports. CLI rendering depends on the typed failure contract but does not own its facts. Operation-specific ownership, receipt, adapter, filesystem-capability, and stable-task-identity representations may be refined independently so long as they preserve these two contracts and use the existing ports.

## Implementation Patterns & Consistency Rules

### Critical Conflict Points

Two areas could otherwise diverge between implementing agents: whether a non-project operation bypasses or fakes the lifecycle, and whether an effect failure becomes a raw exception, a warning-success, an attempted rollback, or a structured non-success.

### Snapshot and Plan Pattern

- Keep operation input, read snapshot, pure plan, and effect progress conceptually distinct even if their exact TypeScript shapes are refined per story.
- LOAD gathers predictable facts only through existing injected ports. A projectless operation uses a real operation-specific snapshot; it never manufactures a dummy `Project` or reaches directly for HOME, process state, or the host filesystem from core code.
- CHECK performs no effects or additional port reads. It validates the whole applicable request and returns one deterministic plan or a typed pre-write failure containing all predictable blockers.
- The plan defines the ordered, named effect boundaries that APPLY and the applicable automatic beats will attempt. The effectful beats consume that plan rather than re-deciding selections, ownership, destinations, dependencies, or task identity from newly discovered predictable state.
- RERENDER and MATERIALISE remain lifecycle beats. Their operation-specific contribution may be empty, but an implementation must not create a second ad hoc mutation path merely because either beat is irrelevant.

### Partial-Mutation Failure Pattern

- Record a boundary as completed only after that boundary's planned effect has completed successfully; retain the observable evidence needed for recovery.
- On an unforeseen effect failure after writes begin, emit the typed mutation non-success with an ordered account of completed, failed, and not-attempted plan boundaries. Never convert it to an exit-zero result or a non-fatal warning.
- Preserve the underlying cause for diagnostics, but do not require the CLI to parse exception text to recover boundary facts.
- The CLI formats the structured evidence, gives the operation-specific forward recovery, and exits non-zero. It does not infer rollback, claim restoration, or hide effects that already completed.
- Retry convergence is demonstrated by operations whose ownership and idempotency contracts require it; no shared generic rollback, resume, or reconciliation protocol is introduced.

### Structure and Naming Boundaries

Existing project naming, test placement, model/service/operation/adapter structure, and CLI result conventions remain in force. Exact interface, discriminator, field, receipt, adapter-catalog, capability-inspection, and stable-identity names are refinable; their semantics must remain explicit and typed rather than encoded only in prose messages.

### Enforcement Guidelines

All implementation agents must:

- preserve one command to one operation and the existing four-port composition;
- prove predictable rejection occurs before the first write across the whole applicable plan;
- prove a projectless operation requires no manifest or fabricated project context;
- inject a failure after at least one planned boundary and prove the CLI reports completed, failed, and unattempted boundaries with a non-zero result;
- retain the core import-boundary lint rule and avoid executor, network, credential, or process-management abstractions.

Good implementations make the CHECK-produced plan and failure evidence independently assertable with fake ports. Anti-patterns include checking the second destination only after writing the first, catching an I/O error and returning an `OperationResult` with warnings, deleting completed writes to simulate rollback, bypassing the lifecycle for personal setup, or adding a port for behavior already expressible through the existing four.

## Project Structure & Boundaries

### Existing Structure Used by These Decisions

This addendum creates no new top-level subsystem and does not rename the existing project. The complete architecture-affected slice is:

```text
src/
├── cli.ts                              # composition root and command registration
├── adapters/
│   ├── node-fs.ts                      # real FileSystem implementation
│   ├── memory-fs.ts                    # deterministic FileSystem fake
│   ├── backlog-cli.ts                  # real BacklogMd implementation
│   ├── fake-backlog.ts                 # deterministic BacklogMd fake
│   ├── process-env.ts                  # real Environment implementation
│   ├── fake-env.ts                     # deterministic Environment fake
│   ├── system-clock.ts                 # real Clock implementation
│   └── fixed-clock.ts                  # deterministic Clock fake
├── core/
│   ├── errors.ts                       # typed pre-write and mutation non-success semantics
│   ├── model/
│   │   └── operation.ts                # operation success/failure evidence contracts
│   ├── operations/
│   │   ├── lifecycle.ts                # snapshot/plan lifecycle and progress preservation
│   │   ├── init-project.ts             # project initialization consumer
│   │   ├── create-bundle.ts            # bundle creation consumer
│   │   └── [existing operation files]  # workspace/setup operations follow the same seam
│   ├── ports/
│   │   ├── filesystem.ts
│   │   ├── backlog.ts
│   │   ├── clock.ts
│   │   └── environment.ts
│   └── services/                       # pure planning, validation, and materialisation logic
└── util/
    ├── confirm.ts                      # driving-edge human authorization
    └── exit.ts                         # typed failure formatting and exit mapping

test/
├── unit/
│   ├── model/                          # success and non-success contract assertions
│   ├── operations/                     # pure plan, beat order, and injected-boundary failure tests
│   ├── errors.test.ts                  # typed failure and exit-category behavior
│   └── util/exit.test.ts               # CLI rendering without message parsing
└── integration/
    ├── adapters/                       # real/fake port parity where relevant
    └── cli.*.test.ts                    # no-write preflight and partial-failure consumer outcomes

agent-skills/                            # packaged WPM skill assets; unchanged by these decisions
templates/                               # built-in template data; unchanged architecture boundary
```

Bracketed existing operation files indicate the already-established operation tier, not a new wildcard directory or prescribed filename. Exact new file names remain story-level refinements; their architectural homes do not.

### Architectural Boundaries

**Driving boundary:** `src/cli.ts` and CLI utilities obtain interactive authorization, invoke one typed operation, render structured success or failure, and select the existing exit code. They do not reconstruct mutation progress from text.

**Operation boundary:** `src/core/operations/` owns LOAD, pure CHECK/plan, APPLY sequencing, empty or applicable RERENDER and MATERIALISE contributions, and progress preservation. It depends on ports, never adapters.

**Model and error boundary:** `src/core/model/` and `src/core/errors.ts` expose typed success, predictable pre-write failure, and post-write mutation non-success semantics without printing or terminating the process.

**Effect boundary:** Existing adapters implement the four ports. Capability probes, ownership evidence, receipts, and Backlog identity reads extend those port contracts only where their implementing story proves the need; they do not create a fifth port.

### Requirements and Epic Mapping

- **Epic 1 — distribution preparation:** remains outside `src/core` and outside the CLI package ship set as required by NFR17. This addendum adds no publication or remote-state architecture.
- **Epic 2 — onboarding and handoff:** personal setup consumes a projectless snapshot/plan; workspace integration and handoff consume project/workspace-specific plans; all post-write failures use the typed non-success contract.
- **Epic 3 — template-defined tasks:** initialization, bundle creation, and bundle enablement validate the complete mandatory-plus-template plan before APPLY and preserve boundary evidence for unforeseen failures during project, bundle, or Backlog.md effects.

### Integration and Data Flow

```text
authorized CLI input
  -> one operation
  -> LOAD via existing ports
  -> pure CHECK produces complete ordered plan
  -> APPLY via existing ports records boundary progress
  -> applicable or empty RERENDER / MATERIALISE continue that progress
  -> typed success OR typed mutation non-success
  -> CLI formatting and exit code
```

No HTTP API, database, event bus, credential store, process manager, or remote publication integration is introduced. Build and packaged-asset structure remains governed by the historical architecture and the scoped requirements rather than being redefined here.

## Architecture Validation Results

### Coherence Validation ✅

**Decision compatibility:** Operation-specific snapshots generalize the existing fresh-per-operation projection without weakening the six-beat lifecycle. The CHECK-produced plan supplies the same ordered boundaries used by the typed partial-mutation failure, so pre-write validation and post-write evidence describe one operation consistently. Neither decision changes the technology stack, four-port composition, pure-core rule, or one-command-to-one-operation boundary.

**Pattern consistency:** The snapshot/plan and mutation-progress patterns prevent the two known divergent implementations: fabricating or bypassing project context, and losing partial effects in either success warnings or generic exceptions. Refinable schemas remain explicitly separated from the semantic decisions.

**Structure alignment:** The existing model, error, lifecycle, port, adapter, and CLI seams can host the decisions. No new top-level component or integration boundary is required.

### Requirements Coverage Validation ✅

**Epic coverage:** Epic 2's personal setup, workspace integration, and handoff operations can plan without requiring a project and can retain partial-write evidence. Epic 3's project and bundle operations can validate the full mandatory-plus-template plan before mutation and report failures across structural, derived-artifact, and Backlog.md boundaries. Epic 1 remains governed by its explicit outside-core, no-remote-write constraint and requires neither decision to introduce publication behavior.

**Functional coverage:** Together with the preserved historical architecture, the addendum supplies the missing architectural semantics for the current FR2–FR49 requirements. It does not add, remove, or reinterpret a functional requirement.

**Non-functional coverage:** The decisions directly close the NFR4 preflight and partial-write gap while preserving NFR1–NFR3's pure core, SDLC agnosticism, determinism, and idempotency boundaries. Existing ownership, authoring-agent separation, non-leakage, headless operation, Backlog.md persistence, exit-code, no-remote-write, and stable-assessment constraints remain supported by the historical architecture and scoped requirements.

### Implementation Readiness Validation ✅

**Decision completeness:** Both blocking semantics state their invariant, lifecycle placement, CLI consequence, exclusions, and permitted refinement boundary. No technology version is introduced by either decision.

**Structure completeness:** Every affected architectural tier and integration point is mapped to its existing home. Exact new filenames and interface names remain deliberately unfrozen because they are not cross-story architectural decisions.

**Pattern completeness:** The rules cover complete predictable reads, pure planning, projectless operation behavior, progress evidence, non-zero CLI handling, retry versus rollback, port discipline, and failure-injection verification.

### Gap Analysis Results

- **Critical gaps:** None within this architecture addendum.
- **Important gaps:** None. The two high architecture findings in the readiness report are resolved by Decisions 1 and 2.
- **Refinements, not gaps:** FileSystem capability reads, receipt and ownership schemas, adapter-catalog types, Backlog identity reads, stable-key matching, and concrete type/file names remain story-owned shapes within the decided boundaries.

This architecture validation does not clear unrelated epic/story-contract findings or replace the required implementation-readiness rerun.

### Architecture Completeness Checklist

**Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**

- [x] Critical decisions documented; neither introduces a technology version
- [x] Existing technology stack preserved and fully referenced
- [x] Integration patterns defined
- [x] Applicable determinism and bounded-work considerations addressed

**Implementation Patterns**

- [x] Existing naming conventions preserved and new semantic names bounded
- [x] Structure patterns defined
- [x] CLI/core communication pattern specified
- [x] Preflight, mutation-failure, recovery, and retry patterns documented

**Project Structure**

- [x] Complete affected directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements-to-structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION for the scoped architecture decisions

**Confidence Level:** High

**Key strengths:** The change is minimal, composes with the existing lifecycle, preserves the four-port pure core, gives all affected operations one preflight rule, and keeps partial mutation observable without introducing rollback or resume machinery.

**Future enhancement boundary:** Public distribution activation and template-task evolution remain deferred. The refinable data and interface shapes listed above should be selected only when their owning stories reach concrete implementation.

### Implementation Handoff

Implementation agents must treat the historical architecture and this addendum together. The first story that needs projectless setup or multi-boundary mutation must establish the shared snapshot/plan and typed non-success seams with pure and CLI-level tests; this does not mandate an additional story or change the approved epic count.
