---
id: TASK-93
title: Migrate the test suite and fixtures to the workspace layout
status: Done
assignee: []
created_date: '2026-06-06 23:38'
updated_date: '2026-06-07 07:13'
labels:
  - authoring-workspace
dependencies:
  - TASK-87
  - TASK-88
  - TASK-89
  - TASK-90
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The unit, integration, and snapshot tests and their fixtures assume the deliverable at the project root. Update them to the workspace layout so the suite reflects and guards the new structure. Depends on the behavioral tasks 87-90. Non-goals: new behavior beyond what 87-90 define.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Fixtures represent authoring workspaces with the deliverable nested under its subdirectory rather than deliverables at the project root.
- [x] #2 Integration tests drive the workspace flow end to end: init creates a workspace, project-bound commands resolve the nested deliverable, and build produces an un-nested archive in the build-output directory.
- [x] #3 A regression test fails if any builder-time region (the authoring backlog, the authoring front door, or the build-output directory) appears inside a build artifact.
- [x] #4 A regression test fails if any deliverable executor front door appears in the authoring tree under its canonical auto-discovered name; it must appear only under the reserved prefix.
- [x] #5 Snapshot expectations reflect the workspace layout and the prefix-stripped executor front door as it appears in the archive.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD (Rule 3): worker afc78550 ran bmad-create-story (story _bmad-output/.../story-task-93.md) + dev-story/qa (doc-driven fallback; epic-1 sprint mirror excludes task-93). NOTE: worker ended before its final report while a cold run was in flight -> orchestrator + reviewer independently verified. Reviewer = SEPARATE subagent adc40f45 (story-automator-review fell back to manual) -> APPROVE, all 5 ACs PASS, regression guards NON-VACUOUS, await masking bug fully eradicated, no lost coverage, no product code changed. Orchestrator ran INDEPENDENT FULL COLD: typecheck 0, biome 0 (195 files), build 0, vitest 1217 passed (96 files). IMPL: comprehensive test/fixtures audit (most migration already done by 87-90). AC#1 all project/workspace fixtures funnel through test/helpers/workspace.ts initWorkspace (real wpm init -> deliverable under wip/); legit deliverable-root unit fixtures (packager) left as-is. AC#2 new "FULL workspace lifecycle E2E" (init->bundle new->project meta/targets->build, asserting resolution + un-nested archive in builds/). AC#3 build e2e plants a unique sentinel in EACH builder-time region (.authoring-backlog/, workspace-root AGENTS.md+CLAUDE.md, builds/) and asserts path+content absence from the archive (non-vacuous). AC#4 walks all of wip/ asserting NO canonical AGENTS.md/CLAUDE.md/GEMINI.md (root + each bundle), only _AGENTS.md. GENUINE BUG FIXED: a subset of cli.bundle-id.e2e (files/installer-skills families) used floating un-awaited withTempDir((dir)=>{...}) -> converted to async/await withTempDir; grep confirms NO floating sites remain suite-wide. AC#5 note: repo has NO vitest .snap files -- "snapshot expectations" are the structural archive-listing assertions (workspace tree in authoring; prefix-stripped AGENTS.md in archive). Files: cli.build.e2e (+149), cli.bundle-id.e2e, cli.init, cli.project-installer-skills.e2e (tests-only). flat-project.ts was already deleted in task-88.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
