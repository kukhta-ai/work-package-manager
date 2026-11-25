---
id: TASK-44
title: Implement the wpm project targets remove command
status: Done
assignee: []
created_date: '2026-06-01 02:19'
updated_date: '2026-06-01 12:22'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): the reverse of targets add. Removes the agent from manifest.yml targets, removes its scope-alias, re-renders derived artefacts, and warns if it was the last target.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When the agent is a current target, it is removed from manifest.yml targets and its scope-alias is removed, warning if the alias did not exist.
- [x] #2 The derived AGENTS.md and installer skill are re-rendered without the agent.
- [x] #3 Removing the last remaining target prints a warning.
- [x] #4 Removing an agent that is not a target fails with a typed not-found error and a non-zero exit.
- [x] #5 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [x] #6 Help output is substantive (description, synopsis, the agent positional, an example) and the agent positional completes from current manifest targets; on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
wpm project targets remove (list-mgmt MUTATION). runMutation: CHECK present (NotFoundError), APPLY remove from manifest.targets AND explicitly delete the scope-alias (the deriver ④ only ADDS -- the add-vs-remove alias asymmetry; memory-fs.remove parity-fixed so exists->false after teardown), warn-if-missing-alias, warn-if-last-target; ④ re-renders without the agent. completion <agent> from installed-target-names (current targets). Verified on the real binary (remove -> exit 0 + last-target warning). Reviewer APPROVE. Gate green.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
