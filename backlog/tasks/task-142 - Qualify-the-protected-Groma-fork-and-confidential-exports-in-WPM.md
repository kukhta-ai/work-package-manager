---
id: TASK-142
title: Qualify the protected Groma fork and confidential exports in WPM
status: In Progress
assignee: []
created_date: '2026-11-06 11:09'
updated_date: '2026-11-13 16:13'
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
ordinal: 142000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
WPM must use the reviewed security fork without upstream fallback, preserve its developer workflows, and qualify confidential exports and a fresh inactive candidate before updating PR7.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 WPM executes only the reviewed fork and verifies its build identity without using an upstream or global fallback.
- [ ] #2 Exports containing source or selected historical secrets cannot reach the final destination without confidentiality and secret checks.
- [ ] #3 The integration remains usable through its native workflows and produces a new independently verified inactive candidate.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Approved integration: pinned fork build, sanitized execution, confidential source export with selected-revision secret checks, update PR7 and create fresh inactive candidate. Existing f716aed candidate remains historical and unchanged.

Runtime integration progress on WPM 46329318b1c599df8f6983a6546423ba91d4d973: reviewed-fork pin contract remains explicitly pending until security fork commit and approved SDK digests freeze. Added private build/source/tool inventory verification, descriptor-bound file reads, sanitized context, external approval authority and native groma:cli routing. Focused runtime/freshness/native/orchestration suite: 48 tests passed; root tsc and scoped ESLint passed. Native projection check passed; architecture skill validated with existing Python/PyYAML. Shared groma.mjs invocation/environment block handed to export owner. Actual fork build/scan/plugin qualification remains unverified; next action finalize immutable fork and per-platform approved SDK inputs, then build and independently qualify.

Runtime follow-up on WPM 46329318b1c599df8f6983a6546423ba91d4d973: four focused unit files now 50 tests passed, including selected-build rejection for independent binary/dependency/helper/external approval/SDK/lock tampering and confined tracked source links. PM-generated exact scanner 0.2.4 and Backlog 1.55.3 SDK recipes are retained; official scanner and Linux native archive SHA512 values match their unmodified frozen locks. Linux x64 Bun/Node archives and extracted bytes were verified without execution. Actual fork/SDK integration remains pending final source freeze and fresh frozen restore; bounded mirror restore is slow and approved local verified-archive replay is prepared as explicit qualification transport. No root WPM build, global configuration change, fallback runtime or publication occurred.

Checkpoint before final fork pin: implementation files frozen for independent runtime review; no own download/install/native watcher writers remain. Focused runtime/freshness/orchestration/native suite passes 51 tests; root tsc, scoped ESLint, Biome and agents:check pass. Fresh frozen SDK restore used explicit verified-public-archive loopback replay after the normal mirror stream timed out at 600s; full provenance is retained privately at groma-sdk-replay-sr8pldq5/receipt.json. Actual ARM64 Backlog 1.55.3 initialization, exact readiness, JSON list/details and live JSON/watch passed through the current approved async adapter; watcher PID was reaped and SDK digest remained unchanged (groma-backlog-native-qualification-CyZTvS/receipt.json). Early CURRENT fork source-CLI scanner 0.2.4 compatibility passed in a disposable 114-source-file WPM copy, scan created 0/refreshed 77/matched 0/findings 42 and authored architecture prose remained visible (groma-scanner-source-qualification-KUo7LW/receipt.json). This is not final compiled-fork/full-freshness qualification. Contract revision/source/lock/tool/approval pins remain pending. Next: freeze and review fork, archive final immutable commit, requalify helper/SDK digests, populate reviewed pins, run actual isolated setup/doctor/scanner/freshness, then remove official npm Groma via package manager. No WPM root build, global-state modification, foreign binary execution or publication occurred.

Independent runtime audit found a coordinated-cache authority bypass: replacing binary or dependency bytes together with mutable receipt digests could pass the old doctor. Fixed before production pinning: fresh setup now records an independent private authority under the OS account home, keyed by canonical owner path and outside any Git/project cache. It binds exact selected receipt bytes, canonical owner/runtime base and reviewed pin. Doctor checks it before interpreting receipt-selected paths or executing helper code. Starting setup revokes the previous authority and receipt. Actual doctor regressions now reject coordinated binary+receipt and dependency+receipt substitutions, approval-directory redirection, missing external authority and authority homes inside project/cache; failed setup revokes the prior selection. Runtime7 tests and focused four-file51 tests pass; tsc, scoped ESLint and Biome pass. Tests mock account-home access into owned temporary fixtures, so no real account or agent configuration was changed. Files frozen for HTTP-owner independent re-audit; final fork pin/setup/package-manager removal still pending the immutable fork commit.

Independent archive-member review found that an option-shaped tar member could be interpreted by the extractor before output verification. Parent fixes reject leading option members and delimit the tar member explicitly; pending/floating-input regression now includes an option-shaped member. Other runtime files remain frozen until final pin. Parent retains the existing modified-file list.

Resume on WPM4632931: recovered the lost security fork from interrupted session patches into /workspace/active/wpm-groma-security, committed as ad95fd42e65f0d3e159c3069a191866e5af54bb5. Frozen Bun1.4.4 restore, native binary build/version0.7.8 and reviewed Linux ARM64/x64 tool archives succeeded. Source inventory and per-platform frozen SDK approvals are now pinned. Cold independent review reproduced a web-confirm stale-registry bug and verified the production-route fix. Fork focused security30 and preserved fixtures64 checks passed; full check has939 passed64 skipped28 failures requiring absent Java/Swift/COBOL/JVM tooling, NOT a passing full fork gate. WPM tsc and quality:fast passed before later portability fixes; WPM runtime/export/orchestration20 tests and Windows-unit fixture44 tests passed. Independent review fixed final export directory confidentiality0700. Historical PR7 CI inspection identified Windows LF/short-path/junction fixtures (fixed), GNU tar drive-letter handling (production and existing test callers fixed), environment-variable case assumptions (fixed), and Linux24 native CLI journey timeouts (still require profiling). Actual isolated Groma setup and analyzer setup both failed ENOSPC; no runtime authority or full quality/release qualification claimed. New storage ownership policy inspected: managed sweeps have no expired entries; bounded cache maintenance and obsolete non-running VSCode versions freed about1.5GiB plus prior uv cleanup. Current free space remains below the policy10GiB heavy-run floor; do not retry large provisioning until capacity is restored. Next: finish focused portability checks, preserve fork branch/PR via GitHub API when Git transport DNS fails, restore capacity, then actual runtime/scanner/export/CI/candidate qualification. Existing f716aed candidate unchanged.

Follow-up evidence: current complete quality:fast passes on Node24.22.2 (351 Biome files, typed ESLint,127 architecture modules, native artifacts and process policy). Seven focused unit files pass64 tests; two focused real integration files (native archives and environment isolation) pass31 tests. Independent targeted re-review of Windows fixes reports no material regression. Fork source ad95fd42e65f0d3e159c3069a191866e5af54bb5 was preserved byte-exactly through GitHub Git-data API because ordinary Git transport DNS fails; draft https://github.com/kukhta-ai/Groma.md/pull/1 now exists. New storage policy review found122 worktrees, only5 merged/clean/inactive, all retaining runtime or release artifacts; none removed.39 managed records remain within retention, none expired. VSCode-marked obsolete, unregistered, non-running versions were removed after checking live process paths; reclaimed1521901568 bytes, plus obsolete audio cache and19MB npm GC. Current2.6GiB remains below10GiB heavy-run floor; fresh runtime/analyzer installs failed ENOSPC and remain unqualified. Full CI, architecture freshness, native export and new candidate remain open.

Storage prerequisite executed against WPM775b261 under /workspace/active/org-os/docs/development-storage.md: shared-lock native pnpm prune removed81886 files/2578 packages; removed one additional obsolete unregistered inactive Claude extension plus obsolete package archives (885108736 allocated bytes), and classified mypy cache from a merged clean inactive worktree (119250944 bytes).114 extant worktrees inspected; five merged clean inactive checkouts still retain runtime/private state or release evidence, so no worktree removed. Managed sweeps found zero expired runs. Application volumes, recovery state, profiles, history and open-task installations preserved. Current available3.84GiB, shortfall6.16GiB to10GiB heavy-run floor; detailed ownership report is ignored .quality/evidence/storage-classification.json. Native pip maintenance refused UID65534 cache; ownership/permissions left intact. quality:doctor still fails missing analyzer receipt; groma:cli agent-instructions still fails missing runtime receipt. No heavy local provisioning retried. Git transport recovered; exact source775b261f2e4496c95ef9f02c5495600eb8d75c20 preserved on qualify/wpm-vnext-security and ordinary CI started at https://github.com/kukhta-ai/work-package-manager/actions/runs/43458531543. PR7 remains on4632931 pending final candidate. WPM repository is public, so its private-artifact candidate workflow is not an available substitute for local private qualification. Next: inspect remote CI results, obtain at least the recorded capacity shortfall through classified closure/operator capacity, then actual runtime/analyzer/freshness/native export qualification, package-manager removal of replaced Groma dependency, and clean-source final candidate gate. Historical f716aed candidate remains unchanged.

Remote Linux x64 CI775b261 successfully provisioned pinned analyzers and actual isolated Groma ad95fd4, passed groma:cli scanner check and Groma runtime doctor, then tsc/Biome/typed ESLint/127-module architecture/native-agent/process checks. Policy stopped specifically at Knip reporting obsolete groma.md as unused. Replacement executable provenance and native CLI are now actually observed on x64; no full policy pass or export qualification claimed. Removed the obsolete root groma.md dependency using npm11.19.1 package-lock-only uninstall with scripts disabled and removed its obsolete version check; the independent reviewed-fork doctor remains mandatory. Local Backlog latency probe is0.23s per native call; existing November6 dist init+bundle-new issues115 calls and takes27s on ARM64, so accumulated child invocations explain long journeys without justifying higher test timeouts. No new full-suite pass claimed.

Post-removal working tree after775b261: both normal and production Knip now pass; focused quality-orchestration and Groma-contract tests pass8/8; complete quality:fast passes (tsc,351-file Biome,typed ESLint,127-module architecture,native agent/process checks). This fixes the observed remote policy blocker without suppressions or omitted tools. Full policy/consumer/candidate gates remain pending; local capacity prerequisite is still unsatisfied.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
