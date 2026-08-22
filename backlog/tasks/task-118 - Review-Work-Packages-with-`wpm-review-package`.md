---
id: TASK-118
title: Review Work Packages with wpm-review-package
status: To Do
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-22 14:31'
labels:
  - onboarding-epic-2
  - authoring-onboarding
  - skill
  - workspace-skill
  - package-review
dependencies:
  - TASK-109
  - TASK-114
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/validation-report.md
priority: high
ordinal: 118000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: A package needs a fresh-context review before handoff so hidden assumptions and deliverable defects are exposed.

Boundary: Reviews the bounded package-structure, reference, registration, version, executor-simulation, non-leakage, and release-readiness catalog from durable artifacts.

Non-goals: Mutating reviewed content without separate authorization or treating readiness as publication authority.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given no prior authoring conversation is available; when `wpm-review-package` reviews a workspace; then it evaluates the bounded FR49 catalog: package structure, references, registrations, version constraints, context-less executor simulation, build non-leakage, and release readiness.
- [ ] #2 Given the bounded review catalog is evaluated; when review inputs are resolved; then its complete scope is derivable from durable workspace and deliverable artifacts without another WPM skill or prior conversation supplying hidden context.
- [ ] #3 Given package structure, references, registrations, or version constraints contain defects; when package coherence is reviewed; then every detected defect in those four catalog categories is reported with its affected artifact or relationship in one review result.
- [ ] #4 Given a bundle represents a fresh installation or version transition; when its executor experience is simulated without authoring context; then unstated prerequisites, ambiguous outcomes, unresolved references, undeclared coupling, and missing verification or usage guidance are reported.
- [ ] #5 Given build or release readiness is reviewed; when the review concludes; then readiness is reported only when package coherence, executor simulation, and build evidence agree.
- [ ] #6 Given a workspace-authoring surface is found in the prospective deliverable; when build non-leakage is reviewed; then release readiness is blocked.
- [ ] #7 Given release readiness is reported; when the review result is presented; then it is not presented as publication authorization.
- [ ] #8 Given no separate fix authorization was supplied; when package review completes; then the reviewed workspace and deliverable content remain unchanged.
- [ ] #9 The exact packed WPM package exposes `wpm-review-package` independently without repository-relative resources.
- [ ] #10 Generated work-package deliverables contain no copy of the `wpm-review-package` workspace-authoring skill.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
- [ ] #4 During this story, a fresh current official Codex `$skill-creator` or Claude Code `skill-creator@claude-plugins-official` authoring helper is invoked; evidence records the helper and host versions, then-current official Codex and Claude Code skill-authoring sources with access date, deterministic native-path, frontmatter, discovery and explicit-invocation identity, trigger/non-trigger contract, and source-free portability evidence for both supported platforms, and fresh Codex discovery, explicit-invocation, natural-language-trigger, non-trigger, and outcome verification. Authenticated live Claude behavioral parity is owned by the approved post-implementation exact-revision cold gate and is not claimed by this story.
<!-- DOD:END -->
