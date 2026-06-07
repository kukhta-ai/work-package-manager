---
id: TASK-90
title: Author the deliverable executor front door under a build-stripped prefix
status: To Do
assignee: []
created_date: '2026-06-06 23:38'
updated_date: '2026-06-06 23:55'
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
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The deliverable executor front door is author-owned content the author can edit, stored under a reserved name that agent auto-discovery does not load.
- [ ] #2 The build restores the executor front door to its canonical name (AGENTS.md, with the CLAUDE.md alias) at the corresponding location in the archive.
- [ ] #3 During authoring, no deliverable front door is auto-discovered under a canonical agent-surface name that contradicts the authoring front door, at the project root or in any bundle.
- [ ] #4 The reserved-prefix convention is documented where the author will see it, so an edit to the front door is not mistaken for a stray file.
- [ ] #5 A file authored under the reserved prefix appears in the archive only under its canonical stripped name, never under both names.
- [ ] #6 Author edits to the prefixed front door appear verbatim in the built archive; the build does not regenerate or overwrite the content.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved prefix decided in TASK-86 notes: leading underscore -> _AGENTS.md (per-bundle _AGENTS.md), build strips it to canonical AGENTS.md + CLAUDE.md/GEMINI.md aliases. Discovery is exact-basename across Claude Code/Codex/Gemini/Cursor, so _AGENTS.md is never auto-loaded; it stays .md and author-editable.
<!-- SECTION:NOTES:END -->
