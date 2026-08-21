# UX Review — Setup Friction and Bureaucracy

## Overall verdict

The proposed Epic 2 has the right product boundary—explicit Codex/Claude choice followed by installation of one personal bootstrap skill—but it risks exposing its internal adapter, detection, state, and migration model as a multi-step user workflow. Keep the implementation stories if they help delivery; the user-facing experience should still be one setup action with one short result and one next step.

## Journey reviewed

An existing coding agent has an installed WPM CLI, configures the author's chosen coding client or clients, gains the personal `wpm-create-package` skill, and proceeds to workspace creation. This review treats Codex and Claude Code as the P0 choices and keeps authoring clients separate from deliverable targets.

## Findings

### High — Adapter inspection must not become a prerequisite screen or command

The adapter catalog is a product contract needed by setup, help, workspace generation, and tests; it is not a task the user should have to perform before setup. Current WPM already exposes a separate `skill install` action, while the proposed scope adds catalog, detection, selection, defaults, reconciliation, and migration concepts (`src/cli.ts:3351-3387`; `epics-authoring-agent-onboarding.md:26-52`).

**Recommendation:** Let the normal setup prompt show the supported choices, detection annotations, and destinations inline. Keep stable adapter IDs in help and headless input. Do not require a preceding list/detect/inspect step.

### High — One-client, multi-client, interactive, and headless are variants of one setup

The user has one intent: “make WPM available to these authoring clients.” Separate commands or modes for one client, several clients, detection, installation, update, or reconciliation would force the user to understand implementation states. The investigation already establishes that one validated selection contract can serve one or many clients (`agent-driven-onboarding-flow-investigation.md:198-204,557-560`).

**Recommendation:** Use one conceptual setup surface:

- interactive invocation: show Codex and Claude Code once, annotate detection, allow one or both, then confirm once;
- headless invocation: accept explicit stable IDs and do not prompt;
- repeated invocation: reconcile the same desired result rather than expose a separate update command.

### High — Personal versus workspace scope should not be a user choice

The level model already decides this: personal scope receives only `wpm-create-package`; the focused authoring family belongs to the generated workspace (`agent-driven-onboarding-flow-investigation.md:458-477`). Asking users where to install skills would expose paths and lifecycle rules they cannot usefully decide.

**Recommendation:** Show the selected personal destination in the confirmation and result, but do not ask the user to select a scope. Workspace integration belongs to workspace creation.

### Medium — Detection is a hint, not a workflow stage

Current behavior scans four config directories and writes every detected scope (`install-authoring-skill.ts:93-115,184-209`; `README.md:70-76`). A stale directory can therefore produce both unwanted writes and extra explanation. Detection remains useful only to reduce selection effort.

**Recommendation:** Preselect or annotate detected P0 clients in the interactive chooser. Do not persist detection, ask the user to verify it, or require detection before an explicitly named supported client can be configured.

### Medium — Happy-path reporting should be actionable, not exhaustive

The current result prints every absolute destination and write status (`src/cli.ts:3336-3348`). Paths are useful at confirmation and on failure, but a successful user primarily needs to know which clients are ready, whether a reload is required, and what to do next.

**Recommendation:** On success, report one line per selected client—installed, updated, or unchanged—plus reload advice only where needed and the next workspace-creation action. Reserve ownership details, fingerprints, and all examined paths for conflicts or diagnostic output.

### Medium — Migration is reconciliation, not a separate user journey

The user should not choose whether setup is an install, update, or legacy migration. Those are states WPM can distinguish through ownership evidence. The only meaningful interruption is when WPM cannot prove it owns content that would need to change (`agent-driven-onboarding-flow-investigation.md:551,568`).

**Recommendation:** Reconcile recognized WPM output automatically after the single confirmation. Stop and explain ambiguous or user-modified content; do not add a migration wizard or a normal-path migration command.

### Medium — The personal bootstrap begins after acquisition

The current packaged `installer-builder` teaches the whole authoring lifecycle (`agent-skills/installer-builder/SKILL.md:48-68`). The revised personal skill should not explain how to obtain the package that had to exist before the skill could be installed.

**Recommendation:** Start `wpm-create-package` with prerequisite readiness, explicit setup status, package intent, workspace creation, and handoff. Keep initial WPM acquisition in distribution-level guidance.

### Low — Avoid user-facing “adapter” and “target” ambiguity

`manifest.yml.targets` describes recipient/executor compatibility, not the author's coding client (`agent-driven-onboarding-flow-investigation.md:138-142`). Both terms appearing in one setup flow would invite the wrong choice.

**Recommendation:** Ask “Which coding tools will author this project?” Use “Codex” and “Claude Code” in interactive copy. Reserve adapter IDs for flags/help and “targets” for deliverable configuration elsewhere.

## Concepts to remove from the normal flow

- a mandatory adapter-catalog step;
- separate detect, install, update, reconcile, and migrate commands;
- a personal-versus-workspace scope choice;
- confirmation after explicit headless selection;
- persistence or display of transient detection state;
- full path, ownership, version, and provenance reports on success;
- package acquisition instructions inside an already-installed personal skill;
- Hermes/OpenClaw choices before their contracts are supported.

## Simplest recommended flow

1. The existing agent invokes one WPM setup action.
2. With explicit client IDs, WPM validates and proceeds without prompting. Without them, WPM shows Codex and Claude Code once, annotates detected clients, and lets the user select one or both.
3. Interactive setup shows one concise write summary—selected clients and personal destinations—and asks for one confirmation.
4. WPM installs, updates, or leaves unchanged only `wpm-create-package` for the selected clients, retaining the selection as a default for workspace creation.
5. The result names each selected client, reload advice only when applicable, and the single next action: create the workspace. Ownership conflicts replace the success result with focused recovery guidance.

## Lens verdict

**Adequate after simplification.** The underlying adapter and ownership model is justified, but it should remain behind one setup interaction. Story count need not shrink; user-visible concepts and steps should.
