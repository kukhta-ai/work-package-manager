---
id: TASK-142
title: Qualify the protected Groma fork and confidential exports in WPM
status: Done
assignee: []
created_date: '2026-11-06 11:09'
updated_date: '2026-11-25 02:24'
labels: []
dependencies:
  - TASK-141
  - TASK-143
modified_files:
  - scripts/groma-runtime.mjs
  - quality/groma-runtime.json
  - test/unit/groma-runtime.test.ts
  - scripts/groma.mjs
  - scripts/quality.mjs
  - package.json
  - AGENTS.md
  - .agents/skills/wpm-repo-architecture/SKILL.md
  - .claude/skills/wpm-repo-architecture/SKILL.md
  - docs/development.md
  - .github/workflows/ci.yml
  - .github/workflows/candidate.yml
  - test/unit/groma-contract.test.ts
  - quality/groma-sdk/typescript/package.json
  - quality/groma-sdk/typescript/bun.lock
  - quality/groma-sdk/backlog/package.json
  - quality/groma-sdk/backlog/bun.lock
  - test/unit/quality-orchestration.test.ts
  - test/unit/agents.test.ts
  - test/unit/candidate-publint.test.ts
  - test/unit/security-contract.test.ts
  - src/adapters/packager.ts
  - src/vnext/adapters/workspace.ts
  - test/integration/environment-isolation.test.ts
  - test/integration/cli.build.e2e.test.ts
  - test/integration/vnext-workspace.test.ts
  - test/integration/vnext-packed.test.ts
  - test/integration/adapters/packager.test.ts
  - test/integration/distribution-preparation/package-preparation.test.ts
  - test/integration/distribution-preparation/packed-install.test.ts
  - package-lock.json
  - scripts/quality-tools.mjs
  - test/unit/quality.test.ts
  - test/helpers/integration-environment.ts
  - vitest.config.ts
  - groma/config.json
  - research/evolution/records/wpm-vnext-protected-tooling.yaml
  - research/evolution/gates/wpm-vnext-e88c2ba-local.json
  - research/evolution/gates/wpm-vnext-pr-7.json
  - test/unit/process-artifacts/policy.test.ts
ordinal: 142000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
WPM must use the reviewed security fork without upstream fallback, preserve its developer workflows, and qualify confidential exports and a fresh inactive candidate before updating PR7.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 WPM executes only the reviewed fork and verifies its build identity without using an upstream or global fallback.
- [x] #2 Exports containing source or selected historical secrets cannot reach the final destination without confidentiality and secret checks.
- [x] #3 The integration remains usable through its native workflows and produces a new independently verified inactive candidate.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Source WPM e88c2ba103504ede0cafe0ec596be609d7cf4950; protected fork cedf271baf7ff6e3eb069059ef7627d894bbed65. All task AC and DoD are met by the completed native workflows, full local release band and independently verified new inactive candidate. Root WPM Backlog remains1.45.2; only Groma work-source configuration selects its existing approved1.55.3 SDK. Exact fork source inventory has3120 entries, SHA2563d5bc79b6b8321e0982087b5e619fca248558392519c236ef4822e76e10a3956; frozen lock SHA256773fac363fa405175cc95479b554dc26ace6855ea0d7c5660bfff0bf328ef66a. Fresh private final setup, full doctor, native scanner/plugin listing and actual Groma freshness pass, preserving87 map records. Complete executable closure is checked against independent private account authority; no global/upstream fallback.

Native final web/edit, confidential current/historical export and all 143 task summaries plus TASK-136 details/native-watch proofs pass. Full fork3OS CI45515317232 is success. Bounded independent final pin/config/tooling and candidate reviews have no blocking findings. Full quality:release invoked by candidate:prepare passes:167 test files,2332 tests,2 host-specific skips; tsc/Biome/typed ESLint/architecture/Knip/native instructions, actual analyzer controls, Groma freshness and mutation policy all pass. Mutation raw score99.53%, zero unreviewed survivors; existing narrow source-bound dispositions retained. Main local band lacked optional zip; focused real scoped ZIP/UnZip adds21 packager tests and TASK105 tar/Git/ZIP47.19s pass without changing budgets.

New private candidate B: source e88c2ba, version0.1.0, ID sha256:952097387f7e7a1d34be366cef7c18e3bc3d9cdd50ba24949ade3ef1c8925868, archive733836 bytes SHA256e9bfbbc2b60b38aa05f99d793420504e2b2920d3c4e5a8b9e47b5c7c77dc3a77. candidate:verify and independent read-only digest/inventory verification pass (508 archive files, no repository developer roots). Exact saved bytes pass clean ordinary npm consumer install, aliases/resources and preservation of agent configuration. Full plain/no-APM journey passed separately packed same-source fixture; final saved archive will receive its own full plain journey. Candidate parent is0700 outside checkout, retention90days. Historical f716aed candidate remains unchanged at SHA2562e0b1cd0cec1d912ce98945a6ec7c31e0b676c760b2f106e64e7a315b9a8f8e4.

Capacity correction:10GiB was conservative headroom, never a measured requirement or current hard policy floor. Serialized pinned analyzer provisioning succeeded from3999911936 free bytes with minimum266096640; fresh final Groma setup started2182660096, minimum669106176; candidate B started2551062528, minimum1509974016. Shared backing-pool changes are included. Only classified owned caches/obsolete artifacts were retired; live application data, histories, profiles, active extensions and global settings preserved.

Delivery remains active: WPM sourceB CI45519390653 has policy plus five consumer cells green, Node24/Windows still running. No final Required pass is claimed. Next: commit these task/compact-evidence records without executable changes; candidate:prepare from that clean final revision with scoped native ZIP tools, verify persisted bytes and full plain journey; push same revision to existing PR7 (base dev), wait all six cells and Required, then bind final source/candidate identity in PR body. No candidate digest rebinding, skipped tools, reduced scope, timeout increases, merge, tag or publication. Fresh Claude model behavior remains unqualified without authentication; remote APM dependencies/recipient agent execution remain separate. Compact local gate and pending PR handoff are separate durable records.

Final-source CI5fd6911 reproduced one stale repository-inventory assertion (expected1 evolution record/2 receipts after legitimate new2/4 evidence); all other Linux26 cases passed. Local focused reproduction is7 passed/1 failed. Stopped only the known provably failing C candidate process group, preserving raw logs and earlier verified B candidate. Correct the test to require the original pilot files plus exact full maintained-directory counts, retaining schema/negative-fixture/minimum policy enforcement; independent review and fresh final-source candidate/CI required. No quality policy, test scope, timeout or artifact digest is relaxed.

Inventory regression corrected:14 focused process-artifact tests pass and full quality:fast passes after formatter output. Bounded independent review reports no blocker: exact counts cover the complete maintained corpus, original pilot files remain required, violations/schema/negative/minimum/index checks are unchanged. The fix changes only the existing test and this task evidence; product, fork pins, runtime scripts, quality policy, deadlines and scope remain unchanged. Native C web/provider/export and actual two-revision WPM map export passed; inherit those only for unchanged executable sources, while the next clean source still needs its own full candidate:prepare, saved-byte plain journey, independent binding review and all6 CI cells plus Required. No failed C artifact exists or is relabelled.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
