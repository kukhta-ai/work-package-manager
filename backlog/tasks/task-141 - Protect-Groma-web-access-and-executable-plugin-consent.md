---
id: TASK-141
title: Protect Groma web access and executable plugin consent
status: In Progress
assignee: []
created_date: '2026-11-06 11:09'
updated_date: '2026-11-13 16:23'
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
- [ ] #1 Unauthenticated or cross-origin HTTP requests cannot read repository data or cause changes.
- [ ] #2 Authorized users retain map editing and plugin management with approval bound to exact executable content.
- [ ] #3 Restore preserves the approved plugin version and modified plugin content cannot execute.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Approved security plan: fork kukhta-ai/Groma.md from 9f2590feda13e47cb91b589f07d868715242fe52; preserve authenticated web editing and plugin management with web consent. Local implementation and independent review pending.

Fork created kukhta-ai/Groma.md; exact base9f2590feda13e47cb91b589f07d868715242fe52, branches wpm-base/security/wpm-local-web prepared locally. Fork tasks647HTTP and648plugins separate owners. HTTP eight native Bun checks passed; session/bootstrap/HostOrigin/CSRF and UI confirmation implementation in progress. Preserved compile autoloadDotenv:false proven native; no unnecessary repository-root interface added. Source hydration verified Git blob identities after slow Git transport. Full fork checks and reviews remain pending.

Resume qualification on WPM775b261: immutable security fork ad95fd42e65f0d3e159c3069a191866e5af54bb5 is preserved in draft https://github.com/kukhta-ai/Groma.md/pull/1. GitHub had not registered existing fork workflows; idempotently reasserting its already-enabled Actions setting registered them without source or policy changes. Only the CI workflow was dispatched on the exact security branch: https://github.com/kukhta-ai/Groma.md/actions/runs/43456996149. Linux and Windows are running, macOS queued; no full-gate pass claimed. Previous native build, focused security checks and independent review remain valid within their recorded scope. Next: inspect all three platform results and fix actual failures without reducing required checks.

Full fork Linux CIad95fd4:1005 passed24 conditional skips2 failures, both existing Java registration scenarios. Root cause is the Java maintainer copy rewriting jlink internal relative links into absolute links outside the scanner package. Fixed only the copy option, leaving plugin confinement unchanged. Native Bun1.4.4 synthetic probe reproduces rejection before and exact content-digest preservation after, and detects target-byte mutation. Fork cd73635dd75704fe40c3868705e91032728c7241 is pushed to PR1; full three-platform CI https://github.com/kukhta-ai/Groma.md/actions/runs/43459679762 is running. Obsolete ad95fd4 run cancelled after preserving Linux failure evidence. Inherited Groma architecture deployment workflow was disabled in the fork because public distribution remains unapproved; it failed configure-pages and never deployed. Native CI remains enabled. WPM still pins immutable ad95fd4 until revised fork qualification is complete.

Follow-up fork CIcd73635 still reports1005 passed24 conditional skips2 Java registration failures. The tests themselves copied GROMA_TEST_JAVA_PACKAGE with default cp and rewrote the internal links before consent. Both existing fixture copies now preserve verbatim links; assertions and integrity enforcement are unchanged. Final current fork source is dd9b613261449002ce6fa195dba5ef18dd558a96, with unchanged frozen dependency lock; new full CI https://github.com/kukhta-ai/Groma.md/actions/runs/43462057578 is queued/running. The obsolete failed cd73635 run was cancelled after retaining its Linux evidence. The actual new Java end-to-end result is still pending; do not treat the synthetic cp probe as that qualification.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
