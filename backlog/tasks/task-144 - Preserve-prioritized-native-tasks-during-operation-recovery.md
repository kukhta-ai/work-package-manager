---
id: TASK-144
title: Preserve prioritized native tasks during operation recovery
status: Done
assignee: []
created_date: '2026-11-25 02:42'
updated_date: '2026-11-25 02:50'
labels: []
dependencies:
  - TASK-136
references:
  - src/adapters/backlog-cli.ts
  - src/vnext/adapters/workspace.ts
modified_files:
  - test/integration/adapters/backlog-cli.test.ts
  - test/integration/vnext-workspace.test.ts
  - src/adapters/backlog-cli.ts
priority: high
ordinal: 144000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The native Backlog list renders priority badges before task identities. The current adapter silently drops those rows, so vNext recovery can create a duplicate operation instead of reusing its stable native identity. Preserve the declared recovery contract and ordinary native task visibility.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Native task listings retain the identity, title and status of tasks with each supported priority and without a priority.
- [x] #2 An identical retry reuses a matching prioritized native operation task without creating a second task or changing authored task content.
- [x] #3 Conflicting or ambiguous prioritized operation identities stop before creating or associating another task.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Correct only the mapped native plain-list row recognition, retaining the effect port and existing CLI behavior. Add real Backlog listing and vNext recovery regressions, review the change independently, then qualify a fresh clean source and exact saved candidate through the full required bands.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Confirmed sourceD P1 using actual Node24.22.2/Backlog1.45.2: an unprioritized orphan is reused, but a high-priority orphan is dropped by the old list parser and operation add creates/associates a duplicate. The independent red fixture was removed and source state stayed unchanged; .quality/evidence/repro-priority-recovery.json retains proof. D candidate was stopped after this confirmed contract violation; neither C nor D produced a qualified artifact. B remains historical evidence and is superseded for delivery by this newly found defect.

Implementation changes only the native plain-list row recognizer to accept its three known priority badges before ID. IDs, title text, status headers, port contracts and existing recovery checks remain unchanged. Groma ownership was inspected (backlog-cli component); planned references and modified-file list were recorded through the CLI after each file change.

All four new real-native regressions fail before the fix. After the fix, both complete integration files pass24 tests: all priorities plus none/title/status filtering, exact matching recovery, and conflicting/ambiguous identities with no mutation or lingering lock. Full quality:fast passes. Bounded independent semantic/security/test review found no blocking issues or policy relaxation. The rebuilt actual CLI also reuses operation-1 for both the no-priority and high-priority cases, with no duplicate and normal fixture cleanup; working-diff and compiled-adapter hashes bind .quality/evidence/priority-recovery-working-fix.json.

AC and focused DoD evidence are complete. Next: clean exact-source full candidate:prepare and all6 OS/Node CI cells plus Required; explicit same-byte candidate:verify and full installed plain journey now including prioritized orphan recovery; final independent artifact/source binding review, PR7 evidence refresh and completion audit. No full final gate is yet claimed. Existing privacy, policy, deadlines, public-distribution inactivity and historical artifact digests remain unchanged.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
