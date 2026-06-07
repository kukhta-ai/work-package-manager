---
id: TASK-91
title: Deliver the authoring skill into the agent skill scope
status: To Do
assignee: []
created_date: '2026-06-06 23:38'
labels:
  - authoring-workspace
dependencies:
  - TASK-86
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Close the distribution gap doc 12 specifies: the bundled installer-builder skill ships inside the npm package but never reaches the author agent. Add a command that copies it into the user agent skill scope, and have init point the author at it. The authoring skill is the authoring-agent instruction surface. Conforms to doc 12 (task 86). Non-goals: the skill content quality protocol (92).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A command installs the bundled installer-builder skill into the user agent skill scope for the detected target agents.
- [ ] #2 Re-running the install is idempotent and reports what it did.
- [ ] #3 When no supported agent scope is detected, the command reports this and exits non-zero without writing anything.
- [ ] #4 init surfaces, in its summary or the authoring front door, how to install the authoring skill when it is absent.
- [ ] #5 The command names the scope or scopes it wrote to.
- [ ] #6 Installing the skill never places it inside any workspace deliverable subdirectory; it targets the user agent scope only.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
