---
id: TASK-152
title: Deliver inspectable portable releases and external review evidence
status: In Progress
assignee: []
created_date: '2026-11-27T20:03:36Z'
updated_date: '2026-11-27T20:22:34Z'
labels: []
dependencies: []
modified_files:
  - src/vnext/adapters/release-codec.ts
  - src/vnext/release-cli.ts
  - src/vnext/adapters/release-review.ts
  - src/vnext/adapters/workspace.ts
  - src/vnext/adapters/package-workspace.ts
  - src/vnext/adapters/release-artifact.ts
  - src/vnext/adapters/releases.ts
  - src/vnext/cli.ts
  - test/integration/vnext-release-cli.test.ts
  - test/integration/vnext-release-review.test.ts
  - test/integration/vnext-releases.test.ts
  - test/unit/vnext/release-artifact.test.ts
  - test/integration/vnext-release-artifact.test.ts
  - .changeset/slow-chefs-send.md
  - docs/vnext-releases.md
  - docs/vnext.md
  - docs/vnext-coverage.md
  - groma/systems/wpm/containers/wpm-cli/components/release-artifact.md
  - groma/systems/wpm/containers/wpm-cli/components/release-cli.md
  - groma/systems/wpm/containers/wpm-cli/components/release-codec.md
  - groma/systems/wpm/containers/wpm-cli/components/release-review.md
  - groma/systems/wpm/containers/wpm-cli/components/releases.md
  - groma/systems/wpm/containers/wpm-cli/components/package-workspace.md
  - scripts/qualify-releases.mjs
  - scripts/qualify-apm.mjs
ordinal: 152000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the approved one-root release plan: TGZ/ZIP/directory build, saved-artifact view/verify and digest-bound external static review. Preserve existing build/test commands. No publication, signatures, agent invocation or package execution.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One root and its runtime closure have equivalent portable TGZ, ZIP and directory releases with deterministic content identity.
- [x] #2 Saved releases can be inspected and verified without source, APM or package execution; tampered or unsafe contents are rejected.
- [x] #3 External static review requests and accepted reports bind exact subject identity and retain findings and unknowns without asserting publisher trust or safety.
- [x] #4 Dry runs and conflicting or interrupted writes preserve foreign content and prior evidence.
- [ ] #5 The saved SDK completes all three release journeys and the required quality bands with independent review.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Base58129035a1a490602050ccf2b42f6125e9837179; branch feat/vnext-releases. Approved single root, TGZ/ZIP/directory, static external review only. Skills dev/test/architecture/review. Implemented bounded artifact/envelope/publication, frozen import reuse, saved view/verify, digest-bound external review and CLI; legacy build bytes unchanged. Focused7files139PASS; quality:doctor and quality:fast PASS140modules/Biome383files/nativeinstructions. Independent reviews accepted artifact/ZIP/ownership, review/report capture, root capture/selection, and qualifier evidence. Closed duplicate setup names, pinned-selection race, replaced partial directories, postcapture mutation, hardlinks and boundedreportgrowth; no scope/waiver changes, pure core unchanged. Groma curated4components/5relations; rescancreated0,99records. Shared-dist actual qualifier52commands PASS (fixture static report, no model/auth); actual savedSDK proof remains pending. Next: stable committed fullquality:ci, isolated exact-source savedSDK 3format+nativeAPM+graph journeys, then taskcloseout and finalclean candidate fullquality:release/privateartifactreview. Large temporary data uses owned /var/lib/k0s/wpm-release-work-yxwvzj3t. Public distribution inactive; no merge/tag/publish.
<!-- SECTION:NOTES:END -->
