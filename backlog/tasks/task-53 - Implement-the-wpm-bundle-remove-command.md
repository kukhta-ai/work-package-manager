---
id: TASK-53
title: Implement the wpm bundle remove command
status: Done
assignee: []
created_date: '2026-06-01 02:20'
updated_date: '2026-06-01 20:19'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project-bound command (doc 10): full teardown of a bundle. After confirmation, drops it from the manifest, deletes its directory, deletes its advisor stub, archives its authoring tasks, and re-renders derived artefacts. Destructive, so it asks to confirm.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The command requires author confirmation before acting because the operation is destructive.
- [x] #2 On confirmation it removes the id from manifest.yml bundles if present, deletes the bundle directory from disk, deletes the advisor stub at installer-skills/id-advisor/ if present, and archives the authoring tasks whose titles name the bundle.
- [x] #3 Derived artefacts are re-rendered and a summary of what was removed is printed.
- [x] #4 Declining the confirmation makes no change and exits without error.
- [x] #5 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id positional completes from current bundles.
- [x] #6 Help output is substantive (description, synopsis, the id positional, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle remove. BMAD skills: bmad-create-story/dev-story/qa-generate-e2e-tests (worker11); bmad-story-automator-review (reviewer APPROVE). DESTRUCTIVE. New mechanic: author confirmation -- a -y/--yes flag skips, else the CLI shell reads one line via readConfirmation (src/util/confirm.ts); SAFE BY DEFAULT: only an explicit y/yes confirms; empty, garbage, EOF, no-stream and non-TTY all DECLINE (proven: no path proceeds to deletion without yes). On confirm composes: drop id from manifest.bundles + fs.remove bundles/id/ + fs.remove the ROOT advisor stub + archive the bundle authoring tasks whose titles name id + rerender + print. PREFIX-SAFE archive via titleNamesBundle (id bounded by non-id-chars; proven against all 10 doc-11 title shapes and all 7 collision shapes incl web-extra; web 12 archived, web-extra 12 preserved). Declining makes no change exit 0. process.stdin stays in the shell. Verified on the real binary. Gate 1111.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
