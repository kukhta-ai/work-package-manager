---
id: TASK-11
title: Implement the three schemas with validators
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-31 23:05'
labels: []
dependencies:
  - TASK-10
ordinal: 11000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A well-formed manifest, bundle descriptor, and template descriptor each parse into the model and serialize back without losing information (doc 06/10)
- [x] #2 The manifest yields release identity, the enabled-bundle list, and target agents; a bundle descriptor yields its id, version, summary, confirmation level, and dependency constraints; a template descriptor yields its scope and parameters
- [x] #3 A malformed descriptor is rejected with a message identifying what is wrong
- [x] #4 Invalid ids are rejected on the same rules the model enforces
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
schema service under src/core/services/schema/ (5 files: problems.ts structural helpers + manifest/bundle/template + barrel). PURE: operates on already-parsed unknown/objects, imports NO yaml (that is task-13), no forbidden modules (AC#-, boundary clean). parseX(data:unknown)->Parsed reusing the task-10 parsers for ids/versions/ranges (AC#4, zero re-impl: parseBundleId x6, parseSemVer x5, parseAgentName x3, parseVersionRange x2). Structural validation runs BEFORE field parsing; field-precise dotted/indexed messages (project.version, targets[i], requires.core, bundles[0]) echoing the bad value + expected form + rationale (AC#3, well above bar). serializeX produces plain *Data objects (the YAML-emit seam for task-13) omitting absent optionals -> genuine parse->serialize->parse round-trip, only lossy step = semver normalization (AC#1). bundles = flat id-string list per doc 06/00/13 (resolved the doc-10 {id} outlier). Fail-fast single-problem; multi-problem aggregation deferred to the validate service (task-20). REVIEW: dedicated reviewer APPROVE; gate green (tsc 0 / biome 0 / vitest 125, 37 schema tests). 2 non-blocking NITs: full-serialize drops unknown keys (BY DESIGN -- in-place comment/unknown-key preservation is task-13 Document-edit, not schema fresh-serialize); cosmetic requires bad-key field path.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
