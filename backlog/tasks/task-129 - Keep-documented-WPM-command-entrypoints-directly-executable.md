---
id: TASK-129
title: Keep documented WPM command entrypoints directly executable
status: Done
assignee: []
created_date: '2026-08-26 13:18'
updated_date: '2026-08-26 15:11'
labels:
  - follow-up
  - cli
  - handoff
dependencies:
  - TASK-106
  - TASK-121
references:
  - README.md
  - docs/12-builder-architecture.md
priority: medium
ordinal: 129000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: Fresh-agent handoff feedback found that receipts record bare wpm verification commands, matching the documented local workflow. On supported POSIX, the documented npm run build plus npm link path exposed dist/cli.js at mode 0644, so direct wpm and installer invocation failed before Node could start.

Boundary: Preserve direct OS executability of both declared commands after every clean local build and rebuild, and prove a handoff verification entry point can be executed literally from its receipt data.

Non-goals: Changing packed-install behavior already covered by TASK-109; activating public distribution; installing WPM during handoff; spawning or authenticating an agent; or adding source-revision provenance beyond the package version.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given a clean checkout on supported POSIX and the documented npm run build plus npm link flow, direct wpm --version and installer --version invocations from PATH both exit 0 and report the package version.
- [x] #2 Given that checkout remains locally linked, after a clean rebuild both PATH commands remain directly executable and report the rebuilt package version.
- [x] #3 Given a prepared handoff receipt and a PATH containing the supported installed or linked WPM command, executing the receipt command and arguments from its recorded working directory starts without a repository-relative Node bypass and verifies with the same package version recorded by the receipt.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Feedback confirmed 2026-08-26 against the cited environment: both global aliases resolved to dist/cli.js at mode 0644; direct execution exited 126 while node dist/cli.js succeeded. The existing cli.bin integration test likewise bypassed the OS executable boundary by putting Node in front of the link. Scope review removed packed-install work because TASK-109 already directly verifies fresh installed launchers, and removed the requirement for a command that cannot start to diagnose itself. Keep the implementation at the build/package edge and prove handoff reproducibility by executing receipt data literally.

Implementation 2026-08-26: the persistent worker literally ran bmad-create-story, bmad-dev-story, and bmad-qa-generate-e2e-tests. A POSIX-only postbuild effect restores mode 0755 on the shared dist/cli.js target after every clean TypeScript build. Integration coverage now uses an isolated real npm link/PATH, invokes both declared commands before and after rebuilding without relinking, and executes the canonical prepared receipt command, argv, and cwd literally while checking package-version agreement. Focused build, typecheck, lint/process-policy, integration (3/3), mode, and diff checks passed.

Independent review cycle 1 literally ran bmad-story-automator-review and APPROVED with no HIGH findings and no product/test changes. Its only MEDIUM bookkeeping correction added the QA summary to the ignored story File List. The one whole-repository CI-equivalent gate is deferred to the stable combined TASK-128/TASK-129 diff after merge per the fast-feedback policy.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Direct POSIX wpm and installer entrypoints now survive clean local builds and rebuilds. Real isolated npm-link coverage proves both commands report the package version, and a prepared handoff receipt executes literally through its recorded command, arguments, and working directory without a Node bypass. Independent BMAD review approved the minimal change.
<!-- SECTION:FINAL_SUMMARY:END -->
