---
id: TASK-95
title: Apply the build's un-nesting and front-door strip to the git archive format
status: Done
assignee: []
created_date: '2026-06-07 06:29'
updated_date: '2026-08-19 16:30'
labels:
  - authoring-workspace
  - follow-up
  - build
dependencies: []
ordinal: 95000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A git-format build produces an archive whose root is the un-nested deliverable, identical in layout to the tarball and zip formats for the same project state.
- [x] #2 The git-format archive excludes the workspace wrapper (authoring front door, authoring backlog, build-output directory) and disabled bundle directories.
- [x] #3 The git-format archive contains the executor front door only under its canonical stripped name (AGENTS.md plus per-target aliases), never the reserved _AGENTS.md prefix.
- [x] #4 Building the same project state in any supported format yields the same archive layout.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD evidence 2026-08-19: persistent worker invoked bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests, then bmad-dev-story again to absorb review fixes; separate reviewer invoked bmad-story-automator-review in two cycles. Implementation: git format now archives an isolated temporary Git tree built from the exact transformed PackageRequest file set, independent of source HEAD; highest-precedence attributes neutralize Git byte transforms; zip uses symlink-preserving mode for cross-format parity. Review cycle 1 fixed two HIGH portability defects and one MEDIUM test weakness; cycle 2 clean APPROVE. Evidence: typecheck PASS, Biome 197 files PASS, build PASS, adapter 10/10, TASK-95 built-CLI E2E 1/1, full Vitest 1237/1237 across 97 files, diff-check PASS. Local environment lacked real zip/unzip; deterministic option regression covers symlink mode and the real three-format parity test runs conditionally where tools exist.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
