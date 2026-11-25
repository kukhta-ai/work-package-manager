---
id: TASK-134
title: Keep the release harness faithful across supported hosts
status: Done
assignee: []
created_date: '2026-08-28 16:52'
updated_date: '2026-08-28 17:16'
labels:
  - follow-up
  - ci
  - windows
  - macos
  - test-harness
  - release-gate
dependencies:
  - TASK-133
modified_files:
  - distribution-preparation/packed-install.js
  - test/integration/adapters/node-fs.test.ts
  - test/integration/cli.authoring-clients.test.ts
  - test/integration/cli.bundle-id.e2e.test.ts
  - test/integration/cli.init.test.ts
  - test/integration/cli.workspace-handoff.test.ts
  - test/integration/distribution-preparation/packed-install.test.ts
  - test/integration/distribution-preparation/public-surfaces.test.ts
  - test/unit/distribution-preparation/packed-install.test.ts
  - test/unit/operations/bundle-authoring.test.ts
  - test/unit/operations/init-project.test.ts
  - test/unit/operations/workspace-authoring-integration.test.ts
  - test/unit/operations/workspace-handoff.test.ts
priority: high
ordinal: 134000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The PR #5 supported-host matrix exposed test-harness assumptions that are not product defects: POSIX-only path spellings, Linux-default environment fakes, mutation races Windows cannot perform while handles are open, platform-specific installed command surfaces, successful npm diagnostics, and one measured real-CLI timing budget. Make those tests represent the same intended boundary on each supported runner without broad product normalization or global timeout changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Supported-host test runs do not misclassify separator-only path spelling differences as product failures.
- [x] #2 Host integration scenarios model the actual runner platform while preserving their intended product assertions.
- [x] #3 Race simulations that the host operating system forbids are not reported as product failures, while the corresponding fail-closed behavior remains covered on hosts that permit the race.
- [x] #4 A source-free installed package can execute its required Backlog peer through the supported Windows command surface.
- [x] #5 A successful package installation remains successful when npm emits diagnostics, while a failed setup exposes the command diagnostics needed to identify its cause.
- [x] #6 Valid custom preincluded-core initialization succeeds across supported hosts or reports the concrete failing command diagnostic.
- [x] #7 The multi-command bundle-ID end-to-end scenario remains bounded across observed supported-runner variation without weakening unrelated timeout checks.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence: literal bmad-investigate @ PR #5 runs 33186232983 and 33186239672. Scope is test/release-harness fidelity only except for a narrow installed-command invocation helper if required. Explicitly reject global path normalization, MemoryFileSystem changes, broad NodeFileSystem refactors, blanket EPERM acceptance, dependency silencing, retries, and global timeout increases.

Literal BMAD workflows run: bmad-create-story, bmad-dev-story, and bmad-qa-generate-e2e-tests by the persistent worker; bmad-story-automator-review cycle 1 by the independent reviewer. Independent verdict: approved with no blocking findings and no executable/test corrections.

Evidence: focused 10-file band 230/230; isolated installed Backlog peer 1/1 selected; measured bundle-ID scenario 1/1 selected; typecheck, focused Biome, process-artifact policy, and diff check passed. Final Windows/macOS execution remains the PR #5 replacement matrix gate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Release tests now compare separator-equivalent host paths, model the real runner platform, exclude only two OS-impossible Windows race simulations, execute Windows npm command shims with correct quoting, retain command diagnostics, and give one measured multi-command E2E a local 90-second bound. Product-wide path semantics and global test budgets are unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
