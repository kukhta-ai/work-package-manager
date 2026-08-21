# Validation Report — WPM Agent Setup and Authoring Handoff

- **UX input:** `epics-authoring-agent-onboarding.md`, Epic 2 and its joins to Epics 1, 3, and 4
- **Run at:** 2026-08-20T20:44:04Z
- **Mode:** `bmad-ux` Validate; all offered lenses selected

## Overall verdict

The product direction is sound, but the proposed Epic 2 is too administrative as a user experience. Adapter discovery, detection, installation, update, migration, ownership, and retained state are implementation concerns behind one user intent: make WPM available to the coding agent or agents that will create the package.

The happy path should contain one agent-aware setup interaction, one workspace-creation interaction, and one fresh-workspace handoff. Explicit consent is required only before interactive personal-scope writes. Predictable conflicts are preflighted before any selected destination changes; update and migration happen as reconciliation outcomes rather than separate workflows.

## Category verdicts

- Flow coverage — **thin**
- Token completeness — **not applicable**
- Component coverage — **thin**
- State coverage — **thin**
- Visual reference coverage — **not applicable**
- Bloat and overspecification — **adequate only after simplification**
- Inheritance discipline — **adequate**
- Shape fit — **thin**
- First-run journey — **needs revision**
- Friction and bureaucracy — **adequate after simplification**
- Consent, trust, and recovery — **thin until preflight and ownership rules are explicit**

## Recommended experience

### Agent-driven default

1. The user asks their existing Codex or Claude Code agent to install/configure WPM and create a package.
2. That agent invokes the single setup action with its explicit client ID. If the user asked for another client too, it supplies both IDs in the same request. No interactive picker or extra confirmation is needed because the explicit headless request is the authorization.
3. WPM preflights all selected personal destinations, then installs, updates, or leaves unchanged only `wpm-create-package` in those destinations.
4. WPM reports the configured clients, only the reload advice that applies, and one exact resume action.
5. After the skill is discoverable, `wpm-create-package` elicits the package intent, creates the workspace for the selected authoring clients, and hands off to a fresh agent rooted there.
6. The fresh agent verifies the workspace and complete authoring backlog, then claims or resumes the next task.

### Direct human fallback

When setup is invoked without explicit client IDs, it presents Codex and Claude Code once, shows detection only as a hint, allows one or both to be selected, previews the destinations, and asks for one confirmation. There is no separate inspect, detect, install, update, or migration journey.

## Findings by severity

### Critical (4)

1. **Detection cannot grant consent.** Only explicit agent IDs or one confirmed interactive selection authorize personal-scope writes.
2. **All selected destinations need complete preflight.** Unknown or unsupported clients, unavailable package resources, invalid destinations, predictable access failures, and ownership conflicts must be reported before any selected destination changes.
3. **The cold-start and reload loop is incomplete.** Installed-package guidance must expose setup before `wpm-create-package` exists, and completion must give adapter-specific reload and exact resume instructions.
4. **The real climax is missing.** Readiness is proven only when a fresh workspace-root agent verifies the front door, workspace skills, receipt, and complete core-plus-template backlog and identifies its next task.

### High (7)

1. **Adapter inspection is not a user prerequisite.** Catalog data belongs inline in setup, help, and diagnostics.
2. **One setup surface should cover one or several clients, interactive or headless use, repeat, update, and legacy migration.**
3. **The current Epic 2/Epic 3 split breaks the promised bootstrap journey.** `wpm-create-package` cannot promise workspace handoff before the workspace surfaces exist; treat setup and handoff as one user journey or remap the promise.
4. **Ownership governs automatic updates.** WPM-owned content may converge; ambiguous, unowned, or modified content is preserved and blocks predictable writes.
5. **Unforeseen partial writes need honest outcomes.** Report completed and failed clients separately and make repeating the same setup convergent; do not promise rollback.
6. **Workspace prerequisites and task-plan conflicts need preflight.** A predictable Backlog.md or planning failure must not leave a partial first-run workspace.
7. **A receipt alone is not handoff success.** It is machine state summarized by the CLI; the receiving agent performs the readiness check.

### Medium (6)

1. Normal setup should show only supported P0 choices: Codex and Claude Code.
2. Detection is transient context and should not be retained as managed state.
3. Successful output should be concise: per-client outcome, relevant reload advice, and the next action; detailed paths and ownership evidence belong in conflicts or diagnostics.
4. Personal-agent defaults may seed workspace creation, but an explicit workspace choice wins and deliverable targets remain independent.
5. Legacy migration is an automatic reconciliation outcome, not a migration wizard or separate normal-path command.
6. User-facing language should say “coding tools that create this package,” “coding tools that author this workspace,” and “agents supported by the delivered package,” rather than exposing adapter/target terminology together.

## Planning consequence

Replace the proposed five-step Epic 2 user journey with one setup experience. Implementation stories may still separate adapter data, setup reconciliation, ownership-safe migration, and tests, but none becomes an extra action the user or bootstrap agent must perform.

The cleanest epic boundary is to combine personal setup and workspace handoff into one end-to-end onboarding epic, followed by the independent template-task extension epic. This removes the cross-epic promise in FR16 and keeps the main outcome visible.

## Reviewer files

- `review-rubric.md`
- `review-first-run.md`
- `review-friction.md`
- `review-trust-recovery.md`
