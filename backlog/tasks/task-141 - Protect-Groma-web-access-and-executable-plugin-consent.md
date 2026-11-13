---
id: TASK-141
title: Protect Groma web access and executable plugin consent
status: In Progress
assignee: []
created_date: '2026-11-06 11:09'
updated_date: '2026-11-06 11:59'
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
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
