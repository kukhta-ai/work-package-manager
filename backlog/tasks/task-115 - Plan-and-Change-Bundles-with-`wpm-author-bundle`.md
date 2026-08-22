---
id: TASK-115
title: Plan and Change Bundles with wpm-author-bundle
status: Done
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-22 14:56'
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
- [x] #1 Given `wpm-author-bundle` is invoked without a prior bootstrap conversation; when a bundle's capability boundary is incomplete or ambiguous; then what belongs in that bundle, what is an external dependency, and what remains a separate capability are explicit; and unresolved author decisions are surfaced rather than invented.
- [x] #2 Given the boundary of a new or existing bundle is agreed; when the skill completes the requested bundle work; then the bundle's stated purpose and lifecycle state are represented in WPM-managed project state; and each required metadata value, declared dependency, and payload registration either resolves through that state or is reported as unresolved; and no unresolved bundle-level concern is reported as complete.
- [x] #3 Given the work also requires recipe authoring, skill or front-door authoring, or whole-package review; when `wpm-author-bundle` reaches that boundary; then it leaves the distinct work explicitly pending without claiming to have completed it; and its bundle-level result remains independently usable.
- [x] #4 Given the workspace, bundle identity, or requested dependency is invalid or conflicting; when the skill evaluates the requested bundle work; then the blocking condition and affected boundary are identified; and no successful bundle result is claimed.
- [x] #5 The exact packed WPM package exposes `wpm-author-bundle` independently without repository-relative resources.
- [x] #6 Generated work-package deliverables contain no copy of the `wpm-author-bundle` workspace-authoring skill.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-22: Literal BMAD workflows ran: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, and bmad-story-automator-review cycles 1-2. The user-approved literal bmad-correct-course workflow moved authenticated live Claude parity to the post-TASK127 exact-final-revision cold gate; a bmad-dev-story continuation reconciled the evidence ownership. Cycle 2 APPROVE: 0 open findings; full npm test 1516/1516; stable product/test SHA-256 25153454f2dcb6ba070fe96e77ddbf484a631cec0c7fa154db3449696c49dcab; exact archive 430 entries / 469924 bytes / SHA-256 9291cffc2110b4a98f2e55c24ca128caaca2e11de05d17bc70269de18afcc9c6. Claude expired-OAuth 401 evidence is retained as a final-gate diagnostic, not a success claim.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
- [x] #4 During this story, a fresh current official Codex `$skill-creator` or Claude Code `skill-creator@claude-plugins-official` authoring helper is invoked; evidence records the helper and host versions, then-current official Codex and Claude Code skill-authoring sources with access date, deterministic native-path, frontmatter, discovery and explicit-invocation identity, trigger/non-trigger contract, and source-free portability evidence for both supported platforms, and fresh Codex discovery, explicit-invocation, natural-language-trigger, non-trigger, and outcome verification. Authenticated live Claude behavioral parity is owned by the approved post-implementation exact-revision cold gate and is not claimed by this story.
<!-- DOD:END -->
