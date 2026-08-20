---
id: TASK-90
title: Author the deliverable executor front door under a build-stripped prefix
status: Done
assignee: []
created_date: '2026-06-06 23:38'
updated_date: '2026-06-07 06:29'
labels:
  - authoring-workspace
dependencies:
  - TASK-86
  - TASK-89
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The deliverable executor front door (the shipped AGENTS.md and its CLAUDE.md alias, at the project root and per bundle) is author-owned content the author may edit. Under its canonical name inside the workspace it would be auto-discovered by the author agent and contradict the authoring front door (closest-wins). Keep it editable by authoring it under a reserved prefix that agent auto-discovery ignores, and have the build strip the prefix so the archive carries the canonical front door. The author owns the content; the build never regenerates or overwrites it. Conforms to doc 12 (task 86). Non-goals: packaging mechanics (89); generating front-door content (the author owns it).
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The deliverable executor front door is author-owned content the author can edit, stored under a reserved name that agent auto-discovery does not load.
- [x] #2 The build restores the executor front door to its canonical name (AGENTS.md, with the CLAUDE.md alias) at the corresponding location in the archive.
- [x] #3 During authoring, no deliverable front door is auto-discovered under a canonical agent-surface name that contradicts the authoring front door, at the project root or in any bundle.
- [x] #4 The reserved-prefix convention is documented where the author will see it, so an edit to the front door is not mistaken for a stray file.
- [x] #5 A file authored under the reserved prefix appears in the archive only under its canonical stripped name, never under both names.
- [x] #6 Author edits to the prefixed front door appear verbatim in the built archive; the build does not regenerate or overwrite the content.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD (Rule 3): worker a45ddad0 ran bmad-create-story (story _bmad-output/.../story-task-90.md) + dev-story/qa (doc-driven fallback; epic-1 sprint mirror excludes task-90). Reviewer = SEPARATE subagent a0a880fd (story-automator-review fell back to manual) -> APPROVE, all 6 ACs PASS regression-tested, core build.ts PURE (transform-spec is policy; staging/copy/symlink effects in packager.ts adapter), coverage strengthened, no-transform path byte-identical to pre-90. Gate: typecheck 0, biome 0 (195 files), fast suite 1076 passed +138 skipped, build e2e 17 passed. IMPL: pure computeFrontDoorTransforms(shippable,targets) on BuildPlan emits {from:_AGENTS.md,to:AGENTS.md,aliases:[per-target]} for root + each shipped bundle; FRONT_DOOR_ALIAS_FILENAMES data map (claude-code->CLAUDE.md, gemini->GEMINI.md; codex/hermes/openclaw read AGENTS.md natively) per doc-05. packager.ts stages the shippable set (preserving symlinks), writes AGENTS.md from _AGENTS.md bytes VERBATIM, creates alias symlinks, drops _AGENTS.md, archives the staged tree (tarball+zip); temp dir cleaned in finally. Bundle template AGENTS.md.tmpl -> _AGENTS.md.tmpl (so bundle new / preincluded bundles scaffold bundles/<id>/_AGENTS.md, never the canonical name -> AC#3). AC#4 documented in agent-skills/installer-builder/references/conventions.md. KNOWN LIMITATION (adjudicated DEFERRABLE -- pre-existing, outside task-90 non-goal "packaging mechanics(89)"): --format git does `git archive HEAD` and does NOT apply un-nesting/exclusions/strip (it never did, since task-89 too) -> tracked as TASK-95. NIT (non-blocking, failure-path only): if stageWithTransforms throws mid-stage the temp dir leaks (archiveSource runs before the try) -> minor robustness follow-up. CARRY-FORWARD: scope-alias symlinks ship with ABSOLUTE targets (pre-existing init behavior) -- a latent archive-portability issue; bundles/bundle-template/_AGENTS.md.tmpl ships in the archive (open question whether the bundle-template scaffold should ship).
<!-- SECTION:NOTES:END -->
