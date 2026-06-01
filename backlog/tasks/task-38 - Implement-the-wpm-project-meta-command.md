---
id: TASK-38
title: Implement the wpm project meta command
status: Done
assignee: []
created_date: '2026-06-01 02:18'
updated_date: '2026-06-01 19:31'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): edits project-level metadata in manifest.yml in one call, updating only the fields whose flags are provided and leaving the rest untouched. Writes are comment-preserving (doc 12). Structure-not-content: it edits structured fields, never prose.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each provided flag (--name --description --license --repository --author) updates the matching manifest.yml project field; omitted flags leave their fields unchanged.
- [x] #2 Existing comments and key order in manifest.yml are preserved across the edit.
- [x] #3 Invoking with no flags makes no change and reports that nothing was updated.
- [x] #4 Run outside any project it exits non-zero with one message naming the missing manifest.yml and suggesting init or the -C override; a -C path is honoured.
- [x] #5 Help output is substantive (description, synopsis, every flag with its effect, an example); on success the command exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
project meta. Skills: bmad-create-story/dev-story/qa (worker10); bmad-story-automator-review APPROVE. Edits the manifest.yml project mapping (ProjectMeta, all 5 fields already in the model) via editYaml setIn, comment and key-order preserving; only provided flags update, omitted untouched; NO flags is an exit-0 no-op with the manifest byte-identical (guard in the leaf, distinct from bundle-meta exit 2); --name fires the rerender (AGENTS.md plus the project-name-derived installer skill). No model or schema change. Verified on the real binary. Gate 1058.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
