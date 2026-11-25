---
id: TASK-42
title: Implement the wpm project targets add command
status: Done
assignee: []
created_date: '2026-06-01 02:19'
updated_date: '2026-06-01 12:22'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): starts supporting a target agent. Appends the agent to manifest.yml targets, creates its scope-alias, re-renders derived artefacts, and materialises a per-bundle verify task for the new agent (doc 11 catalog). Template-driven re-render plus task-driven materialisation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When the agent is not already a target, it is appended to manifest.yml targets and its scope-alias is created from the built-in agent-to-alias map.
- [x] #2 When the agent name is unknown to the built-in map, the command warns and skips the alias so the author can configure it manually, while still recording the target.
- [x] #3 The derived AGENTS.md and installer skill are re-rendered with the new agent list, and a per-bundle authoring task to verify the install-backlog works on the agent is materialised for each bundle, idempotent by title.
- [x] #4 Adding an agent already present is reported as a no-op conflict rather than duplicating it.
- [x] #5 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [x] #6 Help output is substantive (description, synopsis, the agent positional, an example) and the agent positional completes from the built-in well-known agent list; on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
wpm project targets add (list-mgmt MUTATION exemplar). runMutation: CHECK not-present (ConflictError no-op on dup), APPLY append to manifest.targets comment-preservingly; the known-agent scope-alias falls out of ④ RERENDER (deriver scopePlan); an UNKNOWN agent (deriver unknownTargets) warns+skips the alias but still records (AC#2); ⑤ materialises the doc-11 per-bundle Verify-works-on-agent tasks. New warning channel: ApplyOutcome.warnings folded by the harness with deriver-derived unknown-target warnings -> OperationResult.warnings -> stderr, exit 0. completion <agent> from target-names. Cross-cutting fix rode this branch: lifecycle ⑤ now materialises into <root>/.authoring-backlog (shared constant) not the project root -- the binary spot-check found every materialising command failed on a real project. Skill-driven; reviewer APPROVE zero findings. Gate: tsc 0, biome 0, vitest 568.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
