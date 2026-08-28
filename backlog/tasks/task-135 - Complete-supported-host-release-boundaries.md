---
id: TASK-135
title: Complete supported-host release boundaries
status: In Progress
assignee: []
created_date: '2026-08-28 19:21'
updated_date: '2026-08-28 22:59'
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
- [ ] #7 Existing and first-publication workspace state files that use request-bound quarantine publish exact bytes on Windows and retire their staged or prior evidence without residue.
- [ ] #8 Synthetic core-bundle release fixtures include the required minimal install backlog and remain aliasable through the supported Windows fallback.
- [ ] #9 Workspace-handoff integration expectations accept the product portable path dialect on every supported host without changing product path output.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Initial evidence: literal bmad-investigate @ PR #5 candidate b6254a3; push run 33196449021 and pull-request run 33196452919. Confirmed gaps: no-quarantine direct-child writeConfined geometry, Node default argv re-escaping of the cmd.exe outer envelope, and three observed 60-second E2E overruns. Preserve hard-link no-clobber publication, confinement/identity checks, unsafe cmd syntax rejection, and focused timeout policy. Reject NodeFS refactors, blanket EPERM handling, shell:true, retries, global timeout increases, and broad normalization. Cycle-2 evidence: literal bmad-investigate @ candidate 9be9a43, run 33207995447, Windows/Node20 job 98973889650. Direct no-quarantine NodeFS and isolated spaced-prefix Backlog pass. Remaining causes: quarantined state cleanup under a retained publication-parent handle; two invalid core fixtures missing install-backlog/config.yml; and three handoff expectations using native paths. Keep the cmd fix; reject alias fallback changes, product path normalization, retries, and broad filesystem refactors. Cycle-3 evidence: literal bmad-investigate @ candidate 7cbba3d, run 33215249287, Windows/Node20 job 98997319223. Complete log: 10 failed files / 113 failed tests, all one deterministic replacement defect. After the original public file is verified and renamed to quarantine .displaced, its owned initialPublicDescriptor remains open through unlink; Windows leaves the name delete-pending and retained lstat receives EPERM. Close and clear only that verified descriptor before displaced unlink; preserve identity, digest, lstat, cleanup, confinement, and no-clobber checks. Reject EPERM-as-missing, retries, sleeps, more directory-handle cases, or changes to aliases, paths, cmd handling, fixtures, or timeouts.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
