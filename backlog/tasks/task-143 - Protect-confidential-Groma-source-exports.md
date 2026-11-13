---
id: TASK-143
title: Protect confidential Groma source exports
status: In Progress
assignee: []
created_date: '2026-11-06 11:24'
updated_date: '2026-11-13 06:55'
labels: []
dependencies:
  - TASK-141
modified_files:
  - scripts/groma.mjs
  - scripts/groma-export.mjs
  - test/unit/groma-export.test.ts
  - docs/groma.md
  - README.md
  - docs/delivery.md
ordinal: 143000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Source-bearing architecture exports can disclose current or historical repository content. The approved security plan preserves full export and comparison capabilities while requiring explicit acknowledgement, private staging and verified secret checks before final delivery.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Source-bearing exports require explicit acknowledgement and omit live session and plugin approval credentials.
- [ ] #2 A detected secret in either selected revision prevents final export delivery.
- [ ] #3 Unsafe destinations and failed export checks leave existing user content unchanged.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Preserve complete fork exports with explicit acknowledgement and a raw per-revision source inventory. Validate exact Git revision coverage and safe scanner paths. Build only in owned private staging outside checkout; scan decoded historical/current sources and rendered site with pinned Gitleaks/shared mandatory controls before delivery. Negative fixtures cover historical-only secret, checkout aliases, existing user content and traversal. Tests use explicit ports; actual native scanner qualifier will run separately. Missing native tools fail rather than becoming successful evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Independent review reproduced two export defects and both are fixed: caller must now pass --ack-source-export before effects; original vendor paths could bypass default Gitleaks filtering, so captured raw sources are scanned under neutral ordinal .txt paths with original provenance retained in the captured manifest. Production native qualifier and independent random generic-key control both reject historical node_modules-only secrets, accept clean output and remove staging. Five focused unit tests, whole WPM TypeScript and scoped typed ESLint pass. Actual final compiled-fork export and final candidate remain pending; no release qualification claimed yet.

Resume review reproduced final source export root being0755 under umask022 after leaving private staging. Enforced chmod0700 before rename and extended delivered-permissions regression. Independent verification passes; actual final fork/native scanner/export qualification remains pending disk capacity. Source manifest and old-revision detector behavior retained.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
