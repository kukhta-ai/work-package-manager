---
id: TASK-50
title: Implement the wpm bundle new command
status: Done
assignee: []
created_date: '2026-06-01 02:20'
updated_date: '2026-06-01 13:22'
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
- [x] #1 A new id is validated as kebab-case, not already in the manifest, and not a reserved cross-bundle verb (new, enable, disable, remove, list, template); a violation fails with a typed error and a non-zero exit, creating nothing.
- [x] #2 The bundle directory is created from the resolved bundle template (default the project bundles/bundle-template/) with placeholders substituted mechanically, and bundle.yml plus install-backlog/config.yml are written with id, version, empty requires, and task_prefix set to the id.
- [x] #3 Unless --disabled, the id is appended to manifest.yml bundles; unless --no-advisor, the advisor add action runs (stub plus its content task).
- [x] #4 The per-bundle authoring task set from the doc 11 catalog is materialised with stable titles so re-invocation de-dupes by title, and derived artefacts are re-rendered to include the new bundle.
- [x] #5 A summary naming the created bundle, whether an advisor was scaffolded, and the count of materialised tasks is printed; on success exits 0.
- [x] #6 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; --template completes from bundle-scope templates.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
wpm bundle new (completes the task-26 createBundle wiring). FIXED a binary-only bug: the program --version (commander .version) shadowed bundle new's --version -> printed the program version + created nothing; fix = program version is -V-only + a top-level isProgramVersionRequest interception in run() preserves wpm --version/-V, so bundle new <id> --version <v> now sets bundle.yml version (verified real binary). --disabled skips the manifest append; --no-advisor skips the advisor scaffold (scaffoldAdvisor helper renders advisor.SKILL.md.tmpl -> installer-skills/<id>-advisor/SKILL.md, no-op if present, shared with task-80); reserved-verb id refused exit 2; materialises into .authoring-backlog. Reviewer APPROVE zero findings. Gate 649.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
