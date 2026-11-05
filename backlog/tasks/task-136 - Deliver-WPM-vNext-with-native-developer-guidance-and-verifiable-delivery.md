---
id: TASK-136
title: Deliver WPM vNext with native developer guidance and verifiable delivery
status: In Progress
assignee: []
created_date: '2026-11-05 20:15'
updated_date: '2026-11-05 23:28'
labels: []
dependencies: []
modified_files:
  - .changeset/README.md
  - .changeset/config.json
  - .changeset/wpm-vnext.md
  - .gitignore
  - .node-version
  - CONTRIBUTING.md
  - PROCESS-ARTIFACTS.md
  - README.md
  - docs/implementation-plan.md
ordinal: 136000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A plain work package can be authored, checked, built and inspected through the installed CLI without APM.
- [ ] #2 Repository-native Codex and Claude guidance routes development through executable quality and architecture checks.
- [ ] #3 A release candidate is bound to source and artifact digests and public distribution remains inactive.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Approved vNext plan implemented on feat/wpm-vnext; legacy design preloaded at 6c33347330c225dac198272d2c574228b25bcb05. Canonical product/stack/process decisions: docs/vnext.md, docs/implementation-plan.md, docs/development.md, docs/delivery.md. The approved process retires BMAD and keeps publication inactive.

Node 24.22.2 / npm 11.19.1: default clean npm ci passed. quality:ci -- --policy-only passed; product checkpoint unit band passed 1884 tests across 124 files. Actual full packed consumer journey passed in 129.83 s, including source deletion and native commands. Independent specialist reviews closed concrete archive-alias, native-task-symlink, scanner-policy and candidate-affinity findings.

Next: commit the frozen reviewed source, then prepare and verify an inactive exact-source candidate with the mandatory full quality:release band. The earlier serial integration attempt was superseded by the fully isolated bounded harness; no interrupted run is claimed as a pass. Remote CI/branch protection, other hosts/runtimes and an authenticated Claude model turn are separate environment qualifications, not claimed local passes.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
