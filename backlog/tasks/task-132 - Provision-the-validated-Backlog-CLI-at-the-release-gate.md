---
id: TASK-132
title: Make Backlog initialization deterministic in isolated release tests
status: Done
assignee: []
created_date: '2026-08-28 14:40'
updated_date: '2026-08-28 15:38'
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
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A fresh wpm initialization with EDITOR and VISUAL absent creates the exact readable authoring-backlog configuration.
- [x] #2 An absent or unusable Backlog CLI still produces the existing actionable no-mutation failure.
- [x] #3 The source-free packed-install environment exposes its required Backlog peer command from its isolated installation prefix.
- [x] #4 The prepared wpm archive continues to declare Backlog.md as an external required peer, and built initialization succeeds when that peer is supplied only through the isolated consumer prefix.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Gate diagnosis: literal bmad-investigate @ PR #5 cross-platform CI reproduced the Linux failure when EDITOR and VISUAL are absent: Backlog.md omits default_editor, so exact post-init inventory rejects the result. Specify the adapter's validated deterministic editor value. Packed-install separately needs its peer command installed into the isolated consumer prefix; do not mask either issue with a runner-global Backlog install or duplicate dev dependency.

Scope correction after implementation review: the Linux Node 20/22 matrix is the enclosing PR #5 Phase 6 gate, not a second per-story acceptance contract. TASK-132 proves the archive/peer boundary and isolated built initialization; the matrix is run once on the integrated candidate.

BMAD evidence: persistent worker invoked bmad-create-story, bmad-dev-story, and bmad-qa-generate-e2e-tests for Story 4.5. Independent reviewer invoked bmad-story-automator-review cycle 1 and approved after auto-fixing one real portability issue: successful npm installs are judged by spawn success and exit status rather than requiring empty stderr. Focused adapter/parity (10), no-write preflight (1), packed-install units (13), isolated peer integration (1), and real Backlog init (1) passed; typecheck, focused Biome, process-artifact policy, and diff checks passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Backlog initialization now supplies a deterministic editor even without ambient editor variables. Source-free release tests provision the required Backlog.md peer only inside the disposable consumer prefix, verify the external peer contract, and use portable executable resolution without hiding npm diagnostics. The integrated PR matrix remains the enclosing release gate.
<!-- SECTION:FINAL_SUMMARY:END -->
