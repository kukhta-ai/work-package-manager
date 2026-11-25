---
id: TASK-145
title: Complete single-package vNext authoring lifecycle
status: In Progress
assignee: []
created_date: '2026-11-25T13:26:00Z'
updated_date: '2026-11-25T14:26:37Z'
labels: []
dependencies: []
references:
  - docs/vnext.md
  - docs/development.md
modified_files:
  - package.json
  - package-lock.json
  - src/vnext/core/authoring.ts
  - src/vnext/adapters/workspace.ts
  - src/vnext/cli.ts
  - src/adapters/backlog-cli.ts
  - test/unit/vnext/authoring.test.ts
  - test/integration/vnext-authoring.test.ts
  - test/integration/vnext-packed.test.ts
  - test/integration/distribution-preparation/packed-install.test.ts
  - agent-skills/wpm-author-recipe/SKILL.md
  - docs/delivery.md
  - test/integration/templates/default-bundle-install-backlog.test.ts
  - test/doubles/fake-backlog.ts
  - AGENTS.md
  - docs/vnext.md
  - test/unit/adapters/backlog-dependencies.test.ts
  - groma/systems/wpm/containers/wpm-cli/components/authoring.md
  - src/core/ports/backlog.ts
  - groma/systems/wpm/containers/wpm-cli/components/vnext-workspace.md
  - docs/groma.md
  - .changeset/smart-lands-melt.md
  - test/integration/cli.bundle-lifecycle.e2e.test.ts
  - agent-skills/wpm-author/SKILL.md
  - test/unit/agent-skills/wpm-author-router-skill.test.ts
  - test/unit/agent-skills/wpm-author-recipe-skill.test.ts
  - test/integration/adapters/backlog-cli.test.ts
ordinal: 145000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Authors can develop native operation drafts, inspect current release readiness, manage groups and setup associations, retire source without losing authored text, and version a package. Preserve existing vNext add and legacy CLI. Native Backlog remains the sole task-content owner.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A native draft can be authored, inspected, finalized and built without checking recipient acceptance criteria.
- [ ] #2 Invalid source and referenced removals fail before effects; interrupted retirement can be resumed without losing source.
- [ ] #3 Group changes preserve prerequisite meaning and version changes invalidate an existing integrity lock.
- [ ] #4 The complete authoring journey works from installed package bytes with native Backlog.md.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User approved task-backed drafts with wpm-authoring:draft and requested latest Backlog.md. npm registry latest resolved to 1.57.4; exact pin and lock updated. Native 1.45.2 probe confirmed drafts cannot be edited by task edit and promotion changes their ID. No global/native Groma SDK version change.

Implementation uses user-approved task-backed drafts with wpm-authoring:draft and persistent wpm-authoring:v1 source-contract label; readiness is recomputed. Upgraded root Backlog CLI to 1.57.4; private Groma SDK remains 1.55.3. Independent authoring_review findings fixed with regression cases: exact +build SemVer, uppercase IDs, malformed journal duplicates/nulls, retained dependencies on retry and true native draft storage. Mutation gate PASS (532 mutants; 521 killed, 8 timeout, 2 existing reviewed equivalents, 1 existing classified schema-init runtime error; no new waivers). Initial full CI stopped on uncovered new mutants, then focused mutation passed after test improvements. Source baseline fdc059814c311283c0b3d4ae8ba51074c627cd56 plus current worktree; full legacy regression and final CI/candidate pending.

Current validation: quality:fast PASS (128 product modules); all unit files PASS (128 files, 1949 passed, 1 existing host-conditional skip); focused vNext integration including installed archive PASS (3 files,26 tests); real legacy bundle-ID E2E PASS (79 tests); legacy bundle lifecycle PASS (7 tests); help and author-skill structural suites PASS. Backlog1.57.4 removes sequence; shipped guidance now uses full list plus native --ready subset, exact JSON dependency snapshots and pre/post-claim edge freshness. Native display graphs are derived, so consumer preservation checks bind unchanged source bytes. Last full CI hit ENOSPC, report truncated at40960bytes; no successful full CI/release/candidate claim. Retired obsolete unreferenced Node24/Bun distributions and npm cache; doctor PASS with active Groma approvals intact. About400MB free; async request for1–2GB or alternate scratch pending. TASK remains In Progress until full gates and private candidate qualify. Source base fdc059814c311283c0b3d4ae8ba51074c627cd56 plus this worktree.

Final compatibility review accepted by authoring_review: ready subset/full snapshot distinction, exact JSON dependencies at freshness and post-claim boundaries, unchanged native source-byte assertions. 3 focused review files/27 tests PASS. Latest complete-band attempt again exhausted disk as npm cache grew~400MB; log40960bytes truncated and gate exit1, not a pass. npm cache cleaned, ~400MB restored; active SDK intact. User confirmed additional space within30min. Draft PR may be opened while full qualification/candidate remain pending; no publication/merge/tag authorization.

Additional exact-root defect reproduced in1.57.4: foreign BACKLOG_CWD redirected createTask despite explicit cwd. Adapter now pins per-process BACKLOG_CWD=resolve(root); view edit reference carries env and docs/skills require scoped binding. Two-root native regression PASS; independent review of adapter delta2files/15tests PASS, installed-vNext plus adapter/wire3files/16tests PASS. User space arrived (~2.3GiB), removing resource blocker; retain active SDK. Final full CI/release/candidate will use new committed revision; prior source qualification is not reused as a pass.
<!-- SECTION:NOTES:END -->
