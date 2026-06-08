---
id: TASK-103
title: Let bundle scaffolding omit or cleanly remove an unused payload-skill stub
status: Done
assignee: []
created_date: '2026-06-08 00:16'
updated_date: '2026-06-08 13:24'
labels:
  - authoring-context
  - bug
  - product
dependencies: []
ordinal: 103000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Creating a bundle does not leave an unregistered payload-skill stub that the build then ships
- [x] #2 A scaffolded-but-unregistered payload skill can be removed through the CLI
- [x] #3 A bundle that ships no payload skill builds without a placeholder skill in the archive
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
FIXED. Worker a0549112 (create/dev-story fell back to brief-driven). Reviewer = SEPARATE subagent a1711196 -> APPROVE: all 3 ACs independently re-verified (manual dist + unit + e2e: bundle-new 7/7, build+bundle-template 27/27, bundle-id 79/79); registered-vs-orphan dispatch safe in TWO layers (CLI routes by registry + the delete spec's check throws ConstraintError if registered -> can't destroy author content); core boundary clean; skills add regression intact; no lost coverage. FIX: (AC#1/#3) deleted the payload-skill stub from the bundle template (templates/bundle/default/files/payload/agent-skills/{{bundle-id}}-skill/SKILL.md.tmpl -> replaced with .keep) so bundle new creates no unregistered stub and a config-only bundle ships none (only .keep). (AC#2) skills remove <name> now DELETES an on-disk UNREGISTERED orphan skill dir (via the fs.remove port), while KEEPING deregister-and-leave for REGISTERED skills (doc-10 76#1/#2). New completion source skills-removable.ts (union of registered + on-disk). ALSO fixed (orchestrator): cli.bundle-template.e2e 56#2 snapshot did readFileSync on the task-102 backlog symlink -> EISDIR; now records readlinkSync target (a TASK-102 follow-up missed because task-102's gate didn't run bundle-template.e2e). Gate: tsc/biome clean (197 files), fast 1089 passed, affected e2e green. NIT->TASK-105: build ships on-disk payload/agent-skills/** regardless of registration, so a registered-then-DEregistered skill still ships until hand-deleted (latent, pre-existing, out of scope).
<!-- SECTION:NOTES:END -->
