---
id: TASK-34
title: Implement the wpm init command
status: To Do
assignee: []
created_date: '2026-06-01 02:16'
updated_date: '2026-06-01 02:24'
labels:
  - cli
dependencies:
  - TASK-33
  - TASK-50
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-creating command (doc 10): scaffolds a new bundle-project root from a project template. The entry point an author starts from; it stands up the manifest, the bundles tree with the default bundle template, the empty installer-skills templates and .authoring-backlog scaffolding, the scope aliases for declared targets, the rendered AGENTS.md and installer skill, and the initial authoring-backlog tasks. Backs the init-project operation (doc 13 section 5) and renders the minimal project template (doc 12). Structure-not-content and no-mirror apply (doc 10); task materialisation follows the doc 11 catalog.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Running init in an empty target produces a project root containing manifest.yml with project name from the positional and targets and bundles taken from the chosen template, a bundles directory with the default bundle template materialised at bundles/bundle-template/, and empty installer-skills templates and .authoring-backlog directories, where .authoring-backlog is a Backlog.md root whose task_prefix is authoring.
- [ ] #2 The derived AGENTS.md and the project installer SKILL.md are produced by mechanical template substitution only, with no invented prose.
- [ ] #3 One scope-alias is created for each target the chosen template declares, resolved through the built-in agent-to-alias map; when the template declares no targets, no aliases are created.
- [ ] #4 The project-wide authoring task set from the doc 11 catalog is materialised in .authoring-backlog, and for every bundle the template pre-includes the matching per-bundle authoring set is materialised too.
- [ ] #5 When the target path already exists the command refuses with a typed error and a non-zero exit, creating nothing.
- [ ] #6 The --list-templates flag prints the available project templates and exits without creating a project; values passed with --param key=value are available to placeholder substitution.
- [ ] #7 The .authoring-backlog directory is recorded in .gitignore, a summary naming the created path and the number of materialised tasks is printed, and the command exits 0.
- [ ] #8 Help output gives a one-line description, a synopsis, every flag and the positional with their meaning, and a worked example; --template and --list-templates values complete from the available project templates.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
