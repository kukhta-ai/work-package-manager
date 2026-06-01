---
id: TASK-74
title: Implement the wpm bundle ID skills add command
status: To Do
assignee: []
created_date: '2026-06-01 02:23'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): registers a payload runtime agent skill (the delivered product). With an existing SKILL.md it attaches after validating frontmatter; with none and no --path it scaffolds a payload-skill stub from the template snippet and materialises a write-payload-skill task (doc 11); registers either way. Structure-not-content: never authors the skill body.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When a SKILL.md exists at the resolved path (default payload/agent-skills/name/SKILL.md) or the --path location, its frontmatter is validated and the reference is registered.
- [ ] #2 When none exists and no --path is given, a payload-skill stub with frontmatter plus a placeholder runtime-trigger description and no invented prose is rendered at the conventional path, a write-payload-skill task is materialised, and the reference is registered.
- [ ] #3 When --path is given but nothing exists there, the command fails with a typed error.
- [ ] #4 The command prints what it did (attached, or scaffolded with the materialised task id).
- [ ] #5 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles.
- [ ] #6 Help output is substantive (description, synopsis, the name positional and --path, an example); on success exits 0.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
