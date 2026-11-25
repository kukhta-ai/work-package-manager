---
id: TASK-151
title: Deliver reproducible APM worker contexts and connection declarations
status: In Progress
assignee: []
created_date: '2026-11-25T19:23:17Z'
updated_date: '2026-11-25T19:57:47Z'
labels: []
dependencies: []
references:
  - apm
  - docs/vnext.md
  - docs/vnext-apm.md
modified_files:
  - src/vnext/adapters/apm.ts
  - test/integration/vnext-apm.test.ts
  - scripts/qualify-apm.mjs
  - src/vnext/core/model.ts
  - src/vnext/core/apm-source.ts
  - src/vnext/core/worker-context.ts
  - src/vnext/adapters/workspace.ts
  - test/unit/vnext/worker-context.test.ts
  - src/vnext/cli.ts
  - test/integration/vnext-apm-workers.test.ts
  - src/vnext/adapters/package-workspace.ts
  - src/vnext/package-cli.ts
  - src/vnext/adapters/apm-source-tree.ts
  - test/integration/vnext-apm-source-tree.test.ts
  - test/unit/vnext/apm-source.test.ts
  - test/integration/vnext-apm-boundaries.test.ts
  - docs/vnext-apm.md
  - docs/vnext.md
  - docs/vnext-coverage.md
  - .changeset/fast-mails-write.md
  - groma/systems/wpm/containers/wpm-cli/components/apm-source-tree.md
  - groma/systems/wpm/containers/wpm-cli/components/apm-source.md
  - groma/systems/wpm/containers/wpm-cli/components/worker-context.md
  - groma/systems/wpm/containers/wpm-cli/components/apm.md
  - quality/mutation-waivers.json
  - groma/systems/wpm/containers/wpm-cli/components/vnext-contract.md
  - groma/systems/wpm/containers/wpm-cli/components/package-workspace.md
ordinal: 151000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the approved APM worker plan: pin0.39.0, local/remote source resolution and cache replay, Codex/Claude project and session projections, MCP declarations without secret material, recovery and graph-release qualification. No plugins, LSP, lifecycle execution or managed agents.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Authors can resolve, preserve, upgrade and replay local and remote APM setup dependencies using exact content evidence.
- [x] #2 Codex and Claude Code receive isolated instructions, skills and MCP declarations without embedded secrets, with explicit project/session loading requirements.
- [x] #3 Interrupted operations recover without adopting foreign files; stale or changed contexts cannot enter package graph releases.
- [ ] #4 The saved SDK archive passes real APM0.39.0 local and remote qualification, native configuration checks and the required full quality band.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Base2504a7483b39ce20c15a74be16307eac9edc2d83; branch feat/vnext-apm-workers. Implemented APM0.39.0 local/remote resolution and staging, approved distribution pins, secret-free MCP, project/session support, offline prepared-image recovery and canonical graph-import checks. quality:doctor PASS; quality:fast PASS135modules; focused6files238tests PASS; real live6 qualifier PASS local/transitive/public exact remote, both native client parsers, network-denied replay and relocation/reprepare. Latest directory delta focused67tests PASS. Independent review accepted material fixes; existing Ajv equivalence renewed10556comparisons, waiver count2 unchanged. Frozen critical1333mutants accepted1317killed9timeout2reviewed5staticerrors, unreviewed0. Next: stable full quality:ci, clean committed candidate:prepare(fullquality:release), same saved SDK APM/graph journeys and exact digest review. Final candidate/hosted qualification not yet claimed.
<!-- SECTION:NOTES:END -->
