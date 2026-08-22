---
id: TASK-116
title: Author Install Recipes with wpm-author-recipe
status: To Do
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-22 14:31'
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
- [ ] #1 Given `wpm-author-recipe` is invoked without a prior bootstrap conversation; when an author describes a new installation outcome; then the resulting install backlog expresses the required detect, setup, and verify work; and dependencies that affect execution order are explicit; and that install backlog remains the single recipe task source.
- [ ] #2 Given an existing recipe must support a newer version; when the skill completes the revision; then desired-state work expresses the current intended result; and one-time transition work is limited to the prior-version states for which it applies; and previously shipped migration history is not silently redefined.
- [ ] #3 Given a context-less executor runs or resumes the resulting recipe; when it evaluates a task for completion; then the task has observable acceptance outcomes; and every required receipt fact is completion-gated; and completed work can be distinguished without relying on the authoring conversation.
- [ ] #4 Given a recipe lacks required verification, contains ambiguous state or migration work, or has unresolved or cyclic dependencies; when its authoring outcome is assessed; then every discoverable blocker is identified; and the recipe is not presented as ready.
- [ ] #5 The exact packed WPM package exposes `wpm-author-recipe` independently without repository-relative resources.
- [ ] #6 Generated work-package deliverables contain no copy of the `wpm-author-recipe` workspace-authoring skill.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
- [ ] #4 During this story, a fresh current official Codex `$skill-creator` or Claude Code `skill-creator@claude-plugins-official` authoring helper is invoked; evidence records the helper and host versions, then-current official Codex and Claude Code skill-authoring sources with access date, deterministic native-path, frontmatter, discovery and explicit-invocation identity, trigger/non-trigger contract, and source-free portability evidence for both supported platforms, and fresh Codex discovery, explicit-invocation, natural-language-trigger, non-trigger, and outcome verification. Authenticated live Claude behavioral parity is owned by the approved post-implementation exact-revision cold gate and is not claimed by this story.
<!-- DOD:END -->
