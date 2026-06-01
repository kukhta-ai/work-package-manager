---
id: TASK-26
title: Implement one representative operation end-to-end through the lifecycle
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 03:50'
labels: []
dependencies:
  - TASK-17
  - TASK-25
ordinal: 26000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One state-changing operation works end to end through the shared sequence — validating input, producing files from a template, recording the change in the project, re-deriving artefacts, and materialising its authoring tasks (doc 13)
- [x] #2 Its reported result and its effects on the project are observable without involving the command-line surface
- [x] #3 It demonstrates that an operation composes the services and abstractions correctly, ahead of any per-command work
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented createBundle (the bundle new use case, doc 10) as the representative operation through the task-25 harness, plus the concrete makeArtefactDeriver (doc 13 sec 5 step 4: resolve the project template snippets via task-17, then call task-19 deriveArtefacts). Six beats: CHECK validates id, duplicate, and version (all input validated before any effect, beat-purity); APPLY resolves and renders the bundle template (task-17 plus task-16), writes the canonical bundle.yml, and appends the id to manifest.yml comment-preservingly (task-13 editYaml); RERENDER (automatic) re-derives the front-door now listing the new bundle plus the non-broken per-bundle scope aliases; MATERIALISE creates the doc-11 sec-3 per-bundle authoring catalog verbatim (12 tasks with advisor, 11 with --no-advisor); RESULT. Observable end-to-end with NO CLI (AC2). BMAD skills: worker ran create-story, dev-story, qa-generate-e2e-tests, then dev-story again for review polish; reviewer ran story-automator-review, verdict APPROVE. Key decision: the OPERATION owns bundle.yml canonically (structural source of truth for id, version, requires, confirmation); forward note recorded for task-31 - the real bundle template must omit files/bundle.yml or it gets render-then-clobbered. Polish: version validation moved into CHECK; bad-version test added. Gate: tsc 0, biome 0 warnings, vitest 391 passed, npm ci 0.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
