---
id: TASK-115
title: Plan and Change Bundles with wpm-author-bundle
status: To Do
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-21 15:02'
labels:
  - onboarding-epic-2
  - authoring-onboarding
  - skill
  - workspace-skill
  - bundle-authoring
dependencies:
  - TASK-109
  - TASK-114
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/validation-report.md
priority: high
ordinal: 115000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: An author needs focused bundle guidance without loading unrelated authoring knowledge.

Boundary: Covers one bundle's capability boundary, metadata, dependencies, payload registration, and lifecycle state, with durable results and explicit unresolved decisions.

Non-goals: Recipe authoring, skill or front-door authoring, whole-package review, or silently deciding unresolved author choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given `wpm-author-bundle` is invoked without a prior bootstrap conversation; when a bundle's capability boundary is incomplete or ambiguous; then what belongs in that bundle, what is an external dependency, and what remains a separate capability are explicit; and unresolved author decisions are surfaced rather than invented.
- [ ] #2 Given the boundary of a new or existing bundle is agreed; when the skill completes the requested bundle work; then the bundle's stated purpose and lifecycle state are represented in WPM-managed project state; and each required metadata value, declared dependency, and payload registration either resolves through that state or is reported as unresolved; and no unresolved bundle-level concern is reported as complete.
- [ ] #3 Given the work also requires recipe authoring, skill or front-door authoring, or whole-package review; when `wpm-author-bundle` reaches that boundary; then it leaves the distinct work explicitly pending without claiming to have completed it; and its bundle-level result remains independently usable.
- [ ] #4 Given the workspace, bundle identity, or requested dependency is invalid or conflicting; when the skill evaluates the requested bundle work; then the blocking condition and affected boundary are identified; and no successful bundle result is claimed.
- [ ] #5 The exact packed WPM package exposes `wpm-author-bundle` independently without repository-relative resources.
- [ ] #6 Generated work-package deliverables contain no copy of the `wpm-author-bundle` workspace-authoring skill.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
- [ ] #4 During this story, a fresh current official Codex `$skill-creator` or Claude Code `skill-creator@claude-plugins-official` authoring helper is invoked; evidence records the helper and host versions, then-current official Codex and Claude skill-authoring sources with access date, and fresh-session discovery, explicit-invocation, natural-language-trigger, non-trigger, and outcome verification for both supported platforms.
<!-- DOD:END -->
