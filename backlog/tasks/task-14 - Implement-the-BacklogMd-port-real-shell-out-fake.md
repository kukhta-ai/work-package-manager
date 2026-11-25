---
id: TASK-14
title: Implement the BacklogMd port (real shell-out + fake)
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 00:30'
labels: []
dependencies:
  - TASK-6
ordinal: 14000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The builder can initialise a backlog and create, list, edit, and archive tasks in it through one replaceable abstraction (doc 13)
- [x] #2 Tasks created this way carry the acceptance criteria, dependencies, labels, and prefixed ids that Backlog.md records, matching the flag mechanics in doc 08
- [x] #3 Logic that uses this abstraction can run in tests without invoking the real Backlog.md tool
- [x] #4 Through this abstraction there is no way to create or edit the content of a bundle's install-backlog — only authoring-side backlogs (doc 13 no-mirror)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BacklogMd port (src/core/ports/backlog.ts, pure interface: init/createTask/listTasks/editTask/archiveTask + TaskSummary/inputs) + real execaSync adapter (src/adapters/backlog-cli.ts via src/util/shell.ts, mapped to live-inspected backlog v1.45.2 flags, explicit cwd per call, argv-array no-shell injection-safe) + faithful in-memory fake (src/adapters/fake-backlog.ts). execa@9.6.1 dep (lockfile synced, npm ci clean). AC#1 one abstraction; AC#2 created tasks carry AC/deps/labels/prefixed-ids that backlog actually records (integration read-back + flag-by-flag vs live --help); AC#3 fake parity, no subprocess; AC#4 no-mirror STRUCTURAL (no recipe-authoring verb; init only prefix/git; every op names root) -- reviewer Acceptance-Auditor confirmed satisfied. SKILLS RUN (Rule 3 evidence): review = bmad-story-automator-review (actual skill, report-only, loaded+ran GREEN in the reviewer subagent -> APPROVE); fix = bmad-dev-story (actual skill, loaded+ran GREEN in the worker subagent). Implementation cycle-0 was FREEHAND (pre-Rule-3; accepted per user 'go forward only'). FEASIBILITY GREEN: subagents CAN invoke bmad-* skills (both review + worker sides validated). REVIEW CYCLE 1 fixed a FLAKE the orchestrator's independent verification caught (reviewer's single run missed it): real-backlog integration tests + task-5's core-boundary test failed under CONCURRENT vitest processes (~1-in-2) on shared external state -- backlog per-machine global config + core-boundary fixed-name fixtures in shared src/core/. Fix (no retry-masking): isolate HOME/XDG_* per-tmpdir for backlog tests (env threaded through runSync+BacklogCli; port stays pure), pid-suffix the boundary fixtures (task-5 carry-over), fileParallelism:false on the integration project. Stress-verified: worker 18 sequential + 16 concurrent green; orchestrator independently 6 concurrent green. Gate green (tsc 0/biome 51/vitest 176/npm ci clean). 3 non-blocking reviewer NITs left (F1 --depends-on/--labels long forms; F2 create-parse status default; F3 post-archive id-parity test).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
