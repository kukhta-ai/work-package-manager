---
id: TASK-89
title: Package the build as the un-nested deliverable into the build-output directory
status: Done
assignee: []
created_date: '2026-06-06 23:38'
updated_date: '2026-06-07 05:53'
labels:
  - authoring-workspace
dependencies:
  - TASK-86
  - TASK-87
  - TASK-88
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make wpm build emit the deliverable as the archive root and write artifacts into the build-output directory, per the build spec (task 86). The archive un-nests the deliverable subdirectory so an end user unpacking it finds the manifest at the archive root. Builds on the existing build enumeration and exclusions. Non-goals: build-time executor front door generation (90).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 build package writes an archive into the build-output directory, named by the project release name, version, and chosen format.
- [x] #2 The archive root is the un-nested deliverable, with the manifest at the archive root.
- [x] #3 The authoring backlog, the authoring front door, and the build-output directory are absent from the archive.
- [x] #4 Disabled bundle directories and builder-time working directories remain excluded from the archive.
- [x] #5 build dry-run previews the would-ship un-nested tree and produces no artifact.
- [x] #6 build run outside a workspace exits non-zero, naming the missing workspace.
- [x] #7 Re-packaging unchanged project state reproduces an identical archive layout.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD (Rule 3): worker a22d12bc ran bmad-create-story (story _bmad-output/.../story-task-89.md) + dev-story/qa (doc-driven fallback; skills gate on epic-1 sprint mirror). NOTE: the worker session ended before its final report while a cold run was in flight, so the orchestrator + reviewer independently verified the gate. Reviewer = SEPARATE subagent ae7b2501 (story-automator-review fell back to manual) -> APPROVE, all 7 ACs PASS regression-guarded, core build.ts UNCHANGED (pure; effects only in cli/adapter), mkdir via fs port, coverage strengthened, AC#7 a genuine two-build layout compare. Gate: typecheck 0, biome 0 (195 files), fast suite 1069 passed +136 skipped, build e2e 15 passed. IMPL: new buildOutputDir(ctx, workspaceRoot) helper ensures <workspace>/builds/ via ctx.deps.fs.makeDirectories; build package + publish now write there (outDir) instead of cwd. Archive root = un-nested deliverable (build operates on deliverableRoot=wip/ since task-88, so manifest is at the archive root); authoring backlog + authoring front door (root AGENTS.md/CLAUDE.md) + builds/ + the archive itself are absent (they live outside wip/). Files: src/cli.ts, test/integration/cli.build.e2e.test.ts, +packager.ts jsdoc fix (orchestrator). NITS (non-blocking): build publish builds/ write is correct but untested (no publish e2e; out of AC89 scope). CARRY-FORWARD task-90: archive still ships wip/_AGENTS.md verbatim -> strip to AGENTS.md + per-bundle front doors; the e2e AGENTS.md-absent assertion correctly distinguishes the authoring front door from the shipped _AGENTS.md today.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
