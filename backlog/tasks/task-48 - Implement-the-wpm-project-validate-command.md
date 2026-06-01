---
id: TASK-48
title: Implement the wpm project validate command
status: To Do
assignee: []
created_date: '2026-06-01 02:20'
labels:
  - cli
dependencies:
  - TASK-33
  - TASK-20
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): checks project coherence and reports findings. Backs the validate service (doc 13 section 4): dependency constraints resolve, no cycles, targets non-empty, valid project semver, bundle dirs match the manifest with no orphans, scope-alias well-formedness. Deeper checks live as review-phase tasks (doc 11), deliberately outside this command.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The command reports a pass when every bundle requires-constraint resolves against the depended-upon bundle declared version, the requires graph has no cycle, targets is non-empty, project version is valid semver, and every bundle directory except bundle-template is listed in the manifest with no orphans.
- [ ] #2 Each distinct problem is reported as a separate human-readable finding naming the offending location, and all discoverable problems are reported in a single pass rather than only the first.
- [ ] #3 The command has no side effects: it reads and reports, changing nothing.
- [ ] #4 The command exits 0 when the project is coherent and non-zero when any finding is reported.
- [ ] #5 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [ ] #6 Help output is substantive (description, synopsis, an example).
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
