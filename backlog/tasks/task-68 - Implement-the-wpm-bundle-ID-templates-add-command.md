---
id: TASK-68
title: Implement the wpm bundle ID templates add command
status: Done
assignee: []
created_date: '2026-06-01 02:22'
updated_date: '2026-06-01 16:25'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): registers a parameterised payload template the agent placed under payload/templates (the lower-trust tier). Same shape as files add against payload/templates. Structure-not-content.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When the path exists under the bundle payload/templates, the reference is registered and no file content is written or modified.
- [x] #2 Registering a path that does not exist on disk fails with a typed error and a non-zero exit, registering nothing.
- [x] #3 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the path completes from files present under payload/templates.
- [x] #4 Help output is substantive (description, synopsis, the path positional, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle id templates add. BMAD skills run: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests (worker7); bmad-story-automator-review (reviewer APPROVE). Pure reuse of the Family-L generic payload-refs op via TEMPLATES_DESCRIPTOR (on-disk payload/templates to the payload.templates registry key). add validates the path under payload/templates exists via the fs port at the CLI layer (NotFound exit 1) and registers without writing content. Schema extended via a shared parsePayloadCategory helper (files branch byte-identical, per-category absent maps to empty). doc-10:168 Same as files. Verified on the real binary. Gate 856.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
