---
id: TASK-34
title: Implement the wpm init command
status: Done
assignee: []
created_date: '2026-06-01 02:16'
updated_date: '2026-06-01 21:20'
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
- [x] #1 Running init in an empty target produces a project root containing manifest.yml with project name from the positional and targets and bundles taken from the chosen template, a bundles directory with the default bundle template materialised at bundles/bundle-template/, and empty installer-skills templates and .authoring-backlog directories, where .authoring-backlog is a Backlog.md root whose task_prefix is authoring.
- [x] #2 The derived AGENTS.md and the project installer SKILL.md are produced by mechanical template substitution only, with no invented prose.
- [x] #3 One scope-alias is created for each target the chosen template declares, resolved through the built-in agent-to-alias map; when the template declares no targets, no aliases are created.
- [x] #4 The project-wide authoring task set from the doc 11 catalog is materialised in .authoring-backlog, and for every bundle the template pre-includes the matching per-bundle authoring set is materialised too.
- [x] #5 When the target path already exists the command refuses with a typed error and a non-zero exit, creating nothing.
- [x] #6 The --list-templates flag prints the available project templates and exits without creating a project; values passed with --param key=value are available to placeholder substitution.
- [x] #7 The .authoring-backlog directory is recorded in .gitignore, a summary naming the created path and the number of materialised tasks is printed, and the command exits 0.
- [x] #8 Help output gives a one-line description, a synopsis, every flag and the positional with their meaning, and a worked example; --template and --list-templates values complete from the available project templates.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
wpm init FULL. BMAD skills: bmad-create-story/dev-story/qa-generate-e2e-tests (worker12); bmad-story-automator-review (reviewer APPROVE). Extends the task-33 skeleton initProject to all 12 doc-10:137 steps: chosen template (--template, default minimal) + --list-templates (print + exit, no create) + --param k=v substitution; manifest targets/bundles from the rendered template (buildProjection now LOADS the rendered manifest -- the worker self-QA-fix; previously hardcoded empty so a declaring template was silently ignored); bundles/bundle-template/ materialised; empty installer-skills/templates/.authoring-backlog (task_prefix=authoring); AGENTS.md + installer SKILL.md via the deriver (mechanical, no prose); one scope-alias per template target (none if none); materialise the 8 doc-11 project-wide tasks + the per-bundle set for each pre-included bundle (8+12=20 for a core-preincluding fixture), idempotent by title; refuse-if-target-exists (ConflictError, creates nothing); .gitignore + summary + exit 0; help + --template/--list-templates completion. ALSO closes the recorded bundle-template divergence: create-bundle now PREFERS the project bundles/bundle-template/ when present (registry DEFAULT_BUNDLE_TEMPLATE fallback; explicit --template still registry) -- PROVEN on the real binary on both paths (clone-when-present makes bundle template set live, registry-fallback-when-absent no regression to bundle new/enable). Only minimal/default templates exist; single/multi-bundle NOT invented. Verified on the real binary. Gate 1126.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
