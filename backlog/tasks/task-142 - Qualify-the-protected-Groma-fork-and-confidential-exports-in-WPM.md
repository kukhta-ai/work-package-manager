---
id: TASK-142
title: Qualify the protected Groma fork and confidential exports in WPM
status: In Progress
assignee: []
created_date: '2026-11-06 11:09'
updated_date: '2026-11-13 07:00'
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
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
