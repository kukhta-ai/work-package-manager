---
id: TASK-37
title: Implement the wpm project show command
status: Done
assignee: []
created_date: '2026-06-01 02:18'
updated_date: '2026-06-01 12:51'
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
- [x] #1 The command prints the project name, version, description, resolved root path, target agents, and the enabled bundles each with the version read from its bundle.yml.
- [x] #2 With --json the same orientation is emitted as machine-readable JSON.
- [x] #3 The command reads and reports only, with no change on disk, and exits 0 on success.
- [x] #4 Run outside any project it exits non-zero with one message naming the missing manifest.yml and suggesting init or the -C override; a -C path is honoured.
- [x] #5 Help output is substantive (description, synopsis, the --json flag, an example).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
wpm project show [--json] (read). runRead projects a ProjectOrientation (name/version/description/root/targets + each enabled bundle with its bundle.yml version+summary); --json is JSON.stringify of the SAME projection (text/JSON can't diverge). Read-only exit 0; -C honored; no-project typed exit 1. Reviewer APPROVE. Gate 614.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
