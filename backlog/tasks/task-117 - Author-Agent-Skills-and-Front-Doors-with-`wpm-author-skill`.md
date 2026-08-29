---
id: TASK-117
title: Author Agent Skills and Front Doors with wpm-author-skill
status: Done
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-23 08:34'
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
modified_files:
  - agent-skills/wpm-author-skill/SKILL.md
  - test/unit/agent-skills/wpm-author-skill-skill.test.ts
  - test/integration/distribution-preparation/package-preparation.test.ts
  - test/integration/cli.build.e2e.test.ts
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
- [x] #1 Given `wpm-author-skill` is invoked without a prior bootstrap conversation; when an author requests an advisor, install-time helper, payload skill, or native front door; then the completed capability identifies its role, intended user, activation moment, and discovery scope.
- [x] #2 Given the capability's role is established; when its resulting placement is reviewed; then an advisor is discoverable before installation, an install-time helper is available during its relevant install, and a payload skill becomes discoverable only after delivery; and a native front door reaches only its intended agent context.
- [x] #3 Given an authored capability's role is known; when its discovery contract is inspected; then its focused trigger, registration, and native discovery behavior agree with that role.
- [x] #4 Given a WPM-owned or package-owned skill identity is inspected; when its namespace is evaluated; then the `wpm-` prefix is accepted only for WPM-owned skills and a conflicting user-authored identity is reported; and user payload skills, `<project>-installer`, and `<bundle>-advisor` retain package-owned names without the prefix being imposed.
- [x] #5 Given workspace-authoring and deliverable-executor instructions exist in the same project; when their front-door scopes are inspected; then each is discoverable only in its intended context and neither is represented as the other.
- [x] #6 Given the requested role or discovery scope remains ambiguous or conflicts with an existing artifact; when the skill reaches that unresolved boundary; then it identifies the decision or conflict without inventing a placement; and it does not claim the capability is correctly discoverable.
- [x] #7 The exact packed WPM package exposes `wpm-author-skill` independently without repository-relative resources.
- [x] #8 Generated work-package deliverables contain no copy of the `wpm-author-skill` workspace-authoring skill.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-23 completion: literal bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, and independent bmad-story-automator-review all ran. Review resolved 9 findings (6 high, 2 medium, 1 low) and approved with 0 open. Focused 75/75; validator, typecheck, Biome 243 files, build, and diff check passed. One exact npm test passed 123/123 files and 1540/1540 tests. Stable product/test SHA-256 aggregate: 771c691d48f258430548c5a0cea95fe95341eff9eee23099af3d9dbc43653f49. Accepted source-free archive revision b75841027466a01b7d061c089b3d22d1333af937, SHA-256 294e72f8a104a10cf2768a01f298eff77c6a074b786b608bf7583cd1b47376df, 478364 bytes/432 entries. Fresh Codex discovery, explicit aggregate blocked/no-write, natural authoring, validation, and non-trigger evidence passed. Authenticated live Claude parity remains intentionally deferred to the approved post-TASK127 exact-revision cold gate and is not claimed here.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered and independently approved the portable wpm-author-skill contract, exact source-free package exposure, role/identity/registration/front-door safety, and generated-deliverable non-leakage with zero open findings.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
- [x] #4 During this story, a fresh current official Codex `$skill-creator` or Claude Code `skill-creator@claude-plugins-official` authoring helper is invoked; evidence records the helper and host versions, then-current official Codex and Claude Code skill-authoring sources with access date, deterministic native-path, frontmatter, discovery and explicit-invocation identity, trigger/non-trigger contract, and source-free portability evidence for both supported platforms, and fresh Codex discovery, explicit-invocation, natural-language-trigger, non-trigger, and outcome verification. Authenticated live Claude behavioral parity is owned by the approved post-implementation exact-revision cold gate and is not claimed by this story.
<!-- DOD:END -->
