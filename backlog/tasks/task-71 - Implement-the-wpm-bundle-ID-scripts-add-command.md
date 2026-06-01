---
id: TASK-71
title: Implement the wpm bundle ID scripts add command
status: Done
assignee: []
created_date: '2026-06-01 02:23'
updated_date: '2026-06-01 16:25'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): registers an install-time tooling script the agent placed under installer-scripts (install-time tooling, not delivered to the user). Same shape as files add against installer-scripts. Structure-not-content.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When the path exists under the bundle installer-scripts, the reference is registered and no file content is written or modified.
- [x] #2 Registering a path that does not exist on disk fails with a typed error and a non-zero exit, registering nothing.
- [x] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the path completes from files present under installer-scripts.
- [x] #4 Help output is substantive (description, synopsis, the path positional, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle id scripts add. Skills: bmad-create-story/dev-story/qa (worker7); bmad-story-automator-review (APPROVE). SCRIPTS_DESCRIPTOR maps on-disk installer-scripts (a SIBLING of payload, doc-06:77/07:51 install-time tooling NOT delivered) to the payload.scripts registry key. Rationale: the payload map is the CLI reference registry, not a delivery claim; the delivered-vs-install-time distinction lives downstream in the build tasks 82-84. Sibling-distinction is descriptor-enforced and binary-proven: a path placed only under payload/installer-scripts fails exit 1, only installer-scripts counts. doc-10:169 Same as files. Gate 856.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
