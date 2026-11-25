---
id: TASK-81
title: Implement the wpm bundle ID advisor remove command
status: Done
assignee: []
created_date: '2026-06-01 02:23'
updated_date: '2026-06-01 19:31'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): removes this bundle advisor. Deletes the advisor stub directory and closes or archives the write-advisor-content task if still open.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The advisor stub directory installer-skills/id-advisor/ is deleted.
- [x] #2 The write-advisor-content task for the bundle is closed or archived if still open.
- [x] #3 Removing an advisor that does not exist reports that there was nothing to remove and makes no change.
- [x] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles.
- [x] #5 Help output is substantive (description, synopsis, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle id advisor remove. Skills: bmad-create-story/dev-story/qa (worker10); bmad-story-automator-review APPROVE. Deletes installer-skills/id-advisor/ via fs.remove and archives the Write advisor content for id task by EXACT title (archiveTask if status not Done). Edges proven on the real binary: absent advisor to nothing-to-remove exit 0 with the task untouched; exact-title match (svc vs svc-extra distinguished); a Done task left alone; idempotent (listTasks excludes archived). Gate 1058.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
