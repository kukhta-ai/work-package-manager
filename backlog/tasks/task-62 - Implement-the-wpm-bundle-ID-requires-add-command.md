---
id: TASK-62
title: Implement the wpm bundle ID requires add command
status: Done
assignee: []
created_date: '2026-06-01 02:22'
updated_date: '2026-06-01 15:31'
labels:
  - cli
dependencies:
  - TASK-33
  - TASK-18
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): declares a dependency on another bundle by id and npm-style version constraint in this bundle requires map. Defaults the constraint to a caret range on the dependency current version when omitted, warns on cycles, and materialises an adaptation task (doc 11). Exercises version-constraint resolution (doc 13 section 4).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When the dependency id is an enabled bundle, an entry is appended or overwritten in this bundle bundle.yml requires map with the given constraint, or a caret range on the dependency current version when no constraint is given.
- [x] #2 When the new edge would introduce a dependency cycle, the command warns.
- [x] #3 An authoring task to adapt this bundle install-backlog and payload to use the dependency is materialised, idempotent by title.
- [x] #4 A dependency id that is not an enabled bundle fails with a typed not-found error and a non-zero exit.
- [x] #5 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id and dependency id complete from enabled bundles.
- [x] #6 Help output is substantive (description, synopsis, the dependency and constraint positionals, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle id requires add. BMAD skills run: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests (worker6); bmad-story-automator-review (reviewer APPROVE). bundle-requires.ts edits bundles ID bundle.yml requires map via editYaml; caret default is the literal caret-range on the dep current version when omitted; cycle detection overlays the new edge on a fresh graph copy and warns with the edge still written (doc-10:162 warn-not-reject); materialises Adapt id install-backlog and payload to use dep, idempotent by title, into .authoring-backlog. DIVERGENCE: the raw validated range string is written to disk per the doc-10:162 example, reads display the normalized form (consistent with bundle show); a bad range is a UsageError exit 2. Verified on the real binary. Gate 788.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
