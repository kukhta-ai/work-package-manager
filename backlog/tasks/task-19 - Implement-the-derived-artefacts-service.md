---
id: TASK-19
title: Implement the derived-artefacts service
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 01:50'
labels: []
dependencies:
  - TASK-11
  - TASK-16
ordinal: 19000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given a project, the always-read front-door file, the orchestrator skill, and the set of scope aliases that should exist are derived from it (doc 13)
- [x] #2 The derived aliases correspond to the project's declared target agents, at both project and bundle level
- [x] #3 Deriving twice from the same project yields identical results, and re-deriving onto an already-current project changes nothing
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Derived-artefacts service src/core/services/derived-artefacts.ts + agent-aliases.ts (BOTH pure: render(task-16)/model(task-10)/alias-map/node:path only; boundary-clean). agent-aliases.ts: ALIAS_PATHS grounded in doc 05 lines 114-119 (claude-code->.claude/skills; codex+hermes->.agents/skills consolidating standard; openclaw->.openclaw/skills; NEVER a bare skills/ per doc 05 line 131); unknown agent -> undefined (surfaced, not guessed). deriveArtefacts(project, snippets): DETERMINISTIC pure projection -- params from the Project (project-name from manifest.meta.name; {{bundles}} = one '- <summary>' line per enabled bundle in MANIFEST ORDER, ghost-id skipped), renders front-door AGENTS.md + the <project>-installer orchestrator skill (incl {{project-name}} in the orchestrator PATH) via task-16 renderSnippet -> DesiredArtefacts {files, aliasPlan} (AC#1). scopePlan(targets, bundleIds): per known target a root alias + one per bundle (self-similar surfaces, doc 06) = N x (1+M); unknownTargets surfaced (AC#2). planChanges(desired, current-as-data): only the delta -- file byte-compare (skip if matching), alias linkPath existence (skip if present) -> EMPTY ChangeSet when current matches -> re-derive onto a current project is a no-op (AC#3; current supplied as DATA by the operation so the service stays PURE, realizing doc 13 §4 'operation diffs against reality'). Determinism 3x deep-equal; full RERENDER round (derive->apply->re-derive->empty) verified. SKILLS RUN (Rule 3): worker bmad-create-story + bmad-dev-story + bmad-qa-generate-e2e-tests (all head-less, sprint-status suppressed); reviewer bmad-story-automator-review (report-only) -> APPROVE. No new deps. Gate green (tsc 0 / biome 74 / vitest 275 / npm ci clean, single process). 2 non-blocking NITs left (both intentional/defensible): F1 alias diff by linkPath EXISTENCE only -- a corrupted alias pointing at the wrong target is not repaired (out of scope for idempotent re-derive; repair is a separate concern); F2 unresolved-placeholder error surfaces front-door before orchestrator (fail-fast on a build-time tasks-30/31 authoring bug).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
