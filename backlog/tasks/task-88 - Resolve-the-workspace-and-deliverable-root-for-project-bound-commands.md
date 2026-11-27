---
id: TASK-88
title: Resolve the workspace and deliverable root for project-bound commands
status: Done
assignee: []
created_date: '2026-06-06 23:38'
updated_date: '2026-06-07 05:15'
labels:
  - authoring-workspace
dependencies:
  - TASK-86
  - TASK-87
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound commands currently walk up from the working directory to a manifest at the project root. Update resolution so commands find the workspace and operate on the nested deliverable subdirectory from anywhere within the workspace, with -C targeting a workspace. Conforms to the resolution spec in doc 10 (task 86). Non-goals: build packaging (89); init scaffolding (87).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A project-bound command run at the workspace root operates on the deliverable in the deliverable subdirectory.
- [x] #2 A project-bound command run anywhere within the workspace, including inside the deliverable or a bundle directory, resolves the same deliverable root.
- [x] #3 The -C/--project option targets a workspace at the given path.
- [x] #4 Run outside any workspace, a project-bound command exits non-zero, names the missing workspace marker, and suggests init or the -C override.
- [x] #5 Resolution distinguishes a workspace from an unwrapped directory and does not silently operate on a bare deliverable that is not inside a workspace.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD (Rule 3): worker af68b6f0 drove from merged docs (docs/10 resolution + docs/13 s7); the story-automator skills gate on the epic-1 sprint mirror that excludes task-88, so it fell back to doc-driven impl. NOTE: this worker wrote NO story-task-88.md (judged a freehand story a Rule-3 defect) -- a small evidence-trail divergence from prior tasks; non-blocking. Reviewer = SEPARATE subagent a8ccb57a, ran INDEPENDENT FULL COLD suite: typecheck 0, biome 0, build 0, vitest 1203 passed (96 files), ZERO unhandled rejections -> APPROVE. All 5 ACs PASS regression-guarded; coverage STRENGTHENED not eroded (menu-render logic retains dedicated derived-artefacts unit coverage); core boundary intact; PROJECT_MARKER fully removed (only WORKSPACE_MARKER wip/manifest.yml). IMPL: resolveContext marker -> wip/manifest.yml; ProjectContext={workspaceRoot,deliverableRoot=workspaceRoot/wip}; requireProject returns both; lifecycle runMutation LOAD/APPLY/RERENDER on deliverableRoot, MATERIALISE at <workspaceRoot>/.authoring-backlog; executor front door (AGENTS.md) EXCLUDED from mutation re-render (author-owned _AGENTS.md) while orchestrator+aliases still re-derive; init still scaffolds wip/_AGENTS.md once. Deleted test/helpers/flat-project.ts -> added workspace.ts (initWorkspace); 8 e2e suites repointed to the real workspace. 64 files. Orchestrator nit-fix: stale "re-renders AGENTS.md" help text/docstrings in cli.ts + project-meta.ts corrected (typecheck+lint re-confirmed clean). CARRY-FORWARD to task-93: add async/await to the sync withTempDir e2e tests (cli.bundle-id.e2e 43, project-installer-skills.e2e 10, cli.init 3) -- latent (a FAILING assertion leaks as unhandled-rejection; nothing masked now, cold run had 0 rejections). CARRY-FORWARD to task-90: build still ships wip/_AGENTS.md verbatim -> strip to AGENTS.md + per-bundle front doors + tighten build e2e ship-tree assertions; the executor-front-door menu is frozen at init (author maintains it via the doc-11 verify task) -- consistent with doc 10/12.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
