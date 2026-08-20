---
id: TASK-57
title: Implement the wpm bundle ID show command
status: Done
assignee: []
created_date: '2026-06-01 02:21'
updated_date: '2026-06-01 14:09'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): in the context of a specific bundle (bundle then the bundle id), prints that bundle metadata from bundle.yml plus a tree summary. Here ID denotes the bundle-id positional that selects the bundle.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 For an enabled bundle id, the command prints its bundle.yml metadata and a tree summary of the bundle.
- [x] #2 An id that is not an enabled bundle fails with a typed not-found error and a non-zero exit.
- [x] #3 The command reads and reports only, with no change on disk, and exits 0 on success.
- [x] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles.
- [x] #5 Help output is substantive (description, synopsis, an example).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
wpm bundle <id> show (read). Establishes the bundle <id> ROUTING: run()-level pre-routing (isPerBundleInvocation/dispatchPerBundle before commander, via a shared stripGlobalOptions so -C works in any position) + a REUSABLE registry (PerBundleCommandModule/PER_BUNDLE_MODULES/buildPerBundleProgram + requireEnabledBundle guard) the 21 bundle-<id> repeats extend with ONE module each. showBundleSpec (runRead) prints bundle.yml metadata + a sorted files tree; NotFound on a non-enabled id; read-only exit 0; <id> completes from enabled bundles. Reviewer review->S1 fixed (the -C-placement completion gap + a 2nd id-position asymmetry, via the shared helper so completion==dispatch). Gate 682.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
