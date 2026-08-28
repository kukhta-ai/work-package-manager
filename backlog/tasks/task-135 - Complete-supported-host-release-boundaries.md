---
id: TASK-135
title: Complete supported-host release boundaries
status: In Progress
assignee: []
created_date: '2026-08-28 19:21'
updated_date: '2026-08-28 19:22'
labels:
  - follow-up
  - ci
  - windows
  - filesystem
  - packed-install
  - release-gate
  - test-harness
dependencies:
  - TASK-134
priority: high
ordinal: 135000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #5 current-tip CI exposed two Windows release-boundary defects and three measured real-CLI scenarios that exceed the generic 60-second test budget. Restore the supported-host contract with narrow, evidence-backed changes and no broad filesystem, quoting, retry, or timeout policy expansion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A missing confined file that is a direct child of a stable non-empty confinement root publishes the exact requested bytes on Windows and leaves no transient staging entry.
- [ ] #2 Direct-child confined publication still refuses an existing target, an escaped path, or a changed parent identity without replacing unrelated entries.
- [ ] #3 An installed npm command shim beneath a Windows path containing spaces executes through the resolved invocation with its exact arguments and reports the installed version.
- [ ] #4 Unsafe Windows command expansion or quoting syntax remains rejected, and a failed installed-command execution retains actionable diagnostics.
- [ ] #5 The real bundle-create and source-free packed-install journeys complete their publication and installed-command boundaries on supported Windows runners.
- [ ] #6 Only the three real-CLI scenarios observed exceeding 60 seconds receive a bounded 90-second budget; unrelated test timeout contracts remain unchanged.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence: literal bmad-investigate @ PR #5 candidate b6254a3; push run 33196449021 and pull-request run 33196452919. Confirmed gaps: no-quarantine direct-child writeConfined geometry, Node default argv re-escaping of the cmd.exe outer envelope, and three observed 60-second E2E overruns. Preserve hard-link no-clobber publication, confinement/identity checks, unsafe cmd syntax rejection, and focused timeout policy. Reject NodeFS refactors, blanket EPERM handling, shell:true, retries, global timeout increases, and broad normalization.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
