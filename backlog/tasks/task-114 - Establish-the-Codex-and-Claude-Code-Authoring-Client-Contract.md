---
id: TASK-114
title: Establish the Codex and Claude Code Authoring-Client Contract
status: Done
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-22 09:39'
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
modified_files:
  - >-
    _bmad-output/implementation-artifacts/2-1-establish-the-codex-and-claude-code-authoring-client-contract.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - _bmad-output/implementation-artifacts/tests/test-summary-task-114.md
  - src/cli.ts
  - src/core/operations/authoring-clients.ts
  - src/core/services/authoring-clients.ts
  - test/integration/cli.authoring-clients.test.ts
  - test/unit/cli/authoring-clients-commands.test.ts
  - test/unit/services/authoring-clients.test.ts
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
- [x] #1 Given a user or agent requests the supported authoring clients; when WPM presents its inventory or relevant help; then Codex appears with stable ID `codex`; and Claude Code appears with stable ID `claude-code`; and both retain consistent human-readable names.
- [x] #2 Given Codex authoring support is inspected; when its contract is returned; then it identifies `~/.agents/skills` as the personal skill destination, `.agents/skills` as the workspace destination, and `AGENTS.md` as the workspace front door; and it supplies the current detection result and Codex-specific launch and reload guidance.
- [x] #3 Given Claude Code authoring support is inspected; when its contract is returned; then it identifies `~/.claude/skills` as the personal skill destination, `.claude/skills` as the workspace destination, and `CLAUDE.md` as the workspace front door; and it supplies the current detection result and Claude-Code-specific launch and reload guidance.
- [x] #4 Given a project's authoring clients differ from its deliverable targets; when WPM reports or retains either set; then both sets preserve their own values; and no authoring client is inferred from or written to `manifest.yml.targets`.
- [x] #5 Given Hermes, OpenClaw, an empty value, or an unknown identifier is presented as an authoring client; when WPM evaluates its support status; then Codex and Claude Code remain the only selectable P0 clients; and deferred and invalid identifiers are machine-distinguishable and are not reported as successfully configured.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD evidence: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, and independent bmad-story-automator-review all ran literally for TASK-114. Review cycle 1 APPROVE with 5/5 ACs, 0 open findings; four medium and one low finding were auto-fixed. Exact full npm test passed 1,507/1,507 across 120 files; typecheck, Biome over 240 files, build, focused integration, core-boundary, generated-deliverable, and dry-pack gates passed. Stable product/test hash cbb1f41a4251edae93f20f4352fb849182b71d3e130181bdc23bc2cb2a1e8bef. Official Codex and Claude Code facts were checked against current primary documentation on 2026-08-22. Public activation, client configuration, and manifest target mutation remain out of scope.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered the read-only Codex and Claude Code authoring-client contract with stable identities, native personal/workspace paths and front doors, advisory detection, launch/reload guidance, closed selectable/deferred/invalid states, and strict independence from deliverable targets. Reviewer hardened catalog immutability, HOME and directory detection, safe rendering, and help clarity. All tests and quality gates pass.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
