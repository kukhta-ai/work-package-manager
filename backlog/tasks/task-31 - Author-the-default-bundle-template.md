---
id: TASK-31
title: Author the default bundle template
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 09:25'
labels: []
dependencies:
  - TASK-16
ordinal: 31000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Adding a bundle from the default template produces a working bundle: its descriptor, its install-backlog gated by a Definition of Done, and its scope notes (doc 07)
- [x] #2 The produced bundle carries a detect-then-setup-then-verify task scaffold (doc 06/09)
- [x] #3 Every placeholder in the template is substituted in the produced bundle
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Authored the real default bundle template at templates/bundle/default/ (doc 06/07/08/09). template.yml (scope bundle) + files/: AGENTS.md.tmpl (per-bundle closest-wins scope notes, distinct from the root front-door); install-backlog/config.yml.tmpl (task_prefix={{bundle-id}} + a definition_of_done of the six doc-07 receipt facts, one-to-one); install-backlog/tasks/ the detect-setup-verify trio as valid Backlog.md task files (kind:state + step:detect/setup/verify labels, deps -2 to -1 and -3 to -2, AC + DoD blocks); installer-skills/.keep (non-broken per-bundle alias target); payload/files,templates/.keep + payload/agent-skills/{{bundle-id}}-skill stub; installer-scripts/.keep. NO files/bundle.yml (createBundle writes it canonically; no double-write -- verified the operation lists it in changedPaths exactly once). AC1-3 verified by running the task-26 createBundle over the REAL template (11 unit) + a real-backlog-CLI integration test in an isolated tmpdir (4 cases: trio lists, labels/AC/deps/DoD read back, check-dod works, task_prefix honored). BMAD skills (fresh worker after the prior session broke): create-story, dev-story, qa-generate-e2e-tests, all via the Skill tool. Reviewer ran story-automator-review, verdict APPROVE (6 probes; doc-conformance verified end-to-end). Fixed the one NIT (a hardcoded web-handoff-1 example in a config.yml comment changed to {{bundle-id}}-1). DIVERGENCE (recorded, surfaced to user): Backlog.md 1.45.2 discovers a root only via backlog.config.yml or a literal backlog//.backlog/ folder, NOT a bare install-backlog/ -- contradicting doc-07 line 67. task-31 ships install-backlog/ per the docs (correct); the discovery reconciliation is execution-time (doc 03/09) + authoring-time (doc 11 cd flow) + a doc-07 refinement, all downstream; NOT a vocabulary change. Gate: tsc 0, biome 0 warnings, vitest 455 passed, npm ci 0.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
