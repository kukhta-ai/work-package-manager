---
id: TASK-65
title: Implement the wpm bundle ID files add command
status: Done
assignee: []
created_date: '2026-06-01 02:22'
updated_date: '2026-06-01 15:31'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): registers an authoritative reference file the agent has already placed under payload/files. Structure-not-content: it validates and records the reference, never writing file content.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When the path exists under the bundle payload/files, the reference is registered (in bundle.yml payload list or equivalent) and no file content is written or modified.
- [x] #2 Registering a path that does not exist on disk fails with a typed error and a non-zero exit, registering nothing.
- [x] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles and the path from files present under payload/files.
- [x] #4 Help output is substantive (description, synopsis, the path positional, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle id files add. Skills: bmad-create-story/dev-story/qa (worker6); bmad-story-automator-review (APPROVE). Generic payload-refs.ts op over a PayloadRefDescriptor (reused by M templates and N scripts). Existence of bundles ID payload/files/path is checked at the CLI layer via the fs port to a NotFound exit 1 before runMutation (the pure check has no port); registers the reference in bundle.yml payload.files; writes zero file content (structure-not-content). DIVERGENCE: L introduces a payload-reference registry into bundle.yml (top-level payload mapping, files as a string list, absent maps to empty) because doc-10:165 register-in-bundle.yml plus deregister-not-delete require a registry distinct from the file, and doc-06:137 field list is descriptive not exhaustive vs the doc-10 CLI contract. Doc-10-led realization refinement, recorded, not a user gate (goals and vocabulary unchanged). Model plus schema extended backward-compatibly (absent maps to empty proven); 7 model/services fixtures got a neutral payload empty-init. Verified on the real binary. Gate 788.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
