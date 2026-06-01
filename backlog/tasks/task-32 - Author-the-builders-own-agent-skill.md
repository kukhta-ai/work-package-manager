---
id: TASK-32
title: Author the builder's own agent skill
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 09:41'
labels: []
dependencies:
  - TASK-9
ordinal: 32000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An agent reading the builder's own skill can drive the command-line surface to author a bundle-project without external instruction (doc 12)
- [x] #2 The skill activates on intents like authoring a bundle-project or building an installer, and conveys the SDLC-agnostic and thin-builder principles (doc 13)
- [x] #3 Detailed material is reachable on demand rather than front-loaded (progressive disclosure, doc 05)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Authored the builder's own agent skill at agent-skills/installer-builder/ (doc 12 §builder's-own-skill). SKILL.md (lean, 84 lines) -- frontmatter description fires on the authoring/build-an-installer intents; body teaches the CLI arc (wpm init -> bundle new -> fill install-backlog via Backlog.md directly -> register payload -> build) + the surface-responsibility split, and conveys BOTH doc-13 §0 principles substantively (thin-builder/fat-agent: wpm never runs an install, embeds no runtime, the agent does the authoring; SDLC-agnostic: no built-in process, disciplines are vendored as content). references/ (the on-demand depth, doc 05 progressive disclosure): command-reference.md (doc 10 compressed), authoring-workflow.md (doc 11 compressed: the arc + the .authoring-backlog/ + self-attested Done), conventions.md (doc 08: V2 kind:/step:/-m tagging + the Backlog.md flag rules + structure-not-content/no-mirror). Static content (about wpm itself, no placeholders); builder-side skill kept distinct from the install-side per-project installer skill (task-30). agent-skills/ added to package.json files (npm pack ships all four). BMAD skills (reliable fresh worker): create-story, dev-story, qa-generate-e2e-tests via the Skill tool. Reviewer ran story-automator-review -> APPROVE with ZERO findings (exhaustively cross-checked every command/flag/template-name/convention vs doc 10/11/08 -- nothing inaccurate that would mislead an authoring agent). Gate: tsc 0, biome 0 warnings, vitest 469 passed, npm ci 0.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
