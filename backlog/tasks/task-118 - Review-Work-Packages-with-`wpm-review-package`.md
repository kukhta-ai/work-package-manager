---
id: TASK-118
title: Review Work Packages with wpm-review-package
status: Done
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-23 10:15'
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
modified_files:
  - agent-skills/wpm-review-package/SKILL.md
  - test/unit/agent-skills/wpm-review-package-skill.test.ts
  - test/integration/distribution-preparation/package-preparation.test.ts
  - test/integration/cli.build.e2e.test.ts
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
- [x] #1 Given no prior authoring conversation is available; when `wpm-review-package` reviews a workspace; then it evaluates the bounded FR49 catalog: package structure, references, registrations, version constraints, context-less executor simulation, build non-leakage, and release readiness.
- [x] #2 Given the bounded review catalog is evaluated; when review inputs are resolved; then its complete scope is derivable from durable workspace and deliverable artifacts without another WPM skill or prior conversation supplying hidden context.
- [x] #3 Given package structure, references, registrations, or version constraints contain defects; when package coherence is reviewed; then every detected defect in those four catalog categories is reported with its affected artifact or relationship in one review result.
- [x] #4 Given a bundle represents a fresh installation or version transition; when its executor experience is simulated without authoring context; then unstated prerequisites, ambiguous outcomes, unresolved references, undeclared coupling, and missing verification or usage guidance are reported.
- [x] #5 Given build or release readiness is reviewed; when the review concludes; then readiness is reported only when package coherence, executor simulation, and build evidence agree.
- [x] #6 Given a workspace-authoring surface is found in the prospective deliverable; when build non-leakage is reviewed; then release readiness is blocked.
- [x] #7 Given release readiness is reported; when the review result is presented; then it is not presented as publication authorization.
- [x] #8 Given no separate fix authorization was supplied; when package review completes; then the reviewed workspace and deliverable content remain unchanged.
- [x] #9 The exact packed WPM package exposes `wpm-review-package` independently without repository-relative resources.
- [x] #10 Generated work-package deliverables contain no copy of the `wpm-review-package` workspace-authoring skill.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-23 completion: literal bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, and independent replacement-reviewer bmad-story-automator-review all ran. The replacement reviewer completed the mandatory full sequential preload after the prior reviewer session was lost. Review resolved 3 linked HIGH findings: circular original-marker baseline, copied stale-build evidence, and copy-time/source-Git/TOCTOU isolation. Final contract snapshots the original before markers, copies symlink-preservingly outside source Git, proves copy equivalence and capture-boundary immutability, clears copied builds, plants both native markers only in the disposable copy, inspects fresh tar/Git/conditional-zip output, and preserves the original plus historical archive. Validator, typecheck, Biome 244 files, build, diff check, focused package/public/nonleak bands, and exactly one full npm test passed (124/124 files, 1555/1555 tests). Stable product/test aggregate: 39b1b09fb0b7a7345d1161a96b99be5abca3770b1b7610c66d0e9591def91105. Accepted source-free package revision 9c1a8006a63b231543ec1c11e4eb33dead62e5b1, archive SHA-256 f3bd57089f253ee0cb7ede64ef47f87ed6a14c98476648d001f1999e177b9284, 433 entries/482148 bytes, skill SHA-256 6d13b74090c40e60ff3888e47b9e9248032728c5a4eb3824aaef55af93e5aeb2. Fresh Codex discovery, explicit, natural seven-category not-ready/no-write result, and non-trigger passed. Reviewer deviations (fixture-local Serena metadata and an npm-init package.json rewrite) were detected and restored exactly before the gate; package.json/package-lock are clean. Authenticated live Claude remains deferred to the approved post-TASK127 exact-revision cold gate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered and independently approved the fresh-context, read-only wpm-review-package skill with the finite FR49 review catalog, aggregate defect reporting, isolated fresh-build evidence, exact source-free packaging, and generated-deliverable non-leakage.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
- [x] #4 During this story, a fresh current official Codex `$skill-creator` or Claude Code `skill-creator@claude-plugins-official` authoring helper is invoked; evidence records the helper and host versions, then-current official Codex and Claude Code skill-authoring sources with access date, deterministic native-path, frontmatter, discovery and explicit-invocation identity, trigger/non-trigger contract, and source-free portability evidence for both supported platforms, and fresh Codex discovery, explicit-invocation, natural-language-trigger, non-trigger, and outcome verification. Authenticated live Claude behavioral parity is owned by the approved post-implementation exact-revision cold gate and is not claimed by this story.
<!-- DOD:END -->
