---
id: TASK-137
title: Author and release a portable plain vNext work package
status: Done
assignee: []
created_date: '2026-11-05 20:21'
updated_date: '2026-11-06 01:23'
labels: []
dependencies: []
modified_files:
  - docs/vnext.md
  - src/vnext/adapters/apm.ts
  - src/vnext/adapters/portable-tree.ts
  - src/vnext/adapters/workspace.ts
  - src/vnext/cli.ts
  - src/vnext/core/model.ts
  - src/vnext/core/source-text.ts
  - test/integration/vnext-apm.test.ts
  - test/integration/vnext-native-boundary.test.ts
  - test/integration/vnext-packed.test.ts
  - test/integration/vnext-workspace.test.ts
  - test/unit/vnext/contract-boundaries.test.ts
  - test/unit/vnext/model.test.ts
  - test/unit/vnext/portable-tree.test.ts
  - test/unit/vnext/source-text.test.ts
  - test/integration/vnext-private-quality.test.ts
ordinal: 137000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A plain work package preserves operation identity, independent group selection and explicit worker setup selection through validate, lock and build.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plain vNext authoring is implemented under the additive wpm vnext namespace: native operation identities, independent group selection, explicit default/null/named setup selection, strict source validation, deterministic archives and static recipient rehearsal. Installed-CLI acceptance without APM passed. Private .quality segments, archive aliases, native-task symlinks and interrupted-operation reconciliation have regression coverage; legacy CLI behavior is preserved.

Qualified exact source f716aedbe4b4c586819a3169a3aeb7d5c8f35524 on Linux arm64, Node 24.22.2/npm 11.19.1. Mandatory npm run quality:release passed: 165 files, 2305 tests passed, one native Windows-only filesystem test skipped, 2734.54 s. TypeScript/Biome/typed ESLint, architecture, both Knip modes, native artifacts, security, Groma and reviewed mutation checks passed.

Actual APM 0.35.0 qualification passed on identical product sources: pinned executable SHA256 9d2f7cf34ec2fa0b3d806a4711abd223ee429839ec96787279f1c5d82abd25b8, local dependency/skill, Codex and Claude contexts, frozen replay and suppressed user/transitive lifecycle actions. Repeated fixture archive SHA256 0e4fbf154981ae5719fd0bc65828eb5c2a15fb9529af57843cb515509149f798 was unchanged. Canonical behavior: docs/vnext.md.

Limits: static rehearsal does not execute a recipient agent; remote/authenticated APM dependencies and other hosts remain separate qualifications. Public distribution is inactive. Next: human review of the local branch/candidate.
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
