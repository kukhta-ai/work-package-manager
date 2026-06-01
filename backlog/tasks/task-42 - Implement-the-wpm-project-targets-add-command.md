---
id: TASK-42
title: Implement the wpm project targets add command
status: To Do
assignee: []
created_date: '2026-06-01 02:19'
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
- [ ] #1 When the agent is not already a target, it is appended to manifest.yml targets and its scope-alias is created from the built-in agent-to-alias map.
- [ ] #2 When the agent name is unknown to the built-in map, the command warns and skips the alias so the author can configure it manually, while still recording the target.
- [ ] #3 The derived AGENTS.md and installer skill are re-rendered with the new agent list, and a per-bundle authoring task to verify the install-backlog works on the agent is materialised for each bundle, idempotent by title.
- [ ] #4 Adding an agent already present is reported as a no-op conflict rather than duplicating it.
- [ ] #5 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [ ] #6 Help output is substantive (description, synopsis, the agent positional, an example) and the agent positional completes from the built-in well-known agent list; on success exits 0.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
