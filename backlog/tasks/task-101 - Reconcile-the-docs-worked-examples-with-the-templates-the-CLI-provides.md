---
id: TASK-101
title: Reconcile the docs worked examples with the templates the CLI provides
status: To Do
assignee: []
created_date: '2026-06-07 22:51'
updated_date: '2026-06-07 23:53'
labels:
  - authoring-context
  - docs
  - human-gated
dependencies: []
ordinal: 101000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No shipped doc presents a worked example using a project or bundle template the CLI cannot resolve
- [ ] #2 Every project and bundle template named in the docs is resolvable by the CLI, or the doc no longer names it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ALSO in scope of the docs/CLI reconcile (found in epic-4 Story B): docs 10 & 11 worked sessions use 'wpm bundle <id> files add payload/files/launcher.json' which FAILS -- the CLI resolves <path> relative to payload/files/, so the correct form is 'files add launcher.json'. Fix the docs (or the doc examples) alongside the missing-template reconcile.
<!-- SECTION:NOTES:END -->
