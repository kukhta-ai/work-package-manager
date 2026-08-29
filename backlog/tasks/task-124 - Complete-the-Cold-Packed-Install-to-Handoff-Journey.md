---
id: TASK-124
title: Complete the Cold Packed-Install-to-Handoff Journey
status: Done
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-24 17:05'
labels:
  - onboarding-epic-2
  - authoring-onboarding
  - e2e
  - packed-install
  - handoff
dependencies:
  - TASK-123
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/validation-report.md
priority: high
ordinal: 124000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: The complete consumer journey must work from one exact local package without source-checkout state or prior authoring conversation.

Boundary: Proves inert installation, one-action setup, bootstrap availability, selected workspace integration, native front doors, shared backlog, prepared handoff, fresh-session continuation, six-skill packaging, and generated-deliverable non-leakage.

Non-goals: Public acquisition, release activation, process or session ownership, or replacing each skill story's own artifact and deterministic two-platform compatibility evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given the exact verified local package and a fresh supported environment without its source checkout or WPM skills; when the package is installed but setup has not been invoked; then its CLI and every resource in the final revision's declared ship set resolve successfully without repository-relative state.
- [x] #2 Given the exact verified local package is installed but setup has not been invoked; when Codex and Claude Code personal and workspace configurations are inspected; then every configuration remains unchanged.
- [x] #3 Given Codex-only, Claude-Code-only, both-client, or explicit headless selection; when the installed package's single setup action completes; then only the selected personal scopes receive `wpm-create-package`.
- [x] #4 Given installed-package setup succeeds; when its result is inspected; then it requires no repository-relative resource.
- [x] #5 Given installed-package setup succeeds; when its user-facing result is inspected; then it provides one package-creation next action.
- [x] #6 Given the installed bootstrap skill receives package intent and an explicit or retained authoring-client selection; when it creates or adopts the workspace; then every selected project scope contains the five workspace skills.
- [x] #7 Given the installed bootstrap skill creates or adopts the workspace; when each selected project scope is inspected; then its native front door is present and routes first to `wpm-author`.
- [x] #8 Given the installed bootstrap skill creates or adopts the workspace; when workspace-wide authoring state is inspected; then the workspace contains one shared core authoring backlog.
- [x] #9 Given the installed bootstrap skill creates or adopts the workspace; when handoff and unselected integration surfaces are inspected; then one prepared handoff is present and unselected integrations are absent.
- [x] #10 Given the revision under complete-family verification contains all six WPM-owned skill artifacts; when the installed package is inspected and exercised through selected personal and workspace fixtures; then `wpm-create-package`, `wpm-author`, `wpm-author-bundle`, `wpm-author-recipe`, `wpm-author-skill`, and `wpm-review-package` are each independently packaged, discoverable, and invocable.
- [x] #11 Given an independently launched fresh agent starts at the recorded workspace root; when handoff verification runs with the expected handoff surfaces intact; then its actual working directory, configured clients, native front doors, five workspace skills, prepared receipt, and core authoring backlog are reported as agreeing.
- [x] #12 Given fresh-agent handoff verification succeeds; when core authoring work is requested; then the agent can claim or resume that work.
- [x] #13 Given fresh-agent handoff verification and authoring continuation succeed; when WPM's handoff claims are inspected; then WPM claims no process, authentication, session, or acceptance ownership.
- [x] #14 Given that authoring workspace produces a work-package deliverable; when the deliverable boundary is inspected; then it contains no personal or workspace WPM skills, authoring backlog, managed onboarding state, handoff receipt, or workspace authoring front door.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD workflows actually run: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, and independent bmad-story-automator-review. Review APPROVE: 14/14 ACs, 0 open; stable five-file product/test SHA-256 742d7ac8237647f099850755c0fe2b2c9a5f2455160b778e8804b7a5b5b907fd. Focused/static/package/non-leakage gates passed; replacement full npm test passed 134/134 files and 1824/1824 tests after the first run exposed only the corrected shared 300-second outer timeout. Accepted source-deleted archive SHA-256 2efd78fb057b442e0f06b30757983995ea08f4fcb31cc3b4e94ab82a39f365d1, 625313 bytes, zero violations. AC11/12 are supported by explicitly compositional deterministic evidence and prior exact-byte Codex evidence; the current Codex probe was BLOCKED/supplementary and made no mutation. Authenticated live Claude parity remains deferred to the post-TASK127 exact-final-revision cold gate per approved correction.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
