---
id: TASK-27
title: >-
  Build the commander composition root, registration pattern, DI, and error
  handler
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 04:22'
labels: []
dependencies:
  - TASK-12
  - TASK-14
  - TASK-15
  - TASK-23
ordinal: 27000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The command-line program presents the top-level command groups and dispatches to them through one consistent registration approach (doc 10)
- [x] #2 The real file-system, backlog, clock, and environment abstractions are assembled once at the program's entry point and supplied to the commands
- [x] #3 A raised domain failure becomes the correct exit status with a readable message; an unexpected failure exits with the general-error status and shows detail only in a debug mode
- [x] #4 A bundle id that collides with a reserved command verb is refused (doc 10)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built the impure commander composition root src/cli.ts (doc 12 line 73; the first module outside src/core/). AC1: one CommandModule.register pattern attaches the five doc-10 top-level groups (init, template, project, bundle, build) to commander; bundle new is the proof leaf. AC2: makeRealDeps assembles NodeFileSystem, BacklogCli, SystemClock, ProcessEnvironment once into CliDeps, injected via CommandContext into every command. AC3: src/util/exit.ts runWithExit is the single exit-code authority (reusing task-23 exitCodeFor) - success 0, commander help/version 0, commander usage 2, UsageError 2, other DomainError 1, unexpected 1 with stack only in --debug or WPM_DEBUG; commander routed via exitOverride plus configureOutput; output formatting lives in the shell, not core. AC4: bundle new refuses RESERVED_BUNDLE_VERBS (the model single source) as UsageError exit 2, fired BEFORE resolveContext (pure grammar, context-independent) so it is exit 2 with or without a project; parseBundleId stays as exit-1 defense-in-depth. Core boundary intact. BMAD skills: worker ran create-story, dev-story, qa-generate-e2e-tests, then dev-story for the guard-ordering plus env-dedup polish; reviewer ran story-automator-review, verdict APPROVE (7 adversarial probes incl the live commander-15 exit-code-table check). Divergences: commander was missing from the manifest so it was added pinned 15.0.0 (doc 12 mandate, lockfile synced, npm ci clean); the bootstrap cli.ts was replaced; and a faithful task-12 fix to src/util/symlink.ts creates the link parent dir before symlink or copy (real fs does not, the memory fake recorded it - same parity class as task-25). The registration/DI/error pattern is the exemplar tasks 34-84 follow. Gate: tsc 0, biome 0 warnings, vitest 430 passed, npm ci 0.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
