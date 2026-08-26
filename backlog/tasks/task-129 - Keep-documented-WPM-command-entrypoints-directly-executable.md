---
id: TASK-129
title: Keep documented WPM command entrypoints directly executable
status: To Do
assignee: []
created_date: '2026-08-26 13:18'
updated_date: '2026-08-26 14:07'
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


## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Feedback confirmed 2026-08-26 against the cited environment: both global aliases resolved to dist/cli.js at mode 0644; direct execution exited 126 while node dist/cli.js succeeded. The existing cli.bin integration test likewise bypassed the OS executable boundary by putting Node in front of the link. Scope review removed packed-install work because TASK-109 already directly verifies fresh installed launchers, and removed the requirement for a command that cannot start to diagnose itself. Keep the implementation at the build/package edge and prove handoff reproducibility by executing receipt data literally.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a clean checkout on supported POSIX and the documented npm run build plus npm link flow, direct wpm --version and installer --version invocations from PATH both exit 0 and report the package version.
- [ ] #2 Given that checkout remains locally linked, after a clean rebuild both PATH commands remain directly executable and report the rebuilt package version.
- [ ] #3 Given a prepared handoff receipt and a PATH containing the supported installed or linked WPM command, executing the receipt command and arguments from its recorded working directory starts without a repository-relative Node bypass and verifies with the same package version recorded by the receipt.
<!-- AC:END -->
