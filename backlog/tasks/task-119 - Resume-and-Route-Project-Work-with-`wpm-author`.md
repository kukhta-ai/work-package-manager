---
id: TASK-119
title: Resume and Route Project Work with wpm-author
status: Done
assignee: []
created_date: '2026-08-21 15:01'
updated_date: '2026-08-23 11:17'
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
modified_files:
  - agent-skills/wpm-author/SKILL.md
  - test/unit/agent-skills/wpm-author-router-skill.test.ts
  - test/integration/distribution-preparation/package-preparation.test.ts
  - test/integration/cli.build.e2e.test.ts
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
- [x] #1 Given a fresh session at the workspace root; when `wpm-author` begins; then it identifies the authoring workspace, deliverable, build output, and authoring backlog from durable state; and it does not interpret executor-facing deliverable instructions as authoring instructions.
- [x] #2 Given the authoring backlog contains in-progress work; when the agent asks to continue authoring; then resumable work is surfaced before any new task is claimed; and continuing it creates no duplicate task.
- [x] #3 Given no task is in progress and dependency-eligible authoring work exists; when the agent asks to continue; then exactly one eligible task can be claimed and is observable as the current work.
- [x] #4 Given no task is in progress and no authoring work is dependency-eligible; when the agent asks to continue; then the backlog remains unchanged and the absence of eligible work is reported.
- [x] #5 Given the current task concerns project-level authoring; when `wpm-author` handles it; then the task can reach its observable outcome without requiring a specialist skill; and its durable artifacts and authoring-backlog state remain coherent.
- [x] #6 Given the current task concerns a bundle, recipe, agent skill or front door, or package review; when `wpm-author` routes it; then only the matching workspace specialist receives the focused work; and a missing or incompatible specialist produces integration-recovery guidance rather than an unrelated substitution.
- [x] #7 Given the current directory is not a valid authoring workspace root, managed authoring state is missing or corrupt, or the authoring backlog is unavailable or malformed; when `wpm-author` begins or attempts to continue work; then every affected prerequisite is identified with one applicable recovery action.
- [x] #8 Given `wpm-author` detects an invalid workspace, managed-state, or backlog context; when the authoring backlog and workspace artifacts are inspected afterward; then no task is claimed, resumed, or changed and no workspace artifact is mutated.
- [x] #9 The exact packed WPM package exposes `wpm-author` independently without repository-relative resources.
- [x] #10 Generated work-package deliverables contain no copy of the `wpm-author` workspace-authoring skill.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-23 completion: replacement worker completed mandatory full preload then literally ran bmad-create-story, bmad-dev-story, and bmad-qa-generate-e2e-tests; independent reviewer literally ran bmad-story-automator-review. Review resolved 5 HIGH and 3 MEDIUM findings: fresh pre/post claim reads, direct-project selection, TASK120 front-door ownership, unmodified dependency eligibility, separate selection/dispatch reporting, honest serialized no-CAS boundary, fresh Git output, and direct wip nonleak. Validator, typecheck, Biome 245 files, build, diff check, 77/77 focused tests, and exactly one full npm test passed (125/125 files, 1568/1568 tests). Stable product/test aggregate: a56f019c24c4cb3f05a4f945d264e2158f53a9d411193611bf33f739c5ea2653. Accepted source-free package revision f36b0049d9396d3d5f8369dfceaad648fa758e30, archive SHA-256 ea6bd67fc468c077c4a782ad40fb136a5f4ea5567bb939f81f8c128575309f11, 434 entries/486720 bytes; exact skill SHA-256 272d37019235bec9ea657e49e1401f452a3b5f732ae47c887fa93b9e0984a8c8. Fresh installed Codex discovery, explicit, active-resume/no-write, serialized exactly-one-claim, natural routing, and non-trigger evidence passed. TASK120 retains all managed-state/front-door writes. Authenticated live Claude remains deferred to the approved post-TASK127 exact-revision cold gate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered and independently approved the portable wpm-author router with durable workspace orientation, resume-before-claim semantics, serialized exactly-one eligible claim, direct project work, focused specialist routing, aggregate invalid-context recovery, exact source-free packaging, and generated-deliverable non-leakage.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
- [x] #4 During this story, a fresh current official Codex `$skill-creator` or Claude Code `skill-creator@claude-plugins-official` authoring helper is invoked; evidence records the helper and host versions, then-current official Codex and Claude Code skill-authoring sources with access date, deterministic native-path, frontmatter, discovery and explicit-invocation identity, trigger/non-trigger contract, and source-free portability evidence for both supported platforms, and fresh Codex discovery, explicit-invocation, natural-language-trigger, non-trigger, and outcome verification. Authenticated live Claude behavioral parity is owned by the approved post-implementation exact-revision cold gate and is not claimed by this story.
<!-- DOD:END -->
