---
id: TASK-147
title: Resolve versioned package dependency graphs
status: In Progress
assignee: []
created_date: '2026-11-25T17:36:09Z'
updated_date: '2026-11-25T18:14:48Z'
labels: []
dependencies:
  - TASK-146
references:
  - docs/vnext.md
modified_files:
  - src/vnext/core/dependencies.ts
  - src/vnext/core/model.ts
  - test/unit/vnext/dependencies.test.ts
  - test/unit/vnext/contract-boundaries.test.ts
ordinal: 147000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Different branches retain incompatible versions, share identical instances, and terminate on package cycles.
- [ ] #2 Required resolution failures report their chain; optional availability failures are recorded without hiding invalid data.
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
