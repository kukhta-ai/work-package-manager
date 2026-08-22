---
id: TASK-116
title: Author Install Recipes with wpm-author-recipe
status: Done
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-22 16:21'
labels:
  - onboarding-epic-2
  - authoring-onboarding
  - skill
  - workspace-skill
  - recipe-authoring
dependencies:
  - TASK-109
  - TASK-114
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/validation-report.md
priority: high
ordinal: 116000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: Authors need self-contained installation recipes that a context-less executor can verify and resume safely.

Boundary: Covers detect, setup, verify, state, migration, acceptance-outcome, dependency, and receipt coherence within one install backlog.

Non-goals: Bundle metadata, payload or front-door authoring, package review, or redefining previously shipped migration history.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given `wpm-author-recipe` is invoked without a prior bootstrap conversation; when an author describes a new installation outcome; then the resulting install backlog expresses the required detect, setup, and verify work; and dependencies that affect execution order are explicit; and that install backlog remains the single recipe task source.
- [x] #2 Given an existing recipe must support a newer version; when the skill completes the revision; then desired-state work expresses the current intended result; and one-time transition work is limited to the prior-version states for which it applies; and previously shipped migration history is not silently redefined.
- [x] #3 Given a context-less executor runs or resumes the resulting recipe; when it evaluates a task for completion; then the task has observable acceptance outcomes; and every required receipt fact is completion-gated; and completed work can be distinguished without relying on the authoring conversation.
- [x] #4 Given a recipe lacks required verification, contains ambiguous state or migration work, or has unresolved or cyclic dependencies; when its authoring outcome is assessed; then every discoverable blocker is identified; and the recipe is not presented as ready.
- [x] #5 The exact packed WPM package exposes `wpm-author-recipe` independently without repository-relative resources.
- [x] #6 Generated work-package deliverables contain no copy of the `wpm-author-recipe` workspace-authoring skill.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-22: Literal BMAD workflows ran: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, and bmad-story-automator-review cycle 1. APPROVE with 0 open findings after 3 high and 3 medium fixes covering canonical recipe identity, Backlog 1.45.2 command/edit semantics, receipt separation, non-empty DoD gates, safe criteria/dependency editing, and non-vacuous tar evidence. Exact full npm test 1526/1526; stable product/test SHA-256 168b95390c543bff4ecb8687fc8760c89f81ba00d28b71daf3a5389295a92b54; accepted archive SHA-256 7850b514741225a1415ddb1378a93b490fac8f1f47cbc08af6de6aaf699adcc2; skill SHA-256 0cc30eaf3678784dd84ef7c0352a148bf5c1e9ba4efe0d58be6b88a7ad93ad4d. Live Codex exact-archive evidence passed; live Claude remains the approved post-TASK127 gate. Review deviation: a temp-probe cwd mistake created untracked TASK-128; root removed that exact file after confirming Backlog 1.45.2 has no delete command, and TASK-128 is not found with no existing task changed. One ENOSPC cache-clear deviation was confined to disposable review data.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
- [x] #4 During this story, a fresh current official Codex `$skill-creator` or Claude Code `skill-creator@claude-plugins-official` authoring helper is invoked; evidence records the helper and host versions, then-current official Codex and Claude Code skill-authoring sources with access date, deterministic native-path, frontmatter, discovery and explicit-invocation identity, trigger/non-trigger contract, and source-free portability evidence for both supported platforms, and fresh Codex discovery, explicit-invocation, natural-language-trigger, non-trigger, and outcome verification. Authenticated live Claude behavioral parity is owned by the approved post-implementation exact-revision cold gate and is not claimed by this story.
<!-- DOD:END -->
