---
id: TASK-151
title: Deliver reproducible APM worker contexts and connection declarations
status: Done
assignee: []
created_date: '2026-11-25T19:23:17Z'
updated_date: '2026-11-25T20:58:34Z'
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
- [x] #4 The saved SDK archive passes real APM0.39.0 local and remote qualification, native configuration checks and the required full quality band.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation source: 5847ccb3d02a91419dbe019f99b5de73cdb70403; base2504a748, branch feat/vnext-apm-workers, PR10. Skills: wpm-repo-dev/test/architecture/review. npm run quality:ci PASS:178files,2665passed,2existinghost-conditional skips (Go cleanup host and native Windows no-replace publication). quality:fast/agents/135-module architecture PASS; critical1333mutants accepted,unreviewed0, unchanged2existing dispositions. Existing exact Ajv equivalence independently reviewed with10556comparisons. Isolated committed producer saved SDK SHA2560edd1905e08854856ec3448c0cae67203fef05c836689b8960d9bcfc37d11e1d (809762bytes) installed normally with explicit Backlog.md1.57.4. Actual APM0.39 local/transitive/exactremote, top-level remote setup declaration+prepare, both native MCP configuration parsers, network-denied offline replay, relocation, graph2/frozenimport3 and41-command remote+MCPretirement journey PASS. Independent code and exact artifact/evidence audits ACCEPTED;14ownership/retry regressions and7empty-lock regressions PASS. Native empty-graph format1 is accepted narrowly with exact original byte bindings; MCP removal retires only owned outputs. Limitations: no model/session instruction execution or production authentication; graph recipient proof is static(workOperations0); standalone MCP-only without compilable native context stays unprepared, registry-only unresolved MCP/plugins/LSP/managed agents outside scope. Raw reports are local private working memory in /workspace/active/wpm-apm-preflight-5847ccb-20261125 and ignored .quality. Prior2402 gate failed help example (fixed),0f450 gate stopped130 for interoperability fix, neither substitutes for the passed5847 gate. Next action: metadata-only closeout commit, final clean-source candidate:prepare(full quality:release), verify SDK byte affinity and independent candidate envelope review; retain private receipt and update PR10. Public distribution remains inactive; no merge/tag/publish.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered reproducible APM0.39 worker contexts and secret-free MCP declarations for both hosts, with owned retirement/recovery and native empty-lock interoperability. Stable implementation full CI and actual saved-SDK native/graph/remote/retirement qualification passed; final private candidate envelope follows the clean metadata-only closeout.
<!-- SECTION:FINAL_SUMMARY:END -->
