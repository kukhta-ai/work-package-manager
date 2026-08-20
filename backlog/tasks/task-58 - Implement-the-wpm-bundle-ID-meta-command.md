---
id: TASK-58
title: Implement the wpm bundle ID meta command
status: Done
assignee: []
created_date: '2026-06-01 02:21'
updated_date: '2026-06-01 14:09'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): edits a specific bundle bundle.yml metadata via --version, --summary, and --confirmation-level safe or dangerous. Writes are comment-preserving; structure-not-content. ID denotes the bundle-id positional.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each provided flag (--version, --summary, --confirmation-level) updates the matching bundle.yml field; omitted flags leave their fields unchanged.
- [x] #2 The --confirmation-level value is accepted only as safe or dangerous; any other value fails as a usage error with exit code 2.
- [x] #3 Existing comments and key order in bundle.yml are preserved across the edit.
- [x] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles and --confirmation-level from safe and dangerous.
- [x] #5 Help output is substantive (description, synopsis, every flag with its effect, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
wpm bundle <id> meta (mutation, meta-set). editBundleMetaSpec (runMutation): edits bundles/<id>/bundle.yml updating ONLY provided flags via setIn (omitted byte-untouched, comments+key-order preserved); --confirmation-level safe|dangerous via .choices (bad->exit 2; YAML key is ), --version via parseSemVer (bad->UsageError exit 2), no-flags->exit 2; ④ re-renders the menu. --version un-shadowed in the sub-program (the G1 program -V-only fix). completion: <id> from enabled bundles, --confirmation-level from safe/dangerous. Reviewer APPROVE (post-S1). Gate 682.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
