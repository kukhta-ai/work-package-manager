---
id: TASK-16
title: Implement the template render engine
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 00:54'
labels: []
dependencies:
  - TASK-11
ordinal: 16000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given a template's file tree and a set of parameter values, the corresponding output files are produced with every placeholder substituted (doc 13)
- [x] #2 Rendering performs substitution only — no conditional logic and no computed content (Structure-not-Content, doc 10)
- [x] #3 Files meant to be placed at initialisation and snippets meant to be produced on demand are distinguishable and handled accordingly (doc 12)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Template render engine src/core/services/render.ts (PURE, model-only import, no fs): renderTree (init-time batch) + renderSnippet (on-demand) substitute {{kebab-name}} placeholders in BOTH content and path, strip the trailing .tmpl, and fail-loud (descriptive Error naming placeholder + file + path-vs-content) on any unresolved param OR logic-like token. AC#1 every placeholder substituted; AC#2 substitution-ONLY enforced STRUCTURALLY via two regexes (PLACEHOLDER matches only strict {{[a-z0-9]+(-[a-z0-9]+)*}}, then a leftover-brace check rejects ANY remaining {{...}} so #if/#each/> partial/spaces/second-order-injection ALL error, never interpreted); AC#3 init-files vs on-demand-snippets = distinct entry points sharing one renderFile core. SKILLS RUN (Rule 3): worker invoked bmad-create-story + bmad-dev-story + bmad-qa-generate-e2e-tests (impl) and bmad-dev-story (cycle-1 fix) -- all loaded/ran head-less, sprint-status writes suppressed; reviewer invoked bmad-story-automator-review (report-only) -> APPROVE, adversarially probed 14 logic/non-kebab constructs + injection (all rejected -> AC#2 airtight). Cycle-1 fixed [SHOULD] deprecated toThrowError -> toThrow (7x). 2 NITs left confirmed-fine (no literal double-brace escape; param-with-braces rejection = correct secure). Pure (boundary clean); throw-descriptive-Error (mapped to DomainError at task-23). No new deps. Gate green (tsc 0 / biome 63 / vitest 217 / npm ci clean).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
