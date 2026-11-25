---
id: TASK-52
title: Implement the wpm bundle disable command
status: Done
assignee: []
created_date: '2026-06-01 02:20'
updated_date: '2026-06-01 13:22'
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
- [x] #1 The id is removed from manifest.yml bundles while its directory stays on disk untouched.
- [x] #2 Derived artefacts are re-rendered so the disabled bundle no longer appears in the menu.
- [x] #3 Disabling an id not present in the manifest fails with a typed not-found error and a non-zero exit.
- [x] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id positional completes from enabled bundles.
- [x] #5 Help output is substantive (description, synopsis, the id positional, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
wpm bundle disable (runMutation). CHECK rejects non-member (NotFound); APPLY removes the id from manifest.bundles by index (the DIR stays on disk untouched); ④ re-renders so it drops from the menu. No teardown/materialise. Divergence (reviewer-adjudicated correct): manifest.bundles is a flat id list (task-10 model), not doc-10:150's {id:<id>} -- the implemented model is authoritative, uniform with bundle new. Reviewer APPROVE. Gate 649.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
