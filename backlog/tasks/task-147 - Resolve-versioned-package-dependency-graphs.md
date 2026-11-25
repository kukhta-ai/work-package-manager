---
id: TASK-147
title: Resolve versioned package dependency graphs
status: Done
assignee: []
created_date: '2026-11-25T17:36:09Z'
updated_date: '2026-11-25T18:40:30Z'
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
- [x] #1 Different branches retain incompatible versions, share identical instances, and terminate on package cycles.
- [x] #2 Required resolution failures report their chain; optional availability failures are recorded without hiding invalid data.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation on feat/vnext-package-graph, base7dea213. Local multiversion cyclic graph, schema2, lock/edit recovery and runtime composition under implementation. Focused unit/integration tests passed during development; independent review findings receive regression tests. Full gates/candidate pending.

Implementation complete pending full qualification: workspace/source2 selection, pure multi-version resolver, package cycles, ordinary/root-dev/optional scopes, deterministic namespaced graph releases and immutable archive imports. Focused installed/native/archive suites passed; latest stable focused run and full CI next. quality:fast PASS132modules without warnings. Independent authoring_review signoff PASS after ownership/inventory/metadata/journal/archive regressions. Existing Ajv strict waiver renewed for model SHA8856ad5c894c004153451e7875bc568e755cee633e9c12b5fb5c14b59b3df52c by independent identical-validator/10556-case review; two total waivers, no new exclusions. Fresh819-mutant collection reviewed accepted after renewal (803killed9timeouts2existingreviewed5static schema-init errors), zero unreviewed. Sourcebase7dea213 plus current worktree. Next: committed stable fullquality:ci, final evidence/task close, clean-source candidate:prepare fullquality:release, private exact-byte verification and PR review; publication inactive.

Implementation/AC/DoD complete. Full quality:ci PASS on5f719bb51de9f596ebc27ec327e7540c980123c9:173files,2412passed,2existinghost-conditional skips; all required analyzer/architecture/mutation bands passed. Mutation819 accepted with0unreviewed and exactly2existing independently reviewed equivalents. Final follow-up changes only document adapter public methods and correct host-path expectations in an inherited Windows unit fixture (88ed8ed; focused4tests PASS). Post-comment quality:fast132modules and Groma freshness92records PASS. Independent code review signed off all material findings. Candidate preparation from the following clean committed closeout revision is the final required fullquality:release and exact-byte gate; PR9 and private immutable receipts carry its actual source/digest and hosted matrix outcome. No current claim that this final candidate or final-head hosted matrix has already passed. Public distribution inactive; human review/integration remain next.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the approved local multi-package graph slice; full implementation CI and independent review passed. Final immutable candidate and hosted exact-head evidence are recorded on PR9.
<!-- SECTION:FINAL_SUMMARY:END -->
