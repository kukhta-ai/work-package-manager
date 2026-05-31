---
id: TASK-5
title: Set up Biome (lint + format) and pre-commit hooks
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-1
ordinal: 5000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Linting and formatting run on demand and report a clean result on the current codebase
- [ ] #2 A formatting standard is fixed once, so two contributors editing the same file produce no formatting-only differences
- [ ] #3 An import that violates doc 13's core boundary (core depending on the CLI framework, the subprocess library, or OS/file-system modules) is reported as a violation
- [ ] #4 Committing reformats and re-checks the touched files automatically, with feedback in seconds
- [ ] #5 A fresh clone receives this commit-time protection without manual setup
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
