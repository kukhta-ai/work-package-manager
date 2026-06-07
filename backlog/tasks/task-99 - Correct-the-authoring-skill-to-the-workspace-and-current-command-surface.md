---
id: TASK-99
title: Correct the authoring skill to the workspace and current command surface
status: Done
assignee: []
created_date: '2026-06-07 22:51'
updated_date: '2026-06-07 23:53'
labels:
  - authoring-context
  - skill
dependencies: []
ordinal: 99000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The skill command surface includes the command that installs the authoring skill into the agent scope
- [x] #2 No skill surface claims the executor front door is auto-regenerated; it is described as author-owned and written once
- [x] #3 Every worked path in the skill resolves under the deliverable subdirectory rather than the project root
- [x] #4 The skill describes the build as producing the un-nested deliverable into the build-output directory
- [x] #5 The skill references only project and bundle templates the tool actually provides
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Story B. Same worker/reviewer -> APPROVE, all 5 ACs PASS, every fix CLI-TRUE (reviewer verified empirically in a /tmp workspace). Applied the 9 drift fixes: added wpm skill install row; killed the stale 'AGENTS.md re-renders on mutation' claim (front door now described author-owned/written-once; only installer SKILL.md + aliases re-render); 'scaffold an authoring workspace'; project root prints deliverable root (wip/); SKILL init wording; all worked cd paths -> wip/bundles/; dropped non-existent templates (single-bundle/multi-bundle); build rows describe wip/->archive-root un-nesting + exclusions + builds/ output. DISCOVERY: 'files add <path>' is relative to payload/files/ (NOT bundle-relative as the ledger/doc-10 claimed) -- orchestrator empirically verified + fixed the worked example to 'files add launcher.json'. NOTE: docs 10/11 carry the SAME wrong 'files add payload/files/...' form (a doc bug) -> see TASK-101.
<!-- SECTION:NOTES:END -->
