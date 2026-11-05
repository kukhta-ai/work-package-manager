---
id: TASK-137
title: Author and release a portable plain vNext work package
status: In Progress
assignee: []
created_date: '2026-11-05 20:21'
updated_date: '2026-11-05 23:28'
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
- [ ] #1 A plain work package preserves operation identity, independent group selection and explicit worker setup selection through validate, lock and build.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Source base 6c33347330c225dac198272d2c574228b25bcb05; additive wpm vnext preserves legacy commands. Plain package.yml/native operation identities/groups/default-null setup semantics, deterministic USTAR/gzip, captured-source integrity, confinement, mutation reservation and interrupted-request reconciliation implemented and independently reviewed. Developer/author/recipient contexts remain separate.

Actual APM 0.35.0 final-source qualification passed on Linux arm64 with entry SHA-256 9d2f7cf34ec2fa0b3d806a4711abd223ee429839ec96787279f1c5d82abd25b8. Lock/bootstrap/frozen replay/compile for Codex and Claude, local dependency+skill, user/transitive lifecycle suppression and identical repeat archives qualified; archive SHA-256 0e4fbf154981ae5719fd0bc65828eb5c2a15fb9529af57843cb515509149f798. New portable-tree and native-task confinement regressions passed independent focused review/tests.

Limits: no remote/authenticated APM dependency or real recipient-agent execution qualification. test is static extraction rehearsal. Next: complete full integration/candidate qualification; public distribution stays inactive.

Final exact .quality source exclusion prevents private tool state entering payload/setup context. Public lookalikes and ordinary dist/coverage payload remain valid. 157 focused unit/integration tests passed; independent review and fresh critical mutation qualification passed.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
