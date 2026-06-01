---
id: TASK-37
title: Implement the wpm project show command
status: To Do
assignee: []
created_date: '2026-06-01 02:18'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): prints project orientation (name, version, description, root path, targets, and the enabled bundles with their versions) or a JSON form. The orientation call an agent makes first. Reads manifest.yml and each enabled bundle.yml.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The command prints the project name, version, description, resolved root path, target agents, and the enabled bundles each with the version read from its bundle.yml.
- [ ] #2 With --json the same orientation is emitted as machine-readable JSON.
- [ ] #3 The command reads and reports only, with no change on disk, and exits 0 on success.
- [ ] #4 Run outside any project it exits non-zero with one message naming the missing manifest.yml and suggesting init or the -C override; a -C path is honoured.
- [ ] #5 Help output is substantive (description, synopsis, the --json flag, an example).
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
