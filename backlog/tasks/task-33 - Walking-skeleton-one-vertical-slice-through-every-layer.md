---
id: TASK-33
title: 'Walking skeleton: one vertical slice through every layer'
status: To Do
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-29 12:40'
labels: []
dependencies:
  - TASK-26
  - TASK-27
  - TASK-30
ordinal: 33000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A single command-line invocation drives a real change on disk through every layer — from the command surface, through context resolution and an operation, down to the file system — observed in a real working directory
- [ ] #2 The exercised slice is the smallest meaningful one (for example, producing a project from the minimal template and confirming the files exist), not a complete command
- [ ] #3 Passing this demonstrates the layers compose end to end, and it is recorded as the 'foundation complete' checkpoint before per-command work begins
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
