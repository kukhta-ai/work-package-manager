---
id: TASK-10
title: Define the domain model and branded types
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-31 22:55'
labels: []
dependencies:
  - TASK-6
ordinal: 10000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Bundle ids, agent names, versions, and version ranges are each a distinct type that exists only after passing validation; an invalid value cannot be constructed (doc 13)
- [x] #2 A bundle id is rejected unless it is kebab-case and not a reserved word
- [x] #3 The model can represent a project, its manifest, its bundles, a templated unit, an authoring-task spec, a validation report, and an operation result
- [x] #4 The model carries no dependency on the CLI framework, the file system, or any other I/O
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Domain model under src/core/model/ (10 files + barrel; FIRST src/core/ code -- the task-5 boundary rule is now live on real code, proven to fire on a node:fs probe). Branded primitives via smart-constructor parsers returning Parsed<T> that NEVER throw and are the ONLY sanctioned producer -> illegal states unrepresentable (AC#1, reviewer-verified airtight by grep+runtime): BundleId (kebab regex + RESERVED_BUNDLE_VERBS=[new,enable,disable,remove,list,template] sourced from doc 10 line 149, AC#2), AgentName, SemVer (semver.valid), VersionRange (semver.validRange; normalized comparator form stored; empty explicitly rejected). Aggregates Manifest/BundleManifest(requires:ReadonlyMap<BundleId,VersionRange>)/Template/Project + value objects AuthoringTaskSpec/ValidationReport/OperationResult, field shapes per doc 06 (AC#3). Pure -- imports only semver(pure, allowed) + intra-model; no commander/execa/omelette/node:fs (AC#4; biome boundary clean). semver@7.8.1 (dependencies) + @types/semver@7.7.1 (devDeps); lockfile synced, npm ci clean (task-8 lesson). REVIEW: dedicated reviewer APPROVE; gate green (tsc 0 / biome 0 / vitest 88, 74 model tests). 2 non-blocking NITs (RESERVED could be  tuple; name/summary intentionally unbranded free text).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
