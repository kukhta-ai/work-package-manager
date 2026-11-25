---
id: TASK-102
title: Make a bundle's install-backlog resolvable by the Backlog.md CLI
status: Done
assignee: []
created_date: '2026-06-08 00:16'
updated_date: '2026-06-08 11:20'
labels:
  - authoring-context
  - bug
  - product
dependencies: []
ordinal: 102000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Running the Backlog.md CLI from within a bundle operates on that bundle's install-backlog without a manual workaround
- [x] #2 Authoring a recipe task (create/edit/label) from within a bundle persists to that bundle's install-backlog tasks
- [x] #3 The authoring docs' worked recipe-authoring commands run as written, both at authoring time and when the executor works the recipe at install time
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
FIXED. Worker a5ea3230 (create/dev-story fell back to brief-driven). Reviewer = SEPARATE subagent ab32f150 -> APPROVE: independently re-verified the archive + all 3 ACs regression-tested, core pure + fake-real parity clean, all bundle paths covered, skill workaround removed, doc-06 additive, no lost coverage. Root cause: Backlog.md resolves a backlog/ dir; install-backlog/ isn't one. FIX: relative 'backlog -> install-backlog' symlink per bundle, created by bundle new + init (incl. bundles/bundle-template/ + preincluded bundles) via the FileSystem port (ensureAlias); relative-symlink support added to src/util/symlink.ts + memory-fs (fake-real parity). build.ts shippableFiles records the symlink as a non-traversed LEAF (anchored regex ^bundles/[^/]+/backlog$ + NodeFileSystem classifies a symlink as a file) so install-backlog ships ONCE (no double-include). Skill workaround dropped (clean 'cd wip/bundles/<id> && backlog ...' now works); doc-06 gains a one-line backlog-alias note. VERIFIED end-to-end: authoring resolves w/o manual symlink; built archive has bundles/<id>/backlog(symlink->install-backlog) + install-backlog ONCE; EXTRACTED archive resolves 'cd bundles/<id> && backlog task list' (executor install-time flow). Gate: tsc/biome clean (196 files), fast 1083 passed, 5 affected e2e suites 118 passed. NIT (non-blocking): readDirTree clone-skip matches basename 'backlog' at any depth (a payload entry literally named backlog would be skipped) -- pathological, left.
<!-- SECTION:NOTES:END -->
