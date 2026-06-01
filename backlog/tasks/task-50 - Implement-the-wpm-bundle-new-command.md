---
id: TASK-50
title: Implement the wpm bundle new command
status: To Do
assignee: []
created_date: '2026-06-01 02:20'
updated_date: '2026-06-01 02:24'
labels:
  - cli
dependencies:
  - TASK-33
  - TASK-80
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): the author primary working-unit creation. Creates a bundle directory from a template, sets its identity and version, enables it in the manifest by default, auto-scaffolds an advisor unless opted out, materialises the per-bundle authoring task set (doc 11), and re-renders derived artefacts. Backs the create-bundle operation (doc 13 section 5); template-driven plus task-driven.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A new id is validated as kebab-case, not already in the manifest, and not a reserved cross-bundle verb (new, enable, disable, remove, list, template); a violation fails with a typed error and a non-zero exit, creating nothing.
- [ ] #2 The bundle directory is created from the resolved bundle template (default the project bundles/bundle-template/) with placeholders substituted mechanically, and bundle.yml plus install-backlog/config.yml are written with id, version, empty requires, and task_prefix set to the id.
- [ ] #3 Unless --disabled, the id is appended to manifest.yml bundles; unless --no-advisor, the advisor add action runs (stub plus its content task).
- [ ] #4 The per-bundle authoring task set from the doc 11 catalog is materialised with stable titles so re-invocation de-dupes by title, and derived artefacts are re-rendered to include the new bundle.
- [ ] #5 A summary naming the created bundle, whether an advisor was scaffolded, and the count of materialised tasks is printed; on success exits 0.
- [ ] #6 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; --template completes from bundle-scope templates.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
