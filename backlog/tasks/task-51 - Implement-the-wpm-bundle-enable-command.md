---
id: TASK-51
title: Implement the wpm bundle enable command
status: Done
assignee: []
created_date: '2026-06-01 02:20'
updated_date: '2026-06-01 13:22'
labels:
  - cli
dependencies:
  - TASK-33
  - TASK-80
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): adds an existing disabled bundle directory to the manifest. Validates the directory exists and is not already enabled, appends it, runs advisor add unless opted out or already present, and idempotently materialises the per-bundle authoring set (doc 11). Note: the actions table gives enable a --no-advisor flag the command tree omits, an inconsistency carried here as the table behaviour.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When the directory exists and the id is not already in the manifest, the id is appended to manifest.yml bundles and derived artefacts re-render to include it.
- [x] #2 Unless --no-advisor or an advisor already exists, the advisor add action runs.
- [x] #3 The per-bundle authoring task set is materialised idempotently (any task whose title already exists is skipped), so re-enabling a previously-authored bundle is a no-op.
- [x] #4 Enabling a non-existent directory or an already-enabled id fails with a typed error and a non-zero exit.
- [x] #5 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id positional completes from disabled-but-present bundle directories.
- [x] #6 Help output is substantive (description, synopsis, the id positional and --no-advisor, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
wpm bundle enable (runMutation, list-membership). CHECK rejects already-enabled (Conflict) + guards the dir exists (NotFound before any write); APPLY appends to manifest.bundles comment-preservingly + scaffolds the advisor unless --no-advisor/exists; ④ re-renders the menu; ⑤ materialises the per-bundle set idempotently (re-enable = no-op). Reviewer APPROVE. Gate 649.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
