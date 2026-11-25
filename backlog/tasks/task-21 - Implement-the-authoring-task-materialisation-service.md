---
id: TASK-21
title: Implement the authoring-task materialisation service
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 02:11'
labels: []
dependencies:
  - TASK-14
ordinal: 21000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given a set of authoring-task specifications, a task is created for each whose title does not already exist (doc 11)
- [x] #2 Running the same materialisation again creates nothing and changes nothing
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Materialisation engine src/core/services/materialisation.ts (PURE consumer of the BacklogMd PORT: imports only the port interface + the task-10 model -- NOT the backlog-cli adapter/execa/node:fs; boundary-clean). materialiseAuthoringTasks(backlog, root, specs) -> {created: TaskSummary[], skipped: string[]}: reads existing titles ONCE via listTasks, creates a task per NEW title (carrying its acceptanceCriteria) via createTask, skips present ones -- TITLE is the idempotency key (doc 11). First run creates all; an identical re-run creates NOTHING and leaves the backlog unchanged (AC#1/AC#2); within-batch dedup (same title twice in one batch -> created once via the seen-set). Scoped to the creation MECHANISM (the per-command catalogs / the optional pure planAuthoringTasks ship with command leaves later -- deliberately skipped to avoid dead code). SKILLS RUN (Rule 3): worker bmad-create-story + bmad-dev-story + bmad-qa-generate-e2e-tests (all head-less, sprint-status suppressed); reviewer bmad-story-automator-review (report-only) -> APPROVE. Idempotency proven against BOTH the FakeBacklog AND the REAL backlog CLI (env-isolated HOME/XDG, skip-if-unavailable -- reuses the task-14 isolation; no regression, task-14 adapter tests still 13/13). No new deps. Gate green (tsc 0 / biome 80 / vitest 295 / npm ci clean, single process). 1 non-blocking NIT [F1]: skipped[] may repeat a title that appears multiple times in one specs batch (cosmetic; the created list + no-duplicate-creation invariant are unaffected; skipped is informational and the operation reads created).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
