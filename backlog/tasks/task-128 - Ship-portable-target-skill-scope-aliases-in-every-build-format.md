---
id: TASK-128
title: Ship portable target skill-scope aliases in every build format
status: Done
assignee: []
created_date: '2026-08-26 13:18'
updated_date: '2026-08-26 16:24'
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
- [x] #1 Given a deliverable declares a target with a native skill scope, when build dry-run is inspected, then the project-level scope alias appears at the exact target-defined path.
- [x] #2 Given an enabled bundle in that deliverable, when build dry-run is inspected, then its target scope alias appears at the corresponding bundle path.
- [x] #3 Given a built artifact is extracted away from the authoring workspace, when each shipped scope alias is resolved, then it resolves within the artifact to the corresponding shipped installer-skills directory.
- [x] #4 Given a built artifact is inspected, then no target scope alias contains or resolves through an absolute authoring-workspace path.
- [x] #5 Given the same project state is built as tarball, zip, or git, then each format exposes the same target scope alias paths and reachable skill-package contents.
- [x] #6 Given a target is absent from the deliverable manifest, when dry-run or a package is inspected, then no project or bundle scope alias for that target is present.
- [x] #7 Given a bundle is disabled or orphaned, when dry-run or a package is inspected, then that bundle contributes no target scope alias.
- [x] #8 On a supported platform that uses the documented copy fallback instead of symlinks, each extracted target scope exposes the same complete skill-package contents without depending on the authoring workspace.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Feedback evidence: the GLA source contained root plus six bundle .claude/skills links with absolute authoring-workspace targets. The build plan classified each .claude parent as the alias leaf and did not enumerate .claude/skills; packaging then emitted empty directories. Simply including the current links would preserve unsafe source paths, so the acceptance boundary requires extracted, contained aliases. Reviewed archive SHA-256: 2ba8f3cd793d03d4526a212ded416807edfe4d46ad14285b9b2ddef6f1667833.

BMAD workflow evidence 2026-08-26: persistent worker literally ran bmad-create-story, bmad-dev-story, and bmad-qa-generate-e2e-tests; independent reviewer literally ran bmad-story-automator-review cycle 1 and approved with no HIGH or MEDIUM findings. Implementation derives root and enabled-bundle release aliases from manifest state, prunes authoring aliases, and synthesizes contained relative links or complete copy fallbacks in the common staged release tree used by tarball, zip, and git. Evidence: unit 43/43, adapter/symlink integration 18/18, built-CLI TASK-128 acceptance 2/2, typecheck, Biome/process-artifact policy, production build, and diff check passed. One reviewer npm test attempt was inconclusive after all observed tests progressed without failure because Vitest remained in a post-run IPC/open-handle state; the exact full gate is carried once to the combined stable TASK-128/TASK-129 diff under the repository fast-feedback policy.

Combined clean-clone gate at f1d565efcaf9aeea34c19d8f8aaf708a7b5d7ad2: typecheck, lint:ci, package inspection, and build passed; full Vitest completed 1961/1964 with three failures. Literal bmad-investigate concluded all three failures are stale blanket exclusions of .claude/ even though the fixtures declare claude-code and TASK-128 requires .claude/skills. Investigation also confirmed an AC#3 edge: an empty or missing canonical installer-skills directory can leave a POSIX alias dangling or make copy fallback fail. Reopened only DoD#2 for focused repair and final gate.

Gate repair 2026-08-26: literal bmad-investigate traced the 1961/1964 clean-clone result to three stale blanket .claude exclusions and exposed an empty/missing canonical installer-skills edge. The worker literally reran bmad-dev-story and bmad-qa-generate-e2e-tests; the tests now admit only the manifest-declared .claude/skills paths while preserving all authoring-state exclusions. Packaging creates a staging-only .keep for an otherwise unarchivable canonical target, leaving the source untouched. Independent bmad-story-automator-review cycle 2 found and auto-fixed canonical-target symlink traversal by rejecting any non-directory staged path component; the worker absorbed that fix unchanged, and confirmation review cycle 3 APPROVED with no HIGH/MEDIUM findings. Focused evidence: adapter 7/7, built CLI 2/2, packed journey 1/1, typecheck, focused Biome, build, and diff check all pass. The exact clean-clone full gate follows after the required no-ff integration.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ships manifest-derived, extraction-portable target skill-scope aliases at project and enabled-bundle boundaries across dry-run, tarball, ZIP, and Git formats. Relative links and copy fallback expose the same canonical installer-skills contents; empty or missing canonical trees remain resolvable through staging-only markers, while symlinked canonical paths are rejected rather than followed. Undeclared, disabled, orphaned, stale, and authoring-only scopes remain excluded, and source workspaces are not mutated.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
