---
id: TASK-25
title: Implement the shared mutation lifecycle harness
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 03:26'
labels: []
dependencies:
  - TASK-19
  - TASK-21
  - TASK-23
  - TASK-24
ordinal: 25000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every state-changing operation runs the same sequence: load the project, check the requested change, apply it, re-derive the front-door artefacts, materialise any authoring tasks, and report a result (doc 13)
- [x] #2 Re-deriving artefacts and materialising tasks happen automatically around an operation's change, without each operation arranging them
- [x] #3 A read-only operation loads and reports without changing anything
- [x] #4 Repeating an operation whose effect is already present makes no further change
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the shared mutation lifecycle harness (doc 13 sec 5 and 8) as the new src/core/operations tier. runMutation threads the six beats LOAD, CHECK, APPLY, RERENDER, MATERIALISE, RESULT with RERENDER and MATERIALISE automatic (the OperationSpec declares only check, apply, materialise-plan); runRead is the no-mutation read trace; re-runs are idempotent; a failing check raises a typed DomainError and aborts before any effect. Pure glue over the ports (node:path plus yaml leaf plus model plus ports plus task-19 and task-21 services); core import-boundary clean. BMAD skills run: worker ran create-story, dev-story, qa-generate-e2e-tests, then dev-story again for review fixes; reviewer ran story-automator-review twice. Review found and fixed two must-fix items: a biome noConfusingVoidType warning (apply return type void to undefined), and a test plus fake fidelity defect where the in-memory exists masked broken-symlink semantics. Fix: MemoryFileSystem.exists now faithfully follows aliases to their target (a broken link reads false, matching existsSync; chains transitive; cycles bounded), and both fixtures create installer-skills modeling init, so AC4 idempotency is demonstrated honestly. Not a production bug: init creates installer-skills before the scope-alias, so production aliases are never broken. Gate: tsc 0, biome 0 warnings, vitest 376 passed, npm ci 0.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
