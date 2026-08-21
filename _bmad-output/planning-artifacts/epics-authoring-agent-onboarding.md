---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/addendum.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md
  - _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-21.md
---

# work-package-manager - Authoring Agent Onboarding Epic Breakdown

## Overview

This document provides the scoped epic and story breakdown for cross-agent authoring onboarding in work-package-manager. The existing `epics.md` projection is a read-only historical baseline; completed foundation, command-surface, and authoring-workspace work is not restated as new scope. The PRD and its downstream-input addendum define the governed increment, the historical architecture and scoped architecture addendum constrain its implementation, and the readiness report supplies the bounded story corrections applied here.

## Requirements Inventory

### Functional Requirements

Deferred activation outcome (not a current functional requirement): After human-authorized distribution activation, a bootstrap agent with no WPM skill installed can identify the approved WPM channels, obtain and verify one genuine release, satisfy its prerequisites, and invoke the `wpm` CLI from public instructions.

FR2: Installing the WPM CLI candidate, or a later public CLI package, leaves every coding-agent personal and workspace configuration unchanged until the user explicitly runs WPM setup.

FR3: WPM recognises Codex and Claude Code as supported authoring tools and exposes their stable IDs and human-readable names wherever setup or help needs them.

FR4: Each supported adapter exposes its personal skill destination, workspace skill destination, native front door, detection result, native launch hint, and reload guidance.

FR5: Codex authoring integration uses `~/.agents/skills` personally, `.agents/skills` in a workspace, and `AGENTS.md` as its workspace front door.

FR6: Claude Code authoring integration uses `~/.claude/skills` personally, `.claude/skills` in a workspace, and `CLAUDE.md` as its native workspace front door.

FR7: When setup is invoked without explicit authoring-tool IDs, it lets the user select Codex, Claude Code, or both in one interaction and shows detection only as a hint.

FR8: Interactive setup changes no personal agent scope until one concise summary of the selected tools and destinations is confirmed.

FR9: Agent-driven or other non-interactive setup accepts one or more explicit authoring-tool IDs as authorization and does not prompt.

FR10: An explicit supported selection can be configured even when its detection probe is absent.

FR11: An empty or unknown setup selection is rejected before any personal scope is changed.

FR12: Setup installs only the personal `wpm-create-package` bootstrap skill into the selected personal scopes.

FR13: The same setup action installs, updates, or leaves unchanged each selected destination, reports the outcome, and creates no duplicate skill content.

FR14: Setup retains the selected authoring agents as defaults for later workspace creation without changing `manifest.yml.targets`.

FR15: The same setup action migrates a WPM-owned legacy personal `installer-builder` installation to the new bootstrap surface while preserving and reporting an unowned or user-modified copy.

FR16: Once WPM is available, the personal `wpm-create-package` skill guides prerequisite checking, explicit authoring-agent setup, workspace creation, and fresh-session handoff, then stops at the workspace boundary.

FR17: WPM carries and materialises `wpm-author`, `wpm-author-bundle`, `wpm-author-recipe`, `wpm-author-skill`, and `wpm-review-package` as independently discoverable workspace-local skills that can each be reconciled and verified without treating the family as one monolith.

FR18: `wpm-author` independently orients a fresh workspace session, resumes or claims authoring-backlog work, handles project-level authoring, and routes focused work only to specialist skills present in the same workspace.

FR19: `wpm-author-bundle` independently supports planning and changing one bundle, including its capability boundary, metadata, dependencies, payload registration, and lifecycle, while leaving recipe-, skill-, and review-specific work to the corresponding specialist skills.

FR20: The `wpm-` prefix is reserved for WPM-owned skills and is not imposed on user payload skills, `<project>-installer`, or `<bundle>-advisor` names.

FR21: Workspace creation accepts explicit authoring-agent selections and can use the defaults retained by setup.

FR22: A generated workspace exposes the WPM authoring skill family and concise native front door through every selected adapter's project scope, while unselected adapter integrations are not generated implicitly.

FR23: Managed authoring state outside `wip/` records selected adapters, installed skill versions, owned paths, integration origin, and the information needed to reconcile later updates.

FR24: Reapplying workspace integration updates WPM-owned skills and managed front-door content while preserving surrounding user-authored content.

FR25: A workspace created under the legacy `installer-builder` front-door model can adopt the new workspace skill family without changing its deliverable or losing its authoring-backlog history.

FR26: Workspace creation emits a durable, machine-readable handoff receipt containing the workspace root, the configured authoring-adapter set, and per-adapter native launch hints, expected front doors, reload guidance, required first skill, and verification entry point.

FR27: A verification surface reports whether the current working directory, configured authoring-adapter set, every configured adapter's native front door and workspace skill family, authoring backlog, and handoff receipt agree, with recovery guidance specific to each affected adapter.

FR28: Failed handoff verification identifies each mismatched or missing surface and provides a recovery action with a non-zero result.

FR29: WPM provides adapter-specific launch guidance but does not claim to have spawned, authenticated, or assumed lifecycle ownership of an authoring-agent process.

FR30: A project or bundle template may declare an inert authoring-task pack whose entries have producer-scoped stable keys, task text composed only from literal text and documented WPM context, observable acceptance criteria, and dependencies on same-pack keys or documented mandatory project or bundle task keys.

FR31: WPM materialises a selected project-template pack during new workspace initialization and a selected or recorded bundle-template pack during bundle creation or enablement.

FR32: Template-defined tasks append to the mandatory project or bundle tasks of the same operation and cannot replace or disable them.

FR33: Within initialization, bundle creation, or bundle enablement, each selected pack revision and stable key is materialised at most once. A proven same-key, same-definition task is preserved; an ambiguous ownership or different-definition collision fails before mutation.

FR34: Each materialised template task exposes its stable key, template origin, and defining revision in Backlog.md, and its stable-key dependencies resolve to the corresponding Backlog.md task IDs, including documented mandatory project or bundle references.

FR35: Malformed definitions, duplicate keys or rendered-title collisions, unavailable context, unresolved dependencies, cycles, and ownership conflicts in the applicable mandatory-plus-template plan are reported before initialization, bundle creation, or bundle enablement mutates the project, bundle, or authoring backlog.

FR36: Later changes to or removal of a source or default template do not modify already-materialised tasks. Bundle enablement uses its recorded contribution and never guesses the current default; updating existing task contributions, drift reconciliation, and automatic task retirement are deferred.

FR37: The existing template inspection experience exposes a template's authoring-task contribution and validation findings before the template is selected.

FR38: A generated work-package deliverable contains none of the workspace authoring backlog, managed onboarding state, workspace authoring front doors, or WPM workspace-authoring skills.

FR39: WPM exposes distribution as inactive until all activation facts are authorized, reports every missing fact together, rejects occupied or unapproved identities as eligible, and makes no unavailable public-coordinate claim.

FR40: A clean checkout produces an inspectable WPM CLI package containing every required runtime, declared executable, template, WPM skill, document, license, and metadata file while excluding development and local state.

FR41: A fresh supported environment can install the exact local package, invoke every declared executable, resolve packaged resources without the source checkout, and receive actionable prerequisite failures.

FR42: WPM can produce an inactive candidate record binding the observed package and version, proposed tag, source commit, exact package bytes, size, digests, packed-install evidence, and release-note preview without creating remote state.

FR43: Given GitHub policy facts and supplied or read-only observed state, WPM reports a no-write staging assessment, missing activation prerequisites, compatible existing state, and incompatible tag, release, or asset conflicts without changing GitHub or Git state.

FR44: Given npm policy facts and supplied or read-only registry state, WPM reports a no-write publication assessment, missing coordinate, final-tag, provenance, or authority facts, compatible existing state, conflicts, and later manual-authority states without changing npm state.

FR45: Combined GitHub and npm observations are classified as blocked, ready, matching, resumable, conflicting, or complete; compatible partial completion is preserved and conflicts never recommend rollback, overwrite, retagging, or version reuse.

FR46: Starting from the verified local package, a bootstrap agent can reach explicit adapter setup and workspace creation without repository-relative resources, while packaged skills, setup guidance, front doors, inert installation, and handoff behavior agree.

FR47: `wpm-author-recipe` independently supports creating and revising install-backlog recipes with detect, setup, verify, state, migration, observable acceptance-criteria, and receipt concerns kept coherent.

FR48: `wpm-author-skill` independently supports authoring and revising advisors, installer helpers, payload skills, and native front doors with the correct role, discovery scope, trigger, registration, and authoring/executor separation.

FR49: `wpm-review-package` independently supports a fresh context-less review of package structure, references, registration, version constraints, executor simulation, build non-leakage, and release readiness.

### NonFunctional Requirements

NFR1: The implementation preserves the ports-and-adapters dependency rule: core code depends only on models, services, and injected ports and imports no CLI framework, subprocess library, or OS/filesystem module directly.

NFR2: The core remains SDLC-agnostic and contains no coding-agent process launcher, credential/session manager, or methodology-specific workflow model.

NFR3: Personal setup, workspace-integration reapplication, supported template-task materialisation operations, distribution preparation, and release-state assessment are deterministic. Operations defined as repeatable are idempotent; workspace initialization continues to reject an existing target.

NFR4: Before its first write, setup validates every selected personal destination, and initialization, bundle creation, and bundle enablement validate every predictable workspace and applicable task-plan dependency. Predictable failures leave all affected surfaces unchanged. If an unforeseen I/O failure occurs after writes begin, the result identifies the exact completed and failed boundaries and recovery guidance; WPM does not promise generic rollback, resume, or reconciliation.

NFR5: WPM mutates or removes only content it can identify as WPM-owned; unowned or user-modified content is preserved and reported.

NFR6: Authoring-agent choice and deliverable target-agent choice remain independent data axes throughout the CLI, model, persisted state, and generated artifacts.

NFR7: Workspace authoring-only content, including template authoring-task definitions and provenance, is excluded from generated zip, tarball, and git deliverables. Definitions may remain in existing authoring template or scaffold locations, materialised provenance remains in authoring state, and the WPM CLI package has a separate explicit ship-set contract.

NFR8: Each WPM-owned skill is independently discoverable and usable under both supported platforms' official skill contracts, with a focused activation description and progressive disclosure so only knowledge relevant to that skill's named job enters context.

NFR9: Interactive setup has an equivalent headless form suitable for agents, scripts, and CI.

NFR10: Clean packed-install, inactive release-state assessment, Codex-only, Claude-Code-only, multi-agent, headless, repeat/update, legacy-migration, template declaration and inspection, project initialization, bundle creation, bundle enablement, handoff, and generated-deliverable non-leakage journeys are verifiable from cold isolated environments.

NFR11: Projects and templates without authoring-task packs retain their current mandatory-task behavior, and scoped initialization, creation, or enablement operations add neither inferred template work nor duplicate tasks.

NFR12: Public command failures remain machine-distinguishable under the existing exit-code contract, and help text explains the supported adapter IDs and recovery paths.

NFR13: Backlog.md remains the authoring-task persistence mechanism; stable template identity metadata is neither a parallel task engine, a command-event ledger, nor a workspace-reconstruction store, and WPM requires no manual edits under a backlog root.

NFR14: The feature introduces no GUI, telemetry, agent installation, remote template marketplace, mandatory login, publication credential, protected release environment, or remote write.

NFR15: Distribution status, package metadata, documentation, CLI help, packaged assets, skills, and generated front doors remain mutually consistent; while distribution is inactive, none claims an available public coordinate.

NFR16: Candidate preparation and every channel assessment use one persisted packed artifact; independently rebuilt artifacts are never assumed to have identical bytes.

NFR17: Distribution-preparation tooling remains outside `src/core`, outside the WPM CLI package ship set, and outside generated work-package deliverables, and exposes no remote mutation or credential capability.

NFR18: For the same candidate, policy facts, and observed snapshots, release-state classification is stable across reruns; incompatible state fails closed and preserves compatible externally completed work.

### Additional Requirements

- The existing PRD and architecture are projection shims; `docs/00`–`14` remain authoritative, and any design-set change remains a human approval gate.
- The feature must preserve the thin-builder/fat-agent boundary: WPM delivers instructions and observable handoff state, while the user's chosen agent performs authoring work.
- Authoring adapters are a builder/onboarding concept and must not reuse the deliverable's `manifest.yml.targets` as their source of truth.
- Adapter-specific path, front-door, launch-hint, reload, and detection data should be expressed once and consumed by setup, workspace generation, status, and tests without duplicating the portable authoring workflow.
- Interactive prompting and terminal formatting remain driving-adapter concerns; core operations return structured results and never print.
- Personal-scope writes continue through the injected FileSystem and Environment boundaries rather than direct HOME or OS access from core code.
- The existing `initProject` operation refuses an existing target. Epic 2 legacy-workspace reapplication concerns managed skills and front doors only; it is not a template-task reconciliation entry point.
- The title-only materialiser is insufficient for exactly-once template tasks. Initialization, bundle creation, and bundle enablement require a Backlog identity/read boundary for template stable keys, not a general authoring-task reconciliation API.
- Template-defined tasks carry stable key, inspectable origin/revision, documented context, outcome-focused acceptance criteria, and dependencies without prescribing a separate reconstruction or history store.
- Mandatory project and bundle tasks expose documented stable references where template tasks need dependencies. Unrelated command-triggered catalogs and their cardinalities remain unchanged.
- Template authoring-task definitions remain inert data. Task text may use literal text and documented WPM-provided context only; arbitrary promptable parameters, template-defined input prompts, executable interpolation, hooks, and arbitrary code are deferred.
- The mandatory-plus-template graph applicable to one initialization, bundle creation, or bundle enablement operation must be validated before structural APPLY or backlog materialisation begins.
- Predictable schema, rendering, key, dependency, provenance, and planned-collision failures occur before that operation mutates anything; an unforeseen mid-write I/O failure reports its completed boundary and recovery without a generic rollback, resume, or reconciliation guarantee.
- Template contributions extend the mandatory WPM task catalog. Replacement mode and disabling core safety/review tasks are deferred.
- Template-provided custom workspace authoring skills are deferred from this scope; templates may contribute deterministic authoring tasks only.
- A selected project default bundle contribution remains available for later bundle creation or enablement. Changing the source or default affects future selections only and does not update existing project or bundle tasks.
- Template-pack evolution for existing projects or bundles, drift reconciliation, legacy template-task adoption, missing-backlog or fresh-clone reconstruction, generic authoring-task reconciliation, and durable event history for command-triggered task producers are deferred.
- Template task-pack definitions and provenance are authoring-only state and never enter generated work-package deliverables.
- The six WPM-owned skills -- `wpm-create-package`, `wpm-author`, `wpm-author-bundle`, `wpm-author-recipe`, `wpm-author-skill`, and `wpm-review-package` -- are independently reviewable capabilities. Each is delivered by its own story; no omnibus skill-family story substitutes for any individual skill.
- **Skill Story Definition-of-Done supplement:** for any story that creates or changes a WPM-owned skill, the implementer refreshes to the latest official stable authoring helper available at execution time and actually invokes, during that story, either Codex's official `$skill-creator` or Claude Code's official `skill-creator@claude-plugins-official`. The story evidence records the authoring helper and host version, the then-current official Codex and Claude Code skill-authoring source links and access date, and fresh-session verification against both platforms' applicable discovery, explicit-invocation, natural-language trigger, non-trigger, and outcome contracts. A prior skill story's authoring or evidence does not satisfy this gate.
- The Skill Story Definition-of-Done supplement is one conditional shared backlog DoD item, not repeated acceptance-criteria text. Each skill story also owns packed-install availability and generated-deliverable non-leakage evidence for its own artifact rather than deferring those checks to a later family or test-only story.
- The current official authoring references are [OpenAI's Build skills guide](https://learn.chatgpt.com/docs/build-skills), [Claude Code's Extend Claude with skills guide](https://code.claude.com/docs/en/skills), and [Anthropic's skill-authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices); story implementation re-checks their then-current versions rather than treating these planning-time observations as frozen.
- The new personal bootstrap skill and workspace family replace the monolithic primary authoring surface, while compatibility behavior preserves WPM-owned legacy installations and user content.
- Codex and Claude Code are the P0 authoring adapters. Hermes and OpenClaw remain deferred until their current primary contracts are re-verified.
- The normal onboarding experience is one setup action followed by workspace creation and a fresh-workspace handoff. Adapter inspection, detection, installation, update, reconciliation, and legacy migration are not separate required user steps.
- An existing agent normally supplies its own stable authoring-tool ID; another ID is supplied only when the user asks to configure that tool too. A direct human invocation without IDs receives one chooser and one confirmation.
- Setup success reports the configured tools, only applicable reload guidance, and one exact resume action. Detailed ownership and path evidence is reserved for conflicts and diagnostics.
- The public npm/package identifier must not resolve users to the unrelated package currently occupying `wpm`; registry publication itself remains a separate human-authorized release action.
- The current distribution milestone is prepared but inactive. Selecting the public identity and channel policy, configuring authority or trust, creating tags or releases, publishing to npm, and public verification are deferred human-authorized activation work.
- For this increment, the bounded activation-fact inventory is the public npm coordinate, public executable-name or alias policy, GitHub/npm channel roles and precedence, stable-versus-prerelease mapping, GitHub immutability policy, the bounded npm-public/GitHub-pending recovery policy, and the authority or trust evidence required by each channel. Readiness reports every unresolved item in this inventory; it does not invent a value.
- One clean, packed-install-tested WPM package is persisted as the candidate assessed for both future channels; the two channels do not rebuild it independently.
- Stories 1.2 and 1.3 establish generic, revision-scoped ship-set inspection and packed-install harnesses for whatever assets the evaluated source revision declares. Each later WPM-owned-skill story owns adding and proving its own packaged asset; Story 2.11 proves the complete six-skill family. After all scoped stories, the final cold gate reruns those harnesses from the final revision, regenerates the inactive candidate from the resulting exact bytes, and assesses only that refreshed candidate.
- Current GitHub and npm preparation accepts supplied or read-only state and produces classifications only. It contains no mutation boundary and does not reuse `wpm build publish`, which publishes generated work-package deliverables.
- The existing `_bmad-output/planning-artifacts/epics.md` is an immutable historical source and is not a direct input to this correction run; this workflow writes only `epics-authoring-agent-onboarding.md`.

### UX Design Requirements

The subsequent BMAD UX validation is recorded under `ux-designs/ux-work-package-manager-2026-08-20/`. Its binding result is one continuous setup, reload/resume, workspace creation, and fresh-session verification journey. Adapter inspection, detection, updating, reconciliation, and migration remain implementation states rather than extra required user steps. The actionable interaction requirements are captured in FR7–FR11, FR26–FR29, NFR9, NFR12, and the Additional Requirements above.

### FR Coverage Map

Deferred activation outcome: Public acquisition remains outside the current ready set and has no current-branch story.

| Functional requirement | Story coverage |
|---|---|
| FR2 | Stories 1.3 and 2.11 |
| FR3-FR6 | Story 2.1 |
| FR7-FR15 | Story 2.10 |
| FR16 | Story 2.9 |
| FR17 | Stories 2.7 and 2.11 |
| FR18 | Story 2.6 |
| FR19 | Story 2.2 |
| FR20 | Stories 2.4 and 2.7 |
| FR21 | Stories 2.9-2.11 |
| FR22 | Stories 2.7 and 2.11 |
| FR23-FR25 | Story 2.7 |
| FR26-FR29 | Stories 2.8 and 2.11 |
| FR30, FR32, FR35, FR37 | Story 3.1 |
| FR31-FR36 (project scope) | Story 3.2 |
| FR31-FR36 (bundle scope) | Story 3.3 |
| FR38 | Story 2.11 |
| FR39 | Story 1.1 |
| FR40 | Story 1.2 |
| FR41 | Story 1.3 |
| FR42 | Story 1.4 |
| FR43 | Story 1.5 |
| FR44 | Story 1.6 |
| FR45 | Story 1.7 |
| FR46 | Story 2.11 |
| FR47 | Story 2.3 |
| FR48 | Story 2.4 |
| FR49 | Story 2.5 |

## Epic List

### Epic 1: Verified WPM Distribution Preparation

A WPM maintainer can produce, inspect, install, and bind one exact inactive WPM candidate and assess how future GitHub and npm distribution would converge, without choosing a public identity or mutating either channel.

**FRs covered:** FR2, FR39-FR45

### Epic 2: Agent-Guided Package Creation and Workspace Handoff

A user's existing Codex or Claude Code agent can configure WPM through one setup action, use a focused personal bootstrap skill to create or adopt a workspace, and hand work to a fresh workspace-root agent equipped with five independently reviewable workspace skills, correct native front doors, and a verified shared authoring backlog.

**FRs covered:** FR3-FR29, FR38, FR46-FR49

### Epic 3: Template-Defined Authoring Tasks

During new workspace initialization and bundle creation or enablement, WPM appends every selected template-defined authoring task exactly once alongside mandatory work, with validated dependencies and inspectable provenance.

**FRs covered:** FR30-FR37

### Deferred Boundary: Template Evolution and Backlog Reconstruction

Updating existing project or bundle tasks from later template revisions, reconciling changed or removed definitions, reconstructing a missing gitignored authoring backlog, and recovering historical command-triggered work are separate future scope. A fresh agent in Epic 2 means a new session in the prepared workspace, not a fresh clone.

### Deferred Activation Boundary: Verified Public Distribution

After a later human authorization of identity, policy, authority, and trust, a cold bootstrap agent can acquire and verify the same WPM release through approved public channels. This boundary records the deferred activation outcome and has no current-branch stories.

## Story Dependency Map

These are direct `requires` edges for later Backlog CLI creation; transitive dependencies are intentionally omitted.

```text
1.1: []
1.2: [1.1]
1.3: [1.2]
1.4: [1.3]
1.5: [1.4]
1.6: [1.4]
1.7: [1.5, 1.6]
2.1: []
2.2: [1.3, 2.1]
2.3: [1.3, 2.1]
2.4: [1.3, 2.1]
2.5: [1.3, 2.1]
2.6: [2.2, 2.3, 2.4, 2.5]
2.7: [2.6]
2.8: [2.7]
2.9: [2.8]
2.10: [2.9]
2.11: [2.10]
3.1: []
3.2: [3.1]
3.3: [3.2]
```

After Story 3.3, the final cold gate reruns the Story 1.2 package inspection and Story 1.3 packed-install harness against the final revision, regenerates and rebinds the Story 1.4 inactive candidate from those exact bytes, and reruns Stories 1.5–1.7 assessments against only that refreshed candidate. This is verification of current state, not another story or a remote release action.

## Epic 1: Verified WPM Distribution Preparation

A WPM maintainer can produce, inspect, install, and bind one exact inactive WPM candidate and assess how future GitHub and npm distribution would converge, without choosing a public identity or mutating either channel.

Stories 1.2 and 1.3 establish generic package and packed-install contracts for the assets declared by the source revision under test. They do not claim that assets introduced by later stories already exist. Candidate records are likewise revision-bound and may be regenerated without remote effects; the final cold gate rebinds the candidate after all scoped package-affecting work is complete.

### Story 1.1: Expose an Inactive Distribution Contract

As a WPM maintainer,
I want distribution readiness to fail closed while activation facts remain unresolved,
So that preparation cannot imply or enable public distribution accidentally.

**Acceptance Criteria:**

**Given** one or more items in the bounded activation-fact inventory are unresolved or lack the required authorization or control evidence
**When** distribution readiness is assessed
**Then** the distribution is reported as inactive and every unresolved inventory item is reported together.

**Given** distribution is inactive
**When** package metadata, documentation, CLI help, and bootstrap guidance are inspected
**Then** none presents an unresolved coordinate or channel as canonical or publicly obtainable.

**Given** a proposed package coordinate is unresolved, observed as occupied by incompatible state, or lacks explicit WPM authorization plus read-only evidence of availability or WPM control
**When** release eligibility is assessed
**Then** package metadata or registry state alone cannot make it eligible.

### Story 1.2: Establish the Clean Exact Package Boundary

As a WPM maintainer,
I want a clean checkout to produce an inspectable WPM package,
So that I know exactly what a consumer would receive without relying on local development state.

**Acceptance Criteria:**

**Given** a clean checkout at a specific source revision without ignored build output, caches, or contributor-local state
**When** the distributable package is produced
**Then** packaging succeeds without requiring any absent local state.

**Given** a package has been produced from a clean checkout
**When** its source binding is inspected
**Then** the package is bound to the evaluated revision and its declared ship set.

**Given** a produced package
**When** its boundary is inspected
**Then** its paths, package identity, version, and executable targets are reported.

**Given** a produced package
**When** its declared ship set is inspected
**Then** every runtime, executable, template, WPM skill, document, license, and metadata asset required by that revision is present and resolvable.

**Given** a later source revision declares another required ship-set asset
**When** that revision is inspected through the same package-boundary contract
**Then** omission of that asset is rejected without requiring a special-case inspection rule for its artifact type.

**Given** prohibited development, backlog, planning, workspace-authoring, credential, or preparation content is present, or required content is absent
**When** inspection completes
**Then** the package is rejected and every detected violation is identified.

### Story 1.3: Deliver a Fresh Local Packed-Install Journey

As a package user or bootstrap agent,
I want to install and exercise the exact local package in a fresh environment,
So that I can verify the consumer journey independently of the source repository.

**Acceptance Criteria:**

**Given** an inspected package for a specific source revision and a fresh supported environment without its source checkout
**When** that exact package is installed
**Then** installation succeeds.

**Given** the exact package is installed in the fresh environment
**When** each declared executable is invoked
**Then** every executable starts and reports the installed package version consistently.

**Given** only the installed package is available
**When** its resources are resolved
**Then** every packaged resource required by that revision's declared ship set remains available without a repository-relative path.

**Given** snapshots of supported coding-agent personal and workspace configuration
**When** the package is installed without explicit WPM setup
**Then** every configuration remains unchanged.

**Given** a required prerequisite is absent or unsupported
**When** installation or invocation is attempted
**Then** the failure identifies the prerequisite and an actionable recovery condition.

### Story 1.4: Produce an Inactive Verifiable Candidate

As a WPM maintainer,
I want one inactive candidate record to bind the verified package and its evidence,
So that later channel assessments use one auditable artifact without rebuilding or guessing.

**Acceptance Criteria:**

**Given** an exact package that passed inspection, quality checks, and packed-install verification
**When** candidate preparation completes
**Then** one inactive record binds its package and version, proposed tag, source commit, exact artifact, size, digests, verification evidence, and release-note preview.

**Given** any recorded package, revision, artifact, digest, quality, or install evidence is missing or inconsistent
**When** eligibility is assessed
**Then** the candidate is ineligible and every discrepancy is reported.

**Given** public identity or channel-policy decisions remain unresolved
**When** candidate preparation runs
**Then** the candidate can still be prepared locally but remains inactive with those facts reported.

**Given** candidate preparation succeeds or fails
**When** external state is inspected afterward
**Then** no tag, release, asset, npm version, dist-tag, or trust setting has changed.

**Given** the exact package bytes, source revision, proposed tag, and verification evidence are unchanged
**When** candidate preparation is repeated
**Then** the candidate retains the same package identity, digests, and evidence binding without creating a second candidate identity.

**Given** any package bytes, source revision, proposed tag, or required verification evidence differs from the recorded binding
**When** candidate preparation is repeated
**Then** the prior candidate identity is not silently reused and the changed binding is reported before channel assessment.

### Story 1.5: Assess GitHub Release Staging Without Writes

As a WPM maintainer,
I want a no-write assessment of the candidate against GitHub policy and observed state,
So that missing prerequisites and conflicts are known before activation is authorized.

**Acceptance Criteria:**

**Given** an inactive verified candidate and GitHub policy and state supplied by the caller or available through permitted read-only observation
**When** GitHub staging is assessed
**Then** the required tag, draft metadata, exact assets, checksums, notes, evidence, and unresolved policy facts are reported.

**Given** observed GitHub state matches the candidate
**When** assessment completes
**Then** matching tags, drafts, releases, and assets are recognized without proposing duplicates.

**Given** a tag targets another commit or a release or asset conflicts with the candidate
**When** assessment completes
**Then** the affected object and hard conflict are identified.

**Given** any assessment outcome
**When** Git and GitHub state are inspected afterward
**Then** nothing has been created, changed, moved, or deleted.

### Story 1.6: Assess npm Publication Without Writes

As a WPM maintainer,
I want a no-write assessment of the candidate against npm policy and observed state,
So that identity, authority, provenance, and immutable-version conflicts are known before activation.

**Acceptance Criteria:**

**Given** an inactive verified candidate and npm policy and state supplied by the caller or available through permitted read-only observation
**When** npm publication is assessed
**Then** the required coordinate, version, exact artifact, final dist-tag, provenance, repository identity, authority, and unresolved policy facts are reported.

**Given** observed npm state matches the candidate and its approved final tag
**When** assessment completes
**Then** it is recognized without proposing republication.

**Given** an immutable npm version has candidate-matching bytes and metadata but its approved final dist-tag is absent or differs
**When** assessment completes
**Then** the version is reported as compatible state requiring later manual dist-tag authority rather than as a hard immutable-version conflict.

**Given** existing registry bytes or immutable metadata for the candidate version differ from the candidate
**When** assessment completes
**Then** the affected version is reported as a hard conflict.

**Given** a compatible version still needs later manual dist-tag authority or an immutable version is conflicting
**When** assessment reports the recovery boundary
**Then** overwrite, version reuse, republication, or automatic tag repair is not presented as safe.

**Given** any assessment outcome
**When** npm and trust state are inspected afterward
**Then** no package, tag, ownership, credential, or trusted-publisher state has changed.

### Story 1.7: Classify Convergent Dual-Channel State

As a WPM maintainer,
I want the GitHub and npm assessments combined into one stable result,
So that later authorization can distinguish safe progress, compatible partial completion, and conflicts.

**Acceptance Criteria:**

**Given** one candidate and assessments of that candidate for both channels
**When** combined state is evaluated
**Then** it receives exactly one classification under this precedence, from first match to last: `conflicting`, `blocked`, `complete`, `resumable`, `matching`, or `ready`.

| Classification | Mutually exclusive condition after higher-precedence conditions are excluded |
|---|---|
| `conflicting` | A supplied assessment binds a candidate version or digest different from the persisted candidate or the other assessment, or either channel reports a hard conflict. |
| `blocked` | No mismatch or hard conflict exists, but a required candidate binding, item in the bounded activation-fact inventory, or read-only observation needed to derive a non-empty required boundary set or the next safe boundary is absent. |
| `complete` | The supplied policy yields a non-empty required boundary set, and every required channel boundary is externally complete and matches the candidate. |
| `resumable` | At least one required channel boundary is externally complete, at least one remains outstanding, and every completed or observed object is compatible with the candidate. |
| `matching` | No required channel boundary is complete, at least one candidate-bound external object exists, and every observed object is candidate-compatible. A candidate-matching immutable npm version awaiting its approved final dist-tag is compatible but incomplete. |
| `ready` | All required facts are sufficient, no required channel boundary is complete, and no candidate-bound external object exists. |

**Given** the GitHub and npm assessments bind different candidate versions or digests
**When** combined state is evaluated
**Then** it fails closed as `conflicting` and identifies both candidate identities.

**Given** a required candidate binding or assessment identity is absent rather than contradictory
**When** combined state is evaluated
**Then** it is `blocked`, not `conflicting`, and identifies the missing binding.

**Given** one channel or release stage completed compatibly while another remains incomplete
**When** combined state is evaluated
**Then** it is `resumable`, completed work is preserved, and only the outstanding forward boundary is identified.

**Given** either channel conflicts with the candidate
**When** combined state is evaluated
**Then** the affected channel and object are identified.

**Given** combined state is `conflicting`
**When** recovery guidance is reported
**Then** rollback, overwrite, retagging, or version reuse is not recommended.

**Given** identical candidate, policy, and channel observations are evaluated repeatedly
**When** no input changes
**Then** the classification and evidence remain stable.

**Given** combined state is evaluated
**When** local and external release state are inspected afterward
**Then** no state has been mutated.

## Epic 2: Agent-Guided Package Creation and Workspace Handoff

A user's existing Codex or Claude Code agent can configure WPM through one setup action, use a focused personal bootstrap skill to create or adopt a workspace, and hand work to a fresh workspace-root agent equipped with five independently reviewable workspace skills, correct native front doors, and a verified shared authoring backlog.

The conditional Skill Story Definition-of-Done supplement in Additional Requirements applies to Stories 2.2–2.6 and 2.9. These stories are separate quality and ownership boundaries; they do not add separate steps to the user's onboarding journey.

### Story 2.1: Establish the Codex and Claude Code Authoring-Client Contract

As a package author,
I want WPM to identify supported authoring clients and their native surfaces consistently,
So that I can configure the intended authoring environment without confusing it with package target agents.

**Acceptance Criteria:**

**Given** a user or agent requests the supported authoring clients
**When** WPM presents its inventory or relevant help
**Then** Codex appears with stable ID `codex`
**And** Claude Code appears with stable ID `claude-code`
**And** both retain consistent human-readable names.

**Given** Codex authoring support is inspected
**When** its contract is returned
**Then** it identifies `~/.agents/skills` as the personal skill destination, `.agents/skills` as the workspace destination, and `AGENTS.md` as the workspace front door
**And** it supplies the current detection result and Codex-specific launch and reload guidance.

**Given** Claude Code authoring support is inspected
**When** its contract is returned
**Then** it identifies `~/.claude/skills` as the personal skill destination, `.claude/skills` as the workspace destination, and `CLAUDE.md` as the workspace front door
**And** it supplies the current detection result and Claude-Code-specific launch and reload guidance.

**Given** a project's authoring clients differ from its deliverable targets
**When** WPM reports or retains either set
**Then** both sets preserve their own values
**And** no authoring client is inferred from or written to `manifest.yml.targets`.

**Given** Hermes, OpenClaw, an empty value, or an unknown identifier is presented as an authoring client
**When** WPM evaluates its support status
**Then** Codex and Claude Code remain the only selectable P0 clients
**And** deferred and invalid identifiers are machine-distinguishable and are not reported as successfully configured.

### Story 2.2: Plan and Change Bundles with `wpm-author-bundle`

As a package author,
I want a focused `wpm-author-bundle` skill,
So that I can plan or change one bundle without loading unrelated authoring guidance.

**Acceptance Criteria:**

**Given** `wpm-author-bundle` is invoked without a prior bootstrap conversation
**When** a bundle's capability boundary is incomplete or ambiguous
**Then** what belongs in that bundle, what is an external dependency, and what remains a separate capability are explicit
**And** unresolved author decisions are surfaced rather than invented.

**Given** the boundary of a new or existing bundle is agreed
**When** the skill completes the requested bundle work
**Then** the bundle's stated purpose and lifecycle state are represented in WPM-managed project state
**And** each required metadata value, declared dependency, and payload registration either resolves through that state or is reported as unresolved
**And** no unresolved bundle-level concern is reported as complete.

**Given** the work also requires recipe authoring, skill or front-door authoring, or whole-package review
**When** `wpm-author-bundle` reaches that boundary
**Then** it leaves the distinct work explicitly pending without claiming to have completed it
**And** its bundle-level result remains independently usable.

**Given** the workspace, bundle identity, or requested dependency is invalid or conflicting
**When** the skill evaluates the requested bundle work
**Then** the blocking condition and affected boundary are identified
**And** no successful bundle result is claimed.

### Story 2.3: Author Install Recipes with `wpm-author-recipe`

As a package author,
I want a focused `wpm-author-recipe` skill,
So that I can create or revise a self-contained installation recipe that a fresh executor can safely run and resume.

**Acceptance Criteria:**

**Given** `wpm-author-recipe` is invoked without a prior bootstrap conversation
**When** an author describes a new installation outcome
**Then** the resulting install backlog expresses the required detect, setup, and verify work
**And** dependencies that affect execution order are explicit
**And** that install backlog remains the single recipe task source.

**Given** an existing recipe must support a newer version
**When** the skill completes the revision
**Then** desired-state work expresses the current intended result
**And** one-time transition work is limited to the prior-version states for which it applies
**And** previously shipped migration history is not silently redefined.

**Given** a context-less executor runs or resumes the resulting recipe
**When** it evaluates a task for completion
**Then** the task has observable acceptance outcomes
**And** every required receipt fact is completion-gated
**And** completed work can be distinguished without relying on the authoring conversation.

**Given** a recipe lacks required verification, contains ambiguous state or migration work, or has unresolved or cyclic dependencies
**When** its authoring outcome is assessed
**Then** every discoverable blocker is identified
**And** the recipe is not presented as ready.

### Story 2.4: Author Agent Skills and Front Doors with `wpm-author-skill`

As a package author,
I want a focused `wpm-author-skill` skill,
So that each agent capability is discoverable at the intended stage without crossing authoring and executor boundaries.

**Acceptance Criteria:**

**Given** `wpm-author-skill` is invoked without a prior bootstrap conversation
**When** an author requests an advisor, install-time helper, payload skill, or native front door
**Then** the completed capability identifies its role, intended user, activation moment, and discovery scope.

**Given** the capability's role is established
**When** its resulting placement is reviewed
**Then** an advisor is discoverable before installation, an install-time helper is available during its relevant install, and a payload skill becomes discoverable only after delivery
**And** a native front door reaches only its intended agent context.

**Given** an authored capability's role is known
**When** its discovery contract is inspected
**Then** its focused trigger, registration, and native discovery behavior agree with that role.

**Given** a WPM-owned or package-owned skill identity is inspected
**When** its namespace is evaluated
**Then** the `wpm-` prefix is accepted only for WPM-owned skills and a conflicting user-authored identity is reported
**And** user payload skills, `<project>-installer`, and `<bundle>-advisor` retain package-owned names without the prefix being imposed.

**Given** workspace-authoring and deliverable-executor instructions exist in the same project
**When** their front-door scopes are inspected
**Then** each is discoverable only in its intended context and neither is represented as the other.

**Given** the requested role or discovery scope remains ambiguous or conflicts with an existing artifact
**When** the skill reaches that unresolved boundary
**Then** it identifies the decision or conflict without inventing a placement
**And** it does not claim the capability is correctly discoverable.

### Story 2.5: Review Work Packages with `wpm-review-package`

As a work-package author,
I want a focused skill to review a package from a fresh context,
So that defects are found before the package is handed off.

**Acceptance Criteria:**

**Given** no prior authoring conversation is available
**When** `wpm-review-package` reviews a workspace
**Then** it evaluates the bounded FR49 catalog: package structure, references, registrations, version constraints, context-less executor simulation, build non-leakage, and release readiness.

**Given** the bounded review catalog is evaluated
**When** review inputs are resolved
**Then** its complete scope is derivable from durable workspace and deliverable artifacts without another WPM skill or prior conversation supplying hidden context.

**Given** package structure, references, registrations, or version constraints contain defects
**When** package coherence is reviewed
**Then** every detected defect in those four catalog categories is reported with its affected artifact or relationship in one review result.

**Given** a bundle represents a fresh installation or version transition
**When** its executor experience is simulated without authoring context
**Then** unstated prerequisites, ambiguous outcomes, unresolved references, undeclared coupling, and missing verification or usage guidance are reported.

**Given** build or release readiness is reviewed
**When** the review concludes
**Then** readiness is reported only when package coherence, executor simulation, and build evidence agree.

**Given** a workspace-authoring surface is found in the prospective deliverable
**When** build non-leakage is reviewed
**Then** release readiness is blocked.

**Given** release readiness is reported
**When** the review result is presented
**Then** it is not presented as publication authorization.

**Given** no separate fix authorization was supplied
**When** package review completes
**Then** the reviewed workspace and deliverable content remain unchanged.

### Story 2.6: Resume and Route Project Work with `wpm-author`

As a fresh workspace authoring agent,
I want `wpm-author` to orient me and select the right work,
So that I can continue authoring without the bootstrap conversation.

**Acceptance Criteria:**

**Given** a fresh session at the workspace root
**When** `wpm-author` begins
**Then** it identifies the authoring workspace, deliverable, build output, and authoring backlog from durable state
**And** it does not interpret executor-facing deliverable instructions as authoring instructions.

**Given** the authoring backlog contains in-progress work
**When** the agent asks to continue authoring
**Then** resumable work is surfaced before any new task is claimed
**And** continuing it creates no duplicate task.

**Given** no task is in progress and dependency-eligible authoring work exists
**When** the agent asks to continue
**Then** exactly one eligible task can be claimed and is observable as the current work.

**Given** no task is in progress and no authoring work is dependency-eligible
**When** the agent asks to continue
**Then** the backlog remains unchanged and the absence of eligible work is reported.

**Given** the current task concerns project-level authoring
**When** `wpm-author` handles it
**Then** the task can reach its observable outcome without requiring a specialist skill
**And** its durable artifacts and authoring-backlog state remain coherent.

**Given** the current task concerns a bundle, recipe, agent skill or front door, or package review
**When** `wpm-author` routes it
**Then** only the matching workspace specialist receives the focused work
**And** a missing or incompatible specialist produces integration-recovery guidance rather than an unrelated substitution.

**Given** the current directory is not a valid authoring workspace root, managed authoring state is missing or corrupt, or the authoring backlog is unavailable or malformed
**When** `wpm-author` begins or attempts to continue work
**Then** every affected prerequisite is identified with one applicable recovery action.

**Given** `wpm-author` detects an invalid workspace, managed-state, or backlog context
**When** the authoring backlog and workspace artifacts are inspected afterward
**Then** no task is claimed, resumed, or changed and no workspace artifact is mutated.

### Story 2.7: Deliver and Reconcile Workspace Authoring Integration

As a work-package author,
I want each explicitly selected authoring client to receive the workspace's WPM authoring integration,
So that supported agents can author safely without depending on personal authoring state.

**Acceptance Criteria:**

**Given** an explicit non-empty selection of supported workspace authoring clients
**When** workspace integration is applied
**Then** only the selected clients receive their native workspace scopes and front doors.

**Given** an explicit workspace authoring-client selection
**When** workspace integration reads or records that selection
**Then** the selection neither derives from nor changes the deliverable's target agents.

**Given** the workspace authoring-client selection is empty or contains an unsupported client
**When** integration is requested
**Then** the selection is rejected with a machine-distinguishable result.

**Given** workspace integration rejects its authoring-client selection
**When** workspace and deliverable surfaces are inspected afterward
**Then** every surface remains unchanged.

**Given** workspace creation or adoption has a predictable target, Backlog.md, authoring-task-plan, selected-client, destination, or ownership conflict
**When** the complete workspace request is evaluated
**Then** every predictable blocker and its recovery are reported before the first write.

**Given** the complete workspace request has a predictable blocker
**When** workspace, integration, authoring-backlog, and handoff surfaces are inspected afterward
**Then** every surface remains unchanged.

**Given** the complete workspace request has a predictable blocker
**When** its operation result is inspected
**Then** no prepared handoff is claimed.

**Given** workspace integration succeeds
**When** a selected client inspects its native scope
**Then** `wpm-author`, `wpm-author-bundle`, `wpm-author-recipe`, `wpm-author-skill`, and `wpm-review-package` are independently available at one coherent WPM version.

**Given** workspace integration succeeds
**When** a selected client's native front door is inspected
**Then** it directs a fresh authoring session first to `wpm-author`.

**Given** workspace integration succeeds
**When** package-owned installers, advisors, and payload skills are inspected
**Then** they retain their package-owned names rather than acquiring the reserved `wpm-` prefix.

**Given** workspace integration has been applied
**When** its managed authoring state is inspected
**Then** it records the selected clients, installed skill versions, WPM-owned paths, integration origin, and reconciliation facts outside `wip/`.

**Given** WPM-owned integration already exists alongside user-authored content
**When** integration is reapplied
**Then** matching WPM-owned content remains unchanged and stale WPM-owned content converges to the requested version.

**Given** WPM-owned integration already exists alongside user-authored content
**When** integration is reapplied
**Then** surrounding user-authored content is preserved.

**Given** workspace integration is applied or reapplied
**When** managed client scopes and front doors are inspected
**Then** no duplicate managed integration exists.

**Given** an unforeseen failure occurs after integration writes begin
**When** the operation ends
**Then** the typed non-success identifies completed, failed, and unattempted boundaries with recovery guidance and a non-zero result.

**Given** a reported partial integration write and the same authorized request
**When** the request is repeated after the failed boundary is recoverable
**Then** managed integration converges without duplicate or corrupted content and without claiming generic rollback or resume.

**Given** a recognized WPM-owned legacy `installer-builder` workspace
**When** adoption succeeds
**Then** the new family is available.

**Given** a recognized WPM-owned legacy workspace is adopted
**When** its deliverable and authoring backlog are inspected
**Then** the deliverable is unchanged and the authoring-backlog history is preserved.

**Given** an integration path is unowned, user-modified, or ambiguously owned
**When** adoption is evaluated
**Then** the conflict is reported before integration mutation.

**Given** adoption has an ownership conflict
**When** the integration path is inspected afterward
**Then** its existing content remains unchanged.

### Story 2.8: Prepare and Verify a Fresh-Agent Handoff

As a work-package author,
I want workspace creation to prepare a verifiable handoff,
So that a fresh agent can enter at the correct root without reconstructing prior conversation.

**Acceptance Criteria:**

**Given** workspace authoring integration and its core authoring backlog are ready
**When** handoff is prepared
**Then** a durable machine-readable receipt records the resolved workspace root, configured authoring clients, and each client's launch hint, expected front door, reload guidance, required first skill, and verification entry point.

**Given** a handoff receipt has been issued
**When** its result is presented
**Then** it is described as `prepared` with exact workspace-root and client-specific next actions
**And** WPM does not claim to have spawned, authenticated, or received acceptance from another agent.

**Given** a fresh selected agent starts at the recorded workspace root
**When** it verifies the handoff and invokes `wpm-author`
**Then** the working directory, selected client, native front door, workspace skill family, receipt, and core authoring backlog are reported as agreeing
**And** the agent can identify resumable or next authoring work.

**Given** the agent starts from the wrong directory or any expected handoff surface is missing, stale, or mismatched
**When** verification runs
**Then** every affected surface is identified with client-specific recovery guidance
**And** the result is machine-distinguishable and non-zero without declaring unaffected clients invalid.

**Given** a predictable handoff conflict exists
**When** preparation is evaluated
**Then** the conflict is reported before handoff mutation
**And** no prepared claim is emitted.

**Given** an unforeseen failure occurs after handoff writes begin
**When** preparation ends
**Then** completed and failed boundaries are reported
**And** repeating the same request converges without duplicate or corrupted managed state.

### Story 2.9: Guide Package Creation with `wpm-create-package`

As a package author using my existing coding agent,
I want a focused personal `wpm-create-package` skill,
So that my agent can create or adopt a prepared authoring workspace and hand off without carrying bootstrap context into authoring.

This story owns the packaged bootstrap-skill artifact and proves it through a controlled supported personal-scope fixture. Story 2.10 owns normal installation and reconciliation of that artifact in a user's explicitly selected personal scopes.

**Acceptance Criteria:**

**Given** the exact local package and a controlled supported personal-scope fixture that exposes packaged skill content without running normal setup
**When** the bootstrap artifact is discovered and invoked
**Then** `wpm-create-package` is available from the package without a repository-relative resource.

**Given** `wpm-create-package` is available in a supported personal scope and WPM is installed
**When** an existing agent receives package-creation intent
**Then** it identifies unresolved readiness, package-intent, authoring-client, and workspace decisions
**And** it asks only for decisions still required to create or adopt the workspace.

**Given** WPM is ready and explicit supported authoring-client IDs and package intent are available
**When** the agent follows `wpm-create-package`
**Then** the resulting created or adopted workspace uses that authoring-client selection independently of `manifest.yml.targets`
**And** workspace preparation reaches a prepared handoff.

**Given** a prerequisite or required setup state is missing
**When** `wpm-create-package` assesses readiness
**Then** it identifies the blocking condition and one actionable recovery
**And** it does not claim that workspace preparation or handoff succeeded.

**Given** any predictable workspace, authoring-integration, or task-plan dependency for the requested create or adopt operation is invalid, unavailable, or conflicting
**When** `wpm-create-package` evaluates the complete request
**Then** every blocker and affected surface is reported before the first workspace write
**And** the workspace, authoring backlog, deliverable, selected integrations, and handoff state remain unchanged.

**Given** workspace preparation produced a prepared handoff
**When** the bootstrap stage finishes
**Then** the result identifies the workspace root, applicable launch or reload guidance, and the fresh-session verification action
**And** the skill stops at the workspace boundary without claiming spawn, authentication, acceptance, or authoring-task progress.

### Story 2.10: Configure Personal Authoring Clients in One Setup Action

As a WPM user or bootstrap agent,
I want one setup action to configure my selected authoring clients safely,
So that WPM becomes available where I requested without setup bureaucracy or unintended personal changes.

This story owns normal installation, update, preservation, and legacy migration of the packaged `wpm-create-package` artifact in a user's explicitly selected personal scopes.

**Acceptance Criteria:**

**Given** an agent or headless caller supplies one or more supported authoring-client IDs
**When** setup is invoked
**Then** exactly those IDs authorize setup without a prompt.

**Given** an explicit supported authoring-client selection
**When** a selected client's detection probe is absent or another supported client is detected
**Then** the explicit selection remains valid and detection adds no client.

**Given** a human invokes setup without IDs
**When** setup requests authorization
**Then** Codex and Claude Code appear together in one chooser with detection shown only as context.

**Given** a human has selected one or both clients in the chooser
**When** setup presents the selected destinations
**Then** one destination summary receives exactly one confirmation before writes.

**Given** a human declines or cancels the confirmation
**When** setup concludes
**Then** cancellation is reported.

**Given** a human declines or cancels setup confirmation
**When** personal, workspace, and deliverable surfaces are inspected afterward
**Then** every surface remains unchanged.

**Given** the selection is empty or unsupported, required packaged content or HOME is unavailable, a selected destination is predictably unusable, or any selected destination has ambiguous or user-modified ownership
**When** the complete selected set is evaluated
**Then** every predictable blocker and its recovery are reported together before the first write.

**Given** setup preflight rejects the complete selected set
**When** the setup result is inspected
**Then** it is machine-distinguishable and non-zero.

**Given** the complete selected set has a predictable blocker
**When** selected, unselected, workspace, and deliverable surfaces are inspected afterward
**Then** every surface remains unchanged.

**Given** selected destinations are absent, current WPM-owned, older WPM-owned, or recognizably WPM-owned legacy installations
**When** the same setup action runs or is repeated
**Then** the only WPM-owned skill installed, left unchanged, updated, or migrated in each selected personal scope is `wpm-create-package`, and its outcome is reported per scope.

**Given** setup has reconciled a selected personal scope
**When** that scope is inspected
**Then** it contains exactly one managed `wpm-create-package` copy.

**Given** setup has reconciled a selected personal scope containing unrelated content
**When** that scope is inspected
**Then** the unrelated content is preserved.

**Given** an unowned or user-modified legacy `installer-builder` copy does not occupy the current bootstrap destination
**When** setup reconciles that client
**Then** the legacy copy is preserved, reported as unowned or modified, and not represented as migrated.

**Given** setup succeeds
**When** its result and retained defaults are inspected
**Then** the selected authoring-client IDs are available as workspace-creation defaults.

**Given** setup succeeds
**When** deliverable targets and unselected personal scopes are inspected
**Then** `manifest.yml.targets` and every unselected personal scope remain unchanged.

**Given** setup succeeds
**When** its user-facing result is inspected
**Then** it reports only applicable reload guidance plus the exact `wpm-create-package` next action.

**Given** an unforeseen failure occurs after one or more selected writes begin
**When** setup ends
**Then** the typed non-success identifies completed, failed, and unattempted clients and destinations with recovery guidance and a non-zero result.

**Given** setup reported a partial write and the same authorized action is retried after the failed boundary is recoverable
**When** setup completes
**Then** managed personal content converges without duplicates or corruption and without claiming generic rollback or resume.

### Story 2.11: Complete the Cold Packed-Install-to-Handoff Journey

As a package author or bootstrap agent,
I want the exact local WPM package to support onboarding from a cold environment,
So that the consumer journey is proven without source-checkout state or a prior authoring conversation.

This is the complete-family integration proof. It supplements rather than replaces each skill story's own artifact, packed-install, non-leakage, and official-authoring-helper evidence.

**Acceptance Criteria:**

**Given** the exact verified local package and a fresh supported environment without its source checkout or WPM skills
**When** the package is installed but setup has not been invoked
**Then** its CLI and every resource in the final revision's declared ship set resolve successfully without repository-relative state.

**Given** the exact verified local package is installed but setup has not been invoked
**When** Codex and Claude Code personal and workspace configurations are inspected
**Then** every configuration remains unchanged.

**Given** Codex-only, Claude-Code-only, both-client, or explicit headless selection
**When** the installed package's single setup action completes
**Then** only the selected personal scopes receive `wpm-create-package`.

**Given** installed-package setup succeeds
**When** its result is inspected
**Then** it requires no repository-relative resource.

**Given** installed-package setup succeeds
**When** its user-facing result is inspected
**Then** it provides one package-creation next action.

**Given** the installed bootstrap skill receives package intent and an explicit or retained authoring-client selection
**When** it creates or adopts the workspace
**Then** every selected project scope contains the five workspace skills.

**Given** the installed bootstrap skill creates or adopts the workspace
**When** each selected project scope is inspected
**Then** its native front door is present and routes first to `wpm-author`.

**Given** the installed bootstrap skill creates or adopts the workspace
**When** workspace-wide authoring state is inspected
**Then** the workspace contains one shared core authoring backlog.

**Given** the installed bootstrap skill creates or adopts the workspace
**When** handoff and unselected integration surfaces are inspected
**Then** one prepared handoff is present and unselected integrations are absent.

**Given** the revision under complete-family verification contains all six WPM-owned skill artifacts
**When** the installed package is inspected and exercised through selected personal and workspace fixtures
**Then** `wpm-create-package`, `wpm-author`, `wpm-author-bundle`, `wpm-author-recipe`, `wpm-author-skill`, and `wpm-review-package` are each independently packaged, discoverable, and invocable.

**Given** an independently launched fresh agent starts at the recorded workspace root
**When** handoff verification runs with the expected handoff surfaces intact
**Then** its actual working directory, configured clients, native front doors, five workspace skills, prepared receipt, and core authoring backlog are reported as agreeing.

**Given** fresh-agent handoff verification succeeds
**When** core authoring work is requested
**Then** the agent can claim or resume that work.

**Given** fresh-agent handoff verification and authoring continuation succeed
**When** WPM's handoff claims are inspected
**Then** WPM claims no process, authentication, session, or acceptance ownership.

**Given** that authoring workspace produces a work-package deliverable
**When** the deliverable boundary is inspected
**Then** it contains no personal or workspace WPM skills, authoring backlog, managed onboarding state, handoff receipt, or workspace authoring front door.

## Epic 3: Template-Defined Authoring Tasks

During new workspace initialization and bundle creation or enablement, WPM appends every selected template-defined authoring task exactly once alongside mandatory work, with validated dependencies and inspectable provenance.

Template inspection extends the existing template-show experience, and materialisation stays inside initialization, bundle creation, and bundle enablement. Stable keys and provenance serve those operations only; they do not establish workspace-wide reconciliation or reconstruction.

### Story 3.1: Declare and Inspect Template Authoring Tasks

As a template author,
I want to declare and preview the additional authoring work contributed by a project or bundle template,
So that package authors can understand it before using the template.

**Acceptance Criteria:**

**Given** a valid template declares additional authoring tasks
**When** it is inspected through the existing template-show experience
**Then** the template identity and revision and each task's stable key, task text, observable acceptance outcomes, dependencies, and materialisation scope are shown.

**Given** a valid authoring-task contribution is inspected
**When** its relationship to mandatory WPM work is reported
**Then** it is identified as additional work that cannot replace or disable the mandatory catalog.

**Given** a task uses contextual values in its text or acceptance outcomes
**When** the task contribution is inspected
**Then** every value is resolved from literal text or documented WPM-provided context.

**Given** template tasks depend on one another or on mandatory WPM project or bundle tasks
**When** the contribution is inspected
**Then** every dependency resolves through a documented stable reference.

**Given** distinct template producers declare the same local stable key
**When** their otherwise-valid contributions are inspected
**Then** their producer-scoped identities remain distinct and neither declaration is rejected as a duplicate of the other.

**Given** one template producer and revision declares the same local stable key more than once
**When** its contribution is inspected
**Then** the duplicate declaration is reported as invalid.

**Given** a template declares no additional authoring tasks
**When** it is inspected
**Then** it reports no additional authoring-task contribution.

**Given** a contribution is malformed, has duplicate keys or rendered-title collisions, requires unavailable context, has unresolved or cyclic dependencies, or contains unsupported non-declarative content
**When** it is inspected
**Then** every detected problem is reported together and the contribution is not presented as valid.

**Given** any template contribution is inspected
**When** inspection completes successfully or with validation findings
**Then** inspection leaves the template unchanged and performs no project, bundle, or authoring-backlog mutation.

### Story 3.2: Initialize Complete Project Authoring Work

As a bootstrap agent creating a workspace,
I want ordinary initialization to include all mandatory and selected project-template authoring work,
So that the fresh workspace agent receives a complete backlog without another setup step.

**Acceptance Criteria:**

**Given** a valid selected project template and a new workspace request
**When** ordinary initialization succeeds
**Then** one shared authoring backlog contains every mandatory project task and every project-template task exactly once with resolved Backlog.md dependencies.

**Given** a valid selected project template includes one or more bundles
**When** ordinary initialization succeeds
**Then** every pre-included bundle receives its applicable mandatory and template-defined tasks exactly once.

**Given** initialization materialises the complete applicable task plan
**When** workspace preparation continues
**Then** it can proceed to normal handoff without another task-generation action.

**Given** distinct selected template producers use the same local stable key in one initialization plan
**When** ordinary initialization succeeds
**Then** both tasks coexist under distinct producer-scoped identities with their dependencies resolved independently.

**Given** project-template tasks have been materialised
**When** their Backlog.md records are inspected
**Then** each task exposes its stable key, template origin, and defining revision independently of its displayed title.

**Given** a project template contributed authoring tasks to an initialized workspace
**When** that workspace produces a work-package deliverable in any supported format
**Then** the deliverable contains neither the template task definitions nor their materialisation provenance.

**Given** the project template contributes no authoring tasks
**When** initialization succeeds
**Then** existing mandatory-task behavior remains unchanged and no additional or duplicate task appears.

**Given** a workspace was initialized from a project template
**When** the source template later changes or is removed
**Then** the existing workspace and its authoring tasks remain unchanged.

**Given** the complete project task contribution has a predictable definition, context, identity, dependency, cycle, rendered-title, or ownership conflict
**When** initialization is evaluated
**Then** every blocker and affected contribution is reported before any workspace or authoring-backlog change.

**Given** an unforeseen I/O failure occurs after initialization writes begin
**When** initialization ends
**Then** the typed non-success identifies completed, failed, and unattempted project, derived-artifact, and authoring-backlog boundaries with recovery guidance and a non-zero result.

**Given** initialization reports a partial write
**When** its recovery guidance is inspected
**Then** it promises no generic rollback, resume, reconciliation, or successful initialized workspace.

### Story 3.3: Materialise Complete Bundle Authoring Work on Create and Enable

As a workspace authoring agent creating or enabling a bundle,
I want WPM to add all mandatory and template-provided bundle work automatically,
So that required filling, review, and validation never depend on my memory.

**Acceptance Criteria:**

**Given** a valid explicit or recorded default bundle template
**When** a bundle is created
**Then** every mandatory and template-provided bundle task appears exactly once with resolved Backlog.md dependencies.

**Given** a valid explicit or recorded default bundle template
**When** a bundle is created initially disabled
**Then** its complete applicable authoring work is materialised.

**Given** bundle creation materialises the complete applicable task plan
**When** the operation completes
**Then** no separate task-generation action is required.

**Given** bundle-template tasks have been materialised
**When** their Backlog.md records are inspected
**Then** each task exposes its bundle scope, stable key, template origin, and defining revision independently of its displayed title.

**Given** a bundle template contributed authoring tasks to a workspace
**When** that workspace produces a work-package deliverable in any supported format
**Then** the deliverable contains neither the template task definitions nor their materialisation provenance.

**Given** a disabled bundle has a recorded template contribution and is missing applicable work
**When** it is enabled
**Then** only missing mandatory or template-defined tasks are added.

**Given** a disabled bundle has existing authoring tasks and is enabled
**When** its complete task plan is materialised
**Then** existing task identities, statuses, notes, acceptance criteria, and user-authored content remain unchanged.

**Given** the selected bundle template contributes no authoring tasks
**When** a bundle is created from that template
**Then** mandatory bundle-task behavior remains unchanged and no additional or duplicate task appears.

**Given** an older bundle has no recorded template contribution
**When** that bundle is enabled
**Then** mandatory bundle-task behavior remains intact
**And** no current default contribution is inferred retroactively.

**Given** the same recorded contribution is encountered again for the same bundle scope
**When** task materialisation runs
**Then** no duplicate task is created.

**Given** the same recorded contribution is encountered again for the same bundle scope
**When** existing materialised tasks are inspected afterward
**Then** their human-authored state remains unchanged.

**Given** a bundle's template contribution was materialised
**When** the source or default template later changes or is removed
**Then** the existing bundle and its authoring tasks remain unchanged.

**Given** the complete bundle task contribution has a predictable definition, context, identity, dependency, cycle, rendered-title, or ownership conflict
**When** creation or enablement is evaluated
**Then** every blocker and affected contribution is reported before the bundle, manifest, or authoring backlog changes.

**Given** an unforeseen I/O failure occurs after bundle creation or enablement writes begin
**When** the operation ends
**Then** the typed non-success identifies completed, failed, and unattempted bundle, manifest, derived-artifact, and authoring-backlog boundaries with recovery guidance and a non-zero result.

**Given** bundle creation or enablement reports a partial write
**When** its recovery guidance is inspected
**Then** it promises no generic rollback, resume, reconciliation, or successful completed operation.
