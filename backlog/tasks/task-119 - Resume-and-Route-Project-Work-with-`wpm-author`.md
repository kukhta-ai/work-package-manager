---
id: TASK-119
title: Resume and Route Project Work with wpm-author
status: To Do
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-21 15:02'
labels:
  - onboarding-epic-2
  - authoring-onboarding
  - skill
  - workspace-skill
  - authoring-router
dependencies:
  - TASK-115
  - TASK-116
  - TASK-117
  - TASK-118
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/validation-report.md
priority: high
ordinal: 119000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: A fresh workspace-root agent needs durable orientation, safe backlog continuation, and focused routing without bootstrap context.

Boundary: Covers workspace orientation, in-progress work, one dependency-eligible claim, project-level work, specialist routing, and invalid-context recovery.

Non-goals: Personal setup, bootstrap guidance, substituting unrelated specialists, or interpreting executor-facing deliverable instructions as authoring instructions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a fresh session at the workspace root; when `wpm-author` begins; then it identifies the authoring workspace, deliverable, build output, and authoring backlog from durable state; and it does not interpret executor-facing deliverable instructions as authoring instructions.
- [ ] #2 Given the authoring backlog contains in-progress work; when the agent asks to continue authoring; then resumable work is surfaced before any new task is claimed; and continuing it creates no duplicate task.
- [ ] #3 Given no task is in progress and dependency-eligible authoring work exists; when the agent asks to continue; then exactly one eligible task can be claimed and is observable as the current work.
- [ ] #4 Given no task is in progress and no authoring work is dependency-eligible; when the agent asks to continue; then the backlog remains unchanged and the absence of eligible work is reported.
- [ ] #5 Given the current task concerns project-level authoring; when `wpm-author` handles it; then the task can reach its observable outcome without requiring a specialist skill; and its durable artifacts and authoring-backlog state remain coherent.
- [ ] #6 Given the current task concerns a bundle, recipe, agent skill or front door, or package review; when `wpm-author` routes it; then only the matching workspace specialist receives the focused work; and a missing or incompatible specialist produces integration-recovery guidance rather than an unrelated substitution.
- [ ] #7 Given the current directory is not a valid authoring workspace root, managed authoring state is missing or corrupt, or the authoring backlog is unavailable or malformed; when `wpm-author` begins or attempts to continue work; then every affected prerequisite is identified with one applicable recovery action.
- [ ] #8 Given `wpm-author` detects an invalid workspace, managed-state, or backlog context; when the authoring backlog and workspace artifacts are inspected afterward; then no task is claimed, resumed, or changed and no workspace artifact is mutated.
- [ ] #9 The exact packed WPM package exposes `wpm-author` independently without repository-relative resources.
- [ ] #10 Generated work-package deliverables contain no copy of the `wpm-author` workspace-authoring skill.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
- [ ] #4 During this story, a fresh current official Codex `$skill-creator` or Claude Code `skill-creator@claude-plugins-official` authoring helper is invoked; evidence records the helper and host versions, then-current official Codex and Claude skill-authoring sources with access date, and fresh-session discovery, explicit-invocation, natural-language-trigger, non-trigger, and outcome verification for both supported platforms.
<!-- DOD:END -->
