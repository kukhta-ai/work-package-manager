---
id: TASK-81
title: Implement the wpm bundle ID advisor remove command
status: To Do
assignee: []
created_date: '2026-06-01 02:23'
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
- [ ] #1 The advisor stub directory installer-skills/id-advisor/ is deleted.
- [ ] #2 The write-advisor-content task for the bundle is closed or archived if still open.
- [ ] #3 Removing an advisor that does not exist reports that there was nothing to remove and makes no change.
- [ ] #4 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles.
- [ ] #5 Help output is substantive (description, synopsis, an example); on success exits 0.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
