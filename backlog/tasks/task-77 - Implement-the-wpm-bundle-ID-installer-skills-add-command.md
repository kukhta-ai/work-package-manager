---
id: TASK-77
title: Implement the wpm bundle ID installer-skills add command
status: Done
assignee: []
created_date: '2026-06-01 02:23'
updated_date: '2026-06-01 18:45'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): registers a bundle-scoped install-time helper skill. With an existing SKILL.md it attaches after validating frontmatter; with none and no --path it scaffolds a stub from the project template snippet and materialises a content task (doc 11); ensures the bundle installer-skills scope aliases exist. Structure-not-content.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When a SKILL.md exists at the resolved path (default bundles/id/installer-skills/name/SKILL.md) or the --path location, its frontmatter is validated and the reference is registered.
- [x] #2 When none exists and no --path is given, a stub with frontmatter plus a placeholder description and no invented prose is rendered at the conventional path, a content-authoring task naming the bundle is materialised, and the reference is registered.
- [x] #3 When --path is given but nothing exists there, the command fails with a typed error directing the author to omit --path to scaffold.
- [x] #4 The bundle installer-skills scope aliases are ensured to exist, created if absent.
- [x] #5 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles.
- [x] #6 Help output is substantive (description, synopsis, the name positional and --path, an example); on success it prints what it did and exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle id installer-skills add. BMAD skills: bmad-create-story/dev-story/qa-generate-e2e-tests (worker9); bmad-story-automator-review (reviewer APPROVE). Reuses the O skill-refs core (attach/scaffold/error 3-way + frontmatter) via BUNDLE_INSTALLER_SKILLS_DESCRIPTOR; snippet installer-skill.SKILL.md.tmpl; scaffold materialises Write content for install-time skill name in id. Registry: bundle.yml TOP-LEVEL installerSkills (sibling of payload, since installer-skills are not delivered payload per doc-06:77/07:51), name+path entries, absent maps to empty. AC77#4 scope-alias ensure is RERENDER-covered (scopePlan ensures bundles/id/.claude/skills on every mutation; the no-targets edge succeeds with no alias, not an error). Verified on the real binary. Gate 1009.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
