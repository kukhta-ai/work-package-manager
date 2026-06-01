---
id: TASK-52
title: Implement the wpm bundle disable command
status: To Do
assignee: []
created_date: '2026-06-01 02:20'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): removes a bundle from the manifest, leaving its directory on disk but inert (invisible to the installer). Re-renders derived artefacts so the bundle drops out of the menu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The id is removed from manifest.yml bundles while its directory stays on disk untouched.
- [ ] #2 Derived artefacts are re-rendered so the disabled bundle no longer appears in the menu.
- [ ] #3 Disabling an id not present in the manifest fails with a typed not-found error and a non-zero exit.
- [ ] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id positional completes from enabled bundles.
- [ ] #5 Help output is substantive (description, synopsis, the id positional, an example); on success exits 0.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
