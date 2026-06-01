---
id: TASK-4
title: 'Define versioning, release, and changelog conventions'
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-31 22:00'
labels: []
dependencies:
  - TASK-1
ordinal: 4000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A contributor can determine, for any change, whether it is a major, minor, or patch release of the builder
- [x] #2 The steps from tagging a version to a published release are documented (doc 12)
- [x] #3 Release history is recorded in a human-readable changelog with an in-progress section for unreleased changes
- [x] #4 The builder's own version is clearly distinguished from the independent versions of the bundles it produces (doc 08)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CONTRIBUTING.md '## Versioning & releases' + CHANGELOG.md. Builder SemVer MAJOR/MINOR/PATCH defined for this tool (breaking CLI/generated-contract / additive / bugfix) + a 'for any change, decide' rule + honest pre-1.0 caveat (AC#1). Builder-vs-bundle decoupling table (AC#4, doc 08): one package.json version vs each bundle's bundle.yml version -- separate lines, cadences, actors, repos; CHANGELOG tracks the builder only. 5-step tag->npm release process (AC#2, doc 12: build-on-tag/publish-on-tagged-release, npm i -g) with an explicit 'release.yml + wpm build publish NOT yet wired -- convention only; task-8 wires the CI test gate' note. CHANGELOG.md in Keep-a-Changelog style with ## [Unreleased], builder 0.1.0 unreleased (AC#3). doc 08 cited for the semver model + decoupling, not misattributed (doc 08 governs bundle versioning). Doc-only: gate green & unchanged (tsc/biome/vitest 7/7), no testable code logic. Self-verified by orchestrator; consistent with task-2/3, anchors resolve.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
