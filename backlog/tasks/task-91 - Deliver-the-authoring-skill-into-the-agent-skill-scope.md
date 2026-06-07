---
id: TASK-91
title: Deliver the authoring skill into the agent skill scope
status: Done
assignee: []
created_date: '2026-06-06 23:38'
updated_date: '2026-06-07 03:25'
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
- [x] #1 A command installs the bundled installer-builder skill into the user agent skill scope for the detected target agents.
- [x] #2 Re-running the install is idempotent and reports what it did.
- [x] #3 When no supported agent scope is detected, the command reports this and exits non-zero without writing anything.
- [x] #4 init surfaces, in its summary or the authoring front door, how to install the authoring skill when it is absent.
- [x] #5 The command names the scope or scopes it wrote to.
- [x] #6 Installing the skill never places it inside any workspace deliverable subdirectory; it targets the user agent scope only.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BMAD (Rule 3): worker a19076c2 ran bmad-create-story (story _bmad-output/.../story-task-91.md); dev-story+qa fell back to doc-driven (gate on epic-1 sprint mirror excluding task-91). Reviewer = SEPARATE subagent a344b883 (story-automator-review fell back to manual) -> APPROVE, all 6 ACs PASS regression-guarded, doc-05 scope mapping verified EXACT, core boundary clean, no lost coverage. Fast gate green: tsc clean, biome clean (195 files), npm test 1062 passed +134 skipped (e2e self-skip w/o dist; +22 new tests). IMPL: new top-level "wpm skill install" (doc-12 onboarding) copies bundled agent-skills/installer-builder/ into the USER agent skill scope for detected agents. New USER_SCOPE_PATHS in agent-aliases.ts (doc-05 personal scopes: claude-code .claude/skills, codex .agents/skills, hermes .hermes/skills [distinct], openclaw .openclaw/skills); detection = agent HOME config dir exists; pure op install-authoring-skill.ts using FileSystem+Environment ports. AC#3 no-scope -> UsageError -> exit 2, writes nothing. AC#4 init prints install tip when absent + front-door snippet documents it. AC#6 user-scope only, never under wip/. bundledSkillsRoot threaded via import.meta.url (../agent-skills), typed optional to avoid churning ~29 test deps literals (reviewer: acceptable). Added skill install to doc-10 tree+table + reconciled the project-context-is-explicit intro exceptions. Files: src/core/operations/install-authoring-skill.ts (new), agent-aliases.ts, src/cli.ts, authoring-front-door snippet, docs/10. NIT left non-blocking: bundledSkillsRoot could be required for parity.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
