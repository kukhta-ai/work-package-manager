---
id: TASK-132
title: Make Backlog initialization deterministic in isolated release tests
status: To Do
assignee: []
created_date: '2026-08-28 14:40'
updated_date: '2026-08-28 14:43'
labels:
  - follow-up
  - ci
  - backlog
  - release-gate
dependencies:
  - TASK-130
priority: high
ordinal: 132000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The complete matrix proved two real consumer-environment gaps at the Backlog.md boundary: fresh environments without EDITOR or VISUAL omit required deterministic configuration, and the source-free packed-install prefix does not expose its required peer command. Make both isolated paths self-sufficient without relying on runner-global state or embedding the external runtime in wpm.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A fresh wpm initialization with EDITOR and VISUAL absent creates the exact readable authoring-backlog configuration.
- [ ] #2 An absent or unusable Backlog CLI still produces the existing actionable no-mutation failure.
- [ ] #3 The source-free packed-install environment exposes its required Backlog peer command from its isolated installation prefix.
- [ ] #4 The prepared wpm archive continues to declare Backlog.md as an external required peer, and built initialization passes in both supported Linux Node lines.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Gate diagnosis: literal bmad-investigate @ PR #5 cross-platform CI reproduced the Linux failure when EDITOR and VISUAL are absent: Backlog.md omits default_editor, so exact post-init inventory rejects the result. Specify the adapter's validated deterministic editor value. Packed-install separately needs its peer command installed into the isolated consumer prefix; do not mask either issue with a runner-global Backlog install or duplicate dev dependency.
<!-- SECTION:NOTES:END -->
