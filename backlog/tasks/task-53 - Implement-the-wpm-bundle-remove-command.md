---
id: TASK-53
title: Implement the wpm bundle remove command
status: To Do
assignee: []
created_date: '2026-06-01 02:20'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): full teardown of a bundle. After confirmation, drops it from the manifest, deletes its directory, deletes its advisor stub, archives its authoring tasks, and re-renders derived artefacts. Destructive, so it asks to confirm.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The command requires author confirmation before acting because the operation is destructive.
- [ ] #2 On confirmation it removes the id from manifest.yml bundles if present, deletes the bundle directory from disk, deletes the advisor stub at installer-skills/id-advisor/ if present, and archives the authoring tasks whose titles name the bundle.
- [ ] #3 Derived artefacts are re-rendered and a summary of what was removed is printed.
- [ ] #4 Declining the confirmation makes no change and exits without error.
- [ ] #5 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id positional completes from current bundles.
- [ ] #6 Help output is substantive (description, synopsis, the id positional, an example); on success exits 0.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
