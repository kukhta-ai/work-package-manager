---
id: TASK-122
title: Guide Package Creation with wpm-create-package
status: Done
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-23 16:39'
labels:
  - onboarding-epic-2
  - authoring-onboarding
  - skill
  - personal-skill
  - bootstrap
dependencies:
  - TASK-121
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/validation-report.md
modified_files:
  - agent-skills/wpm-create-package/SKILL.md
  - test/unit/agent-skills/wpm-create-package-skill.test.ts
  - test/integration/distribution-preparation/package-preparation.test.ts
  - test/integration/distribution-preparation/packed-install.test.ts
  - test/integration/distribution-preparation/public-surfaces.test.ts
  - test/integration/cli.build.e2e.test.ts
  - >-
    _bmad-output/implementation-artifacts/2-9-guide-package-creation-with-wpm-create-package.md
  - _bmad-output/implementation-artifacts/tests/test-summary-task-122.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
priority: high
ordinal: 122000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: An author's existing coding agent needs a focused personal bootstrap capability that reaches a prepared workspace and then yields to a fresh workspace-root session.

Boundary: Owns the packaged `wpm-create-package` artifact, readiness and unresolved-decision guidance, explicit client selection, workspace creation or adoption, and the prepared-handoff boundary.

Non-goals: Normal personal-scope installation or reconciliation, which belongs to Story 2.10; authoring-task execution; process, authentication, or session ownership; repository-relative fixtures; or extra per-client onboarding steps.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given a fresh supported personal skill scope populated only from the exact local package's declared ship set; when the bootstrap artifact is discovered and invoked; then `wpm-create-package` is independently available without the source checkout or repository-relative resources.
- [x] #2 Given `wpm-create-package` is available in a supported personal scope and WPM is installed; when an existing agent receives package-creation intent; then it identifies unresolved readiness, package-intent, authoring-client, and workspace decisions; and it asks only for decisions still required to create or adopt the workspace.
- [x] #3 Given WPM is ready and explicit supported authoring-client IDs and package intent are available; when the agent follows `wpm-create-package`; then the resulting created or adopted workspace uses that authoring-client selection independently of `manifest.yml.targets`; and workspace preparation reaches a prepared handoff.
- [x] #4 Given a prerequisite or required setup state is missing; when `wpm-create-package` assesses readiness; then it identifies the blocking condition and one actionable recovery; and it does not claim that workspace preparation or handoff succeeded.
- [x] #5 Given any predictable workspace, authoring-integration, or task-plan dependency for the requested create or adopt operation is invalid, unavailable, or conflicting; when `wpm-create-package` evaluates the complete request; then every blocker and affected surface is reported before the first workspace write; and the workspace, authoring backlog, deliverable, selected integrations, and handoff state remain unchanged.
- [x] #6 Given workspace preparation produced a prepared handoff; when the bootstrap stage finishes; then the result identifies the workspace root, applicable launch or reload guidance, and the fresh-session verification action; and the skill stops at the workspace boundary without claiming spawn, authentication, acceptance, or authoring-task progress.
- [x] #7 Generated work-package deliverables contain no copy of the personal `wpm-create-package` skill.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Literal BMAD workflows completed: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, and independent bmad-story-automator-review cycle 1. Fresh official skill-creator was invoked. Reviewer fixed two HIGH findings: coherent canonical same-root prior-version adoption now converges through the full no-write preflight, while foreign/noncanonical/disagreeing/partial state remains blocked; and exact final-byte live Codex evidence is now attributed by a sanitized run manifest. Independent re-audit ended at 0 open. Stable six-file product/test hash 53b917fb85ff9bf64111784904fb0ffec12f9dda5e5088638288274fd662bcee. Validator; focused 26/26; package/source-free 8/8; nonleak 1 pass/25 skipped; typecheck; Biome 255; build; diff check; exact full npm test 131/131 files and 1660/1660 tests in 524.31s. Final source-free archive SHA-256 49b50b2636e74459cea096b3df3753f47e9c3d46e36aaf4db787e74a9ac16369. Fresh Codex discovery, explicit, natural prepared outcome, and adjacent nontrigger passed; no live Claude claim. A post-gate evidence-search quoting mistake briefly launched a second npm test and was terminated before completion/result; no bytes changed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered the portable personal wpm-create-package skill with exact source-free dual-client compatibility, unresolved-decision discipline, complete create/adopt no-write preflight, explicit client selection independent of manifest targets, prepared-handoff-only success, and generated-deliverable nonleakage. Independent review APPROVE: 7/7 AC, 0 open; full gate 1660/1660.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
- [x] #4 During this story, a fresh current official Codex `$skill-creator` or Claude Code `skill-creator@claude-plugins-official` authoring helper is invoked; evidence records the helper and host versions, then-current official Codex and Claude Code skill-authoring sources with access date, deterministic native-path, frontmatter, discovery and explicit-invocation identity, trigger/non-trigger contract, and source-free portability evidence for both supported platforms, and fresh Codex discovery, explicit-invocation, natural-language-trigger, non-trigger, and outcome verification. Authenticated live Claude behavioral parity is owned by the approved post-implementation exact-revision cold gate and is not claimed by this story.
<!-- DOD:END -->
