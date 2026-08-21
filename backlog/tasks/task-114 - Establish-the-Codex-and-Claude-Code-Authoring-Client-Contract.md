---
id: TASK-114
title: Establish the Codex and Claude Code Authoring-Client Contract
status: To Do
assignee: []
created_date: '2026-08-21 15:01'
labels:
  - onboarding-epic-2
  - authoring-onboarding
  - authoring-adapters
  - core-contract
dependencies: []
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/validation-report.md
priority: high
ordinal: 114000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: Authors need one stable definition of each supported authoring client so setup, workspace integration, verification, and help agree.

Boundary: Defines Codex and Claude Code identities, native surfaces, detection, launch, and reload information independently of deliverable targets.

Non-goals: Configuring either client, mutating personal or workspace scope, supporting Hermes or OpenClaw, or changing `manifest.yml.targets`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a user or agent requests the supported authoring clients; when WPM presents its inventory or relevant help; then Codex appears with stable ID `codex`; and Claude Code appears with stable ID `claude-code`; and both retain consistent human-readable names.
- [ ] #2 Given Codex authoring support is inspected; when its contract is returned; then it identifies `~/.agents/skills` as the personal skill destination, `.agents/skills` as the workspace destination, and `AGENTS.md` as the workspace front door; and it supplies the current detection result and Codex-specific launch and reload guidance.
- [ ] #3 Given Claude Code authoring support is inspected; when its contract is returned; then it identifies `~/.claude/skills` as the personal skill destination, `.claude/skills` as the workspace destination, and `CLAUDE.md` as the workspace front door; and it supplies the current detection result and Claude-Code-specific launch and reload guidance.
- [ ] #4 Given a project's authoring clients differ from its deliverable targets; when WPM reports or retains either set; then both sets preserve their own values; and no authoring client is inferred from or written to `manifest.yml.targets`.
- [ ] #5 Given Hermes, OpenClaw, an empty value, or an unknown identifier is presented as an authoring client; when WPM evaluates its support status; then Codex and Claude Code remain the only selectable P0 clients; and deferred and invalid identifiers are machine-distinguishable and are not reported as successfully configured.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
