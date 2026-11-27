---
id: TASK-143
title: Protect confidential Groma source exports
status: Done
assignee: []
created_date: '2026-11-06 11:24'
updated_date: '2026-11-25 01:41'
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
- [x] #1 Source-bearing exports require explicit acknowledgement and omit live session and plugin approval credentials.
- [x] #2 A detected secret in either selected revision prevents final export delivery.
- [x] #3 Unsafe destinations and failed export checks leave existing user content unchanged.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Preserve complete fork exports with explicit acknowledgement and a raw per-revision source inventory. Validate exact Git revision coverage and safe scanner paths. Build only in owned private staging outside checkout; scan decoded historical/current sources and rendered site with pinned Gitleaks/shared mandatory controls before delivery. Negative fixtures cover historical-only secret, checkout aliases, existing user content and traversal. Tests use explicit ports; actual native scanner qualifier will run separately. Missing native tools fail rather than becoming successful evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Source WPM e88c2ba103504ede0cafe0ec596be609d7cf4950; protected fork cedf271baf7ff6e3eb069059ef7627d894bbed65. All acceptance criteria and DoD are satisfied. Full local quality:release passes on clean e88c2ba (167 files;2332 passed;2 host-specific skips). Independent review corrected final directory mode to0700 and confirmed rejection paths.

Actual compiled final fork plus pinned native Gitleaks passes explicit acknowledgement before effects, a clean vendor-path source export, delivered0700 mode, rejection of a synthetic generic secret present only in the older selected node_modules/fixture source, failed-staging removal, existing user-content preservation and checkout/alias destination rejection. The native web export also excludes live session credentials. Disposable repositories/exports and server processes were removed. Evidence remains private under .quality/evidence/export-native-e88c2ba-cedf271.json and web-native-e88c2ba-cedf271.json; compact gate facts persist in research/evolution/gates/wpm-vnext-e88c2ba-local.json.

No full WPM remote matrix pass is claimed while Node24/Windows remains running. Next delivery action: qualify final evidence-only source and PR7 checks. Public distribution remains inactive.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
