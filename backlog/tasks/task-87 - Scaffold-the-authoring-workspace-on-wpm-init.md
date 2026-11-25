---
id: TASK-87
title: Scaffold the authoring workspace on wpm init
status: Done
assignee: []
created_date: '2026-06-06 23:38'
updated_date: '2026-06-07 03:01'
labels:
  - authoring-workspace
dependencies:
  - TASK-85
  - TASK-86
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make wpm init create the workspace per the spec (tasks 85/86): the authoring front door (AGENTS.md plus a CLAUDE.md alias) and the authoring backlog at the workspace root, the deliverable skeleton under the deliverable subdirectory, an empty build-output directory, and a gitignore that excludes the builder-time regions. Extends the current init, which scaffolds the deliverable at the project root, reusing the template, render, derive, and materialise services. Non-goals: workspace resolution (88); build packaging (89); build-time executor front door (90); authoring-skill delivery (91).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 After init of a new project, the workspace root holds an authoring front door and the authoring backlog (a Backlog.md root with the authoring task prefix), and the deliverable skeleton (manifest, bundles tree, default bundle template, installer-skills, templates) lives under the deliverable subdirectory.
- [x] #2 An empty build-output directory exists after init.
- [x] #3 The workspace gitignore excludes the authoring backlog and the build-output directory.
- [x] #4 The authoring front door addresses the authoring agent, orienting it toward authoring the deliverable rather than installing it.
- [x] #5 init refuses when the target path already exists and creates nothing.
- [x] #6 --list-templates prints the available templates and exits without creating anything, and --param k=v still feeds placeholder substitution.
- [x] #7 The project-wide authoring tasks, and a per-bundle set for each template-preincluded bundle, are materialised into the workspace-root authoring backlog with their identities unchanged.
- [x] #8 The deliverable subdirectory contains the rendered per-project installer skill and the executor front door scaffolded under the reserved build-stripped prefix, author-editable and not under its canonical auto-discovered name.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD (Rule 3): worker ab9bfa91 ran bmad-create-story (story _bmad-output/.../story-task-87.md); bmad-dev-story + bmad-qa-generate-e2e-tests FELL BACK to doc-driven impl (those workflows gate on the epic-1 sprint mirror that excludes task-87) -- recorded per Rule 3. Reviewer = SEPARATE subagent a4f8d7b4 (bmad-story-automator-review fell back to manual; it mutates+needs a sprint session) -> APPROVE, all 8 ACs PASS w/ regression-catching tests, core boundary clean, no regression-masking, coverage expanded. Orchestrator independently ran FULL cold gate: typecheck clean, biome clean (191 files), npm test 1177 passed (93 files, dist built -> real-binary e2e active). IMPL: init now scaffolds the authoring workspace -- workspace root gets authoring front door AGENTS.md (+CLAUDE.md alias) addressing the AUTHORING agent (NEW snippet templates/project/minimal/snippets/authoring-front-door.md.tmpl, rendered via renderSnippet -- core stays pure) + .authoring-backlog/ + empty builds/ + .gitignore excluding both; deliverable nests under wip/ (manifest, bundles+bundle-template, installer-skills, templates, rendered installer SKILL.md, scope aliases) with the executor front door scaffolded ONCE as the reserved wip/_AGENTS.md (author-owned, NOT canonical AGENTS.md). Files: src/core/operations/init-project.ts, src/cli.ts, +snippet; tests rewritten/added (init unit+integration) + new test/helpers/flat-project.ts bridging the 87/88 resolution gap (8 e2e suites repointed). DEFERRED (correctly out of scope): deriveArtefacts/lifecycle still re-renders canonical AGENTS.md on later mutations -> task-88/90; flat-project.ts helper to be DELETED at task-88/93. PERF: full cold suite ~21min (pre-existing real-binary e2e subprocess cost, NOT a task-87 regression) -> note for epic gate; use fast suite (no dist, ~50s) for routine per-task checks.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
