---
id: TASK-141
title: Protect Groma web access and executable plugin consent
status: Done
assignee: []
created_date: '2026-11-06 11:09'
updated_date: '2026-11-25 01:43'
labels: []
dependencies: []
ordinal: 141000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The audited Groma server exposes source and mutation endpoints without authentication, and plugin installation can execute code. Preserve native web capabilities while enforcing local authenticated sessions, explicit content-bound plugin consent and exact approved restoration in the reviewed fork.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Unauthenticated or cross-origin HTTP requests cannot read repository data or cause changes.
- [x] #2 Authorized users retain map editing and plugin management with approval bound to exact executable content.
- [x] #3 Restore preserves the approved plugin version and modified plugin content cannot execute.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Source WPM e88c2ba103504ede0cafe0ec596be609d7cf4950; protected fork cedf271baf7ff6e3eb069059ef7627d894bbed65. Accepted implementation and bounded independent security reviews are complete. The fork preserves native authenticated map editing and content-bound plugin consent/Restore; no upstream or global fallback is permitted. Full fork CI passed Linux, macOS and Windows on that exact fork: https://github.com/kukhta-ai/Groma.md/actions/runs/45515317232 (Windows 999 passed, 32 normal conditional skips, zero failures). Frozen dependency lock unchanged.

Fresh final private runtime setup and quality:doctor passed. Actual compiled headless web rejects unauthenticated reads, cross-origin and invalid Host requests; one-use bootstrap, HttpOnly/SameSite cookie and CSRF enforcement passed. Authorized add/edit/remove and exclusion of live bootstrap/cookie/CSRF material from an actual export passed. Runtime and dependency/plugin tampering regressions pass, including coordinated cached-byte/receipt substitution rejected by independent account authority. Native Groma provider 1.55.3 reads all 143 actual WPM 1.45.2 task summaries and TASK-136 details and observes a legacy edit through its native watcher; helper/watcher and fixtures were reaped.

DoD evidence: clean-source candidate preparation ran the full quality:release successfully (167 files;2332 passed;2 host-specific skips), including type/lint/architecture/security/mutation. Independent final pin/config and artifact review found no blockers. WPM remote matrix45519390653 still has Node24/Windows running; no completed remote pass is claimed. Next delivery action: final evidence-only revision candidate and PR7 Required CI, tracked by TASK142 closeout/handoff receipt. Fork PR1 remains draft; no merge/tag/publication authorized.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
