---
title: "PRD — work-package-manager (wpm) — BMAD projection shim"
status: final
created: 2026-05-31
updated: 2026-08-21
---

# PRD — work-package-manager (`wpm`) — BMAD projection shim

> **Authority and scope:** `docs/00`–`14` remain authoritative for the product's fixed goals, user
> problems, vocabulary, and style. The original sections below preserve the historical v1 projection of
> that design set. The dated addendum promotes the user-approved increment captured in the onboarding,
> task-materialisation, and distribution investigations and `epics-authoring-agent-onboarding.md` into the
> governed requirements source for this increment; the epic artifact remains its downstream decomposition.
> This does not change the design documents. A conflict with the fixed core remains a human gate, and the
> design documents win.

---

## Goals and context  (doc `00`)

`wpm` solves the problem of distributing capabilities to AI agents on machines the author has never seen.
Instead of shipping a deterministic installer, the author ships a **work-package** — a status-tracked
backlog of intent-plus-verification tasks — and the recipient's own agent executes them, adapting to
the environment as it goes. The trade: give up fixed steps, gain an install that bends to reality.

Two invariants flow from this thesis (doc `00` §"New-generation thesis"):
1. **Verification travels inside each bundle** — the bundle carries its own proof of success.
2. **Receipt, not lockfile** — the facts the agent cannot re-derive by inspection are recorded in the
   task records themselves; external state files are not used.

This receipt invariant concerns the generated work-package executor's installation record. The scoped
addendum separately permits authoring-only integration state and a prepared-workspace handoff receipt;
neither replaces the bundle's task-record receipt.

Success metric: an author with domain knowledge and an AI agent can package a capability as a
work-package project, and a recipient's agent can install it on an unknown machine with no bespoke
installer chrome on either side.

---

## Users and roles  (docs `01`/`02`/`03`)

Three roles; no role requires a GUI or wizard screen the builder ships.

| Role | Goal | Surface |
|---|---|---|
| **Author** (`01`) | Package a capability as bundles; own the domain truth, trust/confirmation decisions, and verification acceptance criteria | Their existing AI agent using the `wpm` CLI, followed by a fresh workspace-root agent |
| **End user** (`02`) | Install a capability via their AI agent; make two decisions: which agent to wire and which bundles to select; everything else is silent | Their own AI agent reading the generated work-package |
| **Executing agent** (`03`) | Execute the uniform detect→plan→do→verify→record loop per bundle; write the receipt; respect confirmation levels; survive restart | The generated project's `AGENTS.md` + orchestrator skill |

The author is the human who authorizes `wpm` authoring actions, normally through an existing AI agent.
The end user and executing agent interact with what `wpm` generates, not with the authoring CLI itself
(doc `01` §"The authoring loop").

---

## Historical v1 functional scope — the `wpm` authoring CLI  (doc `10`)

The product is the `wpm` binary. The historical v1 command surface is specified in
`docs/10-authoring-cli.md` §"The command tree"; this section names those command groups only. The approved
increment below adds observable setup and handoff capabilities without freezing their final command spelling,
and keeps release-preparation tooling outside the shipped CLI.

```
wpm init          — scaffold a new work-package project from a built-in template
wpm template      — list/show available templates (project-local + built-in)
wpm project       — project metadata, version, target-agent list, project-scoped install-time skills, validation
wpm bundle        — create/enable/disable/remove bundles; per-bundle: metadata, version, requires, files,
                    templates, scripts, payload skills, install-time skills, advisor
wpm build         — dry-run / package / publish the project for distribution
```

Design principles governing every command (doc `10` §"Design principles"):
- **One command per author intent**, hiding multi-store implementation details.
- **Structure, not content**: the CLI manages project structure; the agent writes prose via the filesystem.
- **Above Backlog.md**: task operations are not wrapped; the agent invokes `backlog` directly per bundle.
- **Derived artefacts stay current** automatically on every mutating command (no separate `regenerate`).
- **Every command discoverable**: tab completion + `--help` are contract requirements, not nice-to-haves.

---

## Non-functional constraints  (doc `12` §"Engineering decisions"; doc `13` §0)

- **Language and runtime**: Node.js + TypeScript, ESM-only (no CommonJS dual-build). Required because
  Backlog.md (a hard peer dependency) is itself Node.js ESM; sharing the ecosystem keeps the install
  to `npm i -g` (doc `12`).
- **Historical installation assumption**: a global npm install — `npm i -g <approved-package-name>`.
  No public package coordinate is approved or available in the current increment, and this historical
  assumption does not decide whether npm or GitHub is primary, secondary, or presented alongside the other.
  Backlog.md is a `peerDependency`, not bundled. No plugin system, template registry, telemetry, or login
  (doc `12` §"Distribution").
- **Core boundary** (doc `13` §0, enforced by a `noRestrictedImports` Biome rule): nothing under
  `src/core/` may import the CLI framework, subprocess library, or OS/file-system modules. The core
  is pure; effects live behind injected ports. This invariant is a fixed principle; the specific
  module shapes that realize it are refinable.
- **SDLC-agnosticism**: the builder's own development method must not appear anywhere in `src/core/`
  (doc `13` §0). The Backlog.md authoring-backlog pattern, BMAD, etc., are building-time concerns.
- **Testing**: vitest (TS-native, ESM-friendly); three flavors — unit (pure logic, no I/O), integration
  (real command sequences in tmpdir), snapshot (rendered AGENTS.md/SKILL.md stability) (doc `12`).
- **CI**: GitHub Actions, matrix on Node LTS × {Linux, macOS, Windows}; three-command gate —
  `biome ci`, `tsc --noEmit`, `vitest` (doc `12`; enforced via task-8 in FOUNDATION.md).

---

## Out of scope  (doc `12` §"What's deliberately not in the architecture (yet)")

The following are explicitly excluded from v1 and are future-conversation items, not missing pieces:

- No plugin system (third-party runtime command loading).
- No telemetry, analytics, or opt-in error reporting.
- No template registry, `template add/publish/update`, or shared template marketplace.
- No language bindings (TypeScript only; the doc set 00-14 is the language-neutral spec for others to re-implement).
- No GUI or web UI (`wpm dashboard`). The CLI, `--help`, tab completion, the agent skill, and the docs are the whole UX.

---

## Historical v1 success criterion

Success is the **walking skeleton defined by task-33 in FOUNDATION.md** — the 33-task foundational
backlog (epic-1) culminating in a runnable `wpm` binary that proves the layered architecture composes
end-to-end. The foundational tasks are grouped in phases (see `FOUNDATION.md`): Phase A (repo/toolchain,
tasks 1–9), Phase B (domain model and ports, 10–15), Phase C (services, 16–22), Phase D (operations
and lifecycle, 23–28), Phase E (CLI adapter and content, 29–32), Phase F (walking skeleton, 33).

All 33 tasks must pass the project-level Definition of Done: typecheck clean, Biome clean, tests green,
no core-boundary violation. That gate is itself dogfooded via Backlog.md tracking the builder's own
development (doc `12` §"Dogfooding").

---

## Approved scoped requirements addendum — authoring-agent onboarding (2026-08-21)

This addendum projects the user-approved scope in
`_bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md`. It extends the completed v1 baseline
without redefining the product thesis: an author's existing Codex or Claude Code agent explicitly configures
WPM, creates or adopts an authoring workspace, and hands work to a fresh agent rooted in that workspace.
Templates may add deterministic authoring tasks, and maintainers may prepare and assess one exact release
candidate for GitHub and npm without activating either channel.

### Current increment success criterion

From one exact locally packed WPM package, an existing Codex or Claude Code agent can complete explicit,
inert-by-default setup, create or adopt a correctly integrated authoring workspace, and produce a verified
prepared handoff for a fresh workspace-root agent without repository-relative resources. Selected templates
materialise deterministic append-only authoring tasks without changing mandatory work, and the same inactive
candidate can be classified against read-only GitHub and npm observations without remote mutation or a false
public-coordinate claim.

### Explicitly deferred outcomes

- Selecting a public WPM identity or channel policy; configuring release authority or trust; creating tags,
  releases, or npm publications; public verification; and any other remote write.
- Public acquisition by a bootstrap agent. That outcome is deliberately unnumbered until activation is
  human-authorized, and no public coordinate may be invented in the meantime.
- Authoring adapters beyond Codex and Claude Code; Hermes and OpenClaw require fresh contract verification
  before inclusion.
- Template-provided custom authoring skills, arbitrary runtime behavior, replacement of mandatory tasks,
  evolution or drift reconciliation, automatic retirement, legacy template-task adoption, missing-backlog or
  fresh-clone reconstruction, generic authoring-task reconciliation, and durable command-event history.
- Coding-agent process spawning, authentication, session management, or lifecycle ownership by WPM.

The normal onboarding journey remains one setup action followed by workspace creation and a fresh-workspace
handoff. Adapter detection, updating, reconciliation, and legacy migration are internal states, not extra
required user steps.

The terms in this addendum have narrow meanings:

- An **authoring adapter** describes how WPM integrates with one supported coding agent. For this increment,
  the stable authoring-adapter IDs are `codex` and `claude-code`; they are independent of the deliverable
  target-agent selection in `manifest.yml.targets`.
- A **prepared handoff** records everything needed to start a fresh workspace-root agent. It does not claim
  that WPM spawned, authenticated, or owns that process.
- An **authoring-task pack** is inert template data that can extend, but never replace, WPM's mandatory
  authoring backlog.
- A **candidate** is one persisted packed WPM CLI artifact assessed for both future distribution channels.

### Functional requirements

#### Authoring adapters, personal setup, and bootstrap

- **FR2:** Installing the WPM CLI candidate, or a later public CLI package, leaves every coding-agent
  personal and workspace configuration unchanged until the user explicitly runs WPM setup.
- **FR3:** WPM recognises Codex and Claude Code as supported authoring tools and exposes their stable IDs and
  human-readable names wherever setup or help needs them.
- **FR4:** Each supported adapter exposes its personal skill destination, workspace skill destination,
  native front door, detection result, native launch hint, and reload guidance.
- **FR5:** Codex authoring integration uses `~/.agents/skills` personally, `.agents/skills` in a workspace,
  and `AGENTS.md` as its workspace front door.
- **FR6:** Claude Code authoring integration uses `~/.claude/skills` personally, `.claude/skills` in a
  workspace, and `CLAUDE.md` as its native workspace front door.
- **FR7:** When setup is invoked without explicit authoring-tool IDs, it lets the user select Codex, Claude
  Code, or both in one interaction and shows detection only as a hint.
- **FR8:** Interactive setup changes no personal agent scope until one concise summary of the selected tools
  and destinations is confirmed.
- **FR9:** Agent-driven or other non-interactive setup accepts one or more explicit authoring-tool IDs as
  authorization and does not prompt.
- **FR10:** An explicit supported selection can be configured even when its detection probe is absent.
- **FR11:** An empty or unknown setup selection is rejected before any personal scope is changed.
- **FR12:** Setup installs only the personal `wpm-create-package` bootstrap skill into the selected personal
  scopes.
- **FR13:** The same setup action installs, updates, or leaves unchanged each selected destination, reports
  the outcome, and creates no duplicate skill content.
- **FR14:** Setup retains the selected authoring agents as defaults for later workspace creation without
  changing `manifest.yml.targets`.
- **FR15:** The same setup action migrates a WPM-owned legacy personal `installer-builder` installation to
  the new bootstrap surface while preserving and reporting an unowned or user-modified copy.
- **FR16:** Once WPM is available, the personal `wpm-create-package` skill guides prerequisite checking,
  explicit authoring-agent setup, workspace creation, and fresh-session handoff, then stops at the workspace
  boundary.

#### Workspace authoring skills, integration, and handoff

- **FR17:** WPM carries and materialises `wpm-author`, `wpm-author-bundle`, `wpm-author-recipe`,
  `wpm-author-skill`, and `wpm-review-package` as independently discoverable workspace-local skills that can
  each be reconciled and verified without treating the family as one monolith.
- **FR18:** `wpm-author` independently orients a fresh workspace session, resumes or claims
  authoring-backlog work, handles project-level authoring, and routes focused work only to specialist skills
  present in the same workspace.
- **FR19:** `wpm-author-bundle` independently supports planning and changing one bundle, including its
  capability boundary, metadata, dependencies, payload registration, and lifecycle, while leaving recipe-,
  skill-, and review-specific work to the corresponding specialist skills.
- **FR20:** The `wpm-` prefix is reserved for WPM-owned skills and is not imposed on user payload skills,
  `<project>-installer`, or `<bundle>-advisor` names.
- **FR21:** Workspace creation accepts explicit authoring-agent selections and can use the defaults retained
  by setup.
- **FR22:** A generated workspace exposes the WPM authoring skill family and a concise native front door in
  every selected adapter's project scope, while unselected adapter integrations are not generated
  implicitly.
- **FR23:** Managed authoring state outside `wip/` records selected adapters, installed skill versions,
  owned paths, integration origin, and the information needed to reconcile later updates.
- **FR24:** Reapplying workspace integration updates WPM-owned skills and managed front-door content while
  preserving surrounding user-authored content.
- **FR25:** A workspace created under the legacy `installer-builder` front-door model can adopt the new
  workspace skill family without changing the generated work-package deliverable or losing its
  authoring-backlog history.
- **FR26:** Workspace creation emits a durable, machine-readable handoff receipt containing the workspace
  root, the configured authoring-adapter set, and per-adapter native launch hints, expected front doors,
  reload guidance, required first skill, and verification entry point.
- **FR27:** A verification surface reports whether the current working directory, the configured
  authoring-adapter set, every configured adapter's native front door and workspace skill family, the
  authoring backlog, and the handoff receipt are mutually consistent, with recovery guidance specific to each
  affected adapter.
- **FR28:** Failed handoff verification identifies each mismatched or missing surface, provides a recovery
  action, and returns a non-zero exit code.
- **FR29:** WPM provides adapter-specific launch guidance but does not claim to have spawned, authenticated,
  or assumed lifecycle ownership of an authoring-agent process.

#### Template-defined authoring tasks

- **FR30:** A project or bundle template may declare an inert authoring-task pack whose entries have
  producer-scoped stable keys, task text composed only from literal text and documented WPM context,
  observable acceptance criteria, and dependencies on same-pack keys or documented mandatory project or
  bundle task keys.
- **FR31:** WPM materialises a selected project-template pack during new workspace initialization and a
  selected or recorded bundle-template pack during bundle creation or enablement.
- **FR32:** Template-defined tasks append to the mandatory project or bundle tasks of the same operation and
  cannot replace or disable them.
- **FR33:** Within initialization, bundle creation, or bundle enablement, each stable key in each selected
  pack revision is materialised at most once. A task proven to have the same key and definition is preserved;
  an ambiguous ownership or different-definition collision fails before mutation.
- **FR34:** Each materialised template task exposes its stable key, template origin, and defining revision in
  Backlog.md, and its stable-key dependencies resolve to the corresponding Backlog.md task IDs, including
  documented mandatory project or bundle references.
- **FR35:** Malformed definitions, duplicate keys or rendered-title collisions, unavailable context,
  unresolved dependencies, cycles, and ownership conflicts in the applicable mandatory-plus-template plan
  are reported before initialization, bundle creation, or bundle enablement mutates the project, bundle, or
  authoring backlog.
- **FR36:** Later changes to or removal of a source or default template do not modify already-materialised
  tasks. Bundle enablement uses the bundle's recorded template contribution and never guesses the current
  default; updating
  existing task contributions, drift reconciliation, and automatic task retirement are deferred.
- **FR37:** The existing template inspection experience exposes a template's authoring-task contribution and
  validation findings before the template is selected.
- **FR38:** A generated work-package deliverable contains none of the workspace authoring backlog, managed
  onboarding state, workspace authoring front doors, or WPM workspace-authoring skills.

#### Inactive distribution preparation

- **FR39:** WPM exposes distribution as inactive until all activation facts are authorized, reports every
  missing fact together, does not classify occupied or unapproved identities as eligible, and makes no
  unavailable public-coordinate claim.
- **FR40:** A clean checkout produces an inspectable WPM CLI package containing every required runtime,
  declared executable, template, WPM skill, document, license, and metadata file while excluding development
  and local state.
- **FR41:** In a fresh supported environment, the exact local package can be installed, every declared
  executable invoked, packaged resources resolved without the source checkout, and prerequisite failures
  reported with actionable guidance.
- **FR42:** WPM can produce an inactive candidate record binding the observed package and version, proposed
  tag, source commit, exact package bytes, size, digests, packed-install evidence, and release-note preview
  without creating remote state.
- **FR43:** Given GitHub policy facts and supplied or read-only observed state, WPM reports a no-write staging
  assessment, missing activation prerequisites, compatible existing state, and incompatible tag, release, or
  asset conflicts without changing GitHub or Git state.
- **FR44:** Given npm policy facts and supplied or read-only registry state, WPM reports a no-write
  publication assessment, missing coordinate, final-tag, provenance, or authority facts, compatible existing
  state, conflicts, and states that require later human authorization without changing npm state.
- **FR45:** Combined GitHub and npm observations are classified as blocked, ready, matching, resumable,
  conflicting, or complete; compatible partial completion is preserved and conflicts never recommend
  rollback, overwrite, retagging, or version reuse.
- **FR46:** Starting from the verified local package, a bootstrap agent can reach explicit adapter setup and
  workspace creation without repository-relative resources, while packaged skills, setup guidance, front
  doors, inert installation, and handoff behavior remain mutually consistent.

#### Specialist authoring capabilities

- **FR47:** `wpm-author-recipe` independently supports creating and revising install-backlog recipes with
  detect, setup, verify, state, migration, observable acceptance-criteria, and receipt concerns kept coherent.
- **FR48:** `wpm-author-skill` independently supports authoring and revising advisors, installer helpers,
  payload skills, and native front doors with the correct role, discovery scope, trigger, registration, and
  authoring/executor separation.
- **FR49:** `wpm-review-package` independently supports a fresh context-less review of package structure,
  references, registration, version constraints, executor simulation, build non-leakage, and release
  readiness.

### Cross-cutting non-functional requirements

- **NFR1:** The implementation preserves the ports-and-adapters dependency rule: core code depends only on
  models, services, and injected ports and imports no CLI framework, subprocess library, or OS/filesystem
  module directly.
- **NFR2:** The core remains SDLC-agnostic and contains no coding-agent process launcher,
  credential/session manager, or methodology-specific workflow model.
- **NFR3:** Personal setup, workspace-integration reapplication, supported template-task materialisation
  operations, distribution preparation, and release-state assessment are deterministic. Operations defined
  as repeatable are idempotent; workspace initialization continues to reject an existing target.
- **NFR4:** Before its first write, setup validates every selected personal destination, and initialization,
  bundle creation, and bundle enablement validate every predictable workspace and applicable task-plan
  dependency. Predictable failures leave all affected surfaces unchanged. If an unforeseen I/O failure occurs
  after writes begin, the result identifies the exact completed and failed boundaries and recovery guidance;
  WPM does not promise generic rollback, resume, or reconciliation.
- **NFR5:** WPM mutates or removes only content it can identify as WPM-owned; unowned or user-modified content
  is preserved and reported.
- **NFR6:** Authoring-agent choice and deliverable target-agent choice remain independent data axes throughout
  the CLI, model, persisted state, and generated artifacts.
- **NFR7:** Workspace authoring-only content, including template authoring-task definitions and provenance,
  is excluded from generated zip, tarball, and git deliverables. Definitions may remain in existing authoring
  template or scaffold locations; materialised provenance remains in authoring state; and the WPM CLI package
  has a separate explicit ship-set contract.
- **NFR8:** Each WPM-owned skill is independently discoverable and usable under both supported platforms'
  official skill contracts, with a focused activation description and progressive disclosure so only
  knowledge relevant to that skill's named job enters context.
- **NFR9:** Interactive setup has an equivalent headless form suitable for agents, scripts, and CI.
- **NFR10:** Clean packed-install, inactive release-state assessment, Codex-only, Claude-Code-only,
  multi-agent, headless, repeat/update, legacy-migration, template declaration and inspection, project
  initialization, bundle creation, bundle enablement, handoff, and generated-deliverable non-leakage journeys
  are verifiable from cold isolated environments.
- **NFR11:** Projects and templates without authoring-task packs retain their current mandatory-task behavior,
  and scoped initialization, creation, or enablement operations add neither inferred template work nor
  duplicate tasks.
- **NFR12:** Public command failures remain machine-distinguishable under the existing exit-code contract,
  and help text explains the supported adapter IDs and recovery paths.
- **NFR13:** Backlog.md remains the authoring-task persistence mechanism; stable template identity metadata
  is neither a parallel task engine, a command-event ledger, nor a workspace-reconstruction store, and WPM
  requires no manual edits under a backlog root.
- **NFR14:** The feature introduces no GUI, telemetry, agent installation, remote template marketplace,
  mandatory login, publication credential, protected release environment, or remote write.
- **NFR15:** Distribution status, package metadata, documentation, CLI help, packaged assets, skills, and
  generated front doors remain mutually consistent; while distribution is inactive, none claims an available
  public coordinate.
- **NFR16:** Candidate preparation and every channel assessment use one persisted packed artifact;
  independently rebuilt artifacts are never assumed to have identical bytes.
- **NFR17:** Distribution-preparation tooling remains outside `src/core`, outside the WPM CLI package ship
  set, and outside generated work-package deliverables, and exposes no remote mutation or credential
  capability.
- **NFR18:** For the same candidate, policy facts, and observed snapshots, release-state classification is
  stable across reruns; incompatible state fails closed and preserves compatible externally completed work.

### Shared delivery constraints

- The six WPM-owned skills — `wpm-create-package`, `wpm-author`, `wpm-author-bundle`,
  `wpm-author-recipe`, `wpm-author-skill`, and `wpm-review-package` — remain independently reviewable
  capabilities, each delivered by its own story.
- Every story that creates or changes a WPM-owned skill must use a fresh official Codex or Claude Code
  skill-authoring helper at implementation time and record the helper and host versions, then-current official
  source links and access date, deterministic native-path, frontmatter, discovery and explicit-invocation
  identity, trigger/non-trigger contract, and source-free portability evidence for Codex and Claude Code,
  exact packed/source-free availability, and generated-deliverable non-leakage.
- After all scoped implementation, one clean exact revision runs dependency installation, typecheck,
  repository lint, build, and the exact full test suite; regenerates and rebinds the exact package, packed-
  install, candidate, and channel evidence; and proves fresh live Codex plus externally authenticated live
  Claude Code discovery, explicit-invocation, natural-language trigger, non-trigger, and representative-
  outcome parity for all six WPM-owned skills before final handoff or activation. Host authentication is an
  external prerequisite for that final gate and is not a WPM capability.
- Each skill story owns packed-install availability and generated-deliverable non-leakage evidence for its
  artifact; later family-level verification does not substitute for that evidence.
- Bootstrap and workspace skills reuse supplied or retained facts, ask only for unresolved decisions, and
  return one actionable recovery path when a prerequisite is missing. In a fresh workspace, `wpm-author`
  surfaces in-progress work before claiming exactly one dependency-eligible task; when none is eligible, it
  reports that state without changing the backlog.
- Each specialist skill works without hidden bootstrap context, surfaces unresolved author decisions instead
  of inventing them, and leaves work outside its boundary explicitly pending. Package review is read-only
  unless separate fix authorization is supplied.
- Handoff verification preserves valid results for unaffected adapters when another adapter is stale or
  missing. Retrying WPM-owned handoff preparation after a reported partial write converges without duplicate
  or corrupted managed state.
- Template task text and acceptance outcomes use literal text and documented WPM-provided context only.
  Templates cannot introduce input prompts, executable interpolation, hooks, or arbitrary code.
- Initialization includes the applicable mandatory and template-defined work for every pre-included bundle.
  Materialised bundle-task identity includes bundle scope as well as stable key, template origin, and defining
  revision. Applicable-plan validation reports all detected problems and affected contributions together.
- Unrelated command-triggered authoring-task catalogs and their cardinalities remain unchanged.
- GitHub and npm preparation consume the same exact candidate and supplied or read-only observations. This
  work has no remote-mutation capability and is separate from `wpm build publish`, which publishes generated
  work-package deliverables.
- Inactive assessment reports the still-unresolved npm coordinate, executable-name policy, channel roles,
  stable-versus-prerelease mapping, GitHub immutability policy, and bounded npm-public/GitHub-pending recovery
  policy together; it does not require those decisions to be made in this increment.

---

*PM specialist: John (BMAD) — historical Phase 2 projection plus the approved 2026-08-21 incremental
requirements projection.*
*Written 2026-05-31; updated 2026-08-21. Revision policy: canonical design changes remain human-owned;
user-approved scoped addenda may extend this projection without editing or superseding `docs/00`–`14`.*
