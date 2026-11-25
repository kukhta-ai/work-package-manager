---
id: TASK-133
title: Keep confined file publication usable on Windows
status: Done
assignee: []
created_date: '2026-08-28 16:29'
updated_date: '2026-08-28 16:51'
labels:
  - follow-up
  - ci
  - windows
  - filesystem
  - release-gate
dependencies:
  - TASK-132
modified_files:
  - src/adapters/node-fs.ts
  - test/integration/adapters/node-fs.test.ts
priority: high
ordinal: 133000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The PR #5 matrix exposed a real Windows failure in valid confined writes: a missing public file beneath a stable existing parent cannot be published while the adapter holds its parent inspection handle. Restore the supported Windows behavior without weakening confinement, no-clobber, or identity guarantees.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A valid confined write to a missing file beneath a stable existing parent publishes the exact requested bytes on Windows and leaves no private staging artefact.
- [x] #2 A confined write still refuses alias ancestry, parent identity changes, and public-target clobber races without overwriting existing content.
- [x] #3 An absent required parent still fails without creating the requested public target.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Gate evidence: literal bmad-investigate @ PR #5 run 33186232983 traced 106 Windows failures to the first bundle-contribution-record boundary and the same NodeFileSystem.writeConfined publication path; additional personal setup/init failures enter that boundary. Fix this real adapter defect separately from test-only path hooks.

Literal BMAD workflows run: bmad-create-story, bmad-dev-story, and bmad-qa-generate-e2e-tests by the persistent worker; bmad-story-automator-review cycle 1 by the independent reviewer. Review fixed the Windows post-handle-release confinement recheck and single-owner handle cleanup without changing POSIX behavior or no-clobber publication.

Evidence: NodeFileSystem integration 51/51, typecheck, focused Biome, process-artifact policy, and diff check passed. Final supported-host confirmation remains the PR #5 replacement matrix gate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Confined missing-file publication now releases the Windows directory inspection handle only across hard-link publication, brackets that interval with no-follow and parent-identity checks, reopens for post-publication validation, and retains existing fail-closed/no-clobber behavior. Real-filesystem integration coverage proves exact bytes, staging cleanup, sibling preservation, and missing-parent refusal.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
