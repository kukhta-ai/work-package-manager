---
id: TASK-104
title: Exclude the bundle-template scaffold from built archives
status: To Do
assignee: []
created_date: '2026-06-08 00:16'
updated_date: '2026-06-08 00:33'
labels:
  - authoring-context
  - bug
  - product
dependencies: []
ordinal: 104000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A built archive contains no bundle-template scaffold directory and no unsubstituted placeholder (.tmpl) files
- [ ] #2 The init-generated executor front door has no empty or dangling menu entry when the project has no bundles yet
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Also covers two nits from the epic-4 dogfood review: (gap 5) the bundle-template's scaffolded recipe tasks ship without the -m <version> milestone conventions require -> the template should emit it; (gap 7 clarification) the executor front-door snippet's 'choose from:' line is a dangling colon that never enumerates bundles REGARDLESS of bundle count (not only when empty) -> the AC #2 wording is slightly narrow; the real fix is the snippet never renders a bundle list.
<!-- SECTION:NOTES:END -->
