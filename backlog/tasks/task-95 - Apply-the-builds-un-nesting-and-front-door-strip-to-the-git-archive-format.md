---
id: TASK-95
title: Apply the build's un-nesting and front-door strip to the git archive format
status: To Do
assignee: []
created_date: '2026-06-07 06:29'
labels:
  - authoring-workspace
  - follow-up
  - build
dependencies: []
ordinal: 95000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A git-format build produces an archive whose root is the un-nested deliverable, identical in layout to the tarball and zip formats for the same project state.
- [ ] #2 The git-format archive excludes the workspace wrapper (authoring front door, authoring backlog, build-output directory) and disabled bundle directories.
- [ ] #3 The git-format archive contains the executor front door only under its canonical stripped name (AGENTS.md plus per-target aliases), never the reserved _AGENTS.md prefix.
- [ ] #4 Building the same project state in any supported format yields the same archive layout.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
