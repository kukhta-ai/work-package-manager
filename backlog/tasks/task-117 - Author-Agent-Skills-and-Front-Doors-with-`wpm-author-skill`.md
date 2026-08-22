---
id: TASK-117
title: Author Agent Skills and Front Doors with wpm-author-skill
status: To Do
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-22 14:31'
labels:
  - onboarding-epic-2
  - authoring-onboarding
  - skill
  - workspace-skill
  - skill-authoring
dependencies:
  - TASK-109
  - TASK-114
references:
  - _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/validation-report.md
priority: high
ordinal: 117000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: Agent capabilities must be discoverable at the correct stage without crossing authoring and executor boundaries.

Boundary: Covers advisors, install-time helpers, payload skills, and native front doors, including role, scope, trigger, registration, placement, and namespace coherence.

Non-goals: Bundle or recipe authoring, package review, ambiguous placement guesses, or imposing WPM-owned naming on package-owned skills.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given `wpm-author-skill` is invoked without a prior bootstrap conversation; when an author requests an advisor, install-time helper, payload skill, or native front door; then the completed capability identifies its role, intended user, activation moment, and discovery scope.
- [ ] #2 Given the capability's role is established; when its resulting placement is reviewed; then an advisor is discoverable before installation, an install-time helper is available during its relevant install, and a payload skill becomes discoverable only after delivery; and a native front door reaches only its intended agent context.
- [ ] #3 Given an authored capability's role is known; when its discovery contract is inspected; then its focused trigger, registration, and native discovery behavior agree with that role.
- [ ] #4 Given a WPM-owned or package-owned skill identity is inspected; when its namespace is evaluated; then the `wpm-` prefix is accepted only for WPM-owned skills and a conflicting user-authored identity is reported; and user payload skills, `<project>-installer`, and `<bundle>-advisor` retain package-owned names without the prefix being imposed.
- [ ] #5 Given workspace-authoring and deliverable-executor instructions exist in the same project; when their front-door scopes are inspected; then each is discoverable only in its intended context and neither is represented as the other.
- [ ] #6 Given the requested role or discovery scope remains ambiguous or conflicts with an existing artifact; when the skill reaches that unresolved boundary; then it identifies the decision or conflict without inventing a placement; and it does not claim the capability is correctly discoverable.
- [ ] #7 The exact packed WPM package exposes `wpm-author-skill` independently without repository-relative resources.
- [ ] #8 Generated work-package deliverables contain no copy of the `wpm-author-skill` workspace-authoring skill.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
- [ ] #4 During this story, a fresh current official Codex `$skill-creator` or Claude Code `skill-creator@claude-plugins-official` authoring helper is invoked; evidence records the helper and host versions, then-current official Codex and Claude Code skill-authoring sources with access date, deterministic native-path, frontmatter, discovery and explicit-invocation identity, trigger/non-trigger contract, and source-free portability evidence for both supported platforms, and fresh Codex discovery, explicit-invocation, natural-language-trigger, non-trigger, and outcome verification. Authenticated live Claude behavioral parity is owned by the approved post-implementation exact-revision cold gate and is not claimed by this story.
<!-- DOD:END -->
