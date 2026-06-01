---
id: TASK-45
title: Implement the wpm project installer-skills add command
status: Done
assignee: []
created_date: '2026-06-01 02:19'
updated_date: '2026-06-01 18:45'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): registers a project-scoped install-time helper skill at root. With an existing SKILL.md it attaches and registers; with none it scaffolds a stub from the project template snippet and materialises a content-authoring task (doc 11). Add means attach-or-scaffold, never author finished prose (structure-not-content).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When a SKILL.md exists at the resolved path or the --path location, its frontmatter is validated and the reference is registered at root scope.
- [x] #2 When none exists and no --path is given, a stub is rendered at installer-skills/name/SKILL.md from the project template installer-skill snippet (frontmatter plus placeholder body, no invented prose) and a content-authoring task is materialised and registered.
- [x] #3 When --path is given but nothing exists there, the command fails with a typed error directing the author to omit --path to scaffold.
- [x] #4 A name ending in -advisor or matching the main installer skill name is refused as reserved.
- [x] #5 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override.
- [x] #6 Help output is substantive (description, synopsis, the name positional and --path, an example); on success it prints what it did (attached, or scaffolded with the task id) and exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
project installer-skills add. Skills: bmad-create-story/dev-story/qa (worker9); bmad-story-automator-review APPROVE. F = project-scoped twin under projectModule (root installer-skills/, manifest.yml installerSkills registry, installer-skills-project.ts mirrors version.ts manifest-edit). Same 3-way as O. AC45#4 reserved-name refusal: isReservedInstallerSkillName refuses names ending in -advisor or matching the main installer skill name (manifest.meta.name plus -installer, NOT hardcoded), enforced in both the CLI shell and the spec check, to UsageError exit 2. Verified on the real binary (demo-installer and web-advisor exit 2). Gate 1009.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
