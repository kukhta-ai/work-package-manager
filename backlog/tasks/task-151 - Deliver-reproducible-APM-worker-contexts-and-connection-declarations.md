---
id: TASK-151
title: Deliver reproducible APM worker contexts and connection declarations
status: In Progress
assignee: []
created_date: '2026-11-25T19:23:17Z'
updated_date: '2026-11-25T20:35:41Z'
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
  - groma/externals/apm-cli.md
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
Base2504a748; branch feat/vnext-apm-workers. Skills:wpm-repo-dev/test/architecture/review. Source1a1135e8bfecbf4600d7c56550638324909121f2 full quality:ci PASS178files2644passed2existinghostconditional skips. Its isolated savedSDK SHA256d060b65e3f884c317c991d0395b3313d80780545a7ec9e2e469701fb698b5847 passes native0.39 local/transitive/pinned-remote, bothnativeconfigparsers, network-deniedoffline, relocation, graph2/import3; independently verified artifact/source affinity. Closeout review then found stale MCP after removing all declarations: minimal adapter fix preflights exact prior hashes and regularfiles for BOTH managedpaths before any MCP effects, retires owned outputs or replaces complete projection; explicitretry preserves foreignfiles. New14regressions: red8fail/6pass, fixed4files87PASS; purecore unchanged. Existing1333mutants disposition unchanged2waivers, Ajv equivalence independently approved10556comparisons. Next: independent bounded lifecyclefixreview, fresh stable-source quality:ci, updated actualsavedSDK native/graph/remote-wrapper/retirement proofs, then finalcleancommitted private candidate(fullquality:release) and exact-byte review. PriorSDK is baselineonly afterfix; no model/authentication or work-operation execution claimed. PR10draft/publicdistributioninactive.

Lifecycle fix independent bounded review PASS; independent14regressions PASS, quality:fast PASS135modules. Top-level remote setup source actual saved-SDK baseline probe PASS with add-only declaration delta, exact commit and both targets. Refresh all SDK evidence after the adapter fix; old SDK digest is baseline only.
<!-- SECTION:NOTES:END -->
