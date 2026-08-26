---
id: TASK-128
title: Ship portable target skill-scope aliases in every build format
status: To Do
assignee: []
created_date: '2026-08-26 13:18'
labels:
  - follow-up
  - build
  - packaging
  - scope-aliases
dependencies:
  - TASK-95
references:
  - docs/05-native-agent-surfaces.md
  - docs/06-project-skeleton.md
  - docs/12-builder-architecture.md
priority: high
ordinal: 128000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: Installer-authoring feedback from a real GLA 0.3.0 build at WPM revision 9d28f96903cb3cf9b9cb8765f4f33fd76d07af39 found seven declared Claude Code skill-scope aliases in the authoring tree but zero .claude/skills entries in dry-run or the tarball; the archive contained only empty .claude parents. This prevents root and bundle installer skills from being natively discoverable after extraction.

Boundary: Make the release ship set faithfully include every deliverable target skill-scope alias and keep each alias portable after extraction, with dry-run and all package formats describing the same layout.

Non-goals: Changing the agent-to-scope mapping, adding undeclared deliverable targets, shipping authoring-client wrapper skills, or changing executor front-door alias behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a deliverable declares a target with a native skill scope, when build dry-run is inspected, then the project-level scope alias appears at the exact target-defined path.
- [ ] #2 Given an enabled bundle in that deliverable, when build dry-run is inspected, then its target scope alias appears at the corresponding bundle path.
- [ ] #3 Given a built artifact is extracted away from the authoring workspace, when each shipped scope alias is resolved, then it resolves within the artifact to the corresponding shipped installer-skills directory.
- [ ] #4 Given a built artifact is inspected, then no target scope alias contains or resolves through an absolute authoring-workspace path.
- [ ] #5 Given the same project state is built as tarball, zip, or git, then each format exposes the same target scope alias paths and reachable skill-package contents.
- [ ] #6 Given a target is absent from the deliverable manifest, when dry-run or a package is inspected, then no project or bundle scope alias for that target is present.
- [ ] #7 Given a bundle is disabled or orphaned, when dry-run or a package is inspected, then that bundle contributes no target scope alias.
- [ ] #8 On a supported platform that uses the documented copy fallback instead of symlinks, each extracted target scope exposes the same complete skill-package contents without depending on the authoring workspace.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Feedback evidence: the GLA source contained root plus six bundle .claude/skills links with absolute authoring-workspace targets. The build plan classified each .claude parent as the alias leaf and did not enumerate .claude/skills; packaging then emitted empty directories. Simply including the current links would preserve unsafe source paths, so the acceptance boundary requires extracted, contained aliases. Reviewed archive SHA-256: 2ba8f3cd793d03d4526a212ded416807edfe4d46ad14285b9b2ddef6f1667833.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
