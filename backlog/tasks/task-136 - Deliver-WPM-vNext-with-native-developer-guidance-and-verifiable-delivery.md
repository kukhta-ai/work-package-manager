---
id: TASK-136
title: Deliver WPM vNext with native developer guidance and verifiable delivery
status: In Progress
assignee: []
created_date: '2026-11-05 20:15'
updated_date: '2026-11-06 00:29'
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

2026-11-06 checkpoint: exact source 1632e0410205f33b8631f7f1dbb1a48538867b43 passed the mandatory quality:release band on Node 24.22.2/npm 11.19.1 Linux arm64: 165 files, 2303 tests passed, one Windows-only filesystem test skipped, 2736.00 s. Security/architecture/Knip/Groma and reviewed mutation gates passed. Candidate preparation subsequently refused contributor-local ignored state because it invoked the strict package boundary against the root checkout after quality populated .quality. No candidate was persisted. The boundary is retained; an independently reviewed owned exact-revision producer clone with its own locked install is being implemented. Next: focused regression/review, commit the stable fix, then rerun mandatory exact-source candidate qualification.

Producer fix ready: unchanged strict package boundary now runs in an owned full-tree Git clone at the captured commit with a fresh locked npm ci and isolated Git/npm environment. Independent review found no blocker; two real Git/npm fixture files passed 11 tests. Full quality:fast passed on the stable fix. Original ignored state/root dist/SDK stay intact; export-ignore tracked build inputs are retained and required ignored build inputs fail. Next: commit, real-repository producer preflight, then mandatory full candidate qualification on the new source revision.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
