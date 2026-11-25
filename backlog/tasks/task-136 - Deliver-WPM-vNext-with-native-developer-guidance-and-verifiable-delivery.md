---
id: TASK-136
title: Deliver WPM vNext with native developer guidance and verifiable delivery
status: Done
assignee: []
created_date: '2026-11-05 20:15'
updated_date: '2026-11-06 01:23'
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
- [x] #1 A plain work package can be authored, checked, built and inspected through the installed CLI without APM.
- [x] #2 Repository-native Codex and Claude guidance routes development through executable quality and architecture checks.
- [x] #3 A release candidate is bound to source and artifact digests and public distribution remains inactive.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The approved portable WPM vNext, technology/quality stack, native developer artifacts, Groma participation and private delivery plan are implemented on feat/wpm-vnext. The approved process retires the former BMAD loop. Legacy design was fully preloaded at 6c33347330c225dac198272d2c574228b25bcb05; canonical resulting contracts are docs/vnext.md, docs/implementation-plan.md, docs/development.md, docs/delivery.md and docs/groma.md. Independent specialist reviews closed concrete source/archive/native-task/scanner/candidate findings.

Qualified exact source f716aedbe4b4c586819a3169a3aeb7d5c8f35524 on Linux arm64, Node 24.22.2/npm 11.19.1. Mandatory npm run quality:release passed: 165 files, 2305 tests passed, one native Windows-only filesystem test skipped, 2734.54 s. TypeScript/Biome/typed ESLint, architecture, both Knip modes, native artifacts, security, Groma and reviewed mutation checks passed.

Exact-source candidate sha256:a78b267215722ea6107936829af2ba6b0396ae61abaaf57099faf2a885b16e06 is verified and inactive at /workspace/active/wpm-vnext-candidate-final. Archive wpm-0.1.0.tgz: SHA256 2e0b1cd0cec1d912ce98945a6ec7c31e0b676c760b2f106e64e7a315b9a8f8e4, 731345 bytes. Actual root producer preflight and final preparation produced the same archive digest; independent verification and same-request reuse left all seven persisted files unchanged. Installed plain vNext journey without APM and pinned native APM local fixtures passed. Tasks 137-140 provide bounded acceptance evidence.

Limits: remote GitHub matrix/branch protection, other hosts/runtimes, authenticated Claude model behavior and remote APM dependencies require their environments; they are not claimed local passes. No public distribution, tag, remote write or global agent-setting change was made. Next: human review of the branch and exact candidate digest; any publication remains a separately authorized decision.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented and locally qualified at f716aedbe4b4c586819a3169a3aeb7d5c8f35524; mandatory full release gate passed, exact inactive candidate verified. See implementation notes for scope and limitations.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
