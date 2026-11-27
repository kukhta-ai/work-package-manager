---
id: TASK-152
title: Deliver inspectable portable releases and external review evidence
status: Done
assignee: []
created_date: '2026-11-27T20:03:36Z'
updated_date: '2026-11-27T20:37:39Z'
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
- [x] #5 The saved SDK completes all three release journeys and the required quality bands with independent review.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation source f3fb98a4f7136f9ec40d97d4f5d9294c8052e045; base5812903, branch feat/vnext-releases, PR11. Approved one root, TGZ/ZIP/directory, static external review request/report only. Skills dev/test/architecture/review. quality:ci PASS183files2784tests+2existinghostconditional skips; doctor/fast140modules/Biome383/nativeinstructions PASS. Pure core and required mutation scope/waivers unchanged. Focused7files139PASS; sourceCLI52commandjourney PASS. Exact committed isolated producer saved SDK835178bytes SHA2562d099d093d68d56ad1d1d278d596693f0c005cf53b56d2c1a4ca5a0ba47ae6ba installed normally with explicit Backlog.md1.57.4; full564-file installedshipset comparison PASS. Actual savedSDK52command releasejourney, realAPM0.39 local/transitive/pinnedremote+bothnativehosts inall3formats, graph2/frozenimport3 and hosttar/Python extraction PASS. Independent code/ownership/ZIP/report/selection and exactSDK/evidence reviews ACCEPTED. Closed duplicate setups, pinnedselectionrace, replacedpartialdirs, changedcaptures, directoryhardlinks and boundedreportgrowth. Groma4components/5relations curated; repeat scancreated0/99records. Limitations: one root; signatures and publication inactive; externalreport scenario is a fixture and claimedreviewer/publisher identities unverified; no model/authentication/actualsemanticpackage-review execution; graphrecipient proofstatic(workOperations0). Rawproof localprivate /workspace/active/wpm-release-preflight-f3fb98a-20261127 and ignored. Next: metadata-onlycloseout commit, final clean-source candidate:prepare(fullquality:release), exactSDKbyteaffinity and independent envelope review, then PR11handoff. PR description/private receipts carry finalsource/artifact/check statuses. No merge/tag/publish.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered one-root portable release build/view/verify and external static review evidence across TGZ, ZIP and directory. Stable full CI and actual saved-SDK qualification passed with independent review; final private candidate identity is recorded in PR11 and its local delivery receipts.
<!-- SECTION:FINAL_SUMMARY:END -->
