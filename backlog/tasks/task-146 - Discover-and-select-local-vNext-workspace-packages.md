---
id: TASK-146
title: Discover and select local vNext workspace packages
status: In Progress
assignee: []
created_date: '2026-11-25T17:36:09Z'
updated_date: '2026-11-25T18:14:48Z'
labels: []
dependencies: []
references:
  - docs/vnext.md
modified_files:
  - src/vnext/package-cli.ts
  - src/vnext/cli.ts
  - src/vnext/adapters/package-workspace.ts
  - test/integration/vnext-package-graph.test.ts
ordinal: 146000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A workspace lists registered packages and selects an exact name and version without guessing.
- [ ] #2 Existing single-package authoring remains usable; unsafe or duplicate registrations fail before writes.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation on feat/vnext-package-graph, base7dea213. Local multiversion cyclic graph, schema2, lock/edit recovery and runtime composition under implementation. Focused unit/integration tests passed during development; independent review findings receive regression tests. Full gates/candidate pending.

Implementation complete pending full qualification: workspace/source2 selection, pure multi-version resolver, package cycles, ordinary/root-dev/optional scopes, deterministic namespaced graph releases and immutable archive imports. Focused installed/native/archive suites passed; latest stable focused run and full CI next. quality:fast PASS132modules without warnings. Independent authoring_review signoff PASS after ownership/inventory/metadata/journal/archive regressions. Existing Ajv strict waiver renewed for model SHA8856ad5c894c004153451e7875bc568e755cee633e9c12b5fb5c14b59b3df52c by independent identical-validator/10556-case review; two total waivers, no new exclusions. Fresh819-mutant collection reviewed accepted after renewal (803killed9timeouts2existingreviewed5static schema-init errors), zero unreviewed. Sourcebase7dea213 plus current worktree. Next: committed stable fullquality:ci, final evidence/task close, clean-source candidate:prepare fullquality:release, private exact-byte verification and PR review; publication inactive.
<!-- SECTION:NOTES:END -->
